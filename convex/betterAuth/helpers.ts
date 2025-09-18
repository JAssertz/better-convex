import { Id } from '../_generated/dataModel';
import { QueryCtx } from '../_generated/server';

export const getAuthUserId = async (ctx: QueryCtx) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return null;
  }

  return identity.subject as Id<'user'>;
};

export const getHeaders = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    return new Headers();
  }

  const session = await ctx.db
    .query('session')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .first();

  return new Headers({
    ...(session?.token ? { authorization: `Bearer ${session.token}` } : {}),
    ...(session?.ipAddress
      ? { 'x-forwarded-for': session.ipAddress as string }
      : {}),
  });
};

export const getSession = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    return null;
  }

  const doc = await ctx.db
    .query('session')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .first();

  if (!doc) {
    return null;
  }

  const { _id, ...rest } = doc;

  return { id: _id, ...rest };
};
