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
 *   techdocs                  no docs published; TechDocs is phase 3
 *   permission (+allow-all)   `permission.enabled` is set false in
 *                             app-config.production.yaml, so the frontend
 *                             short-circuits its checks and never calls
 *                             /api/permission
 *   auth (+guest provider)    nothing ever called them -- see below
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
 * On auth specifically, because "it was configured" made it look alive:
 * packages/app uses the DECLARATIVE frontend and installs no SignInPage
 * extension. prepareSpecializedApp therefore leaves requiresSignIn false and
 * clears the identity handlers, so the UI never initiates a sign-in and
 * nothing ever reached /api/auth. The guest provider logged "Configuring auth
 * provider: guest" at startup and would then have THROWN if called -- it
 * refuses to run unless NODE_ENV is 'development' or
 * `dangerouslyAllowOutsideDevelopment` is set, and the Dockerfile sets
 * NODE_ENV=production. Configured, initialised, and unreachable.
 *
 * Access control is the bastion, not the app: the only route in is a
 * port-forward authenticated by an OCI identity and an SSH key.
 *
 * Restoring sign-in takes TWO changes -- a provider module and config here,
 * AND a SignInPage extension in packages/app. Doing only the first rebuilds
 * exactly the dead wiring this removed.
 */

import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// Serves the compiled frontend bundle. Without it there is no UI at all.
backend.add(import('@backstage/plugin-app-backend'));

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

backend.start();
