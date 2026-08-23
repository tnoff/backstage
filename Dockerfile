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

RUN yarn tsc && \
    yarn build:backend && \
    mkdir -p packages/backend/dist/skeleton packages/backend/dist/bundle && \
    tar xzf packages/backend/dist/skeleton.tar.gz -C packages/backend/dist/skeleton && \
    tar xzf packages/backend/dist/bundle.tar.gz -C packages/backend/dist/bundle

# Stage 3 — runtime: production dependencies only.
FROM node:24-trixie-slim
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends libsqlite3-dev && \
    rm -rf /var/lib/apt/lists/*

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

COPY --from=build --chown=node:node /app/packages/backend/dist/bundle/ ./
COPY --chown=node:node app-config*.yaml ./

ENV NODE_ENV=production
EXPOSE 7007
CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml"]
