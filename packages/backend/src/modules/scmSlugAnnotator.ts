import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { AnnotateScmSlugEntityProcessor } from '@backstage/plugin-catalog-backend';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node';

/**
 * Derives the SCM project-slug annotation instead of having every repo hand-write it.
 *
 * AnnotateScmSlugEntityProcessor ships inside @backstage/plugin-catalog-backend
 * -- already installed -- but is NOT one of the default processors. Verified
 * rather than assumed: CatalogBuilder.getDefaultProcessors() returns exactly
 * FileReaderProcessor, UrlReaderProcessor and AnnotateLocationEntityProcessor.
 * So it has to be registered, which is what this module does.
 *
 * What it does: for a Component whose location is a `url:` -- which is every
 * entity the GitHub discovery provider emits -- it parses the location target
 * with git-url-parse and sets `<host>/project-slug` to `owner/name`.
 *
 * Two properties make this better than writing the annotation by hand:
 *
 *   1. It cannot go stale. The slug is derived from the URL the entity was
 *      actually read from, so it is right by construction.
 *
 *   2. It picks the annotation NAME from the integration type -- github.com/
 *      project-slug, gitlab.com/project-slug, or dev.azure.com/project-repo.
 *      That matters here specifically: this fleet moved from GitLab to GitHub,
 *      and the stale `gitlab.com/project-slug` left behind in the project spec
 *      is exactly the bug this prevents. A future host move needs no edit to
 *      any descriptor.
 *
 * An explicit annotation still wins -- the processor only fills in a slug when
 * the entity does not already carry one -- so a repo that needs to override it
 * still can.
 */
export const catalogModuleScmSlugAnnotator = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'scm-slug-annotator',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        config: coreServices.rootConfig,
      },
      async init({ catalog, config }) {
        catalog.addProcessor(AnnotateScmSlugEntityProcessor.fromConfig(config));
      },
    });
  },
});
