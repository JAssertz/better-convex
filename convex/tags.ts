import { z } from 'zod';
import { zid } from 'convex-helpers/server/zod';
import { ConvexError } from 'convex/values';
import {
  createAuthMutation,
  createAuthQuery,
} from './functions';

// List user's tags with usage count
export const list = createAuthQuery()({
  args: {},
  returns: z.array(z.object({
    _id: zid('tags'),
    _creationTime: z.number(),
    name: z.string(),
    color: z.string(),
    usageCount: z.number(),
  })),
  handler: async (ctx) => {
    const tags = await ctx
      .table('tags', 'createdBy', (q) => q.eq('createdBy', ctx.user._id))
      .order('asc');
    
    return await Promise.all(tags.map(async (tag) => ({
      ...tag.doc(),
      usageCount: (await tag.edge('todos')).length,
    })));
  },
});

// Create a new tag
export const create = createAuthMutation({
  rateLimit: 'tag/create',
})({
  args: {
    name: z.string().min(1).max(50),
    color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  },
  returns: zid('tags'),
  handler: async (ctx, args) => {
    // Check if tag with same name already exists for this user
    const existingTag = await ctx
      .table('tags', 'createdBy', (q) => q.eq('createdBy', ctx.user._id))
      .filter((q) => q.eq(q.field('name'), args.name))
      .first();
    
    if (existingTag) {
      throw new ConvexError({
        code: 'DUPLICATE_TAG',
        message: 'A tag with this name already exists',
      });
    }
    
    const tagId = await ctx.table('tags').insert({
      name: args.name,
      color: args.color || generateRandomColor(),
      createdBy: ctx.user._id,
    });
    
    return tagId;
  },
});

// Update tag name or color
export const update = createAuthMutation({
  rateLimit: 'tag/update',
})({
  args: {
    tagId: zid('tags'),
    name: z.string().min(1).max(50).optional(),
    color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const tag = await ctx.table('tags').get(args.tagId);
    
    if (!tag || tag.createdBy !== ctx.user._id) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'Tag not found',
      });
    }
    
    // Check for duplicate name if updating name
    if (args.name && args.name !== tag.name) {
      const existingTag = await ctx
        .table('tags', 'createdBy', (q) => q.eq('createdBy', ctx.user._id))
        .filter((q) => q.eq(q.field('name'), args.name))
        .first();
      
      if (existingTag) {
        throw new ConvexError({
          code: 'DUPLICATE_TAG',
          message: 'A tag with this name already exists',
        });
      }
    }
    
    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.color !== undefined) updates.color = args.color;
    
    if (Object.keys(updates).length > 0) {
      await ctx.table('tags').getX(args.tagId).patch(updates);
    }
    
    return null;
  },
});

// Delete a tag (removes from all todos)
export const deleteTag = createAuthMutation({
  rateLimit: 'tag/delete',
})({
  args: {
    tagId: zid('tags'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const tag = await ctx.table('tags').get(args.tagId);
    
    if (!tag || tag.createdBy !== ctx.user._id) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'Tag not found',
      });
    }
    
    // Delete the tag - Convex Ents will handle removing from todos automatically
    await ctx.table('tags').getX(args.tagId).delete();
    
    return null;
  },
});

// Merge two tags
export const merge = createAuthMutation({
  rateLimit: 'tag/update', // Using update rate limit for merge
})({
  args: {
    sourceTagId: zid('tags'),
    targetTagId: zid('tags'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    if (args.sourceTagId === args.targetTagId) {
      throw new ConvexError({
        code: 'INVALID_OPERATION',
        message: 'Cannot merge a tag with itself',
      });
    }
    
    const sourceTag = await ctx.table('tags').get(args.sourceTagId);
    const targetTag = await ctx.table('tags').get(args.targetTagId);
    
    if (!sourceTag || sourceTag.createdBy !== ctx.user._id) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'Source tag not found',
      });
    }
    
    if (!targetTag || targetTag.createdBy !== ctx.user._id) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'Target tag not found',
      });
    }
    
    // Get all todos with source tag
    const todosWithSourceTag = await sourceTag.edge('todos');
    
    // Add target tag to todos that have source tag (avoiding duplicates)
    for (const todo of todosWithSourceTag) {
      const currentTags = await todo.edge('tags').map(t => t._id);
      if (!currentTags.includes(args.targetTagId)) {
        await ctx.table('todos').getX(todo._id).patch({
          tags: { add: [args.targetTagId] },
        });
      }
    }
    
    // Delete source tag
    await ctx.table('tags').getX(args.sourceTagId).delete();
    
    return null;
  },
});

// Get most popular tags across all users
export const popular = createAuthQuery()({
  args: {
    limit: z.number().min(1).max(50).optional(),
  },
  returns: z.array(z.object({
    _id: zid('tags'),
    name: z.string(),
    color: z.string(),
    usageCount: z.number(),
    isOwn: z.boolean(),
  })),
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    
    // Get all tags with usage counts
    const allTags = await ctx.table('tags').take(100);
    
    const tagsWithCounts = await Promise.all(allTags.map(async (tag) => ({
      ...tag.doc(),
      usageCount: (await tag.edge('todos')).length,
      isOwn: tag.createdBy === ctx.user._id,
    })));
    
    // Sort by usage count and return top N
    return tagsWithCounts
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  },
});

// Generate sample tags for testing
export const generateSamples = createAuthMutation({
  rateLimit: 'tag/create',
})({
  args: {
    count: z.number().min(1).max(100).default(100),
  },
  returns: z.object({
    created: z.number(),
  }),
  handler: async (ctx, args) => {
    // Sample tag names with colors
    const tagTemplates = [
      { name: "Urgent", color: "#EF4444" }, // red
      { name: "Important", color: "#F59E0B" }, // amber
      { name: "Personal", color: "#10B981" }, // emerald
      { name: "Work", color: "#3B82F6" }, // blue
      { name: "Home", color: "#8B5CF6" }, // violet
      { name: "Shopping", color: "#EC4899" }, // pink
      { name: "Health", color: "#14B8A6" }, // teal
      { name: "Finance", color: "#F97316" }, // orange
      { name: "Learning", color: "#6366F1" }, // indigo
      { name: "Travel", color: "#84CC16" }, // lime
      { name: "Project", color: "#06B6D4" }, // cyan
      { name: "Meeting", color: "#7C3AED" }, // purple
      { name: "Deadline", color: "#DC2626" }, // red-600
      { name: "Review", color: "#059669" }, // emerald-600
      { name: "Research", color: "#2563EB" }, // blue-600
      { name: "Development", color: "#7C2D12" }, // orange-900
      { name: "Design", color: "#BE185D" }, // pink-700
      { name: "Testing", color: "#0891B2" }, // cyan-600
      { name: "Documentation", color: "#6D28D9" }, // purple-700
      { name: "Maintenance", color: "#CA8A04" }, // yellow-600
    ];

    const prefixes = ["Priority", "Category", "Type", "Status", "Label"];
    const suffixes = ["Task", "Item", "Note", "Reminder", "Todo"];
    
    // Keep track of used names to avoid duplicates
    const usedNames = new Set<string>();
    
    // First, check existing tags to avoid duplicates
    const existingTags = await ctx
      .table('tags', 'createdBy', (q) => q.eq('createdBy', ctx.user._id));
    
    existingTags.forEach(tag => usedNames.add(tag.name.toLowerCase()));
    
    let created = 0;
    
    for (let i = 0; i < args.count && created < args.count; i++) {
      let name: string;
      let color: string;
      
      if (i < tagTemplates.length && !usedNames.has(tagTemplates[i].name.toLowerCase())) {
        // Use template directly
        name = tagTemplates[i].name;
        color = tagTemplates[i].color;
      } else {
        // Generate a unique name
        let attempts = 0;
        do {
          if (Math.random() > 0.5 && i < tagTemplates.length * 2) {
            // Use template with variation
            const template = tagTemplates[i % tagTemplates.length];
            const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            name = `${prefix} ${template.name}`;
            color = template.color;
          } else {
            // Generate completely random name
            const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
            const number = Math.floor(Math.random() * 100);
            name = `${prefix} ${suffix} ${number}`;
            color = generateRandomColor();
          }
          attempts++;
          if (attempts > 50) {
            // Give up after too many attempts
            break;
          }
        } while (usedNames.has(name.toLowerCase()));
        
        if (attempts > 50) {
          continue;
        }
      }
      
      // Add to used names
      usedNames.add(name.toLowerCase());
      
      try {
        await ctx.table('tags').insert({
          name,
          color,
          createdBy: ctx.user._id,
        });
        created++;
      } catch (error) {
        // Skip if insertion fails (e.g., due to race condition)
        console.error(`Failed to create tag: ${name}`, error);
      }
    }
    
    return { created };
  },
});

// Helper function to generate random hex color
function generateRandomColor(): string {
  const colors = [
    '#EF4444', // red
    '#F59E0B', // amber
    '#10B981', // emerald
    '#3B82F6', // blue
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316', // orange
    '#6366F1', // indigo
    '#84CC16', // lime
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}