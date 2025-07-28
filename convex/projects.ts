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
} from './functions';
import { aggregateTodosByProject } from './aggregates';
import schema from './schema';

// List user's projects (owned + member)
export const list = createAuthPaginatedQuery()({
  args: {
    includeArchived: z.boolean().optional(),
  },
  handler: async (ctx, args) => {
    const user = ctx.user;
    
    // Get member project IDs first
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
        if (!args.includeArchived && project.archived) {
          return false;
        }
        
        return true;
      })
      .paginate(args.paginationOpts);
    
    // Transform results with additional data
    return {
      ...results,
      page: await asyncMap(results.page, async (project) => ({
        ...project,
        memberCount: (await ctx
          .table('projectMembers', 'projectId', (q) => q.eq('projectId', project._id))).length,
        todoCount: await aggregateTodosByProject.count(ctx, {
          namespace: project._id,
          bounds: {} as any,
        }),
        completedTodoCount: (await ctx
          .table('todos', 'projectId', (q) => q.eq('projectId', project._id))
          .filter((q) => q.eq(q.field('completed'), true))).length,
        isOwner: project.ownerId === user._id,
      })),
    };
  },
});

// Get project with members and todo count
export const get = createPublicQuery()({
  args: {
    projectId: zid('projects'),
  },
  returns: z.object({
    _id: zid('projects'),
    _creationTime: z.number(),
    name: z.string(),
    description: z.string().optional(),
    ownerId: zid('users'),
    isPublic: z.boolean(),
    archived: z.boolean(),
    owner: z.object({
      _id: zid('users'),
      name: z.string().nullable(),
      email: z.string(),
    }),
    members: z.array(z.object({
      _id: zid('users'),
      name: z.string().nullable(),
      email: z.string(),
      joinedAt: z.number(),
    })),
    todoCount: z.number(),
    completedTodoCount: z.number(),
  }).nullable(),
  handler: async (ctx, args) => {
    const project = await ctx.table('projects').get(args.projectId);
    if (!project) return null;
    
    // Check access
    const userId = ctx.userId;
    if (!project.isPublic && userId !== project.ownerId) {
      if (!userId) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this project',
        });
      }
      
      const isMember = await ctx
        .table('projectMembers', 'projectId_userId', (q) => 
          q.eq('projectId', args.projectId).eq('userId', userId)
        )
        .first();
      
      if (!isMember) {
        throw new ConvexError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this project',
        });
      }
    }
    
    const owner = await ctx.table('users').getX(project.ownerId);
    
    const members = await ctx
      .table('projectMembers', 'projectId', (q) => q.eq('projectId', project._id))
      .map(async (member) => {
        const user = await ctx.table('users').get(member.userId);
        if (!user) return null;
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
    const completedTodoCount = (await ctx
      .table('todos', 'projectId', (q) => q.eq('projectId', project._id))
      .filter((q) => q.eq(q.field('completed'), true))).length;
    
    return {
      ...project.doc(),
      owner: {
        _id: owner._id,
        name: owner.name ?? null,
        email: owner.email,
      },
      members: members.filter((m): m is NonNullable<typeof m> => m !== null),
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
    const userToAdd = await ctx.table('users').get('email', args.userEmail);
    if (!userToAdd) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    
    // Check if already member or owner
    if (userToAdd._id === project.ownerId) {
      throw new ConvexError({
        code: 'BAD_REQUEST',
        message: 'User is already the owner of this project',
      });
    }
    
    const existingMember = await ctx
      .table('projectMembers', 'projectId_userId', (q) => 
        q.eq('projectId', args.projectId).eq('userId', userToAdd._id)
      )
      .first();
    
    if (existingMember) {
      throw new ConvexError({
        code: 'BAD_REQUEST',
        message: 'User is already a member of this project',
      });
    }
    
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
    userId: zid('users'),
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
      .first();
    
    if (!member) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'User is not a member of this project',
      });
    }
    
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
      .first();
    
    if (!member) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'You are not a member of this project',
      });
    }
    
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
    newOwnerId: zid('users'),
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
    const newOwner = await ctx.table('users').get(args.newOwnerId);
    if (!newOwner) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'New owner not found',
      });
    }
    
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

// Generate sample projects for testing
export const generateSamples = createAuthMutation({
  rateLimit: 'project/create',
})({
  args: {
    count: z.number().min(1).max(100).default(100),
  },
  returns: z.object({
    created: z.number(),
    todosCreated: z.number(),
  }),
  handler: async (ctx, args) => {
    // First, ensure we have tags (create some if none exist)
    const existingTags = await ctx
      .table('tags', 'createdBy', (q) => q.eq('createdBy', ctx.userId))
      .take(1);
    
    if (existingTags.length === 0) {
      // Create some basic tags
      const basicTags = [
        { name: "Priority", color: "#EF4444" },
        { name: "In Progress", color: "#F59E0B" },
        { name: "Review", color: "#10B981" },
        { name: "Bug", color: "#DC2626" },
        { name: "Feature", color: "#3B82F6" },
      ];
      
      for (const tag of basicTags) {
        await ctx.table('tags').insert({
          name: tag.name,
          color: tag.color,
          createdBy: ctx.userId,
        });
      }
    }
    
    // Get all user's tags for todo assignment
    const tags = await ctx
      .table('tags', 'createdBy', (q) => q.eq('createdBy', ctx.userId));
    // Sample project names and descriptions
    const projectTemplates = [
      {
        name: "Website Redesign",
        description: "Complete overhaul of company website with modern design and improved UX",
      },
      {
        name: "Mobile App Development",
        description: "Native iOS and Android app for our e-commerce platform",
      },
      {
        name: "API Integration",
        description: "Integrate third-party APIs for payment processing and analytics",
      },
      {
        name: "Data Migration",
        description: "Migrate legacy database to new cloud-based infrastructure",
      },
      {
        name: "Security Audit",
        description: "Comprehensive security assessment and vulnerability testing",
      },
      {
        name: "Marketing Campaign",
        description: "Q4 marketing campaign across social media and email channels",
      },
      {
        name: "Customer Portal",
        description: "Self-service portal for customers to manage accounts and orders",
      },
      {
        name: "Analytics Dashboard",
        description: "Real-time analytics dashboard for business intelligence",
      },
      {
        name: "DevOps Pipeline",
        description: "Implement CI/CD pipeline with automated testing and deployment",
      },
      {
        name: "Content Management",
        description: "Build custom CMS for managing blog posts and documentation",
      },
      {
        name: "E-learning Platform",
        description: "Online learning platform with video courses and assessments",
      },
      {
        name: "Inventory System",
        description: "Real-time inventory tracking and management system",
      },
      {
        name: "HR Management",
        description: "Employee management system with leave tracking and payroll",
      },
      {
        name: "Social Network",
        description: "Internal social network for team collaboration",
      },
      {
        name: "Reporting Tool",
        description: "Automated report generation and distribution system",
      },
    ];

    const prefixes = ["Project", "Initiative", "Phase", "Sprint", "Epic"];
    const suffixes = ["Alpha", "Beta", "v2", "2024", "Pro", "Plus", "Enterprise"];

    let created = 0;
    let todosCreated = 0;
    
    // Todo templates for projects
    const todoTemplates = [
      "Set up project structure",
      "Create initial documentation",
      "Define project requirements",
      "Schedule kickoff meeting",
      "Assign team roles",
      "Create development timeline",
      "Set up CI/CD pipeline",
      "Configure testing framework",
      "Design system architecture",
      "Implement core features",
      "Write unit tests",
      "Perform code review",
      "Update progress report",
      "Prepare demo presentation",
      "Deploy to staging",
    ];

    for (let i = 0; i < args.count; i++) {
      // Use template or generate name
      let name: string;
      let description: string | undefined;
      
      if (i < projectTemplates.length * 2 && Math.random() > 0.3) {
        // Use template with variations
        const template = projectTemplates[i % projectTemplates.length];
        const usePrefix = Math.random() > 0.7;
        const useSuffix = Math.random() > 0.7;
        
        name = template.name;
        if (usePrefix) {
          const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
          name = `${prefix} ${name}`;
        }
        if (useSuffix) {
          const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
          name = `${name} ${suffix}`;
        }
        
        description = Math.random() > 0.2 ? template.description : undefined;
      } else {
        // Generate generic name
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        name = `${prefix} ${i + 1}`;
        description = Math.random() > 0.5 
          ? `Description for ${name}. This project aims to deliver value through innovation and collaboration.`
          : undefined;
      }

      // Random properties
      const isPublic = Math.random() > 0.7; // 30% public
      const isArchived = Math.random() > 0.9; // 10% archived

      const projectId = await ctx.table('projects').insert({
        name,
        description,
        ownerId: ctx.userId,
        isPublic,
        archived: isArchived,
      });

      created++;
      
      // Create 3-8 todos for each project (skip for archived projects)
      if (!isArchived) {
        const todoCount = Math.floor(Math.random() * 6) + 3;
        const priorities = ['low', 'medium', 'high'] as const;
        
        for (let j = 0; j < todoCount; j++) {
          const todoTitle = todoTemplates[Math.floor(Math.random() * todoTemplates.length)];
          const isCompleted = Math.random() > 0.7; // 30% completed
          const priority = priorities[Math.floor(Math.random() * priorities.length)];
          
          // Assign 0-2 random tags
          const tagCount = Math.floor(Math.random() * 3);
          const selectedTags = tagCount > 0 && tags.length > 0
            ? [...tags]
                .sort(() => Math.random() - 0.5)
                .slice(0, Math.min(tagCount, tags.length))
                .map((t) => t._id)
            : [];
          
          await ctx.table('todos').insert({
            title: `${todoTitle} - ${name}`,
            description: Math.random() > 0.5 ? `Task for ${name} project` : undefined,
            completed: isCompleted,
            priority,
            projectId,
            userId: ctx.userId,
            tags: selectedTags,
            dueDate: Math.random() > 0.6 
              ? Date.now() + Math.floor(Math.random() * 60 * 24 * 60 * 60 * 1000) // 0-60 days in future
              : undefined,
          });
          
          todosCreated++;
        }
      }
    }

    return { created, todosCreated };
  },
});

// Get user's active projects for dropdown
export const listForDropdown = createAuthQuery()({
  args: {},
  returns: z.array(z.object({
    _id: zid('projects'),
    name: z.string(),
    isOwner: z.boolean(),
  })),
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