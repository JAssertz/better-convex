import type { auth } from '@convex/auth';
import { ac, roles } from '@convex/authPermissions';
import { convexClient } from '@convex-dev/better-auth/client/plugins';

// import { polarClient } from '@polar-sh/better-auth';
import {
  adminClient,
  inferAdditionalFields,
  organizationClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  plugins: [
    inferAdditionalFields<typeof auth>(),
    adminClient(),
    organizationClient({
      ac,
      roles,
    }),
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

export function checkRolePermission(args: {
  permissions: NonNullable<
    Parameters<
      typeof authClient.organization.checkRolePermission
    >[0]['permissions']
  >;
  role?: string | null;
}) {
  return authClient.organization.checkRolePermission({
    permissions: args.permissions,
    role: (args.role as any) ?? 'member',
  });
}
