---
name: convex-scheduling
description: Advanced scheduling - runtime crons, batch processing, timeouts, retry patterns
---

# Convex Scheduling - Advanced Patterns

> Prerequisites: See /docs/server/scheduling for cron jobs, scheduled functions, and basic patterns

## Runtime Crons (@convex-dev/crons)

For dynamic cron registration at runtime (not statically in crons.ts):

```bash
bun add @convex-dev/crons
npx convex component add @convex-dev/crons
```

```typescript
// convex/functions/crons.ts
import { z } from 'zod';
import { zid } from 'convex-helpers/server/zod4';
import { Crons } from '@convex-dev/crons';
import { components, internal } from './_generated/api';
import { authMutation } from '../lib/crpc';
import { CRPCError } from 'better-convex/server';

export const crons = new Crons(components.crons);

// Register dynamically
export const registerCron = authMutation
  .input(z.object({
    name: z.string(),
    intervalMs: z.number().optional(),
    cronspec: z.string().optional(),
  }))
  .output(zid('crons'))
  .mutation(async ({ ctx, input }) => {
    if (input.intervalMs) {
      return await crons.register(
        ctx,
        { kind: 'interval', ms: input.intervalMs },
        internal.tasks.runTask,
        { name: input.name }
      );
    } else if (input.cronspec) {
      return await crons.register(
        ctx,
        { kind: 'cron', cron: input.cronspec },
        internal.tasks.runTask,
        { name: input.name }
      );
    }
    throw new CRPCError({
      code: 'BAD_REQUEST',
      message: 'Either intervalMs or cronspec required',
    });
  });

// Pause/resume/delete
export const pauseCron = authMutation
  .input(z.object({ cronId: zid('crons') }))
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    await crons.pause(ctx, input.cronId);
    return null;
  });

export const resumeCron = authMutation
  .input(z.object({ cronId: zid('crons') }))
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    await crons.resume(ctx, input.cronId);
    return null;
  });

export const deleteCron = authMutation
  .input(z.object({ cronId: zid('crons') }))
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    await crons.delete(ctx, input.cronId);
    return null;
  });
```

## User Space Crons (Custom Implementation)

For full control over cron scheduling:

```typescript
// Schema
crons: defineEnt({
  name: v.string(),
  functionName: v.string(),
  args: v.any(),
  schedule: v.union(
    v.object({ kind: v.literal('interval'), ms: v.number() }),
    v.object({ kind: v.literal('cron'), cronspec: v.string() })
  ),
  nextRunTime: v.number(),
  lastRunTime: v.optional(v.number()),
  enabled: v.boolean(),
  schedulerJobId: v.optional(v.id('_scheduled_functions')),
}).index('enabled_nextRunTime', ['enabled', 'nextRunTime']),

// Executor
export const executeCron = privateMutation
  .input(z.object({ cronId: zid('crons') }))
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    const cron = await ctx.table('crons').get(input.cronId);
    if (!cron?.enabled) return null;

    const now = Date.now();
    if (now < cron.nextRunTime) {
      // Not time yet, reschedule
      const jobId = await ctx.scheduler.runAfter(
        cron.nextRunTime - now,
        internal.crons.executeCron,
        { cronId: input.cronId }
      );
      await cron.patch({ schedulerJobId: jobId });
      return null;
    }

    // Execute the function
    await ctx.scheduler.runAfter(0, internal[cron.functionName], cron.args);

    // Calculate next run
    const nextRunTime = cron.schedule.kind === 'interval'
      ? now + cron.schedule.ms
      : calculateNextCronTime(cron.schedule.cronspec);

    // Reschedule
    const jobId = await ctx.scheduler.runAfter(0, internal.crons.executeCron, {
      cronId: input.cronId,
    });

    await cron.patch({
      lastRunTime: now,
      nextRunTime,
      schedulerJobId: jobId,
    });

    return null;
  });
```

## Recurring Tasks Pattern

Self-rescheduling for config-driven recurring tasks:

```typescript
export const startRecurringTask = privateMutation
  .input(z.object({ taskId: z.string(), intervalMs: z.number() }))
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    // Do the work
    console.log(`Running task ${input.taskId}`);

    // Check if should continue
    const config = await ctx
      .table('taskConfigs', 'taskId', (q) => q.eq('taskId', input.taskId))
      .unique();

    if (config?.enabled) {
      // Schedule next run
      await ctx.scheduler.runAfter(
        input.intervalMs,
        internal.tasks.startRecurringTask,
        input
      );
    }

    return null;
  });
```

## Rate-Limited Batch Processing

Process large datasets with controlled throughput:

```typescript
export const processBatch = privateMutation
  .input(z.object({
    cursor: z.string().nullable(),
    batchSize: z.number().default(100),
    delayMs: z.number().default(1000),
  }))
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    const results = await ctx
      .table('items')
      .filter((q) => q.eq(q.field('processed'), false))
      .paginate({ numItems: input.batchSize, cursor: input.cursor });

    // Process items
    for (const item of results.page) {
      await ctx.table('items').getX(item._id).patch({ processed: true });
    }

    // Schedule next batch if more items
    if (!results.isDone) {
      await ctx.scheduler.runAfter(input.delayMs, internal.batch.processBatch, {
        cursor: results.continueCursor,
        batchSize: input.batchSize,
        delayMs: input.delayMs,
      });
    }

    return null;
  });
```

## Timeout Pattern

Implement timeouts for long-running operations:

```typescript
export const createWithTimeout = authMutation
  .input(z.object({
    data: z.unknown(),
    timeoutMs: z.number().default(30000),
  }))
  .output(zid('requests'))
  .mutation(async ({ ctx, input }) => {
    const requestId = await ctx.table('requests').insert({
      ...(input.data as object),
      status: 'pending',
      userId: ctx.userId,
    });

    // Schedule timeout
    await ctx.scheduler.runAfter(input.timeoutMs, internal.requests.timeout, {
      requestId,
    });

    // Start processing
    await ctx.scheduler.runAfter(0, internal.requests.process, { requestId });

    return requestId;
  });

export const timeout = privateMutation
  .input(z.object({ requestId: zid('requests') }))
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    const request = await ctx.table('requests').get(input.requestId);

    // Only timeout if still pending
    if (request?.status === 'pending') {
      await request.patch({
        status: 'timeout',
        completedAt: Date.now(),
      });
    }

    return null;
  });
```

## Retry with Exponential Backoff

Manual retry for actions (which don't auto-retry):

```typescript
export const retryableAction = privateAction
  .input(z.object({
    data: z.unknown(),
    attempts: z.number().default(0),
    maxAttempts: z.number().default(3),
  }))
  .output(z.null())
  .action(async ({ ctx, input }) => {
    try {
      await callExternalAPI(input.data);
    } catch (error) {
      if (input.attempts < input.maxAttempts) {
        // Exponential backoff: 1s, 2s, 4s, ...
        const delay = Math.pow(2, input.attempts) * 1000;
        await ctx.scheduler.runAfter(delay, internal.actions.retryableAction, {
          ...input,
          attempts: input.attempts + 1,
        });
      } else {
        // Log final failure
        await ctx.runMutation(internal.errors.logFailure, {
          error: (error as Error).message,
          data: input.data,
        });
      }
    }

    return null;
  });
```
