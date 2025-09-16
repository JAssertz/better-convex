import { entsTableFactory } from 'convex-ents';
import {
  customCtx,
  customMutation,
} from 'convex-helpers/server/customFunctions';
import {
  type CustomBuilder,
  zCustomAction,
  zCustomMutation,
  zCustomQuery,
} from 'convex-helpers/server/zod';
import { paginationOptsValidator } from 'convex/server';
import { ConvexError } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { SessionUser } from './authShared';

import { api } from './_generated/api';
import {
  action,
  internalMutation as baseInternalMutation,
  mutation as baseMutation,
  internalAction,
  internalQuery,
  query,
} from './_generated/server';
import { authComponent } from './auth';
import {
  getSessionUser,
  getSessionUserWriter,
} from './betterAuth/getSessionUser';
import { getEnv } from './helpers/getEnv';
import { rateLimitGuard } from './helpers/rateLimiter';
import { roleGuard } from './helpers/roleGuard';
import { entDefinitions } from './schema';
import { triggers } from './triggers';

type Overwrite<T, U> = Omit<T, keyof U> & U;
type CustomCtx<Builder> =
  Builder extends CustomBuilder<
    any,
    any,
    infer ModCtx,
    any,
    infer InputCtx,
    any,
    any
  >
    ? Overwrite<InputCtx, ModCtx>
    : never;

export type PublicMutationCtx = CustomCtx<
  ReturnType<typeof createPublicMutation>
>;

export type AuthMutationCtx = CustomCtx<ReturnType<typeof createAuthMutation>>;

export type InternalMutationCtx = CustomCtx<
  ReturnType<typeof createInternalMutation>
>;

export type PublicQueryCtx = CustomCtx<ReturnType<typeof createPublicQuery>>;

export type AuthQueryCtx = CustomCtx<ReturnType<typeof createAuthQuery>>;

// Wrap mutation with triggers
const mutation = customMutation(
  baseMutation,
  customCtx(async (ctx) => ({
    db: triggers.wrapDB(ctx).db,
  }))
);
const internalMutation = customMutation(
  baseInternalMutation,
  customCtx(async (ctx) => ({
    db: triggers.wrapDB(ctx).db,
  }))
);

// Helper function to check if function is dev-only
function checkDevOnly(devOnly?: boolean) {
  if (devOnly && getEnv().DEPLOY_ENV === 'production') {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: 'This function is only available in development',
    });
  }
}

export async function getAuthUserId(
  ctx: MutationCtx | QueryCtx
): Promise<{ userId: Id<'users'> }> {
  const userId = (await authComponent.getAuthUser(ctx))?.userId;

  if (!userId) {
    throw new ConvexError({
      code: 'UNAUTHENTICATED',
      message: 'Not authenticated',
    });
  }

  return { userId: userId as Id<'users'> };
}

// Protected query that adds user and userId to context
export const createAuthQuery = ({
  devOnly,
  role,
}: { devOnly?: boolean; role?: 'admin' } = {}) =>
  zCustomQuery(
    query,
    customCtx(async (ctx) => {
      checkDevOnly(devOnly);

      const ctxWithTable = {
        ...ctx,
        table: entsTableFactory(ctx, entDefinitions),
      };

      const user = await getSessionUser(ctxWithTable);

      if (!user) {
        throw new ConvexError({
          code: 'UNAUTHENTICATED',
          message: 'Not authenticated',
        });
      }
      if (role) {
        roleGuard(role, user);
      }

      return {
        ...ctxWithTable,
        user,
        userId: user?.id ?? null,
      };
    })
  );

export const createAuthPaginatedQuery = ({
  devOnly,
  role,
}: { devOnly?: boolean; role?: 'admin' } = {}) =>
  zCustomQuery(query, {
    args: { paginationOpts: paginationOptsValidator },
    input: async (ctx, args) => {
      checkDevOnly(devOnly);

      const ctxWithTable = {
        ...ctx,
        table: entsTableFactory(ctx, entDefinitions),
      };

      const user = await getSessionUser(ctxWithTable);

      if (!user) {
        throw new ConvexError({
          code: 'UNAUTHENTICATED',
          message: 'Not authenticated',
        });
      }
      if (role) {
        roleGuard(role, user);
      }

      return {
        args,
        ctx: {
          ...ctxWithTable,
          user,
          userId: user?.id ?? null,
        },
      };
    },
  });

// Public query that adds user and userId to context if authenticated
export const createPublicQuery = ({
  devOnly,
  publicOnly,
}: {
  devOnly?: boolean;
  /** Set to true when not depending on the session */
  publicOnly?: boolean;
} = {}) =>
  zCustomQuery(
    query,
    customCtx(async (ctx) => {
      checkDevOnly(devOnly);

      const ctxWithTable = {
        ...ctx,
        table: entsTableFactory(ctx, entDefinitions),
      };

      const user = publicOnly ? null : await getSessionUser(ctxWithTable);

      return {
        ...ctxWithTable,
        user,
        userId: user?.id ?? null,
      };
    })
  );

export const createPublicPaginatedQuery = ({
  devOnly,
  publicOnly,
}: {
  devOnly?: boolean;
  /** Set to true when not depending on the session */
  publicOnly?: boolean;
} = {}) =>
  zCustomQuery(query, {
    args: { paginationOpts: paginationOptsValidator },
    input: async (ctx, args) => {
      checkDevOnly(devOnly);

      const ctxWithTable = {
        ...ctx,
        table: entsTableFactory(ctx, entDefinitions),
      };

      const user = publicOnly ? null : await getSessionUser(ctxWithTable);

      return {
        args,
        ctx: {
          ...ctxWithTable,
          user,
          userId: user?.id ?? null,
        },
      };
    },
  });

export const createInternalQuery = ({ devOnly }: { devOnly?: boolean } = {}) =>
  zCustomQuery(
    internalQuery,
    customCtx(async (ctx) => {
      checkDevOnly(devOnly);

      return {
        table: entsTableFactory(ctx, entDefinitions),
      };
    })
  );

// Internal query that adds user and userId to context
export const createAuthInternalQuery = ({
  devOnly,
  role,
}: { devOnly?: boolean; role?: 'admin' } = {}) =>
  zCustomQuery(
    internalQuery,
    customCtx(async (ctx) => {
      checkDevOnly(devOnly);

      const ctxWithTable = {
        ...ctx,
        table: entsTableFactory(ctx, entDefinitions),
      };

      const user = await getSessionUser(ctxWithTable);

      if (!user) {
        throw new ConvexError({
          code: 'UNAUTHENTICATED',
          message: 'Not authenticated',
        });
      }
      if (role) {
        roleGuard(role, user);
      }

      return {
        ...ctxWithTable,
        user,
        userId: user?.id ?? null,
      };
    })
  );

export const createAuthAction = ({
  devOnly,
  rateLimit,
  role,
}: {
  devOnly?: boolean;
  rateLimit?: string | null;
  role?: 'admin';
} = {}) =>
  zCustomAction(
    action,
    customCtx(async (ctx) => {
      checkDevOnly(devOnly);

      const user: SessionUser | null = await ctx.runQuery(
        api.user.getSessionUser,
        {}
      );

      if (!user) {
        throw new ConvexError({
          code: 'UNAUTHENTICATED',
          message: 'Not authenticated',
        });
      }
      if (role) {
        roleGuard(role, user);
      }
      if (rateLimit) {
        await rateLimitGuard({
          ...ctx,
          rateLimitKey: rateLimit,
          user,
        });
      }

      return {
        user: user,
        userId: user.id,
      };
    })
  );

export const createPublicAction = ({ devOnly }: { devOnly?: boolean } = {}) =>
  zCustomAction(
    action,
    customCtx(async () => {
      checkDevOnly(devOnly);

      return {};
    })
  );

export const createInternalAction = ({ devOnly }: { devOnly?: boolean } = {}) =>
  zCustomAction(
    internalAction,
    customCtx(async (ctx) => {
      checkDevOnly(devOnly);

      return {};
    })
  );

export const createInternalMutation = ({
  devOnly,
}: { devOnly?: boolean } = {}) =>
  zCustomMutation(
    internalMutation,
    customCtx(async (ctx) => {
      checkDevOnly(devOnly);

      return {
        table: entsTableFactory(ctx, entDefinitions),
      };
    })
  );

// Protected mutation that adds user and userId to context
export const createAuthMutation = ({
  devOnly,
  rateLimit,
  role,
}: {
  devOnly?: boolean;
  rateLimit?: string | null;
  role?: 'admin';
} = {}) =>
  zCustomMutation(
    mutation,
    customCtx(async (ctx) => {
      checkDevOnly(devOnly);

      const ctxWithTable = {
        ...ctx,
        table: entsTableFactory(ctx, entDefinitions),
      };

      const user = await getSessionUserWriter(ctxWithTable);

      if (!user) {
        throw new ConvexError({
          code: 'USER_NOT_FOUND',
          message: 'Not authenticated',
        });
      }
      if (role) {
        roleGuard(role, user);
      }
      if (rateLimit) {
        await rateLimitGuard({
          ...ctxWithTable,
          rateLimitKey: rateLimit,
          user,
        });
      }

      return {
        ...ctxWithTable,
        user,
        userId: user.id,
      };
    })
  );

// Public mutation that adds user and userId to context if authenticated
export const createPublicMutation = ({
  devOnly,
  rateLimit,
}: { devOnly?: boolean; rateLimit?: string | null } = {}) =>
  zCustomMutation(
    mutation,
    customCtx(async (ctx) => {
      checkDevOnly(devOnly);

      const ctxWithTable = {
        ...ctx,
        table: entsTableFactory(ctx, entDefinitions),
      };

      const user = await getSessionUserWriter(ctxWithTable);

      if (rateLimit) {
        await rateLimitGuard({
          ...ctxWithTable,
          rateLimitKey: rateLimit,
          user,
        });
      }

      return {
        ...ctxWithTable,
        user,
        userId: user?.id ?? null,
      };
    })
  );
