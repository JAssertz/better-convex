---
name: convex-aggregate
description: Advanced Convex Aggregate patterns - DirectAggregate, performance optimization, complex aggregations
---

# Convex Aggregate - Advanced Patterns

> Prerequisites: See /docs/db/aggregates for basic setup, key patterns, and trigger integration

## DirectAggregate Usage

For aggregating data not stored in tables (manual management):

```typescript
import { DirectAggregate } from '@convex-dev/aggregate';

const aggregate = new DirectAggregate<{
  Key: number;
  Id: string;
}>(components.aggregate);

// Insert
export const trackEvent = authMutation
  .input(z.object({
    eventType: z.string(),
    value: z.number(),
  }))
  .mutation(async ({ ctx, input }) => {
    const id = `${ctx.userId}-${Date.now()}`;

    await aggregate.insert(ctx, {
      key: Date.now(),
      id,
      sumValue: input.value,
    });
  });

// Replace
export const updateEvent = authMutation
  .input(z.object({
    eventId: z.string(),
    newValue: z.number(),
  }))
  .mutation(async ({ ctx, input }) => {
    await aggregate.replace(
      ctx,
      { key: oldTimestamp, id: input.eventId },
      { key: Date.now(), id: input.eventId, sumValue: input.newValue }
    );
  });
```

## Random Access Pattern

Get a random document from a table:

```typescript
const randomize = new TableAggregate<{
  Key: null;
  DataModel: DataModel;
  TableName: 'songs';
}>(components.randomize, {
  sortKey: (doc) => null, // No sorting, random by _id
});

export const getRandomSong = publicQuery
  .output(z.object({
    id: zid('songs'),
    title: z.string(),
  }).nullable())
  .query(async ({ ctx }) => {
    const count = await randomize.count(ctx, { bounds: {} as any });
    if (count === 0) return null;

    const randomIndex = Math.floor(Math.random() * count);
    const result = await randomize.at(ctx, randomIndex);

    if (!result) return null;

    const song = await ctx.table('songs').get(result.doc._id);
    return song ? { id: song._id, title: song.title } : null;
  });
```

## Multiple Sort Orders

Define multiple aggregates on the same table for different access patterns:

```typescript
// Aggregate by score for rankings
const byScore = new TableAggregate<{
  Key: number;
  DataModel: DataModel;
  TableName: 'players';
}>(components.byScore, {
  sortKey: (doc) => doc.score,
});

// Aggregate by username for alphabetical listing
const byUsername = new TableAggregate<{
  Key: string;
  DataModel: DataModel;
  TableName: 'players';
}>(components.byUsername, {
  sortKey: (doc) => doc.username,
});

// Aggregate by last active for activity tracking
const byActivity = new TableAggregate<{
  Key: number;
  DataModel: DataModel;
  TableName: 'players';
}>(components.byActivity, {
  sortKey: (doc) => doc.lastActiveAt,
});
```

## Composite Aggregation Patterns

Multi-dimensional leaderboards with regional queries:

```typescript
// Leaderboard with multiple dimensions
const leaderboard = new TableAggregate<{
  Namespace: string; // game mode
  Key: [string, number, number]; // [region, score, timestamp]
  DataModel: DataModel;
  TableName: 'matches';
}>(components.leaderboard, {
  namespace: (doc) => doc.gameMode,
  sortKey: (doc) => [doc.region, doc.score, doc.timestamp],
});

// Regional high scores
const regionalHighScore = await leaderboard.max(ctx, {
  namespace: 'ranked',
  bounds: { prefix: ['us-west'] },
});

// Count players per region
const usWestCount = await leaderboard.count(ctx, {
  namespace: 'ranked',
  bounds: { prefix: ['us-west'] },
});
```

## Advanced Trigger Patterns

### Cascade deletes with aggregates

Aggregates update automatically when triggers handle cascade deletes:

```typescript
// convex/lib/triggers.ts
import { Triggers } from 'convex-helpers/server/triggers';
import {
  aggregateCharacterStars,
  aggregateUserFollowsByFollowing,
  aggregateUserFollowsByFollower,
  aggregateCharacters,
} from '../functions/aggregates';

export const triggers = new Triggers<DataModel>();

// Register all aggregates
triggers.register('characterStars', aggregateCharacterStars.trigger());
triggers.register('follows', aggregateUserFollowsByFollowing.trigger());
triggers.register('follows', aggregateUserFollowsByFollower.trigger());
triggers.register('characters', aggregateCharacters.trigger());

// CASCADE DELETES - Triggers still work!
triggers.register('user', async (ctx, change) => {
  if (change.operation === 'delete') {
    // Just delete - aggregates update automatically
    const characters = await ctx.table('characters', 'userId', (q) =>
      q.eq('userId', change.id)
    );

    for (const char of characters) {
      await ctx.table('characters').getX(char._id).delete(); // Trigger fires here!
    }
  }
});
```

### Multiple aggregates on same table

```typescript
// When multiple aggregates use the same table, register each separately
triggers.register('follows', aggregateUserFollowsByFollowing.trigger());
triggers.register('follows', aggregateUserFollowsByFollower.trigger());
```

## Performance Optimization

### Namespace vs prefix patterns

```typescript
// GOOD: Namespace for complete isolation (no contention between users)
const byUser = new TableAggregate<{
  Namespace: Id<'user'>;
  Key: number;
  DataModel: DataModel;
  TableName: 'activities';
}>(components.byUser, {
  namespace: (doc) => doc.userId,
  sortKey: (doc) => doc.timestamp,
});

// AVOID: Prefix without namespace causes contention
const byUserPrefix = new TableAggregate<{
  Key: [Id<'user'>, number];
  DataModel: DataModel;
  TableName: 'activities';
}>(components.byUserPrefix, {
  sortKey: (doc) => [doc.userId, doc.timestamp],
});
```

### Lazy aggregation configuration

```typescript
// Configure for high-write scenarios
await aggregate.clear(ctx, 32, true); // maxNodeSize: 32, rootLazy: true

// Configure for high-read scenarios
await aggregate.clear(ctx, 16, false); // maxNodeSize: 16, rootLazy: false
```

### Bounded queries for reduced conflicts

```typescript
// GOOD: Bounded query reduces dependencies
const recentHighScores = await aggregate.count(ctx, {
  bounds: {
    lower: { key: Date.now() - 86400000, inclusive: true }, // Last 24h
  },
});

// AVOID: Unbounded queries cause more conflicts
const allHighScores = await aggregate.count(ctx);
```

### Batch Operations

Reduce function call overhead with batch versions:

```typescript
// Instead of multiple individual calls
const counts = await Promise.all([
  aggregate.count(ctx, { bounds: bounds1 }),
  aggregate.count(ctx, { bounds: bounds2 }),
  aggregate.count(ctx, { bounds: bounds3 }),
]);

// Use batch for better performance
const counts = await aggregate.countBatch(ctx, [
  { bounds: bounds1 },
  { bounds: bounds2 },
  { bounds: bounds3 },
]);

// Also available: sumBatch, atBatch
const sums = await aggregate.sumBatch(ctx, [{ bounds: b1 }, { bounds: b2 }]);
const items = await aggregate.atBatch(ctx, [offset1, offset2, offset3]);
```

## Real-World Patterns

### Leaderboard with user stats

```typescript
export const getUserStats = authQuery
  .input(z.object({ gameId: zid('games') }))
  .output(z.object({
    highScore: z.number(),
    averageScore: z.number(),
    gamesPlayed: z.number(),
    globalRank: z.number().nullable(),
    percentile: z.number(),
  }))
  .query(async ({ ctx, input }) => {
    // User's scores in this game
    const gameScores = await ctx.table('scores', 'user_game', (q) =>
      q.eq('userId', ctx.userId).eq('gameId', input.gameId)
    );

    const highScore = Math.max(...gameScores.map((s) => s.score));
    const averageScore =
      gameScores.reduce((sum, s) => sum + s.score, 0) / gameScores.length;

    // Global stats
    const globalRank = await leaderboardByGame.indexOf(ctx, highScore, {
      namespace: input.gameId,
    });

    const totalPlayers = await leaderboardByGame.count(ctx, {
      namespace: input.gameId,
      bounds: {} as any,
    });

    const percentile =
      globalRank && totalPlayers > 0
        ? ((totalPlayers - globalRank) / totalPlayers) * 100
        : 0;

    return {
      highScore,
      averageScore,
      gamesPlayed: gameScores.length,
      globalRank,
      percentile,
    };
  });
```

### Time-based aggregations

```typescript
const activityByHour = new TableAggregate<{
  Key: [number, string]; // [hour, userId]
  DataModel: DataModel;
  TableName: 'activities';
}>(components.activityByHour, {
  sortKey: (doc) => [
    Math.floor(doc.timestamp / 3600000), // Hour bucket
    doc.userId,
  ],
});

export const getHourlyActivity = publicQuery
  .input(z.object({ hoursAgo: z.number().min(1).max(24) }))
  .output(z.array(z.object({
    hour: z.number(),
    count: z.number(),
  })))
  .query(async ({ ctx, input }) => {
    const now = Date.now();
    const results = [];

    for (let i = 0; i < input.hoursAgo; i++) {
      const hour = Math.floor((now - i * 3600000) / 3600000);
      const count = await activityByHour.count(ctx, {
        bounds: { prefix: [hour] },
      });
      results.push({ hour, count });
    }

    return results.reverse();
  });
```

## Testing Patterns

```typescript
import { expect, test } from 'vitest';
import { ConvexTestingHelper } from 'convex-test';

test('aggregate maintains consistency', async () => {
  const t = new ConvexTestingHelper();

  // Insert test data
  const scoreId = await t.mutation(api.scores.addScore, {
    gameId: 'game1',
    score: 100,
  });

  // Verify aggregate
  const stats = await t.query(api.scores.getStats, {
    gameId: 'game1',
  });

  expect(stats.gameCount).toBe(1);
  expect(stats.totalCount).toBeGreaterThanOrEqual(1);

  // Update and verify
  await t.mutation(api.scores.updateScore, {
    scoreId,
    newScore: 200,
  });

  const newStats = await t.query(api.scores.getStats, {
    gameId: 'game1',
  });

  expect(newStats.gameCount).toBe(1); // Count unchanged
});
```

## Error Handling

```typescript
export const robustAggregate = authMutation
  .input(z.object({ scoreId: zid('scores') }))
  .mutation(async ({ ctx, input }) => {
    const doc = await ctx.table('scores').getX(input.scoreId);

    try {
      await aggregate.delete(ctx, doc);
    } catch (error) {
      // Handle aggregate-specific errors
      if (error.message.includes('not found in aggregate')) {
        // Document wasn't in aggregate, safe to continue
        console.warn('Document not in aggregate:', input.scoreId);
      } else {
        throw error;
      }
    }

    await ctx.table('scores').getX(input.scoreId).delete();
  });
```
