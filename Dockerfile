# Multi-stage build for the Backstage backend.
#
# Deliberately NOT the host-build Dockerfile that `create-app` generates at
# packages/backend/Dockerfile (removed in this repo). That one assumes
# `yarn install && yarn tsc && yarn build:backend` already ran on the host and
# only copies the result — which the .buildkit-docker-push CI template does not
# do. Everything here happens inside the build instead.
#
# Built for linux/arm64 (the template's default PLATFORM); the OKE nodes are
# VM.Standard.A1.Flex.

# Stage 1 — skeleton: just the package.json files, so the dependency layer
# only busts when a manifest or the lockfile changes, not on every source edit.
FROM node:24-trixie-slim AS packages
WORKDIR /app
COPY package.json yarn.lock ./
COPY .yarn ./.yarn
COPY .yarnrc.yml ./
COPY packages packages
COPY plugins plugins
RUN find packages plugins \! -name "package.json" -mindepth 2 -maxdepth 2 -exec rm -rf {} \+

# Stage 2 — build: install everything and compile.
FROM node:24-trixie-slim AS build
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends python3 g++ build-essential libsqlite3-dev

# Pre-create the yarn state dir as `node`. The cache mount below targets
# .../berry/cache, and Docker creates the missing parents (.../berry) as root —
# so yarn, running as `node`, then cannot mkdir its sibling .../berry/index and
# dies with EACCES. Owning the whole tree up front avoids that.
RUN mkdir -p /home/node/.yarn/berry/cache && chown -R node:node /home/node/.yarn

USER node
WORKDIR /app
COPY --from=packages --chown=node:node /app .

RUN --mount=type=cache,target=/home/node/.yarn/berry/cache,sharing=locked,uid=1000,gid=1000 \
    yarn install --immutable

COPY --chown=node:node . .

# Split into one RUN per phase, deliberately.
#
# These were a single chained RUN, which buildkit reports as ONE `DONE <n>s`
# line. That line was 668s on one CI run and 1194s on another, with no way to
# tell which phase owned the time. Measured cold on a 12-core x86 workstation
# the same three phases total ~10s:
#
#   yarn tsc                          3.0s
#   yarn workspace app build          4.5s   (460% CPU, peak RSS 1.70 GiB)
#   yarn workspace backend build      2.4s
#
# 0.75 of a core and arm64 do not explain a 70-120x gap, so the cost is
# somewhere these timings do not show. One RUN per phase makes buildkit print
# a separate DONE line for each, and those stream to the job log as they
# complete — so the breakdown survives even when the job is killed partway,
# which is currently how it ends. See docs projects/ci-builds-starve-kubelet.md.
#
# `--skip-build-dependencies` stops the backend build from rebuilding the app.
# `backend` depends on `app` via `link:../app`, so `yarn build:backend` walks
# into the frontend and rebuilds it ("Building app separately because it is a
# bundled package"). The flag skips the rebuild and still packages the app's
# existing dist: verified locally, the resulting bundle.tar.gz carries all 771
# packages/app/dist files including index.html and the static chunks.
RUN yarn tsc

RUN yarn workspace app build

RUN yarn workspace backend build --skip-build-dependencies

RUN mkdir -p packages/backend/dist/skeleton packages/backend/dist/bundle && \
    tar xzf packages/backend/dist/skeleton.tar.gz -C packages/backend/dist/skeleton && \
    tar xzf packages/backend/dist/bundle.tar.gz -C packages/backend/dist/bundle

# Stage 3 — prod-deps: production dependencies, resolved where a toolchain exists.
#
# `yarn workspaces focus --all --production` compiles native modules when no
# prebuilt binary matches the platform. On arm64 no prebuilds are published for
# better-sqlite3, keytar or cpu-features, so yarn falls back to node-gyp, which
# needs python3 + g++ + make. The runtime base has none of them:
#
#   $ docker run --rm node:24-trixie-slim sh -c 'command -v python3 g++ make cc'
#   python3 MISSING / g++ MISSING / make MISSING / cc MISSING
#
# This is INVISIBLE ON amd64. There, prebuilds exist and nothing is ever
# compiled — a local `docker build` passes clean while CI fails, which is
# exactly what happened: zero "must be built" lines locally, three
# "couldn't be built successfully" on arm64.
#
# The build stage above already compiles these same modules on arm64 with this
# toolchain, so installing it here is known-sufficient rather than hopeful.
# Keeping the install in its own stage means the compiler never reaches the
# shipped image.
FROM node:24-trixie-slim AS prod-deps
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends python3 g++ build-essential libsqlite3-dev

# Same ownership fix as the build stage — this stage mounts the same cache.
RUN mkdir -p /home/node/.yarn/berry/cache && chown -R node:node /home/node/.yarn

USER node
WORKDIR /app

COPY --from=build --chown=node:node /app/.yarn ./.yarn
COPY --from=build --chown=node:node /app/.yarnrc.yml ./
COPY --from=build --chown=node:node /app/yarn.lock /app/package.json ./
COPY --from=build --chown=node:node /app/packages/backend/dist/skeleton/ ./

RUN --mount=type=cache,target=/home/node/.yarn/berry/cache,sharing=locked,uid=1000,gid=1000 \
    yarn workspaces focus --all --production

# Stage 4 — runtime: the compiled result, without the compiler.
FROM node:24-trixie-slim
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends libsqlite3-dev && \
    rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /app

# /app from prod-deps carries node_modules, .yarn, .yarnrc.yml, the lockfile
# and the backend skeleton — everything the focus install produced.
COPY --from=prod-deps --chown=node:node /app ./
COPY --from=build --chown=node:node /app/packages/backend/dist/bundle/ ./
COPY --chown=node:node app-config*.yaml ./

ENV NODE_ENV=production
EXPOSE 7007
CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml"]
