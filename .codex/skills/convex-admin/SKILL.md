---
name: convex-admin
description: Use when implementing admin features with Better Auth and Convex - role-based access, user management, banning
---

# Convex Admin with Better Auth

See [Better Auth Admin Plugin](https://www.better-auth.com/docs/plugins/admin) for full API reference.

## Architecture

**Role-based System:** Role field on user table + middleware checking
**Schema:** user.role ('admin' | 'user'), user.banned, user.banReason, user.banExpires

## Setup

### Server Configuration

**Edit:** `convex/functions/auth.ts`

```typescript
import { admin } from 'better-auth/plugins';

const createAuthOptions = (ctx: GenericCtx) =>
  ({
    // ... existing config
    plugins: [
      admin({
        defaultRole: 'user',
        // adminUserIds: ['user_id_1'], // Always admin regardless of role
        // impersonationSessionDuration: 60 * 60, // 1 hour default
        // defaultBanReason: 'No reason',
        // bannedUserMessage: 'You have been banned',
      }),
      // ... other plugins
    ],
  }) satisfies BetterAuthOptions;
```

### Admin Assignment via Environment

**Edit:** `.env.local`

```
ADMIN=admin@example.com,other@example.com
```

**Edit:** `convex/functions/auth.ts` - Assign admin on user creation:

```typescript
export const authClient = createClient<DataModel, typeof schema>({
  // ... config
  triggers: {
    user: {
      beforeCreate: async (_ctx, data) => {
        const env = getEnv();
        const adminEmails = env.ADMIN;

        const role =
          data.role !== 'admin' && adminEmails?.includes(data.email)
            ? 'admin'
            : data.role;

        return { ...data, role };
      },
    },
  },
});
```

### Client Configuration

**Edit:** `src/lib/convex/auth-client.ts`

```typescript
import { adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // ... existing config
  plugins: [
    adminClient(),
    // ... other plugins
  ],
});
```

## Schema

**Edit:** `convex/functions/schema.ts`

```typescript
user: defineEnt({
  // ... existing fields
  role: v.optional(v.union(v.null(), v.string())), // 'admin' | 'user'
  banned: v.optional(v.union(v.null(), v.boolean())),
  banReason: v.optional(v.union(v.null(), v.string())),
  banExpires: v.optional(v.union(v.null(), v.number())),
})

session: defineEnt({
  // ... existing fields
  impersonatedBy: v.optional(v.union(v.null(), v.string())), // Admin user ID
})
```

## Access Control

### Role Middleware

**Edit:** `convex/lib/crpc.ts`

```typescript
type Meta = {
  auth?: 'optional' | 'required';
  role?: 'admin';
  // ...
};

/** Role middleware - checks admin role from meta after auth middleware */
const roleMiddleware = c.middleware<object>(({ ctx, meta, next }) => {
  const user = (ctx as { user?: { role?: string | null } }).user;
  if (meta.role === 'admin' && user?.role !== 'admin') {
    throw new CRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }
  return next({ ctx });
});

export const authQuery = c.query
  .meta({ auth: 'required' })
  .use(devMiddleware)
  .use(authMiddleware)
  .use(roleMiddleware);

export const authMutation = c.mutation
  .meta({ auth: 'required' })
  .use(devMiddleware)
  .use(authMiddleware)
  .use(roleMiddleware)
  .use(rateLimitMiddleware);
```

### Custom Access Control

**Create:** `convex/shared/permissions.ts`

```typescript
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';

const statement = {
  ...defaultStatements,
  project: ['create', 'read', 'update', 'delete'],
} as const;

export const ac = createAccessControl(statement);

export const admin = ac.newRole({
  ...adminAc.statements,
  project: ['create', 'read', 'update', 'delete'],
});

export const user = ac.newRole({
  project: ['create', 'read'],
});
```

Pass to plugins:

```typescript
// Server
admin({ ac, roles: { admin, user } })

// Client
adminClient({ ac, roles: { admin, user } })
```

## Admin Functions

**Edit:** `convex/functions/admin.ts`

### Check Admin Status

```typescript
export const checkUserAdminStatus = authQuery
  .meta({ role: 'admin' })
  .input(z.object({ userId: zid('user') }))
  .output(z.object({ role: z.string().nullish() }))
  .query(async ({ ctx, input }) => {
    const user = await ctx.table('user').getX(input.userId);
    return { role: user.role };
  });
```

### Update User Role

```typescript
export const updateUserRole = authMutation
  .meta({ role: 'admin' })
  .input(z.object({
    role: z.enum(['user', 'admin']),
    userId: zid('user'),
  }))
  .output(z.boolean())
  .mutation(async ({ ctx, input }) => {
    if (input.role === 'admin' && ctx.user.role !== 'admin') {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Only admin can promote users to admin',
      });
    }

    const targetUser = await ctx.table('user').getX(input.userId);

    if (targetUser.role === 'admin' && ctx.user.role !== 'admin') {
      throw new CRPCError({
        code: 'FORBIDDEN',
        message: 'Cannot modify admin users',
      });
    }

    await targetUser.patch({ role: input.role.toLowerCase() });
    return true;
  });
```

### List All Users (Paginated)

```typescript
const UserListItemSchema = z.object({
  _id: zid('user'),
  _creationTime: z.number(),
  name: z.string().optional(),
  email: z.string(),
  role: z.string(),
  isBanned: z.boolean().optional(),
});

export const getAllUsers = authQuery
  .input(z.object({
    role: z.enum(['all', 'user', 'admin']).optional(),
    search: z.string().optional(),
  }))
  .paginated({ limit: 20, item: UserListItemSchema.nullable() })
  .query(async ({ ctx, input }) => {
    const paginationOpts = { cursor: input.cursor, numItems: input.limit };
    const result = await ctx.table('user').paginate(paginationOpts);

    const enrichedPage = result.page.map((user) => ({
      ...user.doc(),
      isBanned: user?.banned,
      role: user?.role || 'user',
    }));

    return { ...result, page: enrichedPage };
  });
```

## Client Integration

### Check Admin Status

```typescript
const { data: session } = authClient.useSession();
const isAdmin = session?.user?.role === 'admin';
```

### Better Auth Admin API

```typescript
// Create user
await authClient.admin.createUser({
  email: 'user@example.com',
  password: 'password',
  name: 'John Doe',
  role: 'user',
});

// List users (with filtering/sorting/pagination)
const { users, total } = await authClient.admin.listUsers({
  searchValue: 'john',
  searchField: 'name',
  limit: 20,
  offset: 0,
  sortBy: 'createdAt',
  sortDirection: 'desc',
});

// Set role
await authClient.admin.setRole({ userId, role: 'admin' });

// Set password
await authClient.admin.setUserPassword({ userId, newPassword });

// Update user
await authClient.admin.updateUser({ userId, data: { name: 'New Name' } });

// Ban/unban user
await authClient.admin.banUser({ userId, banReason, banExpiresIn });
await authClient.admin.unbanUser({ userId });

// Session management
await authClient.admin.listUserSessions({ userId });
await authClient.admin.revokeUserSession({ sessionToken });
await authClient.admin.revokeUserSessions({ userId }); // All sessions

// Impersonation
await authClient.admin.impersonateUser({ userId });
await authClient.admin.stopImpersonating();

// Delete user
await authClient.admin.removeUser({ userId });
```

### Permission Checking

```typescript
// Check if current user has permission
const { success } = await authClient.admin.hasPermission({
  permissions: { project: ['create', 'update'] },
});

// Check role permission (client-side, no server call)
const canDelete = authClient.admin.checkRolePermission({
  role: 'admin',
  permissions: { project: ['delete'] },
});
```

## API Reference

| Operation | Method | Admin Required |
|-----------|--------|----------------|
| Create user | `authClient.admin.createUser` | Yes |
| List users | `authClient.admin.listUsers` | Yes |
| Set role | `authClient.admin.setRole` | Yes |
| Set password | `authClient.admin.setUserPassword` | Yes |
| Update user | `authClient.admin.updateUser` | Yes |
| Ban user | `authClient.admin.banUser` | Yes |
| Unban user | `authClient.admin.unbanUser` | Yes |
| List sessions | `authClient.admin.listUserSessions` | Yes |
| Revoke session | `authClient.admin.revokeUserSession` | Yes |
| Revoke all sessions | `authClient.admin.revokeUserSessions` | Yes |
| Impersonate | `authClient.admin.impersonateUser` | Yes |
| Stop impersonating | `authClient.admin.stopImpersonating` | Yes |
| Remove user | `authClient.admin.removeUser` | Yes |
| Check permission | `authClient.admin.hasPermission` | No |
| Check role permission | `authClient.admin.checkRolePermission` | No |
