---
name: convex-filters
description: Use when implementing full-text search or complex filtering in Convex - provides search indexes, streams, query optimization, pagination, and relevance scoring
---

# Convex Filters - Advanced Patterns

> Prerequisites: See /docs/db/filters for basic search setup, queries, filter fields, and stream patterns (filterWith, mergedStream, flatMap, distinct)

**CRITICAL:** Streams require `ctx.db` in the first parameter only. Use `ctx.table()` inside stream callbacks.

## Search + Streams Limitation

**CRITICAL:** Streams do NOT support `withSearchIndex()`. Search and streams cannot be combined.

### Options for Complex Filtering with Search

1. **Use filterFields** (recommended):

```typescript
// Add more filterFields to your search index
.searchIndex('search_content', {
  searchField: 'content',
  filterFields: ['category', 'author', 'status', 'dateGroup'],
})
```

2. **Separate search and filter flows**:

```typescript
import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";
import { stream } from "convex-helpers/server/stream";
import { publicQuery } from "../lib/crpc";
import schema from "./schema";

const ArticleSchema = z.object({
  _id: zid("articles"),
  title: z.string(),
  content: z.string(),
  category: z.string(),
  publishedAt: z.number(),
});

export const searchOrFilter = publicQuery
  .input(
    z.object({
      query: z.string().optional(),
      category: z.string().optional(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
    })
  )
  .paginated({ limit: 20, item: ArticleSchema })
  .query(async ({ ctx, input }) => {
    // Option A: If search query provided, use search (limited filtering)
    if (input.query) {
      return await ctx
        .table("articles")
        .search("search_content", (q) => {
          let search = q.search("content", input.query!);
          if (input.category) {
            search = search.eq("category", input.category);
          }
          // Note: Can't do date range filtering in search
          return search;
        })
        .paginate({ cursor: input.cursor, numItems: input.limit });
    }

    // Option B: Without search, use streams for complex filtering
    return await stream(ctx.db, schema)
      .query("articles")
      .withIndex("publishedAt", (q) => {
        if (input.startDate) {
          return q.gte("publishedAt", input.startDate);
        }
        return q;
      })
      .filterWith((article) => {
        if (input.category && article.category !== input.category) {
          return false;
        }
        if (input.endDate && article.publishedAt > input.endDate) {
          return false;
        }
        return true;
      })
      .paginate({ cursor: input.cursor, numItems: input.limit });
  });
```

3. **Post-process search results** (small datasets only):

```typescript
// Only viable if you can limit search results to manageable size
const searchResults = await ctx
  .table("articles")
  .search("search_content", (q) => q.search("content", query))
  .take(100); // Limit to prevent memory issues

// Then filter in memory
const filtered = searchResults.filter((article) => {
  return article.publishedAt >= startDate && article.publishedAt <= endDate;
});
```

## Multi-Field Search

Search multiple indexes and merge results:

```typescript
export const searchAllFields = publicQuery
  .input(
    z.object({
      query: z.string(),
      searchIn: z.enum(["title", "content", "both"]).default("both"),
    })
  )
  .output(
    z.array(
      z.object({
        _id: zid("articles"),
        _score: z.number(),
        title: z.string(),
        content: z.string(),
        matchedField: z.enum(["title", "content"]),
      })
    )
  )
  .query(async ({ ctx, input }) => {
    const results: Array<{
      _id: typeof input._id;
      _score: number;
      title: string;
      content: string;
      matchedField: "title" | "content";
    }> = [];

    if (input.searchIn === "title" || input.searchIn === "both") {
      const titleResults = await ctx
        .table("articles")
        .search("search_title", (q) => q.search("title", input.query))
        .take(10);

      results.push(
        ...titleResults.map((r) => ({
          _id: r._id,
          _score: r._score ?? 0,
          title: r.title,
          content: r.content,
          matchedField: "title" as const,
        }))
      );
    }

    if (input.searchIn === "content" || input.searchIn === "both") {
      const contentResults = await ctx
        .table("articles")
        .search("search_content", (q) => q.search("content", input.query))
        .take(10);

      results.push(
        ...contentResults.map((r) => ({
          _id: r._id,
          _score: r._score ?? 0,
          title: r.title,
          content: r.content,
          matchedField: "content" as const,
        }))
      );
    }

    // Remove duplicates and sort by score
    const uniqueResults = Array.from(
      new Map(results.map((r) => [r._id, r])).values()
    );

    return uniqueResults.sort((a, b) => b._score - a._score);
  });
```

## Fuzzy Search Pattern

Approximate matching for small datasets:

```typescript
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

export const fuzzySearch = publicQuery
  .input(
    z.object({
      query: z.string(),
      threshold: z.number().min(0).max(1).default(0.7),
      field: z.enum(["title", "author"]),
    })
  )
  .output(
    z.array(
      z.object({
        _id: zid("articles"),
        title: z.string(),
        author: z.string(),
        similarity: z.number(),
      })
    )
  )
  .query(async ({ ctx, input }) => {
    // IMPORTANT: Only suitable for small datasets (<1000 docs)
    // For production, consider:
    // 1. Dedicated search service (Algolia, Elasticsearch)
    // 2. Pre-computing similar terms during writes
    // 3. Vector embeddings for semantic search

    const articles = await ctx.table("articles").take(1000);

    const results = articles
      .map((article) => {
        const fieldValue = article[input.field];
        const similarity = calculateSimilarity(
          input.query.toLowerCase(),
          fieldValue.toLowerCase()
        );

        return {
          _id: article._id,
          title: article.title,
          author: article.author,
          similarity,
        };
      })
      .filter((r) => r.similarity >= input.threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 20);

    return results;
  });
```

## Highlighting

Highlight search terms in results:

```typescript
function highlightTerms(text: string, query: string): string {
  const terms = query.toLowerCase().split(/\s+/);
  let highlighted = text;

  terms.forEach((term) => {
    const regex = new RegExp(`(${term})`, "gi");
    highlighted = highlighted.replace(regex, "<mark>$1</mark>");
  });

  return highlighted;
}

export const searchWithHighlight = publicQuery
  .input(
    z.object({
      query: z.string(),
      limit: z.number().min(1).max(20).default(10),
    })
  )
  .output(
    z.array(
      z.object({
        _id: zid("articles"),
        title: z.string(),
        titleHighlighted: z.string(),
        excerpt: z.string(),
        excerptHighlighted: z.string(),
      })
    )
  )
  .query(async ({ ctx, input }) => {
    const results = await ctx
      .table("articles")
      .search("search_content", (q) => q.search("content", input.query))
      .take(input.limit);

    return results.map((article) => {
      // Create excerpt around first match
      const lowerContent = article.content.toLowerCase();
      const lowerQuery = input.query.toLowerCase();
      const matchIndex = lowerContent.indexOf(lowerQuery);

      let excerpt = article.content;
      if (matchIndex !== -1) {
        const start = Math.max(0, matchIndex - 50);
        const end = Math.min(article.content.length, matchIndex + 150);
        excerpt = "..." + article.content.slice(start, end) + "...";
      } else {
        excerpt = article.content.slice(0, 200) + "...";
      }

      return {
        _id: article._id,
        title: article.title,
        titleHighlighted: highlightTerms(article.title, input.query),
        excerpt,
        excerptHighlighted: highlightTerms(excerpt, input.query),
      };
    });
  });
```

## Search Analytics

Track search queries and popular terms:

```typescript
import { privateMutation } from "../lib/crpc";
import { internal } from "./_generated/api";

// Track search terms
export const trackSearch = privateMutation
  .input(
    z.object({
      term: z.string(),
    })
  )
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    const normalizedTerm = input.term.toLowerCase();

    const existing = await ctx
      .table("searchSuggestions", "term", (q) => q.eq("term", normalizedTerm))
      .unique();

    if (existing) {
      await existing.patch({ count: existing.count + 1 });
    } else {
      await ctx.table("searchSuggestions").insert({
        term: normalizedTerm,
        count: 1,
      });
    }

    return null;
  });

// Log search with context
export const logSearch = privateMutation
  .input(
    z.object({
      userId: zid("user").optional(),
      query: z.string(),
      resultCount: z.number(),
      clickedResultId: zid("articles").optional(),
    })
  )
  .output(z.null())
  .mutation(async ({ ctx, input }) => {
    await ctx.table("searchLogs").insert({
      userId: input.userId,
      query: input.query.toLowerCase(),
      resultCount: input.resultCount,
      clickedResultId: input.clickedResultId,
      timestamp: Date.now(),
    });

    // Update suggestions
    await ctx.scheduler.runAfter(0, internal.search.trackSearch, {
      term: input.query,
    });

    return null;
  });

// Get popular searches
export const getPopularSearches = publicQuery
  .input(
    z.object({
      timeframe: z.enum(["day", "week", "month"]).default("week"),
      limit: z.number().min(1).max(20).default(10),
    })
  )
  .output(
    z.array(
      z.object({
        query: z.string(),
        count: z.number(),
      })
    )
  )
  .query(async ({ ctx, input }) => {
    const cutoff =
      Date.now() -
      {
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
      }[input.timeframe];

    const logs = await ctx
      .table("searchLogs")
      .filter((q) => q.gte(q.field("timestamp"), cutoff))
      .take(1000);

    const counts = new Map<string, number>();
    logs.forEach((log) => {
      counts.set(log.query, (counts.get(log.query) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, input.limit);
  });
```

## Autocomplete / Suggestions

```typescript
// Schema for suggestions
// searchSuggestions: defineEnt({
//   term: v.string(),
//   count: v.number(),
// })
//   .index('term', ['term'])
//   .index('count', ['count']),

export const getSuggestions = publicQuery
  .input(
    z.object({
      prefix: z.string(),
      limit: z.number().min(1).max(10).default(5),
    })
  )
  .output(
    z.array(
      z.object({
        term: z.string(),
        count: z.number(),
      })
    )
  )
  .query(async ({ ctx, input }) => {
    const normalizedPrefix = input.prefix.toLowerCase();

    // For production, consider:
    // 1. Dedicated prefix search index
    // 2. Trie data structure
    // 3. For small datasets (<1000), this approach is acceptable

    const suggestions = await ctx
      .table("searchSuggestions", "count")
      .order("desc")
      .take(100);

    return suggestions
      .filter((s) => s.term.startsWith(normalizedPrefix))
      .slice(0, input.limit);
  });
```

---

# Stream Advanced Patterns

## Index Skip Scan

Query with partial index matches:

```typescript
import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";
import { stream, mergedStream } from "convex-helpers/server/stream";
import { publicQuery } from "../lib/crpc";
import schema from "./schema";

const MessageSchema = z.object({
  _id: zid("messages"),
  text: z.string(),
  priority: z.number(),
});

export const highPriorityRecentMessages = publicQuery
  .input(
    z.object({
      minPriority: z.number(),
    })
  )
  .paginated({ limit: 20, item: MessageSchema })
  .query(async ({ ctx, input }) => {
    // Find distinct priorities > minPriority
    const priorities = await stream(ctx.db, schema)
      .query("messages")
      .withIndex("priority", (q) => q.gt("priority", input.minPriority))
      .order("desc")
      .distinct(["priority"])
      .map((m) => m.priority)
      .collect();

    // For each priority, get recent messages
    const messages = mergedStream(
      priorities.map((priority) =>
        stream(ctx.db, schema)
          .query("messages")
          .withIndex("priority", (q) =>
            q
              .eq("priority", priority)
              .gt("_creationTime", Date.now() - 24 * 60 * 60 * 1000)
          )
          .order("desc")
      ),
      ["_creationTime"]
    );

    return await messages.paginate({
      cursor: input.cursor,
      numItems: input.limit,
    });
  });
```

## Complex Combined Patterns

Combine filtering, joins, and distinct:

```typescript
const AuthorSchema = z.object({
  _id: zid("user"),
  name: z.string(),
  postCount: z.number(),
});

export const uniqueActiveAuthors = publicQuery
  .input(
    z.object({
      category: z.string(),
      minPosts: z.number(),
    })
  )
  .paginated({ limit: 20, item: AuthorSchema })
  .query(async ({ ctx, input }) => {
    const posts = stream(ctx.db, schema)
      .query("posts")
      .withIndex("category", (q) => q.eq("category", input.category))
      .filterWith(async (post) => {
        return post.published && post.views > 100;
      })
      .distinct(["authorId"])
      .map(async (post) => {
        const author = await ctx.table("user").get(post.authorId);
        if (!author) return null;

        // Use ctx.table() inside stream operations
        const postCount = await ctx
          .table("posts", "authorId", (q) => q.eq("authorId", post.authorId))
          .filter((q) => q.eq(q.field("published"), true))
          .take(input.minPosts + 1);

        return postCount.length > input.minPosts
          ? { _id: author._id, name: author.name, postCount: postCount.length }
          : null;
      })
      .filterWith(async (author) => author !== null);

    return await posts.paginate({
      cursor: input.cursor,
      numItems: input.limit,
    });
  });
```

## Stream Performance

### Document Scanning

`filterWith` scans documents until page is full:

```typescript
const results = await stream(ctx.db, schema)
  .query("posts")
  .filterWith(async (post) => expensiveCheck(post))
  .paginate({
    ...paginationOpts,
    maximumRowsRead: 1000, // Fail if scanning too many
  });
```

### Pagination Cursors

Stream cursors are more complex than regular queries:

- Include indexed fields (even from filtered docs)
- Only work with same stream construction
- Use `endCursor` for reactive pagination

```typescript
// Cursor fragility: stream structure must be identical between requests
const stream1 = stream(ctx.db, schema).query("messages").withIndex("time");

const stream2 = stream(ctx.db, schema)
  .query("messages")
  .withIndex("time")
  .filterWith((m) => m.read); // Different structure = cursor incompatible!
```

### When to Use

| Use Case                        | Tool                 |
| ------------------------------- | -------------------- |
| Simple field comparisons        | Built-in `.filter()` |
| Complex filters + `.take()`     | `filter` helper      |
| Complex filters + `.paginate()` | Streams              |
| UNION queries                   | `mergedStream()`     |
| JOINs with pagination           | `flatMap()`          |
| Unique values                   | `distinct()`         |

## Stream Migration Guide

### From Filter Helper to Streams

```typescript
// WRONG: Filter helper with pagination (variable page sizes)
import { filter } from "convex-helpers/server/filter";

const filtered = filter(ctx.table("characters"), (char) =>
  char.categories?.includes(category)
);
return await filtered.paginate(opts); // Variable page sizes!

// CORRECT: Stream with consistent page sizes
return await stream(ctx.db, schema)
  .query("characters")
  .filterWith(async (char) => char.categories?.includes(category))
  .paginate(opts);
```

### From Multiple Queries to Merged Stream

```typescript
// WRONG: Fetch all and merge manually
const sent = await ctx.table("messages", "from_to", (q) =>
  q.eq("from", u1).eq("to", u2)
);
const received = await ctx.table("messages", "from_to", (q) =>
  q.eq("from", u2).eq("to", u1)
);
const all = [...sent, ...received].sort(
  (a, b) => b._creationTime - a._creationTime
);

// CORRECT: Stream and paginate
const sent = stream(ctx.db, schema)
  .query("messages")
  .withIndex("from_to", (q) => q.eq("from", u1).eq("to", u2));
const received = stream(ctx.db, schema)
  .query("messages")
  .withIndex("from_to", (q) => q.eq("from", u2).eq("to", u1));
const all = mergedStream([sent, received], ["_creationTime"]);
return await all.paginate(opts);
```

### Handling Nulls in Map

```typescript
const enriched = stream(ctx.db, schema)
  .query("posts")
  .map(async (post) => {
    const author = await ctx.table("user").get(post.authorId);
    // Handle missing documents
    return author ? { ...post, author } : null;
  })
  .filterWith(async (post) => post !== null);
```

## Common Pitfalls

1. **Forgetting Schema Import**: Always import and pass schema
2. **Incorrect Merge Order**: Streams must be ordered by merge fields
3. **Not Handling Nulls**: Map operations can return null
4. **Infinite Scanning**: Use `maximumRowsRead` to prevent runaway queries
5. **Cursor Fragility**: Stream structure must be identical between requests
6. **Using ctx.db inside callbacks**: Use `ctx.table()` inside stream operations

## Best Practices

1. **Create appropriate indexes** - Each search field needs its own search index
2. **Limit results** - Always use `.take()` or `.paginate()`
3. **Consider performance** - Search indexes have overhead, don't over-index
4. **Track queries** - Helps improve search relevance and suggestions
5. **Normalize terms** - Convert to lowercase for consistency
6. **Handle empty queries** - Decide behavior for empty search
