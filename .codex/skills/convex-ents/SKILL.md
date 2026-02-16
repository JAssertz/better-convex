---
name: convex-ents
description: Use when working with Convex Ents (relational database layer on top of Convex) - provides ergonomic patterns for querying related documents, defining edges and relationships, default values, and collocation of authorization rules
---

# Convex Ents - Advanced Patterns

> **Prerequisites**: Load `convex` skill first for foundational Ents patterns (CRUD, simple edges, basic schema)

## Field Defaults & Schema Evolution

When evolving a schema, specify a default for a field to avoid migrations:

```ts
defineEntSchema({
  posts: defineEnt({}).field(
    "contentType",
    v.union(v.literal("text"), v.literal("video")),
    { default: "text" }
  ),
});
```

The field is **required** in TypeScript, but defaults if missing in DB. Without default:

```ts
// Must handle undefined in code
posts: defineEnt({
  contentType: v.optional(v.union(v.literal("text"), v.literal("video"))),
}),
```

### Adding Fields to Union Variants

```ts
defineEntSchema({
  posts: defineEnt(
    v.union(
      v.object({ type: v.literal("text"), content: v.string() }),
      v.object({ type: v.literal("video"), link: v.string() })
    )
  ).field("author", v.id("user")), // Adds to ALL variants
});
```

## Optional Edges

### Optional 1:1 Edges

```ts
defineEntSchema({
  user: defineEnt({})
    .edge("profile", { ref: true }),
  profiles: defineEnt({})
    .edge("user", { field: "userId", optional: true }), // Profile can exist without user
});
```

**Must specify `field` name when using `optional`.**

### Optional 1:many Edges

```ts
defineEntSchema({
  user: defineEnt({})
    .edges("messages", { ref: true }),
  messages: defineEnt({})
    .edge("user", { field: "userId", optional: true }), // Message can exist without user
});
```

## Self-Directed Edges

Edges where both ends are in the same table.

### Asymmetrical (Followers/Following)

```ts
defineEntSchema({
  user: defineEnt({})
    .edges("followers", { to: "user", inverse: "followees" }),
});
```

- B is a "followee" of A (is being followed by A)
- A is a "follower" of B
- Options: `table`, `field`, `inverseField` for custom storage

### Symmetrical (Friends)

```ts
defineEntSchema({
  user: defineEnt({})
    .edges("friends", { to: "user" }), // No inverse = symmetrical
});
```

Double-writes the edge for both directions automatically.

## Helper Types

```ts filename="convex/shared/types.ts"
import { GenericEnt, GenericEntWriter } from "convex-ents";
import { CustomCtx } from "convex-helpers/server/customFunctions";
import { TableNames } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import { entDefinitions } from "./schema";

export type QueryCtx = CustomCtx<typeof query>;
export type MutationCtx = CustomCtx<typeof mutation>;

export type Ent<TableName extends TableNames> = GenericEnt<
  typeof entDefinitions,
  TableName
>;
export type EntWriter<TableName extends TableNames> = GenericEntWriter<
  typeof entDefinitions,
  TableName
>;
```

Usage:

```ts
import { Ent, EntWriter } from "./shared/types";

export function myReadHelper(ctx: QueryCtx, task: Ent<"tasks">) { /* ... */ }
export function myWriteHelper(ctx: MutationCtx, task: EntWriter<"tasks">) { /* ... */ }
```

## Cascading Deletes

### Default Behavior (Hard Delete)

- **1:1/1:many** (field edge): Deleting parent deletes children storing the edge
- **many:many**: Deleting ent removes edge documents, NOT connected ents

### Override 1:1 Deletion Direction

```ts
defineEntSchema({
  user: defineEnt({})
    .edge("profile", { optional: true }),
  profiles: defineEnt({})
    .edge("user", { deletion: "hard" }), // Deleting profile also deletes user
});
```

### Soft Deletion

Adds `deletionTime` field instead of removing:

```ts
defineEntSchema({
  user: defineEnt({})
    .deletion("soft")
    .edges("profiles", { ref: true, deletion: "soft" }), // Cascade soft delete
  profiles: defineEnt({})
    .deletion("soft")
    .edge("user"),
});
```

**Filter soft-deleted:**

```ts
const activeUsers = await ctx.table("user")
  .filter((q) => q.eq(q.field("deletionTime"), undefined));
```

**Undelete:**

```ts
await ctx.table("user").getX(userId).patch({ deletionTime: undefined });
```

### Scheduled Deletion

Soft delete immediately, hard delete after delay:

```ts
defineEntSchema({
  user: defineEnt({})
    .deletion("scheduled", { delayMs: 24 * 60 * 60 * 1000 }) // 24 hours
    .edges("profiles", { ref: true }),
  profiles: defineEnt({}).edge("user"),
});
```

**Setup required:**

```ts filename="convex/lib/functions.ts"
import { scheduledDeleteFactory } from "convex-ents";
export const scheduledDelete = scheduledDeleteFactory(entDefinitions);
```

**Cancel scheduled deletion:**

```ts
await ctx.table("user").getX(userId).patch({ deletionTime: undefined });
```

## Scheduled Functions Integration

Connect scheduled functions to ents:

```ts
defineEntSchema({
  answers: defineEnt({})
    .edge("action", { to: "_scheduled_functions" }),
});
```

Retrieve status via edge:

```ts
return ctx.table("answers").map(async (answer) => ({
  question: answer.question,
  status: (await answer.edge("action")?.state.kind) ?? "stale",
}));
```

### Auto-Cancel on Delete

```ts
defineEntSchema({
  answers: defineEnt({})
    .edge("action", { to: "_scheduled_functions", deletion: "hard" }),
});
```

When answer is deleted, pending/in-progress action is canceled.

## Rules System

Collocate authorization logic with schema definitions.

### Setup

**Step 1: Define rules**

```ts filename="convex/lib/rules.ts"
import { addEntRules } from "convex-ents";
import { entDefinitions } from "./schema";
import { QueryCtx } from "./types";

export function getEntDefinitionsWithRules(ctx: QueryCtx): typeof entDefinitions {
  return addEntRules(entDefinitions, {
    secrets: {
      read: async (secret) => ctx.viewerId === secret.userId,
    },
  });
}

export async function getViewerId(
  ctx: Omit<QueryCtx, "table" | "viewerId" | "viewer" | "viewerX">
): Promise<Id<"user"> | null> {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (user === null) return null;
  const viewer = await ctx.skipRules.table("user").get("tokenIdentifier", user.tokenIdentifier);
  return viewer?._id;
}
```

**Step 2: Apply rules in functions.ts**

```ts filename="convex/lib/functions.ts"
async function queryCtx(baseCtx: QueryCtx) {
  const ctx = {
    db: baseCtx.db as unknown as undefined,
    skipRules: { table: entsTableFactory(baseCtx, entDefinitions) },
  };
  const entDefinitionsWithRules = getEntDefinitionsWithRules(ctx as any);
  const viewerId = await getViewerId({ ...baseCtx, ...ctx });
  (ctx as any).viewerId = viewerId;
  const table = entsTableFactory(baseCtx, entDefinitionsWithRules);
  (ctx as any).table = table;

  const viewer = async () => viewerId !== null ? await table("user").get(viewerId) : null;
  (ctx as any).viewer = viewer;
  const viewerX = async () => {
    const ent = await viewer();
    if (ent === null) throw new Error("Expected authenticated viewer");
    return ent;
  };
  (ctx as any).viewerX = viewerX;
  return { ...ctx, table, viewer, viewerX, viewerId };
}
```

### Read Rules

```ts
return addEntRules(entDefinitions, {
  secrets: {
    read: async (secret) => ctx.viewerId === secret.userId,
  },
});
```

**Behavior:**
- Returns `null` if rule returns `false`: `get`, `first`, `unique`
- Throws if rule returns `false`: `getX`, `firstX`, `uniqueX`, `getManyX`
- Filters out unreadable ents: list operations

### Read Rules Performance

Read rules run on EVERY document fetched. Avoid N+1 queries:

```ts
// ❌ SLOW: Fetches user for every post
read: async (post) => {
  const author = await ctx.table("user").get(post.authorId);
  return author && !author.isBanned;
},

// ✅ FAST: Pre-compute field, check directly
read: async (post) => !post.private || post.authorId === ctx.viewerId,
```

**Performance note:** Methods like `first`, `unique`, `take` paginate internally when rules filter out results (1→2→4→...→64 docs at a time).

### Common Read Rule Patterns

**Delegate to another ent:**

```ts
profiles: {
  read: async (profile) => (await profile.edge("user")) !== null,
},
```

**Test for edge presence:**

```ts
users: {
  read: async (user) =>
    ctx.viewerId !== null &&
    (ctx.viewerId === user._id || (await user.edge("friends").has(ctx.viewerId))),
},
```

### Write Rules

```ts
return addEntRules(entDefinitions, {
  secrets: {
    read: async (secret) => ctx.viewerId === secret.userId,
    write: async ({ operation, ent: secret, value }) => {
      if (operation === "delete") return false; // No one can delete
      if (operation === "create") return ctx.viewerId === value.ownerId;
      // Update: ownerId is immutable
      return value.ownerId === undefined || value.ownerId === secret.ownerId;
    },
  },
});
```

**Parameters:**
- `operation`: `"create"` | `"update"` | `"delete"`
- `ent`: existing ent (for update/delete)
- `value`: value from `.insert()`, `.replace()`, `.patch()`

**Note:** Read rule is checked first before update/delete.

### Ignoring Rules

Use `ctx.skipRules.table` when you need to bypass rules:

```ts
// Read without rules (returns ID to avoid leaking methods)
return (await ctx.skipRules.table("foos").get(someId))._id;
```

**Warning:** Methods on ents from `ctx.skipRules.table` also ignore rules!

## System Tables Access

```ts
const filesMetadata = await ctx.table.system("_storage");
const scheduledFunctions = await ctx.table.system("_scheduled_functions");
```

All standard methods supported: `get`, `getX`, `filter`, `order`, `take`, etc.

## Advanced Edge Traversal

### Map with Nested Edges

```ts
const usersWithMessages = await ctx.table("user").map(async (user) => ({
  name: user.name,
  messages: await user.edge("messages").take(5),
}));
```

**Parallel edge loading:**

```ts
const usersWithProfileAndMessages = await ctx.table("user").map(async (user) => {
  const [profile, messages] = await Promise.all([
    user.edgeX("profile"),
    user.edge("messages").take(5),
  ]);
  return { name: user.name, profile, messages };
});
```

**Nested traversal:**

```ts
const usersWithMessagesAndTags = await ctx.table("user").map(async (user) => ({
  ...user,
  messages: await user.edge("messages").map(async (message) => ({
    text: message.text,
    tags: await message.edge("tags"),
  })),
}));
```

### Many:Many Edge Presence Check

```ts
const hasTag = await ctx.table("messages").getX(messageId).edge("tags").has(tagId);
```

O(1) check instead of fetching all edges.

## Advanced Edge Mutations

### Many:Many with Patch

```ts
// Add and remove edges
await ctx.table("messages").getX(messageId).patch({
  tags: { add: [tagId, otherTagId], remove: [tagToDeleteID] },
});
```

### Many:Many with Replace

```ts
// Replace ALL edges (edges not in list are deleted)
await ctx.table("messages").getX(messageId).replace({
  text: "Changed message",
  tags: [tagID, otherTagID],
});

// Omit edge field to leave unchanged
await ctx.table("messages").getX(messageId).replace({
  text: "Changed message", // tags unchanged
});
```

### Update via Edge Chain

```ts
await ctx.table("user").getX(userId).edgeX("profile").patch({ bio: "Updated" });
```

**Limitation:** Can't chain `edge()` on loaded ent for mutations:

```ts
const user = await ctx.table("user").getX(userId);
// await user.edgeX('profile').patch(...); // TypeScript error

// Workaround: Start from ctx.table
await ctx.table("user").getX(user._id).edgeX("profile").patch({ bio: "New" });
```

## Raw Documents

Return plain documents without ent methods:

```ts
const messages = await ctx.table("messages").docs();
const profile = await user.edgeX("profile").doc();

// In map
const users = await ctx.table("user").map((user) => ({
  ...user.doc(),
  profile: await user.edge("profile"),
}));
```
