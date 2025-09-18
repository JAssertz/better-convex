import type { MutationCtx, QueryCtx } from '@convex/_generated/server';
import type { SessionUser } from '@convex/authShared';
import type { CtxWithTable, Ent, EntWriter } from '@convex/shared/types';

import { getAuthUserId } from '@convex/betterAuth/helpers';
import { getProduct, productToPlan } from '@convex/polar/product';
import { Id } from '@convex/_generated/dataModel';

import { type InternalMutationCtx } from '@convex/functions';

const getSessionData = async (ctx: CtxWithTable<MutationCtx>) => {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    return null;
  }

  console.time('getSession');
  const [_session, user] = await Promise.all([
    ctx.table('session').get('userId', userId),
    ctx.table('user').get(userId),
  ]);

  console.timeEnd('getSession');

  if (!_session || !user) {
    return null;
  }

  const session = {
    ..._session,
    activeOrganizationId:
      (_session.activeOrganizationId as Id<'organization'>) ?? null,
  };

  const activeOrganizationId = session.activeOrganizationId;

  console.time('table.users.get');
  const [subscription] = await Promise.all([
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
  console.timeEnd('table.users.get');

  if (!user) {
    return null;
  }

  const activeOrganization = await (async () => {
    if (!activeOrganizationId) {
      return {} as never;
    }

    const [activeOrg, currentMember] = await Promise.all([
      ctx.table('organization').getX(activeOrganizationId),
      ctx
        .table('member')
        .get('organizationId_userId', activeOrganizationId, userId),
    ]);

    return {
      ...activeOrg.doc(),
      id: activeOrg._id,
      role: currentMember?.role || 'member',
    };
  })();

  return {
    user,
    activeOrganization,
    plan: productToPlan(subscription?.productId) as 'premium' | undefined,
    session,
    isAdmin: user.role === 'admin',
  };
};

// Query to fetch user data for session/auth checks
export const getSessionUser = async (
  ctx: CtxWithTable<QueryCtx>
): Promise<(Ent<'user'> & SessionUser) | null> => {
  const { user, activeOrganization, plan, session, isAdmin } =
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
    isAdmin,
    plan,
    session: {
      id: session._id,
      ...session,
    },
  };
};

export const getSessionUserWriter = async (
  ctx: CtxWithTable<MutationCtx>
): Promise<(EntWriter<'user'> & SessionUser) | null> => {
  const { user, activeOrganization, plan, session, isAdmin } =
    (await getSessionData(ctx)) ?? ({} as never);

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
    isAdmin,
    plan,
    session: {
      id: session._id,
      ...session,
    },
    delete: user.delete,
    patch: user.patch,
    replace: user.replace,
  };
};

export const createUser = async (
  ctx: InternalMutationCtx,
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
  const newUserId = await ctx.table('user').insert({
    bio: args.bio,
    createdAt: Date.now(),
    email: args.email,
    emailVerified: true,
    image: args.image,
    name: args.name,
    role: args.role || 'user',
    updatedAt: Date.now(),
  });

  return newUserId;
};
