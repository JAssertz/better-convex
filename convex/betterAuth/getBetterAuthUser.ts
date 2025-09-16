import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { BetterAuthUser } from '../authShared';

import { components } from '../_generated/api';

// Helper to get user data from Better Auth
export const getBetterAuthUser = async (
  ctx: MutationCtx | QueryCtx,
  userId: Id<'users'>
): Promise<BetterAuthUser | null> => {
  try {
    const betterAuthUser: BetterAuthUser | null = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: 'user',
        where: [
          {
            field: 'userId',
            value: userId,
          },
        ],
      }
    );

    return betterAuthUser;
  } catch {
    return null;
  }
};

export const getBetterAuthUserById = async (
  ctx: MutationCtx | QueryCtx,
  id: string
): Promise<BetterAuthUser | null> => {
  try {
    const betterAuthUser: BetterAuthUser | null = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: 'user',
        where: [
          {
            field: 'id',
            value: id,
          },
        ],
      }
    );

    return betterAuthUser;
  } catch {
    return null;
  }
};

// Helper to find user by email in Better Auth
export const getBetterAuthUserByEmail = async (
  ctx: MutationCtx | QueryCtx,
  email: string
): Promise<BetterAuthUser | null> => {
  try {
    const betterAuthUser: BetterAuthUser | null = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: 'user',
        where: [
          {
            field: 'email',
            value: email,
          },
        ],
      }
    );

    return betterAuthUser;
  } catch {
    return null;
  }
};
