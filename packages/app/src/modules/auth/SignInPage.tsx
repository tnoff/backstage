import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { SignInPage as GuestSignInPage } from '@backstage/core-components';

// Guest-only: nobody types a password here, they already got past the SSH
// bastion to reach this pod in the first place. This exists so TechDocs has
// a real identity to mint its viewer cookie from -- see
// packages/backend/src/index.ts for why that is the one thing in this app
// that actually needs a sign-in.
export const SignInPageExtension = SignInPageBlueprint.make({
  params: {
    loader: async () => props => (
      <GuestSignInPage {...props} providers={['guest']} />
    ),
  },
});
