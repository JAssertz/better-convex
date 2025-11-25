import { internal } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
import type { MutationCtx, QueryCtx } from '@convex/_generated/server';
import type { AuthCtx, CtxWithTable } from '@convex/functions';
import { getProduct, productToPlan } from '@convex/polar/product';
import type { Ent, EntWriter } from '@convex/shared/types';
import { getSession } from 'better-auth-convex';
import { ConvexError } from 'convex/values';

export type SessionUser = Omit<Doc<'user'>, '_creationTime' | '_id'> & {
  id: Id<'user'>;
  activeOrganization:
    | (Omit<Doc<'organization'>, '_id'> & {
        id: Id<'organization'>;
        role: Doc<'member'>['role'];
      })
    | null;
  isAdmin: boolean;
  session: Doc<'session'>;
  impersonatedBy?: string;
  plan?: 'premium';
};

const getSessionData = async (ctx: CtxWithTable<MutationCtx>) => {
  const session = await getSession(ctx);

  if (!session) {
    return null;
  }

  const activeOrganizationId =
    session.activeOrganizationId as Id<'organization'> | null;

  const [user, subscription] = await Promise.all([
    ctx.table('user').get(session.userId),
    (async () => {
      if (!activeOrganizationId) {
        return null;
      }

      // Get active subscription for the organization
      const subscription = await ctx
        .table('subscriptions')
        .get('organizationId_status', activeOrganizationId, 'active');

      if (!subscription) {
        return null;
      }

      const product = getProduct(subscription.productId);

      return {
        ...subscription.doc(),
        product: product ?? null,
      };
    })(),
  ]);

  if (!user) {
    return null;
  }

  const activeOrganization = await (async () => {
    if (!activeOrganizationId) {
      return null;
    }

    const [activeOrg, currentMember] = await Promise.all([
      ctx.table('organization').getX(activeOrganizationId),
      ctx
        .table('member')
        .get('organizationId_userId', activeOrganizationId, session.userId),
    ]);

    return {
      ...activeOrg.doc(),
      id: activeOrg._id,
      role: currentMember?.role || 'member',
    };
  })();

  return {
    activeOrganization,
    impersonatedBy: session.impersonatedBy ?? undefined,
    isAdmin: user.role === 'admin',
    plan: productToPlan(subscription?.productId),
    session,
    user,
  } as const;
};

// Query to fetch user data for session/auth checks
export const getSessionUser = async (
  ctx: CtxWithTable<QueryCtx>
): Promise<(Ent<'user'> & SessionUser) | null> => {
  const { activeOrganization, impersonatedBy, isAdmin, plan, session, user } =
    (await getSessionData(ctx as any)) ?? ({} as never);

  if (!user) {
    return null;
  }

  return {
    ...user,
    id: user._id,
    activeOrganization,
    doc: user.doc,
    edge: user.edge,
    edgeX: user.edgeX,
    impersonatedBy,
    isAdmin,
    plan,
    session,
  };
};

export const getSessionUserWriter = async (
  ctx: CtxWithTable<MutationCtx>
): Promise<(EntWriter<'user'> & SessionUser) | null> => {
  const { activeOrganization, impersonatedBy, isAdmin, plan, session, user } =
    (await getSessionData(ctx)) ?? ({} as never);

  if (!user) {
    return null;
  }

  return {
    ...user,
    id: user._id,
    activeOrganization,
    delete: user.delete,
    doc: user.doc,
    edge: user.edge,
    edgeX: user.edgeX,
    impersonatedBy,
    isAdmin,
    patch: user.patch,
    plan,
    replace: user.replace,
    session,
  };
};

export const createUser = async (
  ctx: CtxWithTable<MutationCtx>,
  args: {
    email: string;
    name: string;
    bio?: string | null;
    github?: string | null;
    image?: string | null;
    location?: string | null;
    role?: 'admin' | 'user';
  }
) => {
  // WARNING: This bypasses Better Auth hooks including:
  const now = new Date();

  const beforeCreateData = await ctx.runMutation(internal.auth.beforeCreate, {
    data: {
      bio: args.bio ?? undefined,
      createdAt: now.getTime(),
      email: args.email,
      emailVerified: false,
      github: args.github ?? undefined,
      image: args.image ?? undefined,
      location: args.location ?? undefined,
      name: args.name,
      role: args.role ?? 'user',
      updatedAt: now.getTime(),
    },
    model: 'user',
  });

  const userId = await ctx.table('user').insert(beforeCreateData);

  const user = await ctx.table('user').getX(userId);

  await ctx.runMutation(internal.auth.onCreate, {
    doc: user.doc(),
    model: 'user',
  });

  // Create account record for credential provider
  await ctx.table('account').insert({
    accountId: userId,
    createdAt: now.getTime(),
    password: Math.random().toString(36).slice(-12), // Random password
    providerId: 'credential',
    updatedAt: now.getTime(),
    userId,
  });

  return userId;
};

export const hasPermission = async (
  ctx: AuthCtx,
  body: NonNullable<Parameters<typeof ctx.auth.api.hasPermission>[0]>['body'],
  shouldThrow = true
) => {
  const canUpdate = await ctx.auth.api.hasPermission({
    body,
    headers: ctx.auth.headers,
  });

  if (shouldThrow && !canUpdate.success) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions for this action',
    });
  }

  return canUpdate.success;
};
