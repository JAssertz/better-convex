import type { auth } from '@convex/betterAuth/auth';

import { convexClient } from '@convex-dev/better-auth/client/plugins';
// import { polarClient } from '@polar-sh/better-auth';
import {
  adminClient,
  inferAdditionalFields,
  organizationClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    adminClient(),
    organizationClient(),
    // polarClient(),
    convexClient(),
  ],
});

// Export hooks from the auth client
export const {
  signIn,
  signOut,
  signUp,
  useActiveOrganization,
  useListOrganizations,
  useSession,
} = authClient;
