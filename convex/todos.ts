import { z } from "zod";
import { zid } from "convex-helpers/server/zod";
import {
  createAuthQuery,
  createAuthMutation,
  createAuthPaginatedQuery,
} from "./functions";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";

// List todos with pagination and filters
export const list = createAuthPaginatedQuery()({
  args: {
    completed: z.boolean().optional(),
    projectId: zid("projects").optional(),
    priority: z
      .enum(["low", "medium", "high"])
      .optional(),
  },
  handler: async (ctx, args) => {
    // Start with user's todos
    let query = ctx.table("todos", "userId", (q) => 
      q.eq("userId", ctx.userId)
    );

    // Apply completed filter if specified
    if (args.completed !== undefined) {
      query = query.filter((q) => 
        q.eq(q.field("completed"), args.completed!)
      );
    }

    // Apply project filter if specified
    if (args.projectId !== undefined) {
      query = query.filter((q) => 
        q.eq(q.field("projectId"), args.projectId!)
      );
    }

    // Apply priority filter if specified
    if (args.priority !== undefined) {
      query = query.filter((q) => 
        q.eq(q.field("priority"), args.priority!)
      );
    }

    // Order by creation time (newest first) and paginate
    return await query
      .order("desc")
      .paginate(args.paginationOpts)
      .map(async (todo) => ({
        ...todo.doc(),
        tags: await todo.edge("tags").map((tag) => tag.doc()),
        project: todo.projectId 
          ? await ctx.table("projects").get(todo.projectId)
          : null,
      }));
  },
});

// Search todos with full-text search
export const search = createAuthPaginatedQuery()({
  args: {
    query: z.string().min(1),
    completed: z.boolean().optional(),
    projectId: zid("projects").optional(),
  },
  handler: async (ctx, args) => {
    return await ctx
      .table("todos")
      .search("search_title_description", (q) => {
        let searchQuery = q
          .search("title", args.query)
          .eq("userId", ctx.userId);
        
        if (args.completed !== undefined) {
          searchQuery = searchQuery.eq("completed", args.completed);
        }
        
        if (args.projectId !== undefined) {
          searchQuery = searchQuery.eq("projectId", args.projectId);
        }
        
        return searchQuery;
      })
      .paginate(args.paginationOpts)
      .map(async (todo) => ({
        ...todo.doc(),
        tags: await todo.edge("tags").map((tag) => tag.doc()),
        project: todo.projectId 
          ? await ctx.table("projects").get(todo.projectId)
          : null,
      }));
  },
});

// Get a single todo with all relations
export const get = createAuthQuery()({
  args: {
    id: zid("todos"),
  },
  returns: z
    .object({
      _id: zid("todos"),
      _creationTime: z.number(),
      userId: zid("users"),
      title: z.string(),
      description: z.string().optional(),
      completed: z.boolean(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      dueDate: z.number().optional(),
      projectId: zid("projects").optional(),
      deletionTime: z.number().optional(),
      tags: z.array(
        z.object({
          _id: zid("tags"),
          _creationTime: z.number(),
          name: z.string(),
          color: z.string(),
          createdBy: zid("users"),
        })
      ),
      project: z
        .object({
          _id: zid("projects"),
          _creationTime: z.number(),
          name: z.string(),
          description: z.string().optional(),
          isPublic: z.boolean(),
          archived: z.boolean(),
          ownerId: zid("users"),
        })
        .nullable(),
      user: z.object({
        _id: zid("users"),
        _creationTime: z.number(),
        name: z.string().optional(),
        email: z.string(),
        image: z.string().optional(),
      }),
    })
    .nullable(),
  handler: async (ctx, args) => {
    const todo = await ctx.table("todos").get(args.id);
    
    if (!todo || todo.userId !== ctx.userId) {
      return null;
    }

    return {
      ...todo.doc(),
      tags: await todo.edge("tags").map((tag) => tag.doc()),
      project: todo.projectId 
        ? await ctx.table("projects").get(todo.projectId)
        : null,
      user: (await todo.edge("user"))!.doc(),
    };
  },
});

// Create a new todo
export const create = createAuthMutation({
  rateLimit: "todo/create",
})({
  args: {
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    dueDate: z.number().optional(),
    projectId: zid("projects").optional(),
    tagIds: z.array(zid("tags")).max(10).optional(),
  },
  returns: zid("todos"),
  handler: async (ctx, args) => {
    // Validate project access if provided
    if (args.projectId) {
      const project = await ctx.table("projects").get(args.projectId);
      if (!project) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      // Check if user is owner or member
      const isOwner = project.ownerId === ctx.userId;
      const isMember = await project.edge("members").has(ctx.userId);
      
      if (!isOwner && !isMember) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "You don't have access to this project",
        });
      }
    }

    // Validate tags if provided
    if (args.tagIds && args.tagIds.length > 0) {
      const tags = await ctx.table("tags").getMany(args.tagIds);
      const validTags = tags.filter(
        (tag) => tag && tag.createdBy === ctx.userId
      );
      
      if (validTags.length !== args.tagIds.length) {
        throw new ConvexError({
          code: "INVALID_TAGS",
          message: "Some tags are invalid or don't belong to you",
        });
      }
    }

    // Create the todo
    const todoId = await ctx.table("todos").insert({
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
  rateLimit: "todo/update",
})({
  args: {
    id: zid("todos"),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    priority: z.enum(["low", "medium", "high"]).nullable().optional(),
    dueDate: z.number().nullable().optional(),
    projectId: zid("projects").nullable().optional(),
    tagIds: z.array(zid("tags")).max(10).optional(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.table("todos").get(args.id);
    
    if (!todo || todo.userId !== ctx.userId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    // Build update object
    const updates: any = {};
    
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.priority !== undefined) updates.priority = args.priority || undefined;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate || undefined;
    
    // Handle project update
    if (args.projectId !== undefined) {
      if (args.projectId) {
        const project = await ctx.table("projects").get(args.projectId);
        if (!project) {
          throw new ConvexError({
            code: "NOT_FOUND",
            message: "Project not found",
          });
        }

        const isOwner = project.ownerId === ctx.userId;
        const isMember = await project.edge("members").has(ctx.userId);
        
        if (!isOwner && !isMember) {
          throw new ConvexError({
            code: "FORBIDDEN",
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
        const tags = await ctx.table("tags").getMany(args.tagIds);
        const validTags = tags.filter(
          (tag) => tag && tag.createdBy === ctx.userId
        );
        
        if (validTags.length !== args.tagIds.length) {
          throw new ConvexError({
            code: "INVALID_TAGS",
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
  rateLimit: "todo/update",
})({
  args: {
    id: zid("todos"),
  },
  returns: z.boolean(),
  handler: async (ctx, args) => {
    const todo = await ctx.table("todos").get(args.id);
    
    if (!todo || todo.userId !== ctx.userId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    const newStatus = !todo.completed;
    await todo.patch({ completed: newStatus });
    
    return newStatus;
  },
});

// Soft delete a todo
export const deleteTodo = createAuthMutation({
  rateLimit: "todo/delete",
})({
  args: {
    id: zid("todos"),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.table("todos").get(args.id);
    
    if (!todo || todo.userId !== ctx.userId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    // Soft delete sets deletionTime
    await todo.delete();
    
    return null;
  },
});

// Restore a soft-deleted todo
export const restore = createAuthMutation({
  rateLimit: "todo/update",
})({
  args: {
    id: zid("todos"),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const todo = await ctx.table("todos").get(args.id);
    
    if (!todo || todo.userId !== ctx.userId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    if (!todo.deletionTime) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Todo is not deleted",
      });
    }

    // Restore by removing deletionTime
    await todo.patch({ deletionTime: undefined });
    
    return null;
  },
});

// Bulk delete todos
export const bulkDelete = createAuthMutation({
  rateLimit: "todo/delete",
})({
  args: {
    ids: z.array(zid("todos")).min(1).max(100),
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
        const todo = await ctx.table("todos").get(id);
        
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
  rateLimit: "todo/update",
})({
  args: {
    todoId: zid("todos"),
    targetIndex: z.number().min(0),
    projectId: zid("projects").optional(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    // This is a placeholder for reordering logic
    // In a real implementation, you would:
    // 1. Add an "order" field to the schema
    // 2. Update the order of todos within the same project/list
    // 3. Ensure consistent ordering
    
    const todo = await ctx.table("todos").get(args.todoId);
    
    if (!todo || todo.userId !== ctx.userId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Todo not found",
      });
    }

    // For now, just validate the todo exists and belongs to the user
    // Real implementation would update order fields
    
    return null;
  },
});

// Generate sample todos for testing
export const generateSamples = createAuthMutation({
  rateLimit: "todo/create",
})({
  args: {
    count: z.number().min(1).max(100).default(100),
    projectId: zid("projects").optional(),
  },
  returns: z.object({
    created: z.number(),
  }),
  handler: async (ctx, args) => {
    // First, ensure we have tags (create some if none exist)
    const existingTags = await ctx
      .table('tags', 'createdBy', (q) => q.eq('createdBy', ctx.userId))
      .take(1);
    
    if (existingTags.length === 0) {
      // Create some basic tags
      const basicTags = [
        { name: "Urgent", color: "#EF4444" },
        { name: "Important", color: "#F59E0B" },
        { name: "Personal", color: "#10B981" },
        { name: "Work", color: "#3B82F6" },
        { name: "Later", color: "#8B5CF6" },
      ];
      
      for (const tag of basicTags) {
        await ctx.table('tags').insert({
          name: tag.name,
          color: tag.color,
          createdBy: ctx.userId,
        });
      }
    }
    
    // Sample data templates
    const titles = [
      "Review quarterly reports",
      "Update project documentation",
      "Schedule team meeting",
      "Prepare presentation slides",
      "Code review for feature branch",
      "Fix bug in authentication flow",
      "Implement new dashboard widget",
      "Write unit tests for API endpoints",
      "Optimize database queries",
      "Update dependencies to latest versions",
      "Design new landing page",
      "Research competitor features",
      "Plan sprint retrospective",
      "Document API endpoints",
      "Set up CI/CD pipeline",
      "Migrate to new hosting provider",
      "Implement user feedback system",
      "Create onboarding tutorial",
      "Analyze user metrics",
      "Refactor legacy code",
    ];

    const descriptions = [
      "Need to complete this task before the end of the week",
      "High priority item that requires immediate attention",
      "Collaborate with the team to ensure quality delivery",
      "Follow up with stakeholders for additional requirements",
      "Research best practices and implement accordingly",
      "This is a critical task for the current sprint",
      "Coordinate with other departments for smooth execution",
      "Make sure to test thoroughly before deployment",
      "Document all changes for future reference",
      "Consider performance implications of this change",
      null, // Some todos without descriptions
      null,
      null,
    ];

    const priorities = ["low", "medium", "high"] as const;
    
    // Get user's projects if no specific project is provided
    let projectIds: Array<{ _id: string }> = [];
    if (args.projectId) {
      // Verify access to the specified project
      const project = await ctx.table("projects").get(args.projectId);
      if (!project) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }
      
      const isOwner = project.ownerId === ctx.userId;
      const memberRecord = await ctx
        .table('projectMembers', 'projectId_userId', (q) => 
          q.eq('projectId', args.projectId!).eq('userId', ctx.userId)
        )
        .first();
      const isMember = !!memberRecord;
      
      if (!isOwner && !isMember) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "You don't have access to this project",
        });
      }
      
      projectIds = [{ _id: args.projectId }];
    } else {
      // Get all user's projects
      const ownedProjects = await ctx
        .table("projects", "ownerId", (q) => q.eq("ownerId", ctx.userId));
      
      const memberProjects = await ctx
        .table("projectMembers", "userId", (q) => q.eq("userId", ctx.userId))
        .map(async (member) => {
          const project = await ctx.table("projects").get(member.projectId);
          return project;
        });
      
      projectIds = [...ownedProjects, ...memberProjects].filter((p): p is NonNullable<typeof p> => p !== null);
    }
    
    // Get user's tags for random assignment
    const tags = await ctx
      .table("tags")
      .filter((q) => q.eq(q.field("createdBy"), ctx.userId));
    
    let created = 0;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    
    for (let i = 0; i < args.count; i++) {
      // Random data selection
      const title = titles[Math.floor(Math.random() * titles.length)];
      const description = descriptions[Math.floor(Math.random() * descriptions.length)];
      const priority = priorities[Math.floor(Math.random() * priorities.length)];
      const isCompleted = Math.random() > 0.7; // 30% completed
      const hasDueDate = Math.random() > 0.6; // 40% have due dates
      
      // Random project assignment (if projects exist)
      const projectId = projectIds.length > 0 && Math.random() > 0.3
        ? projectIds[Math.floor(Math.random() * projectIds.length)]?._id
        : undefined;
      
      // Random tag assignment (0-3 tags)
      const tagCount = tags.length > 0 ? Math.floor(Math.random() * Math.min(4, tags.length)) : 0;
      const selectedTags = tagCount > 0
        ? [...tags]
            .sort(() => Math.random() - 0.5)
            .slice(0, tagCount)
            .map((t) => t._id)
        : [];
      
      // Due date (future dates for incomplete, past dates for completed)
      const dueDate = hasDueDate
        ? isCompleted
          ? thirtyDaysAgo + Math.random() * (now - thirtyDaysAgo)
          : now + Math.random() * 30 * 24 * 60 * 60 * 1000
        : undefined;
      
      // Add some variation to the title
      const titleVariation = i % 5 === 0 ? ` #${i + 1}` : "";
      
      await ctx.table("todos").insert({
        title: title + titleVariation,
        description: description || undefined,
        completed: isCompleted,
        priority,
        dueDate,
        projectId: projectId as Id<"projects"> | undefined,
        userId: ctx.userId,
        tags: selectedTags,
      });
      
      created++;
    }
    
    return { created };
  },
});