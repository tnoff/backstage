# backstage

The [Backstage](https://backstage.io) developer portal for the OKE cluster: a
service catalog for the `tnoff` repos, plus the TechDocs and API/relationship
graph that sit on top of it.

This repo is the portal's **application source and base config**. Where things
that touch it live:

| Concern | Where |
|---|---|
| Deployment, production config (`app-config.production.yaml`), TechDocs GC | `tnoff/docker-apps` (`apps/backstage/`) |
| Operations and architecture docs for the portal | `tnoff/docker-apps` `techdocs/backstage/` |
| The `backstage` System, and Resources with no code repo | `tnoff/docker-apps` `catalog-info.yaml` |
| Bucket Resources | `tnoff/terraform` |
| This repo's catalog entities | `catalog-info.yaml`: Component `backstage` and Group `admin` only |

## Why this repo exists

Backstage ships no upstream production image. The documented path is to scaffold
your own app and build an image from it, so the portal is a fork you maintain
rather than an artifact you pull. The cluster is `arm64`
(`VM.Standard.A1.Flex`), which rules out community demo images.

## What is installed

The backend is deliberately trimmed to a catalog plus TechDocs
(`packages/backend/src/index.ts` documents each removed plugin):

- app-backend (serves the frontend bundle)
- auth with the **guest** provider only. It exists because TechDocs needs some
  identity to mint its viewer cookie, not as an authorization boundary. Access
  control is the bastion port-forward (the portal has no Ingress).
- catalog, plus the GitHub discovery module (reads `catalog-info.yaml` from
  every repo the GitHub App can see) and an `AnnotateScmSlugEntityProcessor`
  variant (`modules/scmSlugAnnotator.ts`) that derives `github.com/project-slug`
  from the entity's location
- techdocs-backend. `app-config.yaml` here uses the local builder/publisher for
  development; production overrides it to an external builder with an S3-style
  publisher, so docs are published by each repo's CI, not built in the portal.

Not installed: scaffolder, search, kubernetes, permission, notifications.
`app-config.yaml` sets `permission.enabled: false` to match.

`catalog.rules` allow `Component, System, API, Resource, Location, Group`;
there is no static `catalog.locations`, entities arrive only through GitHub
discovery. The `examples/` directory is leftover scaffold content and is not
loaded.

## Building

The authoritative Dockerfile is the multi-stage one at the repo root, which
compiles everything inside the image for `linux/arm64`. Images go to
`iad.ocir.io/tnoff/backstage`.

## Local development

```sh
corepack enable
yarn install
yarn start
```

`.yarnrc.yml` sets `npmMinimalAgeGate: 3d`, which quarantines packages published
in the last three days. `@backstage/*` and `nunjitsu` (a transitive dependency
of the scaffolder backend, authored by a Backstage core maintainer) are
preapproved.

## CI and release

GitHub Actions, using reusable workflows from `tnoff/github-workflows`:

- `ci.yml` (pull requests): secret scan, image-input change detection, image
  build and scan. Changes touching only `catalog-info.yaml` or `renovate.json`
  skip the build.
- `release.yml` (push to `main`): assemble the changelog from `changelog.d/`
  fragments, tag, push the image, then dispatch `image-bump` to
  docker-apps' `bump-image-pin.yml`, which opens the pin-bump PR.

## Deployment

Runs in the `backstage` namespace on the `internal` node pool
(`nodeSelector: node_role: internal` plus the matching toleration). See
`techdocs/backstage` in `tnoff/docker-apps` for architecture and operations.
