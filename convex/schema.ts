import { defineEnt, defineEntSchema, getEntDefinitions } from 'convex-ents';
import { v } from 'convex/values';

const schema = defineEntSchema(
  {
    // --------------------
    // Core User & Session Models
    // --------------------
    users: defineEnt({
      // Profile fields
      name: v.optional(v.string()),
      bio: v.optional(v.string()),
      image: v.optional(v.string()),

      // Organization tracking
      lastActiveOrganizationId: v.optional(v.string()),
      personalOrganizationId: v.string(),

      // Timestamps
      deletedAt: v.optional(v.number()),
    })
      .field('email', v.string(), { unique: true })
      .field('customerId', v.optional(v.string()), { index: true })
      .edges('subscriptions', { to: 'subscriptions', ref: 'userId' })
      .edges('todos', { ref: true })
      .edges('ownedProjects', { to: 'projects', ref: 'ownerId' })
      .edges('memberProjects', {
        to: 'projects',
        table: 'projectMembers',
        field: 'userId',
        inverseField: 'projectId',
      })
      .edges('todoComments', { ref: true }),

    // --------------------
    // Polar Payment Tables
    // --------------------
    subscriptions: defineEnt({
      createdAt: v.string(),
      modifiedAt: v.optional(v.union(v.string(), v.null())),
      amount: v.optional(v.union(v.number(), v.null())),
      currency: v.optional(v.union(v.string(), v.null())),
      recurringInterval: v.optional(v.union(v.string(), v.null())),
      status: v.string(),
      currentPeriodStart: v.string(),
      currentPeriodEnd: v.optional(v.union(v.string(), v.null())),
      cancelAtPeriodEnd: v.boolean(),
      startedAt: v.optional(v.union(v.string(), v.null())),
      endedAt: v.optional(v.union(v.string(), v.null())),
      priceId: v.optional(v.string()),
      productId: v.string(),
      checkoutId: v.optional(v.union(v.string(), v.null())),
      metadata: v.record(v.string(), v.any()),
      customerCancellationReason: v.optional(v.union(v.string(), v.null())),
      customerCancellationComment: v.optional(v.union(v.string(), v.null())),
    })
      .field('subscriptionId', v.string(), { unique: true })
      .field('organizationId', v.string(), { index: true })
      .edge('user', { to: 'users', field: 'userId' })
      .index('organizationId_status', ['organizationId', 'status'])
      .index('userId_organizationId_status', [
        'userId',
        'organizationId',
        'status',
      ])
      .index('userId_endedAt', ['userId', 'endedAt']),

    // --------------------
    // Todo Model
    // --------------------
    todos: defineEnt({
      title: v.string(),
      description: v.optional(v.string()),
    })
      .field('completed', v.boolean(), { index: true })
      .field(
        'priority',
        v.optional(
          v.union(v.literal('low'), v.literal('medium'), v.literal('high'))
        ),
        { index: true }
      )
      .field('dueDate', v.optional(v.number()), { index: true })
      .deletion('soft')
      .edge('user')
      .edge('project', { field: 'projectId', optional: true })
      .edges('tags', {
        to: 'tags',
        table: 'todoTags',
        field: 'todoId',
        inverseField: 'tagId',
      })
      .edges('todoComments', { ref: true })
      .index('user_completed', ['userId', 'completed'])
      .searchIndex('search_title_description', {
        searchField: 'title',
        filterFields: ['userId', 'completed', 'projectId'],
      }),

    // --------------------
    // Project Model
    // --------------------
    projects: defineEnt({
      name: v.string(),
      description: v.optional(v.string()),
    })
      .field('isPublic', v.boolean(), { index: true })
      .field('archived', v.boolean(), { index: true })
      .edge('owner', { to: 'users', field: 'ownerId' })
      .edges('todos', { ref: 'projectId' })
      .edges('members', {
        to: 'users',
        table: 'projectMembers',
        field: 'projectId',
        inverseField: 'userId',
      })
      .searchIndex('search_name_description', {
        searchField: 'name',
        filterFields: ['isPublic', 'archived'],
      }),

    // --------------------
    // Tag Model
    // --------------------
    tags: defineEnt({
      color: v.string(),
    })
      .field('name', v.string(), { index: true })
      .field('createdBy', v.id('users'), { index: true })
      .edges('todos', {
        to: 'todos',
        table: 'todoTags',
        field: 'tagId',
        inverseField: 'todoId',
      }),

    // --------------------
    // Comment Model
    // --------------------
    todoComments: defineEnt({
      content: v.string(),
    })
      .field('parentId', v.optional(v.id('todoComments')), { index: true })
      .edge('todo')
      .edge('user')
      .edges('replies', {
        to: 'todoComments',
        inverse: 'parent',
        table: 'commentReplies',
        field: 'parentId',
        inverseField: 'replyId',
      }),

    // --------------------
    // Join Tables (needed for TypeScript and aggregates)
    // --------------------
    projectMembers: defineEnt({})
      .field('projectId', v.id('projects'), { index: true })
      .field('userId', v.id('users'), { index: true })
      .index('projectId_userId', ['projectId', 'userId'])
      .index('userId_projectId', ['userId', 'projectId']),

    todoTags: defineEnt({})
      .field('todoId', v.id('todos'), { index: true })
      .field('tagId', v.id('tags'), { index: true })
      .index('todoId_tagId', ['todoId', 'tagId'])
      .index('tagId_todoId', ['tagId', 'todoId']),

    commentReplies: defineEnt({})
      .field('parentId', v.id('todoComments'), { index: true })
      .field('replyId', v.id('todoComments'), { index: true })
      .index('parentId_replyId', ['parentId', 'replyId'])
      .index('replyId_parentId', ['replyId', 'parentId']),
  },
  {
    schemaValidation: true,
  }
);

export default schema;

// Export ent definitions for use throughout the app
export const entDefinitions = getEntDefinitions(schema);
