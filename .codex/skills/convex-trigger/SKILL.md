---
name: convex-trigger
description: Advanced trigger patterns - audit logging, authorization rules, component integration
---

# Convex Triggers - Advanced Patterns

> Prerequisites: See /docs/db/triggers for setup, basic patterns, and best practices

## Audit Logging

Log all changes with user context:

```typescript
triggers.register('teams', async (ctx, change) => {
  const user = await authComponent.safeGetAuthUser(ctx);
  await ctx.table('auditLog').insert({
    table: 'teams',
    operation: change.operation,
    documentId: change.id,
    userId: user?.tokenIdentifier,
    timestamp: Date.now(),
    changes: change,
  });
});
```

## Authorization Rules

Enforce ownership at the database level:

```typescript
triggers.register('messages', async (ctx, change) => {
  const identity = await authComponent.safeGetAuthUser(ctx);
  const userId = identity?.subject;

  const owner = change.oldDoc?.userId ?? change.newDoc?.userId;
  if (userId !== owner) {
    throw new Error(`User ${userId} cannot modify message owned by ${owner}`);
  }
});
```

## Component Integration

Many Convex components provide trigger helpers:

```typescript
import { ShardedCounter } from '@convex-dev/sharded-counter';
const counter = new ShardedCounter(components.shardedCounter);

// Register component trigger
triggers.register('votes', counter.trigger('voteCount'));
```

Works with:
- `@convex-dev/sharded-counter` - Distributed counters
- `@convex-dev/aggregate` - O(log n) aggregations (use `.trigger()`)

## Async Debounced Processing

Schedule async processing with debouncing to only process final state:

```typescript
// Global variable to track scheduled functions within a mutation
let scheduledSyncToClerk: Id<'_scheduled_functions'> | null = null;

triggers.register('user', async (ctx, change) => {
  if (change.operation === 'delete') return;

  // Cancel previously scheduled sync from this mutation
  if (scheduledSyncToClerk) {
    await ctx.scheduler.cancel(scheduledSyncToClerk);
  }

  // Schedule new sync - only final state will be sent
  scheduledSyncToClerk = await ctx.scheduler.runAfter(
    0,
    internal.clerk.syncUser,
    { userId: change.id }
  );
});
```

Use when:
- Processing has side effects (actions)
- Document changes multiple times in one mutation
- You only care about final state
