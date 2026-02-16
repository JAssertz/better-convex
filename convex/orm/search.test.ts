import { expect, test } from 'vitest';
import schema from '../schema';
import { convexTest, runCtx } from '../setup.testing';

test('search query returns matching rows in relevance mode', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Search Author',
      email: 'search-author@example.com',
    });

    await baseCtx.db.insert('posts', {
      text: 'galaxy red fox',
      type: 'news',
      numLikes: 1,
      authorId,
    });
    await baseCtx.db.insert('posts', {
      text: 'galaxy blue moon',
      type: 'blog',
      numLikes: 2,
      authorId,
    });
    await baseCtx.db.insert('posts', {
      text: 'ocean green wave',
      type: 'news',
      numLikes: 3,
      authorId,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const rows = await ctx.orm.query.posts.findMany({
      search: {
        index: 'text_search',
        query: 'galaxy',
      },
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row: any) => row.text.includes('galaxy'))).toBe(true);
  });
});

test('search filters are pushed into search index', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Search Filter Author',
      email: 'search-filter-author@example.com',
    });

    await baseCtx.db.insert('posts', {
      text: 'galaxy filter one',
      type: 'news',
      numLikes: 1,
      authorId,
    });
    await baseCtx.db.insert('posts', {
      text: 'galaxy filter two',
      type: 'blog',
      numLikes: 2,
      authorId,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const rows = await ctx.orm.query.posts.findMany({
      search: {
        index: 'text_search',
        query: 'galaxy',
        filters: { type: 'news' },
      },
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row: any) => row.type === 'news')).toBe(true);
  });
});

test('search supports post-search object where on base fields', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Search Where Author',
      email: 'search-where-author@example.com',
    });

    await baseCtx.db.insert('posts', {
      text: 'galaxy where yes',
      type: 'news',
      published: true,
      numLikes: 1,
      authorId,
    });
    await baseCtx.db.insert('posts', {
      text: 'galaxy where no',
      type: 'news',
      published: false,
      numLikes: 2,
      authorId,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const rows = await ctx.orm.query.posts.findMany({
      search: {
        index: 'text_search',
        query: 'galaxy',
      },
      where: {
        published: true,
      },
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row: any) => row.published === true)).toBe(true);
  });
});

test('search supports eager relation loading with with', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Search With Author',
      email: 'search-with-author@example.com',
    });

    await baseCtx.db.insert('posts', {
      text: 'galaxy with relation',
      type: 'news',
      numLikes: 1,
      authorId,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const rows = await ctx.orm.query.posts.findMany({
      search: {
        index: 'text_search',
        query: 'galaxy',
      },
      with: {
        author: true,
      },
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].author).toBeDefined();
    expect(rows[0].author?.name).toBe('Search With Author');
  });
});

test('search pagination works with cursor flow', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Search Paging Author',
      email: 'search-paging-author@example.com',
    });

    await baseCtx.db.insert('posts', {
      text: 'galaxy paging one',
      type: 'news',
      numLikes: 1,
      authorId,
    });
    await baseCtx.db.insert('posts', {
      text: 'galaxy paging two',
      type: 'news',
      numLikes: 2,
      authorId,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    const page1 = await ctx.orm.query.posts.findMany({
      search: {
        index: 'text_search',
        query: 'galaxy',
      },
      cursor: null,
      limit: 1,
    });

    expect(page1.page).toHaveLength(1);
    expect(page1.isDone).toBe(false);
    expect(page1.continueCursor).not.toBeNull();

    const page2 = await ctx.orm.query.posts.findMany({
      search: {
        index: 'text_search',
        query: 'galaxy',
      },
      cursor: page1.continueCursor,
      limit: 1,
    });

    expect(page2.page).toHaveLength(1);
  });
});

test('search + orderBy throws guardrail error', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    await expect(
      ctx.orm.query.posts.findMany({
        search: {
          index: 'text_search',
          query: 'galaxy',
        },
        orderBy: { createdAt: 'desc' },
      } as any)
    ).rejects.toThrow(/search.+orderBy|orderBy.+search/i);
  });
});

test('search + where(fn) throws guardrail error', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    await expect(
      ctx.orm.query.posts.findMany({
        search: {
          index: 'text_search',
          query: 'galaxy',
        },
        where: (_posts: any, { predicate }: any) =>
          predicate((row: any) => row.type === 'news'),
      } as any)
    ).rejects.toThrow(/search.+where/i);
  });
});

test('search + relation where throws guardrail error', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    await expect(
      ctx.orm.query.posts.findMany({
        search: {
          index: 'text_search',
          query: 'galaxy',
        },
        where: {
          author: {
            name: 'Alice',
          },
        },
      } as any)
    ).rejects.toThrow(/search.+relation|relation.+search/i);
  });
});

test('search where eq conflicts with search.filters and throws', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Search Conflict Author',
      email: 'search-conflict-author@example.com',
    });

    await baseCtx.db.insert('posts', {
      text: 'galaxy conflict',
      type: 'news',
      numLikes: 1,
      authorId,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    await expect(
      ctx.orm.query.posts.findMany({
        search: {
          index: 'text_search',
          query: 'galaxy',
          filters: { type: 'blog' },
        },
        where: {
          type: 'news',
        },
      } as any)
    ).rejects.toThrow(
      /search\\.filters.+where|where.+search\\.filters|conflict/i
    );
  });
});

test('search where eq object conflicts with search.filters and throws', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Search Conflict Eq Author',
      email: 'search-conflict-eq-author@example.com',
    });

    await baseCtx.db.insert('posts', {
      text: 'galaxy conflict eq',
      type: 'news',
      numLikes: 1,
      authorId,
    });
  });

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    await expect(
      ctx.orm.query.posts.findMany({
        search: {
          index: 'text_search',
          query: 'galaxy',
          filters: { type: 'blog' },
        },
        where: {
          type: { eq: 'news' },
        },
      } as any)
    ).rejects.toThrow(
      /search\\.filters.+where|where.+search\\.filters|conflict/i
    );
  });
});
