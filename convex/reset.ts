import type { TableNames } from '@convex/_generated/dataModel';

import { getEnv } from '@convex/helpers/getEnv';
import schema from '@convex/schema';
import { z } from 'zod';

import { internal } from './_generated/api';
import {
  createInternalAction,
  createInternalMutation,
  createInternalQuery,
} from './functions';
// import { deletePolarCustomers } from './polar/customer';

const DELETE_BATCH_SIZE = 64;

// Clear all of the tables except...
const excludedTables = new Set<TableNames>();

export const reset = createInternalAction({
  devOnly: true,
})({
  handler: async (ctx) => {
    // Delete all Polar customers first (comprehensive cleanup)
    // await deletePolarCustomers();

    for (const tableName of Object.keys(schema.tables)) {
      if (excludedTables.has(tableName as TableNames)) {
        continue;
      }

      await ctx.scheduler.runAfter(0, internal.reset.deletePage, {
        cursor: null,
        tableName,
      });
    }

    await ctx.runMutation(internal.reset.resetAuth, {});
  },
});

export const deletePage = createInternalMutation({
  devOnly: true,
})({
  args: {
    cursor: z.union([z.string(), z.null()]),
    tableName: z.string(),
  },
  handler: async (ctx, args) => {
    // Use ctx.table for proper trigger handling
    const results = await ctx
      .table(args.tableName as TableNames)
      .paginate({ cursor: args.cursor, numItems: DELETE_BATCH_SIZE });

    for (const row of results.page) {
      try {
        // Use ctx.table to delete, which will properly trigger aggregates
        await ctx
          .table(args.tableName as TableNames)
          .getX(row._id)
          .delete();
      } catch {
        // Document might have been deleted by a trigger or concurrent process
      }
    }

    if (!results.isDone) {
      await ctx.scheduler.runAfter(0, internal.reset.deletePage, {
        cursor: results.continueCursor,
        tableName: args.tableName,
      });
    }
  },
});

/** Reset only better-auth tables Usage: npx convex run reset:betterAuth */
export const resetAuth = createInternalMutation({
  devOnly: true,
})({
  handler: async (ctx) => {
    const betterAuthTables = [
      'account',
      'invitationss',
      'jwks',
      'member',
      'organization',
      'session',
      'user',
      'verification',
    ] as const;

    for (const tableName of betterAuthTables) {
      await ctx.scheduler.runAfter(0, internal.reset.deleteAuthPage, {
        cursor: null,
        tableName,
      });
    }
  },
});

export const deleteAuthPage = createInternalMutation({
  devOnly: true,
})({
  args: {
    cursor: z.union([z.string(), z.null()]),
    tableName: z.string(),
  },
  handler: async (ctx, args) => {
    const result: any = await ctx.runMutation(
      internal.betterAuth.adapter.deleteMany,
      {
        input: {
          model: args.tableName as any,
        },
        paginationOpts: {
          cursor: args.cursor,
          numItems: DELETE_BATCH_SIZE,
        },
      }
    );

    if (!result.isDone && result.continueCursor) {
      await ctx.scheduler.runAfter(0, internal.reset.deleteAuthPage, {
        cursor: result.continueCursor,
        tableName: args.tableName,
      });
    }
  },
});

export const getAdminUsers = createInternalQuery()({
  args: {},
  returns: z.array(
    z.object({
      customerId: z.string().optional().nullable(),
    })
  ),
  handler: async (ctx) => {
    const adminEmails = getEnv().ADMIN;

    // Get all admin users by their emails
    const adminUsers: any[] = [];

    for (const email of adminEmails) {
      const user = await ctx.table('user').get('email', email);

      if (user) {
        adminUsers.push(user);
      }
    }

    // Filter and return only users with customer IDs
    return adminUsers
      .filter((user) => user.customerId)
      .map((user) => ({ customerId: user.customerId! }));
  },
});
