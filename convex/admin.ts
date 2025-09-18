import { zid } from 'convex-helpers/server/zod';
import { ConvexError } from 'convex/values';
import { z } from 'zod';

import type { Id } from './_generated/dataModel';

import { aggregateUsers } from './aggregates';
import {
  createAuthMutation,
  createAuthPaginatedQuery,
  createAuthQuery,
} from './functions';

// Admin operations that work with our application's user role system
// Better Auth's admin plugin handles banning, sessions, etc. through the client

// Check if a user has admin privileges in our system
export const checkUserAdminStatus = createAuthQuery({
  role: 'admin',
})({
  args: {
    userId: zid('user'),
  },
  returns: z.object({
    isAdmin: z.boolean(),
    role: z.string().nullish(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.table('user').getX(args.userId);

    return {
      isAdmin: user.role === 'admin',
      role: user.role,
    };
  },
});

// Update user role
export const updateUserRole = createAuthMutation({
  role: 'admin',
})({
  args: {
    role: z.enum(['user', 'admin']),
    userId: zid('user'),
  },
  returns: z.boolean(),
  handler: async (ctx, args) => {
    // Only admin can promote to admin
    if (args.role === 'admin' && !ctx.user.isAdmin) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only admin can promote users to admin',
      });
    }

    const targetUser = await ctx.table('user').getX(args.userId);

    // Can't demote admin unless you are admin
    if (targetUser.role === 'admin' && !ctx.user.isAdmin) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Cannot modify admin users',
      });
    }

    await targetUser.patch({
      role: args.role.toLowerCase(),
    });

    return true;
  },
});

// Grant admin access to a user based on their email (for admin setup)
export const grantAdminByEmail = createAuthMutation({
  role: 'admin',
})({
  args: {
    email: z.string().email(),
    role: z.enum(['admin']),
  },
  returns: z.object({
    success: z.boolean(),
    userId: zid('user').optional(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.table('user').get('email', args.email);

    if (!user) {
      return {
        success: false,
      };
    }

    await user.patch({
      role: args.role.toLowerCase(),
    });

    return {
      success: true,
      userId: user._id,
    };
  },
});

// Get all users with pagination for admin dashboard
export const getAllUsers = createAuthPaginatedQuery()({
  args: {
    role: z.enum(['all', 'user', 'admin']).optional(),
    search: z.string().optional(),
  },
  handler: async (ctx, args) => {
    // Build query
    const query = ctx.table('user');

    // Filter by search term if provided
    if (args.search) {
      const searchLower = args.search.toLowerCase();

      // For now, just paginate and filter in memory
      // You can add a search index later for better performance
      const result = await query.paginate(args.paginationOpts);

      const enrichedPage = await Promise.all(
        result.page.map(async (user) => {
          const email = user?.email || '';

          // Check if any field matches search
          if (
            !user.name?.toLowerCase().includes(searchLower) &&
            !email.toLowerCase().includes(searchLower)
          ) {
            return null;
          }

          return {
            ...user.doc(),
            banExpiresAt: user?.banExpires,
            banReason: user?.banReason,
            email: email,
            isBanned: user?.banned || false,
            role: user?.role || 'user',
          };
        })
      );

      return {
        ...result,
        page: enrichedPage.filter(Boolean),
      };
    }

    // Regular pagination without search
    const result = await query.paginate(args.paginationOpts);

    const enrichedPage = await Promise.all(
      result.page.map(async (user) => {
        const userData = {
          ...user.doc(),
          banExpiresAt: user?.banExpires,
          banReason: user?.banReason,
          email: user?.email || '',
          isBanned: user?.banned || false,
          role: user?.role || 'user',
        };

        // Filter by role if specified
        if (args.role && args.role !== 'all' && userData.role !== args.role) {
          return null;
        }

        return userData;
      })
    );

    return {
      ...result,
      page: enrichedPage.filter(Boolean),
    };
  },
});

// Get admin dashboard statistics
export const getDashboardStats = createAuthQuery({
  role: 'admin',
})({
  args: {},
  returns: z.object({
    recentUsers: z.array(
      z.object({
        _id: zid('user'),
        _creationTime: z.number(),
        image: z.string().nullish(),
        name: z.string().optional(),
      })
    ),
    totalAdmins: z.number(),
    totalUsers: z.number(),
    userGrowth: z.array(
      z.object({
        count: z.number(),
        date: z.string(),
      })
    ),
  }),
  handler: async (ctx) => {
    // Get recent users
    const recentUsers = await ctx
      .table('user')
      .order('desc')
      .take(5)
      .map(async (user) => ({
        _id: user._id,
        _creationTime: user._creationTime,
        image: user.image,
        name: user.name,
      }));

    // Get users from last 7 days for growth calculation
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const usersLast7Days = await ctx
      .table('user')
      .filter((q) => q.gte(q.field('_creationTime'), sevenDaysAgo))
      .take(1000); // Reasonable limit for 7 days of users

    // Calculate user growth for last 7 days
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const userGrowth: { count: number; date: string }[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now - i * oneDay);
      const startOfDay = new Date(date.setHours(0, 0, 0, 0)).getTime();
      const endOfDay = new Date(date.setHours(23, 59, 59, 999)).getTime();

      const count = usersLast7Days.filter(
        (user) =>
          user._creationTime >= startOfDay && user._creationTime <= endOfDay
      ).length;

      userGrowth.push({
        count,
        date: new Date(startOfDay).toISOString().split('T')[0],
      });
    }

    // Count admins from last 100 users (representative sample)
    const sampleUsers = await ctx.table('user').take(100);
    let adminCount = 0;

    for (const user of sampleUsers) {
      if (user.role === 'admin') {
        adminCount++;
      }
    }

    // Get exact user count using aggregate - O(log n) performance!
    const totalUsers = await aggregateUsers.count(ctx, {
      bounds: {} as any,
      namespace: 'global',
    });

    // Estimate total admins based on sample
    const estimatedAdmins = Math.round(
      (adminCount / sampleUsers.length) * totalUsers
    );

    return {
      recentUsers,
      totalAdmins: estimatedAdmins,
      totalUsers,
      userGrowth,
    };
  },
});
