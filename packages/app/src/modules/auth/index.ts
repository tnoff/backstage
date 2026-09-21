import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageExtension } from './SignInPage';

export const authModule = createFrontendModule({
  pluginId: 'app',
  extensions: [SignInPageExtension],
});
