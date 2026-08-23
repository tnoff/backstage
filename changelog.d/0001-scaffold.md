- Scaffolded the Backstage app (`@backstage/create-app` 0.9.1) and wired it to
  the standard CI templates: buildkit build-check on MRs, arm64 image push to
  OCIR on main, trufflehog, renovate, and the changelog/version flow.
