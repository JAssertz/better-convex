---
name: convex-test
description: Use when writing tests for Convex functions - provides patterns for unit testing queries/mutations/actions, Ents, authentication, rules, scheduled functions, and database operations using convex-test library
---

## Overview

Test Convex functions using `convex-test` library with Vitest in edge-runtime environment. Tests run fast in-memory mock of Convex backend. Always use the project's custom `convexTest` wrapper from `setup.testing.ts`.

## Common Mistakes

| Mistake                                  | Fix                                             |
| ---------------------------------------- | ----------------------------------------------- |
| Using `baseConvexTest` directly          | Use `convexTest` from `./setup.testing`         |
| Forgetting `await runCtx(baseCtx)`       | Always wrap context in `runCtx`                 |
| Not using `t.run()` wrapper              | All test logic must be inside `t.run()`         |
| Missing `vi.useFakeTimers()`             | Required for scheduled function tests           |
| Not calling `vi.useRealTimers()` cleanup | Always reset timers after fake timer tests      |
| Missing schema import                    | Always pass `schema` to `convexTest()`          |
| Not cleaning up scheduled functions      | Use `t.finishAllScheduledFunctions()`           |
| Accessing `ctx.user` outside auth tests  | Set viewer first with `addViewer()` helper      |

## Test File Setup

**Location:** `convex/*.test.ts`

**File Pattern:**

```typescript
import { test as baseTest, expect, vi } from 'vitest';
import { internal, api } from './_generated/api';
import schema from './schema';
import { convexTest, runCtx } from './setup.testing';
import { MutationCtx, QueryCtx } from './types';

// Basic test (no context injection)
test('simple test', async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    // test logic here
  });
});

// Advanced: Context injection pattern
const test = baseTest.extend<{
  ctx: MutationCtx;
}>({
  // eslint-disable-next-line no-empty-pattern
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

// Use injected context
test('with context injection', async ({ ctx }) => {
  // ctx is already set up
  await ctx.table('users').insert({ name: 'Test', email: 'test@example.com' });
});
```

**Context Types:**

- `MutationCtx` - Full read/write context (use for most tests)
- `QueryCtx` - Read-only context (use for query-only tests)
- Replace `MutationCtx` with `QueryCtx` in test setup to verify read-only constraints

## Basic Testing Patterns

### Simple Query/Mutation Test

```typescript
test('insert and query', async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    // Insert data
    const userId = await ctx
      .table('users')
      .insert({ name: 'Stark', email: 'tony@stark.com' });

    // Query data
    const user = await ctx.table('users').getX(userId);
    expect(user.name).toEqual('Stark');
  });
});
```

### Testing Ents Edge Traversal

```typescript
test('1:many edge traversal', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' });
  await ctx.table('messages').insert({ text: 'Hello world', userId });

  // Traverse edge
  const firstMessage = await ctx.table('messages').firstX();
  const user = await firstMessage.edge('user');
  expect(user.name).toEqual('Stark');
});

test('many:many edge', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' });
  const messageId = await ctx
    .table('messages')
    .insert({ text: 'Hello world', userId });
  const tagId = await ctx
    .table('tags')
    .insert({ name: 'cool', messages: [messageId] });

  // Check edge exists
  const hasTag = await ctx.table('messages').getX(messageId).edge('tags').has(tagId);
  expect(hasTag).toEqual(true);
});
```

### Testing with `.get()` for Ent Methods

```typescript
test('insert and use ent methods', async ({ ctx }) => {
  // Use .get() to get ent with methods
  const user = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' })
    .get();

  // Now can use ent methods
  const messages = await user.edge('messages');
  await user.patch({ name: 'Tony Stark' });
});
```

## Testing with Context Injection

**Recommended for most tests** - cleaner syntax, automatic setup/cleanup

```typescript
const test = baseTest.extend<{ ctx: MutationCtx }>({
  // eslint-disable-next-line no-empty-pattern
  ctx: async ({}, use) => {
    const t = convexTest(schema);
    await t.run(async (baseCtx) => {
      const ctx = await runCtx(baseCtx);
      await use(ctx);
    });
  },
});

test('with injected context', async ({ ctx }) => {
  // ctx is ready to use
  const user = await ctx.table('users').insert({ name: 'Test', email: 'test@example.com' });
});
```

## Testing Mutations and Writes

### Insert Operations

```typescript
test('insert returns ID', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Gates', email: 'bill@gates.com' });
  expect(userId).toBeTruthy();
});

test('insertMany', async ({ ctx }) => {
  const userIds = await ctx.table('users').insertMany([
    { name: 'Stark', email: 'tony@stark.com' },
    { name: 'Musk', email: 'elon@musk.com' },
  ]);
  expect(userIds).toHaveLength(2);
});
```

### Patch Operations

```typescript
test('patch updates fields', async ({ ctx }) => {
  const user = await ctx
    .table('users')
    .insert({ name: 'Gates', email: 'bill@gates.com' })
    .get();

  const updated = await user.patch({ name: 'Bill Gates' }).get();
  expect(updated.name).toEqual('Bill Gates');
  expect(updated.email).toEqual('bill@gates.com');
});

test('patch removes field with undefined', async ({ ctx }) => {
  const userId = await ctx.table('users').insert({
    name: 'Gates',
    email: 'bill@gates.com',
    height: 1.8,
  });

  await ctx.table('users').getX(userId).patch({ height: undefined });
  const updated = await ctx.table('users').getX(userId);
  expect(updated.height).toBeUndefined();
});
```

### Replace Operations

```typescript
test('replace updates entire document', async ({ ctx }) => {
  const tag = await ctx
    .table('tags')
    .insert({ name: 'Blue', messages: [messageId] })
    .get();

  await tag.replace({ name: 'Green', messages: [] });
  const updated = await ctx.table('tags').getX(tag._id);
  expect(updated.name).toEqual('Green');
});
```

### Delete Operations

```typescript
test('delete removes document', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Gates', email: 'bill@gates.com' });

  await ctx.table('users').getX(userId).delete();
  const deleted = await ctx.table('users').get(userId);
  expect(deleted).toBeNull();
});
```

## Testing Edge Operations

### 1:1 Edges

```typescript
test('1:1 edge traversal', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' });
  await ctx.table('profiles').insert({ bio: 'Hello world', userId });

  const profile = await ctx.table('users').firstX().edgeX('profile');
  expect(profile.bio).toEqual('Hello world');
});

test('1:1 optional edge missing', async ({ ctx }) => {
  const photo = await ctx.table('photos').insert({ url: 'https://a.b' }).get();
  const user = await photo.edge('user');
  expect(user).toBeNull();
});
```

### 1:Many Edges

```typescript
test('1:many edge from field end', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' });
  await ctx.table('messages').insert({ text: 'Hello world', userId });

  const user = await ctx.table('messages').firstX().edge('user');
  expect(user.name).toEqual('Stark');
});

test('1:many edge pagination', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' });
  await ctx.table('messages').insertMany([
    { text: 'First', userId },
    { text: 'Second', userId },
    { text: 'Third', userId },
  ]);

  const page = await ctx
    .table('users')
    .firstX()
    .edge('messages')
    .paginate({ numItems: 2, cursor: null });

  expect(page.page).toHaveLength(2);
  expect(page.isDone).toEqual(false);
});
```

### Many:Many Edges

```typescript
test('many:many edge creation', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' });
  const messageId = await ctx
    .table('messages')
    .insert({ text: 'Hello', userId });
  const tagId = await ctx
    .table('tags')
    .insert({ name: 'cool', messages: [messageId] });

  const tags = await ctx.table('messages').getX(messageId).edge('tags');
  expect(tags).toHaveLength(1);
  expect(tags[0].name).toEqual('cool');
});

test('many:many has() check', async ({ ctx }) => {
  const messageId = await ctx.table('messages').insert({ text: 'Hello', userId });
  const tagId = await ctx.table('tags').insert({ name: 'cool', messages: [messageId] });

  const hasTag = await ctx.table('messages').getX(messageId).edge('tags').has(tagId);
  expect(hasTag).toEqual(true);
});

test('many:many symmetric edge', async ({ ctx }) => {
  const user1 = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' })
    .get();
  const user2 = await ctx
    .table('users')
    .insert({ name: 'Musk', email: 'elon@musk.com' })
    .get();

  await user2.patch({ friends: { add: [user1._id] } });

  const friends = await ctx.table('users').firstX().edge('friends');
  expect(friends).toHaveLength(1);
  expect(friends[0].name).toEqual('Musk');
});
```

### Edge IDs Only (Performance)

```typescript
test('many:many edge ids only', async ({ ctx }) => {
  const messageId = await ctx.table('messages').insert({ text: 'Hello', userId });
  const tagIds = await ctx.table('tags').insertMany([
    { name: 'cool', messages: [messageId] },
    { name: 'funny', messages: [messageId] },
  ]);

  // Get IDs only (more efficient)
  const ids = await ctx.table('messages').getX(messageId).edge('tags').ids().take(3);
  expect(ids).toMatchObject(tagIds.slice(0, 3));

  // Map over IDs to fetch selectively
  const names = await ctx
    .table('messages')
    .getX(messageId)
    .edge('tags')
    .ids()
    .map(async (id) => (await ctx.table('tags').getX(id)).name);
  expect(names).toMatchObject(['cool', 'funny']);
});
```

## Testing Query Operations

### Get Operations

```typescript
test('get by ID', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' });

  const user = await ctx.table('users').get(userId);
  expect(user).not.toBeNull();
  expect(user!.name).toEqual('Stark');
});

test('getX throws if not found', async ({ ctx }) => {
  await expect(async () => {
    await ctx.table('users').getX('invalid_id' as any);
  }).rejects.toThrow();
});

test('get via unique index', async ({ ctx }) => {
  await ctx.table('users').insert({ name: 'Stark', email: 'tony@stark.com' });
  const user = await ctx.table('users').get('email', 'tony@stark.com');
  expect(user).not.toBeNull();
});

test('get via compound index', async ({ ctx }) => {
  await ctx.table('posts').insert({ text: 'My video', type: 'video', numLikes: 4 });
  const post = await ctx.table('posts').getX('numLikesAndType', 'video', 4);
  expect(post.text).toEqual('My video');
});
```

### getMany Operations

```typescript
test('getMany with nulls', async ({ ctx }) => {
  const ids = await ctx.table('users').insertMany([
    { name: 'Stark', email: 'tony@stark.com' },
    { name: 'Musk', email: 'elon@musk.com' },
  ]);

  await ctx.table('users').getX(ids[0]).delete();

  const users = await ctx.table('users').getMany([ids[0], ids[1]]);
  expect(users).toMatchObject([null, { name: 'Musk' }]);
});

test('getManyX throws if any missing', async ({ ctx }) => {
  const ids = await ctx.table('users').insertMany([
    { name: 'Stark', email: 'tony@stark.com' },
    { name: 'Musk', email: 'elon@musk.com' },
  ]);

  await ctx.table('users').getX(ids[0]).delete();

  await expect(async () => {
    await ctx.table('users').getManyX([ids[0], ids[1]]);
  }).rejects.toThrow();
});
```

### Query with Indexes

```typescript
test('query using index', async ({ ctx }) => {
  await ctx.table('posts').insertMany([
    { text: 'Video 1', type: 'video', numLikes: 5 },
    { text: 'Video 2', type: 'video', numLikes: 3 },
  ]);

  const post = await ctx
    .table('posts', 'numLikesAndType', (q) =>
      q.eq('type', 'video').gt('numLikes', 3)
    )
    .firstX();

  expect(post.text).toEqual('Video 1');
});
```

### Search Queries

```typescript
test('search with filter', async ({ ctx }) => {
  await ctx.table('posts').insertMany([
    { text: 'Great video', type: 'video', numLikes: 4 },
    { text: 'Awesome video', type: 'video', numLikes: 0 },
  ]);

  const post = await ctx
    .table('posts')
    .search('text', (q) => q.search('text', 'awesome').eq('type', 'video'))
    .firstX();

  expect(post.text).toEqual('Awesome video');
});
```

### Ordering and Pagination

```typescript
test('order and pagination', async ({ ctx }) => {
  await ctx.table('users').insertMany([
    { name: 'Stark', email: 'tony@stark.com', height: 3 },
    { name: 'Musk', email: 'elon@musk.com' },
  ]);

  const result = await ctx
    .table('users')
    .order('asc', 'email')
    .paginate({ cursor: null, numItems: 5 });

  expect(result.page[0].name).toEqual('Musk');
  expect(result.page[1].name).toEqual('Stark');
});
```

### Map Operations

```typescript
test('map with edges', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' });
  await ctx.table('messages').insert({ text: 'Hello', userId });

  const enriched = await ctx.table('users').map(async (user) => ({
    ...user.doc(),
    messages: await user.edge('messages'),
  }));

  expect(enriched[0].messages).toHaveLength(1);
});

test('paginate with map', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' });
  await ctx.table('messages').insert({ text: 'Hello', userId });

  const result = await ctx
    .table('messages')
    .paginate({ cursor: null, numItems: 1 })
    .map(async (msg) => ({
      text: msg.text,
      author: (await msg.edge('user')).name,
    }));

  expect(result.page[0].author).toEqual('Stark');
});
```

## Testing Default Fields

```typescript
test('default field values', async ({ ctx }) => {
  await ctx.table('posts').insert({ text: 'My post' } as any);
  const post = await ctx.table('posts').firstX();
  expect(post.numLikes).toEqual(0);
  expect(post.type).toEqual('text');
});
```

## Testing Unique Constraints

```typescript
test('unique field constraint', async ({ ctx }) => {
  await ctx.table('users').insert({
    name: 'Gates',
    email: 'bill@gates.com',
  });

  await expect(async () => {
    await ctx.table('users').insert({
      name: 'Mellinda',
      email: 'bill@gates.com',
    });
  }).rejects.toThrowError(
    'In table "users" cannot create a duplicate document with field "email"'
  );
});

test('1:1 uniqueness constraint', async ({ ctx }) => {
  const userId = await ctx.table('users').insert({
    name: 'Gates',
    email: 'bill@gates.com',
  });
  await ctx.table('profiles').insert({ bio: 'Hello', userId });

  await expect(async () => {
    await ctx.table('profiles').insert({ bio: 'Other', userId });
  }).rejects.toThrowError(
    'In table "profiles" cannot create a duplicate 1:1 edge "user"'
  );
});
```

## Testing Rules

**CRITICAL:** Rules tests require setting up a viewer (first user becomes viewer in test context)

### Setup Helper

```typescript
async function addViewer(t: TestConvex<typeof schema>) {
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    await ctx.table('users').insert({ name: 'Stark', email: 'tony@stark.com' });
  });
}
```

### Read Rules

```typescript
test('read rule filters results', async () => {
  const t = convexTest(schema);

  // Setup data with skipRules
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const [user1Id, user2Id] = await ctx.table('users').insertMany([
      { name: 'Stark', email: 'tony@stark.com' },
      { name: 'Musk', email: 'elon@musk.com' },
    ]);
    await ctx.skipRules.table('secrets').insertMany([
      { value: 'secret1', ownerId: user1Id },
      { value: 'secret2', ownerId: user2Id },
    ]);
  });

  // Rules applied - first user is viewer
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const secrets = await ctx.table('secrets');
    expect(secrets).toHaveLength(1); // Only sees own secret
  });
});

test('read rule on edge traversal', async () => {
  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const [user1Id, user2Id] = await ctx.table('users').insertMany([
      { name: 'Stark', email: 'tony@stark.com' },
      { name: 'Musk', email: 'elon@musk.com' },
    ]);
    await ctx.skipRules.table('secrets').insertMany([
      { value: 'secret1', ownerId: user1Id },
      { value: 'secret2', ownerId: user2Id },
    ]);
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const [firstUser, secondUser] = await ctx.table('users').take(2);
    const viewerSecret = await firstUser.edge('secret');
    expect(viewerSecret?.value).toEqual('secret1');
    const otherSecret = await secondUser.edge('secret');
    expect(otherSecret).toEqual(null); // Rule blocks access
  });
});
```

### Write Rules

```typescript
test('write rule on insert', async () => {
  const t = convexTest(schema);
  await addViewer(t);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const viewer = await ctx.table('users').firstX();
    const otherUserId = await ctx
      .table('users')
      .insert({ name: 'Jobs', email: 'steve@jobs.com' });

    // Can create own secret
    await ctx.table('secrets').insert({ value: '123', ownerId: viewer._id });

    // Cannot create secret for other user
    await expect(async () => {
      await ctx.table('secrets').insert({ value: '123', ownerId: otherUserId });
    }).rejects.toThrowError('Cannot insert into table "secrets"');
  });
});

test('write rule on patch', async () => {
  const t = convexTest(schema);
  await addViewer(t);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const otherUserId = await ctx
      .table('users')
      .insert({ name: 'Jobs', email: 'steve@jobs.com' });
    const secretId = await ctx.skipRules
      .table('secrets')
      .insert({ value: '123', ownerId: ctx.viewerId! });

    // Cannot change owner (immutable field)
    await expect(async () => {
      await ctx.table('secrets').getX(secretId).patch({ ownerId: otherUserId });
    }).rejects.toThrowError('Cannot update document');

    // Can update value
    await ctx.table('secrets').getX(secretId).patch({ value: '456' });
  });
});

test('write rule on delete', async () => {
  const t = convexTest(schema);
  await addViewer(t);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const viewer = await ctx.table('users').firstX();
    const secret = await ctx
      .table('secrets')
      .insert({ value: '123', ownerId: viewer._id })
      .get();

    await expect(async () => {
      await secret.delete();
    }).rejects.toThrowError('Cannot delete from table "secrets"');
  });
});
```

## Testing Cascading Deletes

```typescript
test('hard cascading deletes', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Jobs', email: 'steve@jobs.com' });
  const messageId = await ctx
    .table('messages')
    .insert({ text: 'Hello', userId });
  const detailId = await ctx
    .table('messageDetails')
    .insert({ value: 'Detail', messageId });

  await ctx.table('users').getX(userId).delete();

  // Cascading delete removes message and detail
  expect(await ctx.table('messages').get(messageId)).toBeNull();
  expect(await ctx.table('messageDetails').get(detailId)).toBeNull();
});

test('soft deletion', async ({ ctx }) => {
  const userId = await ctx
    .table('users')
    .insert({ name: 'Stark', email: 'tony@stark.com' });
  const headshotId = await ctx
    .table('headshots')
    .insert({ taken: '2024-11-09', userId });

  await ctx.table('headshots').getX(headshotId).delete();

  // Soft delete sets deletionTime
  const headshot = await ctx.table('headshots').getX(headshotId);
  expect(headshot.deletionTime).not.toBeUndefined();
});

test('scheduled deletion', async () => {
  vi.useFakeTimers();

  const t = convexTest(schema);
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const teamId = await ctx.table('teams').insert({});
    const memberId = await ctx.table('members').insert({ teamId });
    const dataId = await ctx.table('datas').insert({ memberId });

    await ctx.table('teams').getX(teamId).delete();

    // Soft deleted initially
    const team = await ctx.table('teams').getX(teamId);
    expect(team.deletionTime).not.toBeUndefined();
    expect(await ctx.table('datas').getX(dataId)).not.toBeNull();
  });

  // Run scheduled deletion
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    // Hard deleted after scheduled function runs
    expect(await ctx.table('teams')).toHaveLength(0);
    expect(await ctx.table('members')).toHaveLength(0);
    expect(await ctx.table('datas')).toHaveLength(0);
  });

  vi.useRealTimers();
});
```

## Testing System Tables

```typescript
test('_scheduled_functions table', async ({ ctx }) => {
  vi.useFakeTimers();

  const jobId = await ctx.scheduler.runAfter(
    1000,
    internal.migrations.usersCapitalizeName,
    { fn: 'Foo' }
  );

  const job = await ctx.table.system('_scheduled_functions').get(jobId);
  expect(job).not.toBeNull();
  expect(job!.state.kind).toEqual('pending');

  await ctx.scheduler.cancel(jobId);

  vi.useRealTimers();
});

test('get via index on system tables', async ({ ctx }) => {
  vi.useFakeTimers();

  const jobId = await ctx.scheduler.runAfter(
    1000,
    internal.migrations.usersCapitalizeName,
    { fn: 'Foo' }
  );

  const job = await ctx.table.system('_scheduled_functions').get('by_id', jobId);
  expect(job).not.toBeNull();

  vi.useRealTimers();
});
```

## Testing Scheduled Functions

**CRITICAL:** Always use fake timers for scheduled function tests

```typescript
test('schedule and run mutation', async () => {
  vi.useFakeTimers();

  const t = convexTest(schema);

  // Schedule function
  const scheduledId = await t.mutation(api.scheduler.scheduleUpdate, {
    delayMs: 10000,
  });

  // Advance time
  vi.advanceTimersByTime(11000);

  // Wait for completion
  await t.finishInProgressScheduledFunctions();

  // Verify result
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const job = await ctx.table.system('_scheduled_functions').get(scheduledId);
    expect(job!.state.kind).toEqual('success');
  });

  vi.useRealTimers();
});

test('chain of scheduled functions', async () => {
  vi.useFakeTimers();

  const t = convexTest(schema);

  await t.mutation(api.scheduler.scheduleChain);

  // Run all scheduled functions recursively
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  // Assert final state
  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);
    const task = await ctx.table('tasks').first();
    expect(task).toMatchObject({ author: 'AI' });
  });

  vi.useRealTimers();
});
```

**Methods:**

- `t.finishInProgressScheduledFunctions()` - Wait for currently running scheduled functions
- `t.finishAllScheduledFunctions(vi.runAllTimers)` - Run all scheduled functions recursively

## Testing Function Calls

### Call Public Functions

```typescript
test('call public query', async () => {
  const t = convexTest(schema);

  // Insert test data
  await t.mutation(api.messages.send, { body: 'Hi!', author: 'Sarah' });
  await t.mutation(api.messages.send, { body: 'Hey!', author: 'Tom' });

  // Query data
  const messages = await t.query(api.messages.list);
  expect(messages).toMatchObject([
    { body: 'Hi!', author: 'Sarah' },
    { body: 'Hey!', author: 'Tom' },
  ]);
});
```

### Call Internal Functions

```typescript
test('call internal mutation', async () => {
  const t = convexTest(schema);

  await t.mutation(internal.posts.add, {
    title: 'First Post',
    content: 'Content',
    author: 'Alice',
  });

  const posts = await t.query(api.posts.list);
  expect(posts).toHaveLength(1);
});
```

### Call with Authentication

```typescript
test('authenticated call', async () => {
  const t = convexTest(schema);

  const asSarah = t.withIdentity({ name: 'Sarah' });
  await asSarah.mutation(api.tasks.create, { text: 'Add tests' });

  const sarahsTasks = await asSarah.query(api.tasks.list);
  expect(sarahsTasks).toMatchObject([{ text: 'Add tests' }]);

  const asLee = t.withIdentity({ name: 'Lee' });
  const leesTasks = await asLee.query(api.tasks.list);
  expect(leesTasks).toEqual([]); // Different user
});
```

## Testing HTTP Actions

```typescript
test('http action', async () => {
  const t = convexTest(schema);

  const response = await t.fetch('/api/webhook', {
    method: 'POST',
    body: JSON.stringify({ event: 'test' }),
  });

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.success).toBe(true);
});
```

## Assertion Patterns

### Common Matchers

```typescript
// Exact equality
expect(value).toEqual(expected);

// Object shape (partial match)
expect(object).toMatchObject({ name: 'Test' });

// Array length
expect(array).toHaveLength(5);

// Null/undefined
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).not.toBeNull();

// Boolean
expect(flag).toBeTruthy();
expect(flag).toBeFalsy();
expect(flag).toBe(true);

// Throws error
await expect(async () => {
  await someFunction();
}).rejects.toThrowError('Error message');
await expect(async () => {
  await someFunction();
}).rejects.toThrow(); // Any error
```

### Type Testing

```typescript
test('type checking', async ({ ctx }) => {
  const message = await ctx.table('messages').firstX();

  // eslint-disable-next-line no-constant-condition -- typecheck test only
  if (false) {
    // @ts-expect-error -- verify type error
    message.nonExistentField;
  }

  expect(message.text).toBeTruthy();
});
```

## Type Patterns

```typescript
import { Ent, EntWriter, MutationCtx, QueryCtx } from './types';

test('Ent type', async ({ ctx }) => {
  const message: Ent<'messages'> = await ctx.table('messages').firstX();
  const doc = { ...message };

  // Ent methods not available on spread
  await expect(async () => {
    // @ts-expect-error edge should not be available
    await doc.edge('user');
  }).rejects.toThrow();
});

test('EntWriter type', async ({ ctx }) => {
  const message: EntWriter<'messages'> = await ctx.table('messages').firstX();

  // Can use both read and write methods
  await message.patch({ text: 'Updated' });
  const user = await message.edge('user');
});
```

## Mocking Patterns

### Mocking fetch

```typescript
test('action with mocked fetch', async () => {
  const t = convexTest(schema);

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ text: async () => 'AI response' }) as Response)
  );

  const reply = await t.action(api.messages.sendAIMessage, { prompt: 'hello' });
  expect(reply).toEqual('AI response');

  vi.unstubAllGlobals();
});
```

### Spying on Methods

```typescript
test('spy on db operations', async ({ ctx }) => {
  const dbPatchSpy = vi.spyOn(ctx.db as any, 'patch');

  await ctx.table('messages').getX(messageId).patch({ tags: { add: [tagId] } });

  expect(dbPatchSpy).not.toHaveBeenCalled(); // Edge update doesn't call patch
});
```

## Performance Patterns

### Batch Operations

```typescript
test('batch insert is faster', async ({ ctx }) => {
  // Prefer insertMany
  const ids = await ctx.table('users').insertMany(
    Array.from({ length: 100 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@example.com`,
    }))
  );
  expect(ids).toHaveLength(100);
});
```

### IDs Only for Performance

```typescript
test('fetch IDs only for efficiency', async ({ ctx }) => {
  const messageId = await ctx.table('messages').insert({ text: 'Hello', userId });
  await ctx.table('tags').insertMany([
    { name: 'tag1', messages: [messageId] },
    { name: 'tag2', messages: [messageId] },
  ]);

  // More efficient: IDs only
  const tagIds = await ctx.table('messages').getX(messageId).edge('tags').ids();

  // Then fetch selectively
  const firstTag = await ctx.table('tags').getX(tagIds[0]);
});
```

## Common Test Setup Patterns

### Shared Test Data

```typescript
async function createTestUser(ctx: MutationCtx) {
  return await ctx
    .table('users')
    .insert({ name: 'Test User', email: 'test@example.com' })
    .get();
}

test('use shared setup', async ({ ctx }) => {
  const user = await createTestUser(ctx);
  expect(user.name).toEqual('Test User');
});
```

### Multi-step Setup

```typescript
test('complex setup', async ({ ctx }) => {
  // Create hierarchy
  const userId = await ctx
    .table('users')
    .insert({ name: 'Owner', email: 'owner@example.com' });
  const messageId = await ctx
    .table('messages')
    .insert({ text: 'Hello', userId });
  const tagIds = await ctx.table('tags').insertMany([
    { name: 'tag1', messages: [messageId] },
    { name: 'tag2', messages: [messageId] },
  ]);

  // Test against setup
  const tags = await ctx.table('messages').getX(messageId).edge('tags');
  expect(tags).toHaveLength(2);
});
```

## Configuration

### vitest.config.mts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
    include: ['convex/**/*.test.ts', 'convex/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/tmp/**'],
  },
});
```

### package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:once": "vitest run",
    "test:debug": "vitest --inspect-brk --no-file-parallelism",
    "test:coverage": "vitest run --coverage --coverage.reporter=text"
  }
}
```

## Debugging Tests

### Debug Single Test

```bash
bun test:debug
```

### Coverage Report

```bash
bun test:coverage
```

### Watch Mode

```bash
bun test
```

## Critical Rules

1. **ALWAYS** import from `./setup.testing`, never `convex-test` directly
2. **ALWAYS** use `runCtx(baseCtx)` wrapper for context setup
3. **ALWAYS** pass `schema` to `convexTest()`
4. **ALWAYS** use `vi.useFakeTimers()` / `vi.useRealTimers()` for scheduled function tests
5. **ALWAYS** use `ctx.skipRules` when setting up test data that violates rules
6. **ALWAYS** clean up timers with `vi.useRealTimers()` after fake timer tests
7. **NEVER** use `baseConvexTest` directly - always use project's `convexTest` wrapper
8. **NEVER** forget to await `t.finishAllScheduledFunctions()` in scheduled tests

## Limitations

- Mock implementation differs from production Convex backend
- Error messages may differ from production
- No limits enforcement (size/time)
- ID format may differ (don't depend on format)
- Text search uses simplified semantics
- Vector search uses cosine similarity but not efficient indexing
- No cron job support (trigger manually)
- Runtime uses edge-runtime (close to Convex but may differ)

For production testing, use Convex backend testing tools.
