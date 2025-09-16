import { createApi } from '@convex-dev/better-auth';
import { asyncMap } from 'convex-helpers';
import { v } from 'convex/values';

import { query } from './_generated/server';
import type { Id } from './_generated/dataModel';

import { createAuth } from '../auth';
import schema from './schema';

export const {
  create,
  deleteMany,
  deleteOne,
  findMany,
  findOne,
  updateMany,
  updateOne,
} = createApi(schema, createAuth);

export const listMembers = query({
  args: {
    organizationId: v.string(),
  },
  returns: v.object({
    members: v.array(
      v.object({
        id: v.string(),
        createdAt: v.number(),
        role: v.string(),
        user: v.object({
          id: v.string(),
          email: v.string(),
          image: v.optional(v.string()),
          name: v.optional(v.string()),
        }),
        userId: v.string(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query('member')
      .withIndex('organizationId_userId', (q) =>
        q.eq('organizationId', args.organizationId)
      )
      .collect();

    return {
      members: await asyncMap(members, async (member) => {
        const user = (await ctx.db.get(member.userId as Id<'user'>))!;

        return {
          id: member._id,
          createdAt: member.createdAt,
          role: member.role,
          user: {
            id: user._id,
            email: user.email,
            image: user.image ?? undefined,
            name: user.name,
          },
          userId: member.userId,
        };
      }),
    };
  },
});
