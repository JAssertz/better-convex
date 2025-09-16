import type { MutationCtx, QueryCtx } from '@convex/_generated/server';
import type {
  BetterAuthMember,
  BetterAuthOrganization,
  Session,
  SessionUser,
} from '@convex/authShared';
import type { Ent, EntWriter } from '@convex/shared/types';

import { components } from '@convex/_generated/api';
import { createAuth, getHeaders } from '@convex/auth';
import { getEnv } from '@convex/helpers/getEnv';
import { getOrganizationSubscription } from '@convex/polar/getOrganizationSubscription';
import { productToPlan } from '@convex/polar/product';
import { entDefinitions } from '@convex/schema';
import { entsTableFactory } from 'convex-ents';

// Helper function to get active organization data
const getActiveOrganizationData = async (
  ctx: QueryCtx,
  args: {
    activeOrganizationId: string | null;
    betterAuthUserId: string;
  }
) => {
  if (!args.activeOrganizationId) {
    return {} as Omit<BetterAuthOrganization, '_id'> &
      Pick<BetterAuthMember, 'role'> & { id: string };
  }

  console.time('betterAuth.adapter.findOne organization + member');
  const [activeOrg, currentMember]: [BetterAuthOrganization, BetterAuthMember] =
    await Promise.all([
      ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'organization',
        where: [
          {
            field: 'id',
            value: args.activeOrganizationId,
          },
        ],
      }),
      ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'member',
        where: [
          {
            field: 'userId',
            value: args.betterAuthUserId,
          },
          {
            field: 'organizationId',
            value: args.activeOrganizationId,
          },
        ],
      }),
    ]);
  console.timeEnd('betterAuth.adapter.findOne organization + member');

  return {
    ...activeOrg,
    id: activeOrg._id,
    role: currentMember?.role || 'member',
  };
};

// Query to fetch user data for session/auth checks
export const getSessionUser = async (
  ctx: QueryCtx
): Promise<(Ent<'users'> & SessionUser) | null> => {
  const auth = createAuth(ctx);
  const headers = await getHeaders(ctx);

  console.time('auth.api.getSession');
  const session = (await auth.api.getSession({
    headers,
  })) as Session | null;
  console.timeEnd('auth.api.getSession');

  if (!session) {
    return null;
  }

  const { image, ...authUser } = session.user;

  const table = entsTableFactory(ctx, entDefinitions);
  console.time('table.users.get');
  const [user, subscription] = await Promise.all([
    table('users').get(session.user.userId),
    getOrganizationSubscription(ctx as any, {
      organizationId: session.session.activeOrganizationId,
    }),
  ]);
  console.timeEnd('table.users.get');

  if (!user) {
    return null;
  }

  // Get active organization data
  const activeOrganization = await getActiveOrganizationData(ctx, {
    activeOrganizationId: session.session.activeOrganizationId!,
    betterAuthUserId: session.user.id,
  });

  return {
    ...authUser,
    ...user,
    id: user._id,
    activeOrganization,
    doc: user.doc,
    edge: user.edge,
    edgeX: user.edgeX,
    isAdmin: authUser.role === 'admin',
    plan: productToPlan(subscription?.productId),
    session: session.session,
  };
};

export const getSessionUserWriter = async (
  ctx: MutationCtx
): Promise<(EntWriter<'users'> & SessionUser) | null> => {
  const auth = createAuth(ctx);
  const headers = await getHeaders(ctx);
  const session = (await auth.api.getSession({
    headers,
  })) as Session | null;

  if (!session) {
    return null;
  }

  const { image, ...authUser } = session.user;

  const table = entsTableFactory(ctx, entDefinitions);
  const [user, subscription] = await Promise.all([
    table('users').get(session.user.userId),
    getOrganizationSubscription(ctx as any, {
      organizationId: session.session.activeOrganizationId,
    }),
  ]);

  if (!user) {
    return null;
  }

  // Get active organization data
  const activeOrganization = await getActiveOrganizationData(ctx, {
    activeOrganizationId: session.session.activeOrganizationId!,
    betterAuthUserId: session.user.id,
  });

  return {
    ...authUser,
    ...user,
    id: user._id,
    activeOrganization,
    delete: user.delete,
    doc: user.doc,
    edge: user.edge,
    edgeX: user.edgeX,
    isAdmin: authUser.role === 'admin',
    patch: user.patch,
    plan: productToPlan(subscription?.productId),
    replace: user.replace,
    session: session.session,
  };
};

const mapDevSettings = (
  devSettings?: {
    plan: 'default' | 'free' | 'premium' | 'team';
    role: string;
  } | null
): {
  isAdmin?: boolean;
  plan?: 'premium' | 'team';
} => {
  if (getEnv().DEPLOY_ENV === 'production' || !devSettings) return {};

  const res: {
    isAdmin?: boolean;
    plan?: 'premium' | 'team';
  } = {};

  if (devSettings.role && devSettings.role !== 'default') {
    res.isAdmin = devSettings.role === 'admin';
  }
  if (devSettings.plan && devSettings.plan !== 'default') {
    res.plan =
      devSettings.plan === 'free'
        ? undefined
        : (devSettings.plan as 'premium' | 'team');
  }

  return res;
};
