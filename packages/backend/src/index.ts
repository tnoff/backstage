/*
 * Catalog-only backend.
 *
 * Trimmed from the create-app default, which registers 21 plugins. The goal
 * for now is a working software catalog and nothing else; everything below
 * that is not needed for that is removed rather than left running.
 *
 * Removing a `backend.add` line stops the plugin being INITIALISED. It does
 * not remove the dependency, so the image is the same size -- shrinking that
 * means dropping the packages from package.json and regenerating yarn.lock,
 * which is a separate change because the Dockerfile runs
 * `yarn install --immutable` and a stale lockfile fails the build outright.
 *
 * Removed, and why each is safe to drop for a catalog:
 *   proxy                     nothing proxies through this yet
 *   scaffolder (+github,      no software templates; also drops the catalog's
 *     +notifications)         scaffolder-entity-model module
 *   permission (+allow-all)   `permission.enabled` is set false in
 *                             app-config.production.yaml, so the frontend
 *                             short-circuits its checks and never calls
 *                             /api/permission
 *   search (+pg, +catalog,    still nothing worth indexing at this size; revisit
 *     +techdocs)               once discovery has pulled in the whole fleet
 *   kubernetes                phase 2 at the earliest, and it needs a cluster
 *                             locator config that does not exist yet
 *   user-settings             per-user state we have no users for
 *   notifications, signals    both exist to serve other plugins' events
 *   mcp-actions               not wired to anything
 *
 * Each is one line to restore, and the removals are deliberately grouped so
 * putting one back does not require re-deriving what it depended on.
 *
 * Auth (+guest provider) is back, for one reason only: TechDocs' static doc
 * viewer mints a browser cookie from the caller's credentials before it will
 * serve iframed HTML
 * (GET /api/techdocs/.backstage/auth/v1/cookie), and that minting endpoint
 * refuses to run for an anonymous caller -- `dangerouslyDisableDefaultAuthPolicy`
 * lets requests through without credentials, it does not manufacture an
 * identity to sign a cookie with. Every other plugin here is fine with
 * anonymous, so this was previously left out entirely (see git history for
 * that reasoning) -- restoring it took both halves this time: this module
 * AND the SignInPage extension in packages/app/src/modules/auth, since the
 * first alone reproduces the exact dead-wiring bug that was here before.
 *
 * Access control is still the bastion, not the app: the only route in is a
 * port-forward authenticated by an OCI identity and an SSH key. Guest auth
 * hands out a shared `user:development/guest` identity to anyone who is
 * already on that route -- it exists so TechDocs has *an* identity to work
 * with, not to gate who gets one. `dangerouslyAllowOutsideDevelopment: true`
 * is required in app-config.yaml because the Dockerfile sets
 * NODE_ENV=production and the guest provider otherwise refuses to run there.
 */

import { createBackend } from '@backstage/backend-defaults';

import { catalogModuleScmSlugAnnotator } from './modules/scmSlugAnnotator';

const backend = createBackend();

// Serves the compiled frontend bundle. Without it there is no UI at all.
backend.add(import('@backstage/plugin-app-backend'));

// Guest-only sign-in -- see the comment above for why this exists at all.
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));

// The point of the exercise.
backend.add(import('@backstage/plugin-catalog-backend'));
// Kept deliberately: it subscribes to catalog errors and logs them, which is
// the only visibility into a location that fails to load.
// https://backstage.io/docs/features/software-catalog/configuration#subscribing-to-catalog-errors
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));
// Catalog discovery across the fleet. Reads catalog-info.yaml out of every repo
// the tnoff-backstage App can see and emits a Location for each -- so adding a
// descriptor to a repo is the whole of onboarding it, with no config change
// here. Configured under catalog.providers.github in app-config.production.yaml.
backend.add(import('@backstage/plugin-catalog-backend-module-github'));
// Derives <host>/project-slug from each entity's location instead of every repo
// hand-writing it. See the module for why it is registered rather than default.
backend.add(catalogModuleScmSlugAnnotator);

// Phase 3. Renders whatever a component's backstage.io/techdocs-ref points at;
// with no annotation on an entity it just has no Docs tab, so this is safe to
// turn on ahead of any repo actually publishing docs. Needs a `techdocs:`
// block in config -- see app-config.yaml -- and, before this reaches prod,
// an external publisher in app-config.production.yaml: the default local
// storage lives on the pod's filesystem, so it does not survive a restart or
// exist on any other replica.
backend.add(import('@backstage/plugin-techdocs-backend'));

backend.start();
