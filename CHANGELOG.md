# Changelog

All notable changes to this project are documented here.

Entries are assembled from `changelog.d/` fragments by CI — do not edit this
file directly.
## [0.0.1] - 2026-09-05

### Changed

- Scaffolded the Backstage app (`@backstage/create-app` 0.9.1) and wired it to the standard CI templates: buildkit build-check on MRs, arm64 image push to OCIR on main, trufflehog, renovate, and the changelog/version flow.

