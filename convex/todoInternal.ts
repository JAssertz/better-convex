import { z } from 'zod';
import { zid } from 'convex-helpers/server/zod';

import type { Id } from './_generated/dataModel';
import {
  createInternalQuery,
  createInternalMutation,
  createInternalAction,
} from './functions';
import { internal } from './_generated/api';
import {
  aggregateTodosByUser,
  aggregateTodosByStatus,
  aggregateTodosByProject,
} from './aggregates';

// ============================================
// INTERNAL QUERIES (Background Processing)
// ============================================

// Get users with overdue todos for notification
export const getUsersWithOverdueTodos = createInternalQuery()({
  args: {
    hoursOverdue: z.number().default(24),
    limit: z.number().default(100),
  },
  returns: z.array(
    z.object({
      userId: zid('users'),
      email: z.string(),
      name: z.string().optional(),
      overdueTodos: z.array(
        z.object({
          _id: zid('todos'),
          title: z.string(),
          dueDate: z.number(),
          daysOverdue: z.number(),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const cutoff = now - args.hoursOverdue * 60 * 60 * 1000;

    // Find overdue todos (exclude soft-deleted)
    const overdueTodos = await ctx
      .table('todos')
      .filter((q) =>
        q.and(
          q.eq(q.field('completed'), false),
          q.neq(q.field('dueDate'), undefined),
          q.lt(q.field('dueDate'), cutoff),
          q.eq(q.field('deletionTime'), undefined)
        )
      )
      .take(1000); // Get more than limit to group by user

    // Group by user
    const userTodos = new Map<Id<'users'>, typeof overdueTodos>();
    for (const todo of overdueTodos) {
      const existing = userTodos.get(todo.userId) || [];
      existing.push(todo);
      userTodos.set(todo.userId, existing);
    }

    // Get user details and format response
    const results: Array<{
      userId: Id<'users'>;
      email: string;
      name: string | undefined;
      overdueTodos: Array<{
        _id: Id<'todos'>;
        title: string;
        dueDate: number;
        daysOverdue: number;
      }>;
    }> = [];
    for (const [userId, todos] of userTodos) {
      if (results.length >= args.limit) break;

      const user = await ctx.table('users').get(userId);
      if (user) {
        results.push({
          userId,
          email: user.email,
          name: user.name,
          overdueTodos: todos.slice(0, 5).map((todo) => ({
            _id: todo._id,
            title: todo.title,
            dueDate: todo.dueDate!,
            daysOverdue: Math.floor(
              (now - todo.dueDate!) / (24 * 60 * 60 * 1000)
            ),
          })),
        });
      }
    }

    return results;
  },
});

// Get statistics for admin dashboard
export const getSystemStats = createInternalQuery()({
  args: {},
  returns: z.object({
    users: z.object({
      total: z.number(),
      active30d: z.number(),
      withTodos: z.number(),
    }),
    todos: z.object({
      total: z.number(),
      completed: z.number(),
      overdue: z.number(),
      byPriority: z.record(z.string(), z.number()),
    }),
    projects: z.object({
      total: z.number(),
      public: z.number(),
      active: z.number(),
    }),
    activity: z.object({
      todosCreatedToday: z.number(),
      todosCompletedToday: z.number(),
      commentsToday: z.number(),
    }),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const todayStart = new Date().setHours(0, 0, 0, 0);

    // User stats
    const allUsers = await ctx.table('users');
    // For active users, check by creation time since _lastModified doesn't exist
    const activeUsers = allUsers.filter((u) => u._creationTime > thirtyDaysAgo);

    // Count users with todos using aggregates (exclude soft-deleted)
    let usersWithTodos = 0;
    for (const user of allUsers) {
      // Count only active todos (where isDeleted is false)
      const activeTodoCount = await aggregateTodosByUser.count(ctx, {
        namespace: user._id,
        bounds: {
          lower: { key: ['high', false, false], inclusive: true },
          upper: { key: ['none', true, false], inclusive: true },
        },
      });
      if (activeTodoCount > 0) usersWithTodos++;
    }

    // Todo stats (only count active todos, not soft-deleted)
    const totalTodos = await aggregateTodosByStatus.count(ctx, {
      bounds: {
        lower: { key: [false, 'high', 0, false], inclusive: true },
        upper: { key: [true, 'none', Infinity, false], inclusive: true },
      },
    });
    // Count completed active todos
    const completedTodos = await aggregateTodosByStatus.count(ctx, {
      bounds: {
        lower: { key: [true, 'high', 0, false], inclusive: true },
        upper: { key: [true, 'none', Infinity, false], inclusive: true },
      },
    });

    // Count overdue (exclude soft-deleted)
    const overdueTodosList = await ctx
      .table('todos')
      .filter((q) =>
        q.and(
          q.eq(q.field('completed'), false),
          q.neq(q.field('dueDate'), undefined),
          q.lt(q.field('dueDate'), now),
          q.eq(q.field('deletionTime'), undefined)
        )
      );
    const overdueTodos = overdueTodosList.length;

    // Priority breakdown (exclude soft-deleted)
    const priorities = ['low', 'medium', 'high', 'none'];
    const byPriority: Record<string, number> = {};
    for (const priority of priorities) {
      const todosList = await ctx
        .table('todos')
        .filter((q) =>
          q.and(
            q.eq(
              q.field('priority'),
              priority === 'none' ? undefined : priority
            ),
            q.eq(q.field('deletionTime'), undefined)
          )
        );
      byPriority[priority] = todosList.length;
    }

    // Project stats
    const projects = await ctx.table('projects');
    const publicProjects = projects.filter((p) => p.isPublic);
    const activeProjects = projects.filter((p) => !p.archived);

    // Today's activity (exclude soft-deleted)
    const todosCreatedTodayList = await ctx
      .table('todos')
      .filter((q) =>
        q.and(
          q.gte(q.field('_creationTime'), todayStart),
          q.eq(q.field('deletionTime'), undefined)
        )
      );
    const todosCreatedToday = todosCreatedTodayList.length;

    const todosCompletedTodayList = await ctx
      .table('todos')
      .filter((q) =>
        q.and(
          q.eq(q.field('completed'), true),
          q.gte(q.field('_creationTime'), todayStart),
          q.eq(q.field('deletionTime'), undefined)
        )
      );
    const todosCompletedToday = todosCompletedTodayList.length;

    const commentsTodayList = await ctx
      .table('todoComments')
      .filter((q) => q.gte(q.field('_creationTime'), todayStart));
    const commentsToday = commentsTodayList.length;

    return {
      users: {
        total: allUsers.length,
        active30d: activeUsers.length,
        withTodos: usersWithTodos,
      },
      todos: {
        total: totalTodos,
        completed: completedTodos,
        overdue: overdueTodos,
        byPriority,
      },
      projects: {
        total: projects.length,
        public: publicProjects.length,
        active: activeProjects.length,
      },
      activity: {
        todosCreatedToday,
        todosCompletedToday,
        commentsToday,
      },
    };
  },
});

// ============================================
// INTERNAL MUTATIONS (Data Maintenance)
// ============================================

// Batch update todo priorities based on due dates
export const updateOverduePriorities = createInternalMutation()({
  args: {
    batchSize: z.number().default(100),
  },
  returns: z.object({
    updated: z.number(),
    hasMore: z.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const tomorrow = now + 24 * 60 * 60 * 1000;

    // Find todos due soon that aren't high priority (exclude soft-deleted)
    const urgentTodos = await ctx
      .table('todos')
      .filter((q) =>
        q.and(
          q.eq(q.field('completed'), false),
          q.neq(q.field('dueDate'), undefined),
          q.lt(q.field('dueDate'), tomorrow),
          q.neq(q.field('priority'), 'high'),
          q.eq(q.field('deletionTime'), undefined)
        )
      )
      .take(args.batchSize);

    // Update priorities
    for (const todo of urgentTodos) {
      await ctx.table('todos').getX(todo._id).patch({ priority: 'high' });
    }

    return {
      updated: urgentTodos.length,
      hasMore: urgentTodos.length === args.batchSize,
    };
  },
});

// Archive completed todos older than N days
export const archiveOldCompletedTodos = createInternalMutation()({
  args: {
    daysOld: z.number().default(90),
    batchSize: z.number().default(100),
  },
  returns: z.object({
    archived: z.number(),
    hasMore: z.boolean(),
  }),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.daysOld * 24 * 60 * 60 * 1000;

    const oldTodos = await ctx
      .table('todos')
      .filter((q) =>
        q.and(
          q.eq(q.field('completed'), true),
          q.lt(q.field('_creationTime'), cutoff),
          q.eq(q.field('deletionTime'), undefined)
        )
      )
      .take(args.batchSize);

    // In a real app, might move to an archive table
    // For demo, we'll just delete them (soft delete)
    for (const todo of oldTodos) {
      await ctx.table('todos').getX(todo._id).delete();
    }

    return {
      archived: oldTodos.length,
      hasMore: oldTodos.length === args.batchSize,
    };
  },
});

// Recalculate user statistics
export const recalculateUserStats = createInternalMutation()({
  args: {
    userId: zid('users'),
  },
  returns: z.object({
    totalTodos: z.number(),
    completedTodos: z.number(),
    streak: z.number(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.table('users').getX(args.userId);

    // Get todo counts from aggregates (exclude soft-deleted)
    const totalTodos = await aggregateTodosByUser.count(ctx, {
      namespace: args.userId,
      bounds: {
        lower: { key: ['high', false, false], inclusive: true },
        upper: { key: ['none', true, false], inclusive: true },
      },
    });

    // Count completed todos (exclude soft-deleted)
    const completedCounts = await Promise.all([
      aggregateTodosByUser.count(ctx, {
        namespace: args.userId,
        bounds: {
          lower: { key: ['low', true, false], inclusive: true },
          upper: { key: ['low', true, false], inclusive: true },
        },
      }),
      aggregateTodosByUser.count(ctx, {
        namespace: args.userId,
        bounds: {
          lower: { key: ['medium', true, false], inclusive: true },
          upper: { key: ['medium', true, false], inclusive: true },
        },
      }),
      aggregateTodosByUser.count(ctx, {
        namespace: args.userId,
        bounds: {
          lower: { key: ['high', true, false], inclusive: true },
          upper: { key: ['high', true, false], inclusive: true },
        },
      }),
      aggregateTodosByUser.count(ctx, {
        namespace: args.userId,
        bounds: {
          lower: { key: ['none', true, false], inclusive: true },
          upper: { key: ['none', true, false], inclusive: true },
        },
      }),
    ]);

    const completedTodos = completedCounts.reduce(
      (sum, count) => sum + count,
      0
    );

    // Calculate streak (consecutive days with completed todos, exclude soft-deleted)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentCompleted = await ctx
      .table('todos')
      .filter((q) =>
        q.and(
          q.eq(q.field('userId'), args.userId),
          q.eq(q.field('completed'), true),
          q.gte(q.field('_creationTime'), thirtyDaysAgo),
          q.eq(q.field('deletionTime'), undefined)
        )
      )
      .order('desc');

    // Calculate streak
    let streak = 0;
    const dateSet = new Set<string>();

    for (const todo of recentCompleted) {
      const todoDate = new Date(todo._creationTime).toDateString();
      dateSet.add(todoDate);
    }

    // Count consecutive days from today backwards
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      const dateStr = checkDate.toDateString();

      if (dateSet.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        break; // Streak broken
      }
    }

    // Could store these stats on user document
    return {
      totalTodos,
      completedTodos,
      streak,
    };
  },
});

// ============================================
// INTERNAL ACTIONS (Complex Operations)
// ============================================

// Process daily summary emails
export const processDailySummaries = createInternalAction()({
  args: {},
  returns: z.object({
    processed: z.number(),
    sent: z.number(),
    failed: z.number(),
  }),
  handler: async (ctx) => {
    // Get users with overdue todos
    const usersToNotify: {
      userId: Id<'users'>;
      email: string;
      name?: string;
      overdueTodos: Array<{
        _id: Id<'todos'>;
        title: string;
        dueDate: number;
        daysOverdue: number;
      }>;
    }[] = await ctx.runQuery(internal.todoInternal.getUsersWithOverdueTodos, {
      hoursOverdue: 24,
      limit: 100,
    });

    let sent = 0;
    let failed = 0;

    for (const user of usersToNotify) {
      try {
        // In real app, send email via external service
        // await sendEmail({
        //   to: user.email,
        //   subject: 'Your overdue todos',
        //   template: 'overdue-todos',
        //   data: user,
        // });

        console.log(
          `Would send email to ${user.email} about ${user.overdueTodos.length} overdue todos`
        );
        sent++;
      } catch (error) {
        console.error(`Failed to send email to ${user.email}:`, error);
        failed++;
      }
    }

    return {
      processed: usersToNotify.length,
      sent,
      failed,
    };
  },
});

// Generate weekly report
export const generateWeeklyReport = createInternalAction()({
  args: {
    userId: zid('users'),
  },
  returns: z.object({
    week: z.object({
      start: z.number(),
      end: z.number(),
    }),
    stats: z.object({
      todosCreated: z.number(),
      todosCompleted: z.number(),
      projectsWorkedOn: z.number(),
      mostProductiveDay: z.string().nullable(),
    }),
    insights: z.array(z.string()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const weekStart = now - 7 * 24 * 60 * 60 * 1000;

    // Get user's todos from the past week
    const weekTodos: {
      created: Array<{
        _id: Id<'todos'>;
        title: string;
        dueDate: number;
        completedAt: number;
      }>;
      completed: Array<{
        _id: Id<'todos'>;
        title: string;
        dueDate: number;
        completedAt: number;
      }>;
      all: Array<{
        _id: Id<'todos'>;
        title: string;
        dueDate: number;
        completedAt: number;
        projectId: Id<'projects'> | null;
      }>;
    } = await ctx.runQuery(internal.todoInternal.getUserWeeklyActivity, {
      userId: args.userId,
      weekStart,
    });

    // Calculate stats
    const todosCreated = weekTodos.created.length;
    const todosCompleted = weekTodos.completed.length;
    const projectsWorkedOn = new Set(
      weekTodos.all.map((t) => t.projectId).filter(Boolean)
    ).size;

    // Find most productive day
    const dayActivity = new Map<string, number>();
    for (const todo of weekTodos.completed) {
      const day = new Date(todo.completedAt).toLocaleDateString('en-US', {
        weekday: 'long',
      });
      dayActivity.set(day, (dayActivity.get(day) || 0) + 1);
    }

    let mostProductiveDay: string | null = null;
    let maxCompleted = 0;
    for (const [day, count] of dayActivity) {
      if (count > maxCompleted) {
        mostProductiveDay = day;
        maxCompleted = count;
      }
    }

    // Generate insights
    const insights: string[] = [];

    if (todosCompleted > todosCreated) {
      insights.push(
        'Great job! You completed more tasks than you created this week.'
      );
    }

    if (projectsWorkedOn > 3) {
      insights.push(
        `You worked across ${projectsWorkedOn} projects. Consider focusing on fewer projects for deeper progress.`
      );
    }

    if (mostProductiveDay) {
      insights.push(
        `Your most productive day was ${mostProductiveDay} with ${maxCompleted} tasks completed.`
      );
    }

    const completionRate =
      todosCreated > 0 ? (todosCompleted / todosCreated) * 100 : 0;
    if (completionRate > 80) {
      insights.push(
        `Excellent ${Math.round(completionRate)}% completion rate!`
      );
    } else if (completionRate < 50) {
      insights.push(
        'Consider breaking down tasks into smaller, more manageable pieces.'
      );
    }

    return {
      week: {
        start: weekStart,
        end: now,
      },
      stats: {
        todosCreated,
        todosCompleted,
        projectsWorkedOn,
        mostProductiveDay,
      },
      insights,
    };
  },
});

// Internal query for weekly activity
export const getUserWeeklyActivity = createInternalQuery()({
  args: {
    userId: zid('users'),
    weekStart: z.number(),
  },
  returns: z.object({
    created: z.array(z.any()),
    completed: z.array(z.any()),
    all: z.array(z.any()),
  }),
  handler: async (ctx, args) => {
    const allTodos = await ctx
      .table('todos')
      .filter((q) => q.eq(q.field('userId'), args.userId));

    const created = allTodos.filter((t) => t._creationTime >= args.weekStart);

    const completed = allTodos
      .filter((t) => t.completed && t._creationTime >= args.weekStart)
      .map((t) => ({
        ...t.doc(),
        completedAt: t._creationTime,
      }));

    return {
      created: created.map((t) => t.doc()),
      completed,
      all: allTodos.map((t) => t.doc()),
    };
  },
});
