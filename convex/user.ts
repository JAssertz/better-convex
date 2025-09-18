import { zid } from 'convex-helpers/server/zod';
import { z } from 'zod';

import { createAuthMutation, createPublicQuery } from './functions';
import { updateSettingsSchema } from './userShared';

// Check if user is authenticated
export const getIsAuthenticated = createPublicQuery({
  publicOnly: true,
})({
  handler: async (ctx) => {
    return !!(await ctx.auth.getUserIdentity());
  },
});

// Get session user (minimal data)
export const getSessionUser = createPublicQuery()({
  handler: async ({ user: userEnt }) => {
    if (!userEnt) {
      return null;
    }

    const { doc, edge, edgeX, ...user } = userEnt;

    return user;
  },
});

// Get full user data for the authenticated user
export const getCurrentUser = createPublicQuery()({
  returns: z.union([
    z.object({
      id: zid('user'),
      activeOrganization: z.object({
        id: z.string(),
        createdAt: z.any(),
        logo: z.string().nullish(),
        name: z.string(),
        role: z.string(),
        slug: z.string(),
      }),
      image: z.string().nullish(),
      isAdmin: z.boolean(),
      name: z.string().optional(),
      session: z.object({
        activeOrganizationId: z.string().nullable().optional(),
        impersonatedBy: z.string().nullable().optional(),
        token: z.string(),
        userId: z.string(),
      }),
    }),
    z.null(),
  ]),
  handler: async (ctx) => {
    const { user: userEnt } = ctx;

    if (!userEnt) {
      return null;
    }

    const { id, activeOrganization, image, isAdmin, name, session } = userEnt;

    return {
      id,
      activeOrganization,
      image,
      isAdmin,
      name,
      session: {
        activeOrganizationId: session.activeOrganizationId,
        impersonatedBy: session.impersonatedBy,
        token: session.token,
        userId: session.userId,
      },
    };
  },
});

// Update user settings
export const updateSettings = createAuthMutation()({
  args: updateSettingsSchema,
  returns: z.object({ success: z.boolean() }),
  handler: async (ctx, args) => {
    const { user } = ctx;
    const { bio, name } = args;

    // Build update object
    const updateData: Record<string, any> = {};

    if (bio !== undefined) updateData.bio = bio;
    if (name !== undefined) updateData.name = name;

    await user.patch(updateData);

    return { success: true };
  },
});
