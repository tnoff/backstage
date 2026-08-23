# backstage

The [Backstage](https://backstage.io) developer portal for the OKE cluster —
a service catalog for the repos under `tnoff-projects/`, plus the docs and
runbooks that live next to them.

Scope, phasing, and the decisions behind it: [`docs/projects/service-catalog.md`](https://gitlab.com/tnoff-projects/docs/-/blob/main/projects/service-catalog.md).

## Why this repo exists

Backstage ships no upstream production image. The documented deployment path
is to scaffold your own app and build an image from it, so the portal is a
fork you maintain rather than an artifact you pull. The cluster is `arm64`
(`VM.Standard.A1.Flex`), which rules out the community demo images as well.

This repo therefore holds the Backstage app itself and builds an image into
OCIR that OKE can actually run.

## Status

Seeded, not yet scaffolded. The app lands in a follow-up MR.

This initial commit exists because a GitHub repo with no commits deadlocks
`apply:infra` — `github_branch.default` cannot resolve `refs/heads/main` in an
empty repo. The push-mirror below populates the GitHub side on first push,
which clears it.

## Layout

- GitLab (`tnoff-projects/backstage`) is the source of truth.
- GitHub (`tnoff/backstage`) is a push-mirror target only — do not push to it.
- Images are pushed to `iad.ocir.io/tnoff/backstage`, and a successful build
  triggers the image-pin bump on `docker-apps`.

## Deployment

Runs on the `internal` node pool alongside the monitoring stack, in the
`backstage` namespace. Anything scheduled there needs both a
`nodeSelector` of `node_role: internal` and a matching toleration for the
`node_role=internal:NoSchedule` taint.
