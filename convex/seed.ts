import { createUser } from '@convex/authInternal';
import { zid } from 'convex-helpers/server/zod';
import { z } from 'zod';

import type { Id } from './_generated/dataModel';

import { internal } from './_generated/api';
import {
  createInternalAction,
  createInternalMutation,
  createAuthAction,
} from './functions';
import { getEnv } from './helpers/getEnv';

// Admin configuration - moved inside functions to avoid module-level execution
const getAdminConfig = () => {
  const adminEmail = getEnv().ADMIN[0] || 'admin@example.com';

  return { adminEmail };
};

// Seed data
const getUsersData = () => [
  {
    id: 'alice',
    bio: 'Frontend Developer',
    email: 'alice@example.com',
    image: 'https://avatars.githubusercontent.com/u/2',
    name: 'Alice Johnson',
  },
  {
    id: 'bob',
    bio: 'Backend Developer',
    email: 'bob@example.com',
    image: 'https://avatars.githubusercontent.com/u/3',
    name: 'Bob Smith',
  },
  {
    id: 'carol',
    bio: 'UI/UX Designer',
    email: 'carol@example.com',
    image: 'https://avatars.githubusercontent.com/u/4',
    name: 'Carol Williams',
  },
  {
    id: 'dave',
    bio: 'DevOps Engineer',
    email: 'dave@example.com',
    image: undefined,
    name: 'Dave Brown',
  },
];

// Main seed function that orchestrates everything
export const seed = createInternalMutation()({
  args: {},
  returns: z.null(),
  handler: async (ctx) => {
    console.info('🌱 Starting seeding...');

    try {
      // Step 1: Clean up existing seed data
      await ctx.runMutation(internal.seed.cleanupSeedData, {});

      // Step 2: Seed users
      await ctx.runMutation(internal.seed.seedUsers, {});

      console.info('✅ Seeding finished');
    } catch (error) {
      console.error('❌ Error while seeding:', error);
      throw error;
    }

    return null;
  },
});

// Clean up existing seed data
export const cleanupSeedData = createInternalMutation()({
  args: {},
  returns: z.null(),
  handler: async (ctx) => {
    console.info(
      '🧹 Starting cleanup of seed data (preserving users and sessions)...'
    );

    console.info('🧹 Cleanup finished');

    return null;
  },
});

// Seed users
export const seedUsers = createInternalMutation()({
  args: {},
  returns: z.array(zid('users')),
  handler: async (ctx) => {
    console.info('👤 Creating users...');

    const userIds: Id<'users'>[] = [];

    // First, get the admin user if it exists
    const adminEmail = getAdminConfig().adminEmail;
    const adminUser = await ctx.table('users').get('email', adminEmail);

    if (adminUser) {
      userIds.push(adminUser._id);
      console.info(`  ✅ Found admin user: ${adminEmail}`);
    }

    const usersData = getUsersData();

    for (const userData of usersData) {
      // Check if user exists by email
      const existing = await ctx
        .table('users')
        .filter((q) => q.eq(q.field('email'), userData.email))
        .unique();

      if (existing) {
        // Update existing user (preserve session-related fields)
        const updateData: any = {
          name: userData.name,
        };

        if (userData.bio !== undefined) {
          updateData.bio = userData.bio;
        }
        if (userData.image !== undefined) {
          updateData.image = userData.image;
        }

        await ctx.table('users').getX(existing._id).patch(updateData);
        userIds.push(existing._id);
        console.info(`  ✅ Updated user: ${userData.name}`);
      } else {
        const userId = await createUser(ctx, {
          bio: userData.bio,
          email: userData.email,
          image: userData.image,
          name: userData.name,
        });

        userIds.push(userId);
        console.info(`  ✅ Created user: ${userData.name}`);
      }
    }

    console.info('👤 Created/updated users');

    return userIds;
  },
});

// Generate sample projects with todos for testing - AUTH ACTION
export const generateSamples = createAuthAction()({
  args: {
    count: z.number().min(1).max(100).default(100),
  },
  returns: z.object({
    created: z.number(),
    todosCreated: z.number(),
  }),
  handler: async (ctx, args) => {
    let totalCreated = 0;
    let totalTodosCreated = 0;

    // Process in batches of 5 projects at a time
    const batchSize = 5;
    const numBatches = Math.ceil(args.count / batchSize);

    for (let i = 0; i < numBatches; i++) {
      const batchCount = Math.min(batchSize, args.count - i * batchSize);

      // Create projects in this batch using internal mutation
      const batchResult = await ctx.runMutation(
        internal.seed.generateSamplesBatch,
        {
          count: batchCount,
          userId: ctx.user._id,
          batchIndex: i,
        }
      );

      totalCreated += batchResult.created;
      totalTodosCreated += batchResult.todosCreated;
    }

    return {
      created: totalCreated,
      todosCreated: totalTodosCreated,
    };
  },
});

// Internal mutation to generate a small batch of samples
export const generateSamplesBatch = createInternalMutation()({
  args: {
    count: z.number(),
    userId: zid('users'),
    batchIndex: z.number(),
  },
  returns: z.object({
    created: z.number(),
    todosCreated: z.number(),
  }),
  handler: async (ctx, args) => {
    // First, ensure we have tags (create some if none exist)
    const existingTags = await ctx
      .table('tags', 'createdBy', (q) => q.eq('createdBy', args.userId))
      .take(1);

    if (existingTags.length === 0) {
      // Create some basic tags one by one to avoid triggers
      const basicTags = [
        { name: 'Priority', color: '#EF4444' },
        { name: 'In Progress', color: '#F59E0B' },
        { name: 'Review', color: '#10B981' },
        { name: 'Bug', color: '#DC2626' },
        { name: 'Feature', color: '#3B82F6' },
      ];

      for (const tag of basicTags) {
        await ctx.table('tags').insert({
          name: tag.name,
          color: tag.color,
          createdBy: args.userId,
        });
      }
    }

    // Get user's tags for todo assignment (limit to prevent excessive data read)
    const tags = await ctx
      .table('tags', 'createdBy', (q) => q.eq('createdBy', args.userId))
      .take(10); // Reduced from 50 to minimize memory usage

    // Sample project names and descriptions
    const projectTemplates = [
      {
        name: 'Website Redesign',
        description:
          'Complete overhaul of company website with modern design and improved UX',
      },
      {
        name: 'Mobile App Development',
        description: 'Native iOS and Android app for our e-commerce platform',
      },
      {
        name: 'API Integration',
        description:
          'Integrate third-party APIs for payment processing and analytics',
      },
      {
        name: 'Data Migration',
        description:
          'Migrate legacy database to new cloud-based infrastructure',
      },
      {
        name: 'Security Audit',
        description:
          'Comprehensive security assessment and vulnerability testing',
      },
      {
        name: 'Marketing Campaign',
        description:
          'Q4 marketing campaign across social media and email channels',
      },
      {
        name: 'Customer Portal',
        description:
          'Self-service portal for customers to manage accounts and orders',
      },
      {
        name: 'Analytics Dashboard',
        description: 'Real-time analytics dashboard for business intelligence',
      },
      {
        name: 'DevOps Pipeline',
        description:
          'Implement CI/CD pipeline with automated testing and deployment',
      },
      {
        name: 'Content Management',
        description:
          'Build custom CMS for managing blog posts and documentation',
      },
      {
        name: 'E-learning Platform',
        description:
          'Online learning platform with video courses and assessments',
      },
      {
        name: 'Inventory System',
        description: 'Real-time inventory tracking and management system',
      },
      {
        name: 'HR Management',
        description:
          'Employee management system with leave tracking and payroll',
      },
      {
        name: 'Social Network',
        description: 'Internal social network for team collaboration',
      },
      {
        name: 'Reporting Tool',
        description: 'Automated report generation and distribution system',
      },
    ];

    const prefixes = ['Project', 'Initiative', 'Phase', 'Sprint', 'Epic'];
    const suffixes = [
      'Alpha',
      'Beta',
      'v2',
      '2024',
      'Pro',
      'Plus',
      'Enterprise',
    ];

    let created = 0;
    let todosCreated = 0;

    // Todo templates for projects
    const todoTemplates = [
      'Set up project structure',
      'Create initial documentation',
      'Define project requirements',
      'Schedule kickoff meeting',
      'Assign team roles',
      'Create development timeline',
      'Set up CI/CD pipeline',
      'Configure testing framework',
      'Design system architecture',
      'Implement core features',
      'Write unit tests',
      'Perform code review',
      'Update progress report',
      'Prepare demo presentation',
      'Deploy to staging',
    ];

    // Pre-compute tag IDs for efficient selection
    const tagIds = tags.map((t) => t._id);
    const getRandomTags = (maxCount: number) => {
      if (tagIds.length === 0) return [];
      const count = Math.min(
        Math.floor(Math.random() * (maxCount + 1)),
        tagIds.length
      );
      const selectedIndices = new Set<number>();
      while (selectedIndices.size < count) {
        selectedIndices.add(Math.floor(Math.random() * tagIds.length));
      }
      return Array.from(selectedIndices).map((i) => tagIds[i]);
    };

    // Process projects and their todos one at a time to minimize memory usage
    for (let i = 0; i < args.count; i++) {
      // Use template or generate name
      let name: string;
      let description: string | undefined;

      const projectIndex = args.batchIndex * 5 + i; // Global project index (updated for batch size 5)

      if (projectIndex < projectTemplates.length * 2 && Math.random() > 0.3) {
        // Use template with variations
        const template =
          projectTemplates[projectIndex % projectTemplates.length];
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
        name = `${prefix} ${projectIndex + 1}`;
        description =
          Math.random() > 0.5
            ? `Description for ${name}. This project aims to deliver value through innovation and collaboration.`
            : undefined;
      }

      // Random properties
      const isPublic = Math.random() > 0.7; // 30% public
      const isArchived = Math.random() > 0.9; // 10% archived

      const projectId = await ctx.table('projects').insert({
        name,
        description,
        ownerId: args.userId,
        isPublic,
        archived: isArchived,
      });

      created++;

      // Create 2-5 todos for each project immediately (reduced from 3-8 for safety)
      // This way we process one project at a time, avoiding memory buildup
      if (!isArchived) {
        const todoCount = Math.floor(Math.random() * 4) + 2; // 2-5 todos per project
        const priorities = ['low', 'medium', 'high'] as const;

        for (let j = 0; j < todoCount; j++) {
          const todoTitle =
            todoTemplates[Math.floor(Math.random() * todoTemplates.length)];
          const isCompleted = Math.random() > 0.7; // 30% completed
          const priority =
            priorities[Math.floor(Math.random() * priorities.length)];

          // Use optimized tag selection (max 1 tag instead of 2)
          const selectedTags = getRandomTags(1);

          // Insert todo immediately to avoid accumulating in memory
          await ctx.table('todos').insert({
            title: `${todoTitle} - ${name}`,
            description:
              Math.random() > 0.7 ? undefined : `Task for ${name} project`, // Less descriptions
            completed: isCompleted,
            priority,
            projectId,
            userId: args.userId,
            tags: selectedTags,
            dueDate:
              Math.random() > 0.7 // Less due dates (30% instead of 60%)
                ? Date.now() +
                  Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000) // 0-30 days instead of 60
                : undefined,
          });

          todosCreated++;
        }
      }
    }

    return { created, todosCreated };
  },
});

// Run the seed - this can be called from the Convex dashboard
// npx convex run seed:seed
