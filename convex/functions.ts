import { getAuth } from '@convex/auth';
import { registerTriggers } from '@convex/triggers';
import { getHeaders } from 'better-auth-convex';
import { type Auth, paginationOptsValidator } from 'convex/server';
import { ConvexError } from 'convex/values';
import { entsTableFactory } from 'convex-ents';
import {
  customCtx,
  customMutation,
} from 'convex-helpers/server/customFunctions';
import {
  zCustomAction,
  zCustomMutation,
  zCustomQuery,
} from 'convex-helpers/server/zod4';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';
import {
  action,
  internalMutation as baseInternalMutation,
  mutation as baseMutation,
  internalAction,
  internalQuery,
  query,
} from './_generated/server';
import {
  getSessionUser,
  getSessionUserWriter,
  type SessionUser,
} from './authHelpers';
import { getEnv } from './helpers/getEnv';
import { rateLimitGuard } from './helpers/rateLimiter';
import { roleGuard } from './helpers/roleGuard';
import { entDefinitions } from './schema';
import type { Ent, EntWriter } from './shared/types';

// Initialize triggers
const triggers = registerTriggers();

export type CtxWithTable<Ctx extends MutationCtx | QueryCtx = QueryCtx> =
  ReturnType<typeof getCtxWithTable<Ctx>>;

type CtxUser<Ctx extends MutationCtx | QueryCtx = QueryCtx> = SessionUser &
  (Ctx extends MutationCtx ? EntWriter<'user'> : Ent<'user'>);

export type GenericCtx = ActionCtx | MutationCtx | QueryCtx;

export type PublicCtx<Ctx extends MutationCtx | QueryCtx = QueryCtx> =
  CtxWithTable<Ctx> & {
    auth: Auth & Partial<ReturnType<typeof getAuth> & { headers: Headers }>;
    user: CtxUser<Ctx> | null;
    userId: Id<'user'> | null;
  };

export type AuthCtx<Ctx extends MutationCtx | QueryCtx = QueryCtx> =
  CtxWithTable<Ctx> & {
    auth: Auth & ReturnType<typeof getAuth> & { headers: Headers };
    user: CtxUser<Ctx>;
    userId: Id<'user'>;
  };

export type AuthMutationCtx<Ctx extends MutationCtx = MutationCtx> =
  AuthCtx<Ctx>;

// Wrap mutation with triggers
const mutation = customMutation(
  baseMutation,
  customCtx(async (ctx) => ({
    db: triggers.wrapDB(ctx).db,
  }))
);
export const internalMutation = customMutation(
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

export const getCtxWithTable = <Ctx extends MutationCtx | QueryCtx>(
  ctx: Ctx
) => {
  // Use the db from ctx (which may already be wrapped by triggers)
  // entsTableFactory will use ctx.db internally, preserving trigger wrapping
  return {
    ...ctx,
    table: entsTableFactory(ctx, entDefinitions),
  };
};

type AuthError = {
  code: string;
  message: string;
};

const AUTH_REQUIRED_ERROR: AuthError = {
  code: 'UNAUTHENTICATED',
  message: 'Not authenticated',
} as const;

const MUTATION_AUTH_REQUIRED_ERROR: AuthError = {
  code: 'USER_NOT_FOUND',
  message: 'Not authenticated',
} as const;

function requireUser<T>(
  user: T | null,
  error: AuthError = AUTH_REQUIRED_ERROR
): T {
  if (!user) {
    throw new ConvexError(error);
  }

  return user;
}

async function withRequiredUserContext<Ctx extends MutationCtx | QueryCtx>(
  ctx: CtxWithTable<Ctx>,
  user: CtxUser<Ctx>
) {
  return {
    ...ctx,
    auth: {
      ...ctx.auth,
      ...getAuth(ctx),
      headers: await getHeaders(ctx, user.session),
    },
    user,
    userId: user.id,
  };
}

async function withOptionalUserContext<Ctx extends MutationCtx | QueryCtx>(
  ctx: CtxWithTable<Ctx>,
  user: CtxUser<Ctx> | null
) {
  return {
    ...ctx,
    auth: user
      ? {
          ...ctx.auth,
          ...getAuth(ctx),
          headers: await getHeaders(ctx, user.session),
        }
      : ctx.auth,
    user,
    userId: user?.id ?? null,
  };
}

async function applyRateLimit(
  ctx: ActionCtx | MutationCtx,
  rateLimit: string | null | undefined,
  user: Pick<SessionUser, 'id' | 'plan'> | null
) {
  if (!rateLimit) return;

  await rateLimitGuard({
    ...ctx,
    rateLimitKey: rateLimit,
    user,
  });
}

// Protected query that adds user and userId to context
export const createAuthQuery = ({
  devOnly,
  role,
}: {
  devOnly?: boolean;
  role?: 'admin';
} = {}) =>
  zCustomQuery(
    query,
    customCtx(async (_ctx) => {
      checkDevOnly(devOnly);

      const ctx = getCtxWithTable(_ctx);
      const user = requireUser(await getSessionUser(ctx));

      if (role) {
        roleGuard(role, user);
      }

      return withRequiredUserContext(ctx, user);
    })
  );

export const createAuthPaginatedQuery = ({
  devOnly,
  role,
}: {
  devOnly?: boolean;
  role?: 'admin';
} = {}) =>
  zCustomQuery(query, {
    args: { paginationOpts: paginationOptsValidator },
    input: async (_ctx, args) => {
      checkDevOnly(devOnly);

      const ctx = getCtxWithTable(_ctx);
      const user = requireUser(await getSessionUser(ctx));

      if (role) {
        roleGuard(role, user);
      }

      return {
        args,
        ctx: await withRequiredUserContext(ctx, user),
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
    customCtx(async (_ctx) => {
      checkDevOnly(devOnly);

      const ctx = getCtxWithTable(_ctx);
      const user = publicOnly ? null : await getSessionUser(ctx);

      return withOptionalUserContext(ctx, user);
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
    input: async (_ctx, args) => {
      checkDevOnly(devOnly);

      const ctx = getCtxWithTable(_ctx);
      const user = publicOnly ? null : await getSessionUser(ctx);

      return {
        args,
        ctx: await withOptionalUserContext(ctx, user),
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
}: {
  devOnly?: boolean;
  role?: 'admin';
} = {}) =>
  zCustomQuery(
    internalQuery,
    customCtx(async (_ctx) => {
      checkDevOnly(devOnly);

      const ctx = getCtxWithTable(_ctx);
      const user = requireUser(await getSessionUser(ctx));

      if (role) {
        roleGuard(role, user);
      }

      return withRequiredUserContext(ctx, user);
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

      const rawUser = await ctx.runQuery(api.user.getSessionUser, {});
      const user = requireUser(rawUser as SessionUser | null);

      if (role) {
        roleGuard(role, user);
      }

      await applyRateLimit(ctx, rateLimit, user);

      return {
        ...ctx,
        user,
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
    customCtx(async (_) => {
      checkDevOnly(devOnly);

      return {};
    })
  );

export const createInternalMutation = ({
  devOnly,
}: {
  devOnly?: boolean;
} = {}) =>
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
    customCtx(async (_ctx) => {
      checkDevOnly(devOnly);

      const ctx = getCtxWithTable(_ctx);
      const user = requireUser(
        await getSessionUserWriter(ctx),
        MUTATION_AUTH_REQUIRED_ERROR
      );

      if (role) {
        roleGuard(role, user);
      }

      await applyRateLimit(ctx, rateLimit, user);

      return withRequiredUserContext(ctx, user);
    })
  );

// Public mutation that adds user and userId to context if authenticated
export const createPublicMutation = ({
  devOnly,
  rateLimit,
}: {
  devOnly?: boolean;
  rateLimit?: string | null;
} = {}) =>
  zCustomMutation(
    mutation,
    customCtx(async (_ctx) => {
      checkDevOnly(devOnly);

      const ctx = getCtxWithTable(_ctx);
      const user = await getSessionUserWriter(ctx);

      await applyRateLimit(ctx, rateLimit, user);

      return withOptionalUserContext(ctx, user);
    })
  );
