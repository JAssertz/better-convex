import { z } from 'zod';
import { zid } from 'convex-helpers/server/zod';
import { ConvexError } from 'convex/values';
import { asyncMap } from 'convex-helpers';
import { stream } from 'convex-helpers/server/stream';
import {
  createAuthMutation,
  createAuthPaginatedQuery,
  createAuthQuery,
  createPublicQuery,
  createPublicPaginatedQuery,
} from './functions';
import { aggregateTodosByProject } from './aggregates';
import schema from './schema';

// List projects - shows user's projects when authenticated, public projects when not
export const list = createPublicPaginatedQuery()({
  args: {
    includeArchived: z.boolean().optional(),
  },
  handler: async (ctx, args) => {
    const user = ctx.user;

    // If not authenticated, show only public non-archived projects
    if (!user) {
      const results = await stream(ctx.db, schema)
        .query('projects')
        .filterWith(async (project) => {
          // Only show public projects when not authenticated
          if (!project.isPublic) {
            return false;
          }

          // Apply archive filter (archived projects are never shown publicly)
          return !project.archived;
        })
        .paginate(args.paginationOpts);

      // Transform results with public data
      return {
        ...results,
        page: await asyncMap(results.page, async (project) => ({
          ...project,
          memberCount: (
            await ctx.table('projectMembers', 'projectId', (q) =>
              q.eq('projectId', project._id)
            )
          ).length,
          todoCount: await aggregateTodosByProject.count(ctx, {
            namespace: project._id,
            bounds: {} as any,
          }),
          completedTodoCount: (
            await ctx
              .table('todos', 'projectId', (q) =>
                q.eq('projectId', project._id)
              )
              .filter((q) => q.eq(q.field('completed'), true))
          ).length,
          isOwner: false,
        })),
      };
    }

    // Get member project IDs for authenticated user
    const memberProjectIds = await ctx
      .table('projectMembers', 'userId', (q) => q.eq('userId', user._id))
      .map(async (member) => member.projectId);

    // Use streams to filter and paginate all projects
    const results = await stream(ctx.db, schema)
      .query('projects')
      .filterWith(async (project) => {
        // Include if user is owner or member
        const isOwner = project.ownerId === user._id;
        const isMember = memberProjectIds.includes(project._id);

        if (!isOwner && !isMember) {
          return false;
        }

        // Apply archive filter
        if (args.includeArchived) {
          // When includeArchived is true, show ONLY archived projects
          return project.archived;
        } else {
          // When includeArchived is false/undefined, show ONLY non-archived projects
          return !project.archived;
        }
      })
      .paginate(args.paginationOpts);

    // Transform results with additional data
    return {
      ...results,
      page: await asyncMap(results.page, async (project) => ({
        ...project,
        memberCount: (
          await ctx.table('projectMembers', 'projectId', (q) =>
            q.eq('projectId', project._id)
          )
        ).length,
        todoCount: await aggregateTodosByProject.count(ctx, {
          namespace: project._id,
          bounds: {} as any,
        }),
        completedTodoCount: (
          await ctx
            .table('todos', 'projectId', (q) => q.eq('projectId', project._id))
            .filter((q) => q.eq(q.field('completed'), true))
        ).length,
        isOwner: project.ownerId === user._id,
      })),
    };
  },
});

// Get project with members and todo count - public projects viewable by all
export const get = createPublicQuery()({
  args: {
    projectId: zid('projects'),
  },
  returns: z
    .object({
      _id: zid('projects'),
      _creationTime: z.number(),
      name: z.string(),
      description: z.string().optional(),
      ownerId: zid('user'),
      isPublic: z.boolean(),
      archived: z.boolean(),
      owner: z.object({
        _id: zid('user'),
        name: z.string().nullable(),
        email: z.string(),
      }),
      members: z.array(
        z.object({
          _id: zid('user'),
          name: z.string().nullable(),
          email: z.string(),
          joinedAt: z.number(),
        })
      ),
      todoCount: z.number(),
      completedTodoCount: z.number(),
    })
    .nullable(),
  handler: async (ctx, args) => {
    const project = await ctx.table('projects').get(args.projectId);
    if (!project) return null;

    // Check access
    const userId = ctx.userId;
    const isOwner = userId === project.ownerId;

    // For private projects, check membership
    if (!project.isPublic && !isOwner) {
      if (!userId) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this project',
        });
      }

      // Is not member, throw error
      await ctx
        .table('projectMembers', 'projectId_userId', (q) =>
          q.eq('projectId', args.projectId).eq('userId', userId)
        )
        .firstX();
    }

    const owner = await ctx.table('user').getX(project.ownerId);

    const members = await ctx
      .table('projectMembers', 'projectId', (q) =>
        q.eq('projectId', project._id)
      )
      .map(async (member) => {
        const user = await ctx.table('user').getX(member.userId);

        return {
          _id: user._id,
          name: user.name ?? null,
          email: user.email,
          joinedAt: member._creationTime,
        };
      });

    const todoCount = await aggregateTodosByProject.count(ctx, {
      namespace: project._id,
      bounds: {} as any,
    });

    // Get completed todo count
    const completedTodoCount = (
      await ctx
        .table('todos', 'projectId', (q) => q.eq('projectId', project._id))
        .filter((q) => q.eq(q.field('completed'), true))
    ).length;

    return {
      ...project.doc(),
      owner: {
        _id: owner._id,
        name: owner.name ?? null,
        email: owner.email,
      },
      members,
      todoCount,
      completedTodoCount,
    };
  },
});

// Create project with owner assignment
export const create = createAuthMutation({
  rateLimit: 'project/create',
})({
  args: {
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    isPublic: z.boolean().optional(),
  },
  returns: zid('projects'),
  handler: async (ctx, args) => {
    const projectId = await ctx.table('projects').insert({
      name: args.name,
      description: args.description,
      ownerId: ctx.user._id,
      isPublic: args.isPublic ?? false,
      archived: false,
    });

    return projectId;
  },
});

// Update project
export const update = createAuthMutation({
  rateLimit: 'project/update',
})({
  args: {
    projectId: zid('projects'),
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    isPublic: z.boolean().optional(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const project = await ctx.table('projects').getX(args.projectId);

    // Check ownership
    if (project.ownerId !== ctx.user._id) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can update the project',
      });
    }

    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.isPublic !== undefined) updates.isPublic = args.isPublic;

    if (Object.keys(updates).length > 0) {
      await ctx.table('projects').getX(args.projectId).patch(updates);
    }

    return null;
  },
});

// Archive project (soft delete)
export const archive = createAuthMutation({
  rateLimit: 'project/update',
})({
  args: {
    projectId: zid('projects'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const project = await ctx.table('projects').getX(args.projectId);

    // Check ownership
    if (project.ownerId !== ctx.user._id) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can archive the project',
      });
    }

    await ctx.table('projects').getX(args.projectId).patch({
      archived: true,
    });

    return null;
  },
});

// Restore archived project
export const restore = createAuthMutation({
  rateLimit: 'project/update',
})({
  args: {
    projectId: zid('projects'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const project = await ctx.table('projects').getX(args.projectId);

    // Check ownership
    if (project.ownerId !== ctx.user._id) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can restore the project',
      });
    }

    await ctx.table('projects').getX(args.projectId).patch({
      archived: false,
    });

    return null;
  },
});

// Add project member
export const addMember = createAuthMutation({
  rateLimit: 'project/member',
})({
  args: {
    projectId: zid('projects'),
    userEmail: z.string().email(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const project = await ctx.table('projects').getX(args.projectId);

    // Check ownership
    if (project.ownerId !== ctx.user._id) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can add members',
      });
    }

    // Find user by email
    const userToAdd = await ctx.table('user').getX('email', args.userEmail);

    // Check if already member or owner
    if (userToAdd._id === project.ownerId) {
      throw new ConvexError({
        code: 'BAD_REQUEST',
        message: 'User is already the owner of this project',
      });
    }

    // existing?
    await ctx
      .table('projectMembers', 'projectId_userId', (q) =>
        q.eq('projectId', args.projectId).eq('userId', userToAdd._id)
      )
      .firstX();

    // Add member
    await ctx.table('projectMembers').insert({
      projectId: args.projectId,
      userId: userToAdd._id,
    });

    return null;
  },
});

// Remove project member
export const removeMember = createAuthMutation({
  rateLimit: 'project/member',
})({
  args: {
    projectId: zid('projects'),
    userId: zid('user'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const project = await ctx.table('projects').getX(args.projectId);

    // Check ownership
    if (project.ownerId !== ctx.user._id) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can remove members',
      });
    }

    const member = await ctx
      .table('projectMembers', 'projectId_userId', (q) =>
        q.eq('projectId', args.projectId).eq('userId', args.userId)
      )
      .firstX();

    await ctx.table('projectMembers').getX(member._id).delete();

    return null;
  },
});

// Leave project as member
export const leave = createAuthMutation({
  rateLimit: 'project/member',
})({
  args: {
    projectId: zid('projects'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const member = await ctx
      .table('projectMembers', 'projectId_userId', (q) =>
        q.eq('projectId', args.projectId).eq('userId', ctx.user._id)
      )
      .firstX();

    await ctx.table('projectMembers').getX(member._id).delete();

    return null;
  },
});

// Transfer project ownership
export const transfer = createAuthMutation({
  rateLimit: 'project/update',
})({
  args: {
    projectId: zid('projects'),
    newOwnerId: zid('user'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const project = await ctx.table('projects').getX(args.projectId);

    // Check ownership
    if (project.ownerId !== ctx.user._id) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only the project owner can transfer ownership',
      });
    }

    // Check new owner exists
    await ctx.table('user').getX(args.newOwnerId);

    // If new owner is currently a member, remove them
    const memberRecord = await ctx
      .table('projectMembers', 'projectId_userId', (q) =>
        q.eq('projectId', args.projectId).eq('userId', args.newOwnerId)
      )
      .first();

    if (memberRecord) {
      await ctx.table('projectMembers').getX(memberRecord._id).delete();
    }

    // Add current owner as member
    await ctx.table('projectMembers').insert({
      projectId: args.projectId,
      userId: ctx.user._id,
    });

    // Transfer ownership
    await ctx.table('projects').getX(args.projectId).patch({
      ownerId: args.newOwnerId,
    });

    return null;
  },
});

// Get user's active projects for dropdown
export const listForDropdown = createAuthQuery()({
  args: {},
  returns: z.array(
    z.object({
      _id: zid('projects'),
      name: z.string(),
      isOwner: z.boolean(),
    })
  ),
  handler: async (ctx) => {
    const user = ctx.user;

    // Get owned projects
    const ownedProjects = await ctx
      .table('projects', 'ownerId', (q) => q.eq('ownerId', user._id))
      .filter((q) => q.eq(q.field('archived'), false))
      .map(async (project) => ({
        _id: project._id,
        name: project.name,
        isOwner: true,
      }));

    // Get member projects
    const memberProjects = await ctx
      .table('projectMembers', 'userId', (q) => q.eq('userId', user._id))
      .map(async (member) => {
        const project = await ctx.table('projects').get(member.projectId);
        if (!project || project.archived) return null;
        return {
          _id: project._id,
          name: project.name,
          isOwner: false,
        };
      });

    return [
      ...ownedProjects,
      ...memberProjects.filter((p): p is NonNullable<typeof p> => p !== null),
    ].sort((a, b) => a.name.localeCompare(b.name));
  },
});
