import type { Doc, Id } from '@convex/_generated/dataModel';
import type { Member } from 'better-auth/plugins';

import {
  getBetterAuthUserByEmail,
  getBetterAuthUserById,
} from '@convex/betterAuth/getBetterAuthUser';
import {
  type InternalMutationCtx,
  createInternalMutation,
  createInternalQuery,
} from '@convex/functions';
import { zid } from 'convex-helpers/server/zod';
import { ConvexError } from 'convex/values';
import { z } from 'zod';

import { components, internal } from './_generated/api';
import { getEnv } from './helpers/getEnv';

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
  // TODO: beforeUserCreate

  const newUserId: Id<'users'> = await ctx.runMutation(
    internal.authInternal.onCreateUser,
    {
      bio: args.bio,
      email: args.email,
      image: args.image,
      location: args.location,
      name: args.name,
    }
  );

  await ctx.runMutation(components.betterAuth.adapter.create, {
    input: {
      data: {
        createdAt: Date.now(),
        email: args.email,
        emailVerified: true,
        image: args.image,
        name: args.name,
        role: args.role || 'user',
        updatedAt: Date.now(),
        userId: newUserId,
      },
      model: 'user',
    },
  });

  await ctx.runMutation(internal.authInternal.afterUserCreate, {
    id: newUserId,
    email: args.email,
  });

  return newUserId;
};

// Internal query to get the last active organization for a user
export const getLastActiveOrganizationId = createInternalQuery()({
  args: {
    betterAuthUserId: z.string(),
    userId: zid('users'),
  },
  returns: z.string(),
  handler: async (ctx, args) => {
    const user = await ctx.table('users').get(args.userId);

    if (user?.lastActiveOrganizationId) {
      return user.lastActiveOrganizationId ?? '';
    }

    const member: Member | null = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: 'member',
        where: [
          {
            field: 'userId',
            value: args.betterAuthUserId,
          },
        ],
      }
    );

    return member?.organizationId ?? '';
  },
});

export const onCreateUser = createInternalMutation()({
  args: {
    bio: z.string().nullish(),
    email: z.string(),
    github: z.string().nullish(),
    image: z.string().nullish(),
    location: z.string().nullish(),
    name: z.string(),
  },
  returns: zid('users'),
  handler: async (ctx, args) => {
    // Check if user already exists in app (from init or previous creation)
    const existingUser = await ctx.table('users').get('email', args.email);

    let userId: Id<'users'> | null = null;

    if (existingUser) {
      // Update existing user with all provided fields
      const updateData: Partial<Doc<'users'>> = {};

      // Update all optional fields if provided
      if (args.bio) updateData.bio = args.bio;
      if (args.image) updateData.image = args.image;
      if (args.name) updateData.name = args.name;
      // Only update if there are fields to update
      if (Object.keys(updateData).length > 0) {
        await ctx.table('users').getX(existingUser._id).patch(updateData);
      }

      userId = existingUser._id;
    } else {
      userId = await ctx.table('users').insert({
        bio: args.bio || undefined,
        deletedAt: undefined,
        email: args.email,
        image: args.image || undefined,
        name: args.name || undefined,
        personalOrganizationId: '', // Will be set after personal organization creation
      });
    }

    return userId;
  },
});

// This afterUserCreate is for updating admin role based on environment variables
export const afterUserCreate = createInternalMutation()({
  args: {
    id: z.string(),
    email: z.string(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const env = getEnv();
    const adminEmails = env.ADMIN;

    // Check if this user email is in the admin list
    if (adminEmails && adminEmails.includes(args.email)) {
      // Update the Better Auth user role to admin
      const betterAuthUser = await getBetterAuthUserByEmail(ctx, args.email);

      if (betterAuthUser && betterAuthUser.role !== 'admin') {
        await ctx.runMutation(components.betterAuth.adapter.updateOne, {
          input: {
            model: 'user',
            update: { role: 'admin' },
            where: [{ field: 'email', value: betterAuthUser.email }],
          },
        });
      }
    }

    return null;
  },
});

export const afterSessionCreate = createInternalMutation()({
  args: {
    token: z.string(),
    userId: z.string(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const betterAuthUser = await getBetterAuthUserById(ctx, args.userId);

    if (!betterAuthUser) {
      throw new ConvexError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'User not found',
      });
    }

    // Create personal organization for the new user
    await ctx.runMutation(internal.organization.createPersonalOrganization, {
      email: betterAuthUser.email,
      image: betterAuthUser.image,
      name: betterAuthUser.name,
      token: args.token,
      userId: betterAuthUser.userId,
    });

    // Create Polar customer for the new user
    // await ctx.scheduler.runAfter(0, internal.polar.customer.createCustomer, {
    //   betterAuthUserId: args.userId,
    //   email: betterAuthUser.email,
    //   name: betterAuthUser.name,
    //   userId: betterAuthUser.userId,
    // });

    return null;
  },
});

export const onDeleteUser = createInternalMutation()({
  args: {
    userId: zid('users'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    // Delete user from database
    await ctx.table('users').getX(args.userId).delete();

    return null;
  },
});

export const onUpdateUser = createInternalMutation()({
  args: {
    image: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    userId: zid('users'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const updates: Partial<Doc<'users'>> = {};

    // Update additional fields if provided
    if (args.name !== undefined && args.name !== null) {
      updates.name = args.name;
    }
    if (args.image !== undefined && args.image !== null) {
      updates.image = args.image;
    }

    await ctx.table('users').getX(args.userId).patch(updates);

    return null;
  },
});
