import {
  convexTable,
  defineSchema,
  integer,
  searchIndex,
  text,
  vector,
  vectorIndex,
} from 'better-convex/orm';
import { expect, test } from 'vitest';

test('search and vector index builders export correctly', () => {
  const posts = convexTable(
    'posts',
    {
      text: text().notNull(),
      type: text().notNull(),
      embedding: vector(1536).notNull(),
    },
    (t) => [
      searchIndex('text_search').on(t.text).filter(t.type),
      searchIndex('text_empty_filter').on(t.text).filter(),
      searchIndex('text_search_staged').on(t.text).staged(),
      vectorIndex('embedding_vec')
        .on(t.embedding)
        .dimensions(1536)
        .filter(t.type),
      vectorIndex('embedding_vec_staged')
        .on(t.embedding)
        .dimensions(1536)
        .staged(),
    ]
  );

  const schema = defineSchema({ posts });
  const exported = JSON.parse(
    (schema as unknown as { export(): string }).export()
  ) as {
    tables: Array<{
      tableName: string;
      searchIndexes: unknown[];
      stagedSearchIndexes: unknown[];
      vectorIndexes: unknown[];
      stagedVectorIndexes: unknown[];
    }>;
  };

  const table = exported.tables.find((entry) => entry.tableName === 'posts');
  expect(table).toBeDefined();

  expect(table?.searchIndexes).toEqual([
    {
      indexDescriptor: 'text_search',
      searchField: 'text',
      filterFields: ['type'],
    },
    {
      indexDescriptor: 'text_empty_filter',
      searchField: 'text',
      filterFields: [],
    },
  ]);

  expect(table?.stagedSearchIndexes).toEqual([
    {
      indexDescriptor: 'text_search_staged',
      searchField: 'text',
      filterFields: [],
    },
  ]);

  expect(table?.vectorIndexes).toEqual([
    {
      indexDescriptor: 'embedding_vec',
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['type'],
    },
  ]);

  expect(table?.stagedVectorIndexes).toEqual([
    {
      indexDescriptor: 'embedding_vec_staged',
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: [],
    },
  ]);
});

test('extraConfig object return works for search and vector indexes', () => {
  const posts = convexTable(
    'posts',
    {
      text: text().notNull(),
      embedding: vector(1536).notNull(),
    },
    (t) => ({
      search: searchIndex('text_search').on(t.text),
      vector: vectorIndex('embedding_vec').on(t.embedding).dimensions(1536),
    })
  );

  const schema = defineSchema({ posts });
  const exported = JSON.parse(
    (schema as unknown as { export(): string }).export()
  ) as {
    tables: Array<{
      tableName: string;
      searchIndexes: unknown[];
      vectorIndexes: unknown[];
    }>;
  };

  const table = exported.tables.find((entry) => entry.tableName === 'posts');
  expect(table?.searchIndexes).toEqual([
    {
      indexDescriptor: 'text_search',
      searchField: 'text',
      filterFields: [],
    },
  ]);
  expect(table?.vectorIndexes).toEqual([
    {
      indexDescriptor: 'embedding_vec',
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: [],
    },
  ]);
});

test('searchIndex requires .on()', () => {
  expect(() =>
    convexTable('posts', { text: text().notNull() }, () => [
      searchIndex('missing_on') as any,
    ])
  ).toThrow(/Did you forget to call \.on/);
});

test('vectorIndex requires .on()', () => {
  expect(() =>
    convexTable('posts', { embedding: vector(1536).notNull() }, () => [
      vectorIndex('missing_on') as any,
    ])
  ).toThrow(/Did you forget to call \.on/);
});

test('vectorIndex requires dimensions', () => {
  expect(() =>
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('missing_dimensions').on(t.embedding),
    ])
  ).toThrow(/missing dimensions/i);
});

test('searchIndex validates search field type', () => {
  expect(() =>
    convexTable('posts', { count: integer().notNull() }, (t) => [
      searchIndex('search_count').on(t.count),
    ])
  ).toThrow(/only supports text\(\) columns/);
});

test('vectorIndex validates vector field type', () => {
  expect(() =>
    convexTable('posts', { text: text().notNull() }, (t) => [
      vectorIndex('vec').on(t.text).dimensions(1536),
    ])
  ).toThrow(/requires a vector\(\) column/);
});

test('vectorIndex validates dimensions match vector column', () => {
  expect(() =>
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('vec').on(t.embedding).dimensions(768),
    ])
  ).toThrow(/dimensions \(768\) do not match vector column/);
});

test('vectorIndex validates dimensions values', () => {
  expect(() =>
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('vec').on(t.embedding).dimensions(0),
    ])
  ).toThrow(/must be positive/);

  expect(() =>
    convexTable('posts', { embedding: vector(1536).notNull() }, (t) => [
      vectorIndex('vec').on(t.embedding).dimensions(1.5),
    ])
  ).toThrow(/must be an integer/);
});

test('vector builder validates dimensions values', () => {
  expect(() => vector(0)).toThrow(/must be positive/);
  expect(() => vector(1.25)).toThrow(/must be an integer/);
});

test('searchIndex validates table ownership for columns', () => {
  const users = convexTable('users', { name: text().notNull() });

  expect(() =>
    convexTable('posts', { text: text().notNull() }, () => [
      searchIndex('search_users').on(users.name),
    ])
  ).toThrow(/references column from 'users'/);
});

test('legacy chainable index APIs throw', () => {
  const posts = convexTable('posts', { text: text().notNull() });

  expect(() => (posts as any).index('by_text', ['text'])).toThrow(
    /table.index\(\) is not supported/
  );
  expect(() =>
    (posts as any).searchIndex('search_text', {
      searchField: 'text',
    })
  ).toThrow(/table.searchIndex\(\) is not supported/);
  expect(() =>
    (posts as any).vectorIndex('vec', {
      vectorField: 'text',
      dimensions: 1536,
    })
  ).toThrow(/table.vectorIndex\(\) is not supported/);
});
