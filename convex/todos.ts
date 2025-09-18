import { z } from 'zod';
import { zid } from 'convex-helpers/server/zod';
import {
  createAuthQuery,
  createAuthMutation,
  createAuthPaginatedQuery,
  createPublicPaginatedQuery,
} from './functions';
import { ConvexError } from 'convex/values';

// List todos - shows user's todos when authenticated, public project todos when not
export const list = createPublicPaginatedQuery()({
  args: {
    completed: z.boolean().optional(),
    projectId: zid('projects').optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  },
  handler: async (ctx, args) => {
    // If projectId is specified, check if it's a public project
    if (args.projectId) {
      const project = await ctx.table('projects').getX(args.projectId);

      // Check access
      if (!project.isPublic) {
        if (!ctx.userId) {
          throw new ConvexError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }

        // Check if user is owner or member
        const isOwner = project.ownerId === ctx.userId;
        const isMember = await ctx
          .table('projectMembers', 'projectId_userId', (q) =>
            q.eq('projectId', args.projectId!).eq('userId', ctx.userId!)
          )
          .first();

        if (!isOwner && !isMember) {
          throw new ConvexError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
      }

      // For public projects or authorized users, show all project todos
      let query = ctx.table('todos', 'projectId', (q) =>
        q.eq('projectId', args.projectId)
      );

      // Apply filters
      if (args.completed !== undefined) {
        query = query.filter((q) =>
          q.eq(q.field('completed'), args.completed!)
        );
      }

      if (args.priority !== undefined) {
        query = query.filter((q) => q.eq(q.field('priority'), args.priority!));
      }

      // Order by creation time (newest first) and paginate
      return await query
        .order('desc')
        .paginate(args.paginationOpts)
        .map(async (todo) => ({
          ...todo.doc(),
          tags: await todo.edge('tags').map((tag) => tag.doc()),
          project: await ctx.table('projects').get(todo.projectId!),
        }));
    }

    // No projectId specified - show user's todos only (must be authenticated)
    if (!ctx.userId) {
      // Return empty paginated result using a filter that matches nothing
      return await ctx
        .table('todos')
        .filter((q) => q.eq(q.field('userId'), 'impossible-user-id' as any))
        .paginate(args.paginationOpts)
        .map(async (todo) => ({
          ...todo.doc(),
          tags: await todo.edge('tags').map((tag) => tag.doc()),
          project: null,
        }));
    }

    // Start with user's todos
    let query = ctx.table('todos', 'userId', (q) =>
      q.eq('userId', ctx.userId!)
    );

    // Apply completed filter if specified
    if (args.completed !== undefined) {
      query = query.filter((q) => q.eq(q.field('completed'), args.completed!));
    }

    // Apply priority filter if specified
    if (args.priority !== undefined) {
      query = query.filter((q) => q.eq(q.field('priority'), args.priority!));
    }

    // Order by creation time (newest first) and paginate
    return await query
      .order('desc')
      .paginate(args.paginationOpts)
      .map(async (todo) => ({
        ...todo.doc(),
        tags: await todo.edge('tags').map((tag) => tag.doc()),
        project: todo.projectId
          ? await ctx.table('projects').get(todo.projectId)
          : null,
      }));
  },
});

// Search todos - works for public projects when not authenticated
export const search = createPublicPaginatedQuery()({
  args: {
    query: z.string().min(1),
    completed: z.boolean().optional(),
    projectId: zid('projects').optional(),
  },
  handler: async (ctx, args) => {
    // If projectId is specified, check if it's a public project
    if (args.projectId) {
      const project = await ctx.table('projects').getX(args.projectId);

      // Check access
      if (!project.isPublic) {
        if (!ctx.userId) {
          throw new ConvexError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }

        // Check if user is owner or member
        const isOwner = project.ownerId === ctx.userId;
        const isMember = await ctx
          .table('projectMembers', 'projectId_userId', (q) =>
            q.eq('projectId', args.projectId!).eq('userId', ctx.userId!)
          )
          .first();

        if (!isOwner && !isMember) {
          throw new ConvexError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
      }

      // Search within the project
      return await ctx
        .table('todos')
        .search('search_title_description', (q) => {
          let searchQuery = q
            .search('title', args.query)
            .eq('projectId', args.projectId);

          if (args.completed !== undefined) {
            searchQuery = searchQuery.eq('completed', args.completed);
          }

          return searchQuery;
        })
        .paginate(args.paginationOpts)
        .map(async (todo) => ({
          ...todo.doc(),
          tags: await todo.edge('tags').map((tag) => tag.doc()),
          project: await ctx.table('projects').get(todo.projectId!),
        }));
    }

    // No projectId - search user's todos only (must be authenticated)
    if (!ctx.userId) {
      throw new ConvexError({
        code: 'UNAUTHENTICATED',
        message: 'You must be logged in to search your todos',
      });
    }

    return await ctx
      .table('todos')
      .search('search_title_description', (q) => {
        let searchQuery = q
          .search('title', args.query)
          .eq('userId', ctx.userId!);

        if (args.completed !== undefined) {
          searchQuery = searchQuery.eq('completed', args.completed);
        }

        return searchQuery;
      })
      .paginate(args.paginationOpts)
      .map(async (todo) => ({
        ...todo.doc(),
        tags: await todo.edge('tags').map((tag) => tag.doc()),
        project: todo.projectId
          ? await ctx.table('projects').get(todo.projectId)
          : null,
      }));
  },
});

// Get a single todo with all relations
export const get = createAuthQuery()({
  args: {
    id: zid('todos'),
  },
  returns: z
    .object({
      _id: zid('todos'),
      _creationTime: z.number(),
      userId: zid('user'),
      title: z.string(),
      description: z.string().optional(),
      completed: z.boolean(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      dueDate: z.number().optional(),
      projectId: zid('projects').optional(),
      deletionTime: z.number().optional(),
      tags: z.array(
        z.object({
          _id: zid('tags'),
          _creationTime: z.number(),
          name: z.string(),
          color: z.string(),
          createdBy: zid('user'),
        })
      ),
      project: z
        .object({
          _id: zid('projects'),
          _creationTime: z.number(),
          name: z.string(),
          description: z.string().optional(),
          isPublic: z.boolean(),
          archived: z.boolean(),
          ownerId: zid('user'),
        })
        .nullable(),
      user: z.object({
        _id: zid('user'),
        _creationTime: z.number(),
        name: z.string().optional(),
        email: z.string(),
        image: z.string().nullish(),
      }),
    })
    .nullable(),
  handler: async (ctx, args) => {
    const todo = await ctx.table('todos').get(args.id);

    if (!todo || todo.userId !== ctx.userId) {
      return null;
    }

    return {
      ...todo.doc(),
      tags: await todo.edge('tags').map((tag) => tag.doc()),
      project: todo.projectId
        ? await ctx.table('projects').get(todo.projectId)
        : null,
      user: (await todo.edge('user'))!.doc(),
    };
  },
});

// Create a new todo
export const create = createAuthMutation({
  rateLimit: 'todo/create',
})({
  args: {
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    dueDate: z.number().optional(),
    projectId: zid('projects').optional(),
    tagIds: z.array(zid('tags')).max(10).optional(),
  },
  returns: zid('todos'),
  handler: async (ctx, args) => {
    // Validate project access if provided
    if (args.projectId) {
      const project = await ctx.table('projects').getX(args.projectId);

      // Check if user is owner or member
      const isOwner = project.ownerId === ctx.userId;
      const isMember = await project.edge('members').has(ctx.userId);

      if (!isOwner && !isMember) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: "You don't have access to this project",
        });
      }
    }

    // Validate tags if provided
    if (args.tagIds && args.tagIds.length > 0) {
      const tags = await ctx.table('tags').getMany(args.tagIds);
      const validTags = tags.filter(
        (tag) => tag && tag.createdBy === ctx.userId
      );

      if (validTags.length !== args.tagIds.length) {
        throw new ConvexError({
          code: 'INVALID_TAGS',
          message: "Some tags are invalid or don't belong to you",
        });
      }
    }

    // Create the todo
    const todoId = await ctx.table('todos').insert({
      title: args.title,
      description: args.description,
      completed: false,
      priority: args.priority,
      dueDate: args.dueDate,
      projectId: args.projectId,
      userId: ctx.userId,
      tags: args.tagIds || [],
    });

    return todoId;
  },
});

// Update a todo
export const update = createAuthMutation({
  rateLimit: 'todo/update',
})({
  args: {
    id: zid('todos'),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
    dueDate: z.number().nullable().optional(),
    projectId: zid('projects').nullable().optional(),
    tagIds: z.array(zid('tags')).max(10).optional(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.table('todos').getX(args.id);

    if (todo.userId !== ctx.userId) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'Todo not found',
      });
    }

    // Build update object
    const updates: any = {};

    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.priority !== undefined)
      updates.priority = args.priority || undefined;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate || undefined;

    // Handle project update
    if (args.projectId !== undefined) {
      if (args.projectId) {
        const project = await ctx.table('projects').getX(args.projectId);

        const isOwner = project.ownerId === ctx.userId;
        const isMember = await project.edge('members').has(ctx.userId);

        if (!isOwner && !isMember) {
          throw new ConvexError({
            code: 'FORBIDDEN',
            message: "You don't have access to this project",
          });
        }
        updates.projectId = args.projectId;
      } else {
        updates.projectId = undefined;
      }
    }

    // Handle tag updates
    if (args.tagIds !== undefined) {
      if (args.tagIds.length > 0) {
        const tags = await ctx.table('tags').getMany(args.tagIds);
        const validTags = tags.filter(
          (tag) => tag && tag.createdBy === ctx.userId
        );

        if (validTags.length !== args.tagIds.length) {
          throw new ConvexError({
            code: 'INVALID_TAGS',
            message: "Some tags are invalid or don't belong to you",
          });
        }
      }
      updates.tags = args.tagIds;
    }

    // Apply updates
    await todo.patch(updates);

    return null;
  },
});

// Toggle todo completion status
export const toggleComplete = createAuthMutation({
  rateLimit: 'todo/update',
})({
  args: {
    id: zid('todos'),
  },
  returns: z.boolean(),
  handler: async (ctx, args) => {
    const todo = await ctx.table('todos').getX(args.id);

    if (todo.userId !== ctx.userId) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'Todo not found',
      });
    }

    const newStatus = !todo.completed;
    await todo.patch({ completed: newStatus });

    return newStatus;
  },
});

// Soft delete a todo
export const deleteTodo = createAuthMutation({
  rateLimit: 'todo/delete',
})({
  args: {
    id: zid('todos'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.table('todos').getX(args.id);

    if (todo.userId !== ctx.userId) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'Todo not found',
      });
    }

    // Soft delete sets deletionTime
    await todo.delete();

    return null;
  },
});

// Restore a soft-deleted todo
export const restore = createAuthMutation({
  rateLimit: 'todo/update',
})({
  args: {
    id: zid('todos'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.table('todos').getX(args.id);

    if (todo.userId !== ctx.userId) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'Todo not found',
      });
    }

    if (!todo.deletionTime) {
      throw new ConvexError({
        code: 'INVALID_STATE',
        message: 'Todo is not deleted',
      });
    }

    // Restore by removing deletionTime
    await todo.patch({ deletionTime: undefined });

    return null;
  },
});

// Bulk delete todos
export const bulkDelete = createAuthMutation({
  rateLimit: 'todo/delete',
})({
  args: {
    ids: z.array(zid('todos')).min(1).max(100),
  },
  returns: z.object({
    deleted: z.number(),
    errors: z.array(z.string()),
  }),
  handler: async (ctx, args) => {
    let deleted = 0;
    const errors: string[] = [];

    for (const id of args.ids) {
      try {
        const todo = await ctx.table('todos').get(id);

        if (todo && todo.userId === ctx.userId) {
          await todo.delete();
          deleted++;
        } else {
          errors.push(`Todo ${id} not found or unauthorized`);
        }
      } catch (error) {
        errors.push(`Failed to delete todo ${id}`);
      }
    }

    return { deleted, errors };
  },
});

// Reorder todos (for drag-and-drop support)
export const reorder = createAuthMutation({
  rateLimit: 'todo/update',
})({
  args: {
    todoId: zid('todos'),
    targetIndex: z.number().min(0),
    projectId: zid('projects').optional(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    // This is a placeholder for reordering logic
    // In a real implementation, you would:
    // 1. Add an "order" field to the schema
    // 2. Update the order of todos within the same project/list
    // 3. Ensure consistent ordering

    const todo = await ctx.table('todos').getX(args.todoId);

    if (todo.userId !== ctx.userId) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'Todo not found',
      });
    }

    // For now, just validate the todo exists and belongs to the user
    // Real implementation would update order fields

    return null;
  },
});
