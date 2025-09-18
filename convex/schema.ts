import { defineEnt, defineEntSchema, getEntDefinitions } from 'convex-ents';
import { v } from 'convex/values';

const schema = defineEntSchema(
  {
    // --------------------
    // Better Auth Tables (forked locally)
    // --------------------

    session: defineEnt({
      expiresAt: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
      ipAddress: v.optional(v.union(v.null(), v.string())),
      userAgent: v.optional(v.union(v.null(), v.string())),
      impersonatedBy: v.optional(v.union(v.null(), v.string())),
      activeOrganizationId: v.optional(v.union(v.null(), v.string())),
    })
      .field('token', v.string(), { index: true })
      .edge('user', { to: 'user', field: 'userId' })
      .index('expiresAt', ['expiresAt'])
      .index('expiresAt_userId', ['expiresAt', 'userId']),

    account: defineEnt({
      accountId: v.string(),
      providerId: v.string(),
      accessToken: v.optional(v.union(v.null(), v.string())),
      refreshToken: v.optional(v.union(v.null(), v.string())),
      idToken: v.optional(v.union(v.null(), v.string())),
      accessTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
      refreshTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
      scope: v.optional(v.union(v.null(), v.string())),
      password: v.optional(v.union(v.null(), v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .edge('user', { to: 'user', field: 'userId' })
      .index('accountId', ['accountId'])
      .index('accountId_providerId', ['accountId', 'providerId'])
      .index('providerId_userId', ['providerId', 'userId']),

    verification: defineEnt({
      value: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .field('identifier', v.string(), { index: true })
      .field('expiresAt', v.number(), { index: true }),

    organization: defineEnt({
      logo: v.optional(v.union(v.null(), v.string())),
      createdAt: v.number(),
      metadata: v.optional(v.union(v.null(), v.string())),
      monthlyCredits: v.number(),
    })
      .field('slug', v.string(), { unique: true })
      .field('name', v.string(), { index: true })
      .edges('members', { to: 'member', ref: true })
      .edges('invitations', { to: 'invitation', ref: true })
      .edges('usersLastActive', {
        to: 'user',
        ref: 'lastActiveOrganizationId',
      })
      .edges('usersPersonal', { to: 'user', ref: 'personalOrganizationId' }),

    member: defineEnt({
      createdAt: v.number(),
    })
      .field('role', v.string(), { index: true })
      .edge('organization', { to: 'organization', field: 'organizationId' })
      .edge('user', { to: 'user', field: 'userId' })
      .index('organizationId_userId', ['organizationId', 'userId']),

    invitation: defineEnt({
      role: v.optional(v.union(v.null(), v.string())),
      expiresAt: v.number(),
    })
      .field('email', v.string(), { index: true })
      .field('status', v.string(), { index: true })
      .edge('organization', { to: 'organization', field: 'organizationId' })
      .edge('inviter', { to: 'user', field: 'inviterId' })
      .index('email_organizationId_status', [
        'email',
        'organizationId',
        'status',
      ])
      .index('organizationId_status', ['organizationId', 'status'])
      .index('email_status', ['email', 'status'])
      .index('organizationId_email', ['organizationId', 'email'])
      .index('organizationId_email_status', [
        'organizationId',
        'email',
        'status',
      ]),

    jwks: defineEnt({
      publicKey: v.string(),
      privateKey: v.string(),
      createdAt: v.number(),
    }),

    // --------------------
    // Unified User Model (App + Better Auth)
    // --------------------
    user: defineEnt({
      // Better Auth required fields
      name: v.string(),
      emailVerified: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),

      // Better Auth optional fields
      image: v.optional(v.union(v.null(), v.string())),
      role: v.optional(v.union(v.null(), v.string())),
      banned: v.optional(v.union(v.null(), v.boolean())),
      banReason: v.optional(v.union(v.null(), v.string())),
      banExpires: v.optional(v.union(v.null(), v.number())),
      bio: v.optional(v.union(v.null(), v.string())),
      firstName: v.optional(v.union(v.null(), v.string())),
      github: v.optional(v.union(v.null(), v.string())),
      lastName: v.optional(v.union(v.null(), v.string())),
      linkedin: v.optional(v.union(v.null(), v.string())),
      location: v.optional(v.union(v.null(), v.string())),
      username: v.optional(v.union(v.null(), v.string())),
      website: v.optional(v.union(v.null(), v.string())),
      x: v.optional(v.union(v.null(), v.string())),

      // App-specific fields
      deletedAt: v.optional(v.number()),
    })
      .field('email', v.string(), { unique: true })
      .field('customerId', v.optional(v.string()), { index: true })
      // Better Auth edges
      .edges('sessions', { to: 'session', ref: 'userId' })
      .edges('accounts', { to: 'account', ref: 'userId' })
      .edges('members', { to: 'member', ref: 'userId' })
      .edges('invitations', { to: 'invitation', ref: 'inviterId' })
      // App-specific edges
      .edge('lastActiveOrganization', {
        to: 'organization',
        field: 'lastActiveOrganizationId',
        optional: true,
      })
      .edge('personalOrganization', {
        to: 'organization',
        field: 'personalOrganizationId',
        optional: true,
      })
      .edges('subscriptions', { to: 'subscriptions', ref: 'userId' })
      .edges('todos', { ref: true })
      .edges('ownedProjects', { to: 'projects', ref: 'ownerId' })
      .edges('memberProjects', {
        to: 'projects',
        table: 'projectMembers',
        field: 'userId',
        inverseField: 'projectId',
      })
      .edges('todoComments', { ref: true })
      // Indexes from both tables
      .index('email_name', ['email', 'name'])
      .index('name', ['name']),

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
      .edge('user', { to: 'user', field: 'userId' })
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
      .edge('user', { to: 'user', field: 'userId' })
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
      .edge('owner', { to: 'user', field: 'ownerId' })
      .edges('todos', { ref: 'projectId' })
      .edges('members', {
        to: 'user',
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
      .field('createdBy', v.id('user'), { index: true })
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
      .edge('user', { to: 'user', field: 'userId' })
      .edges('replies', {
        to: 'todoComments',
        inverse: 'parent',
        table: 'commentReplies',
        field: 'parentId',
        inverseField: 'replyId',
      }),

    // --------------------
    // Join Tables with extended fields, indexes (two 1:many edges) and edges
    // --------------------
    // --------------------
    // Join Tables mapping the auto-generated edges (needed only for TypeScript and aggregates).
    // NOT SUPPORTED: custom fields, indexes, edges.
    // --------------------
    projectMembers: defineEnt({})
      .field('projectId', v.id('projects'), { index: true })
      .field('userId', v.id('user'), { index: true })
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
