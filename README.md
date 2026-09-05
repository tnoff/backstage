# backstage

The [Backstage](https://backstage.io) developer portal for the OKE cluster — a
service catalog for the repos under `tnoff-projects/`, plus the docs and
runbooks that live next to them.

Scope, phasing, and the decisions behind it:
[`docs/projects/service-catalog.md`](https://gitlab.com/tnoff-projects/docs/-/blob/main/projects/service-catalog.md).

## Why this repo exists

Backstage ships no upstream production image. The documented deployment path is
to scaffold your own app and build an image from it, so the portal is a fork you
maintain rather than an artifact you pull. The cluster is `arm64`
(`VM.Standard.A1.Flex`), which rules out the community demo images as well.

## Layout

- GitLab (`tnoff-projects/backstage`) is the source of truth.
- GitHub (`tnoff/backstage`) is a push-mirror target only — do not push to it.
- Images go to `iad.ocir.io/tnoff/backstage`, built `linux/arm64`.

## Building

The authoritative Dockerfile is the **multi-stage one at the repo root**. The
host-build variant that `create-app` generates at `packages/backend/Dockerfile`
has been removed: it assumes `yarn install && yarn tsc && yarn build:backend`
already ran on the host, which the CI template does not do. One Dockerfile, the
one CI actually builds.

## Local development

```sh
corepack enable
yarn install
yarn start
```

Note `.yarnrc.yml` sets `npmMinimalAgeGate: 3d`, which quarantines packages
published in the last three days. `nunjitsu` is preapproved there — it is a
transitive dependency of `@backstage/plugin-scaffolder-backend`, authored by a
Backstage core maintainer, and was newer than the gate at scaffold time.

## Deployment

Runs on the `internal` node pool alongside the monitoring stack, in the
`backstage` namespace. Anything scheduled there needs both a `nodeSelector` of
`node_role: internal` and a matching toleration for the
`node_role=internal:NoSchedule` taint.

## Status

Scaffolded and building. Not yet deployed, and the catalog is empty — the
`docker-apps` Flux tree and the plugin set (GitLab discovery, Kubernetes,
Grafana) are the next steps.
