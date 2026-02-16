/* biome-ignore-all lint: compile-time type assertions only */

import type { TestCtx } from '../setup.testing';

declare const db: TestCtx['orm'];

void db.query.users
  .withIndex('by_name', (q) => q.eq('name', 'Alice'))
  .findMany({
    where: (_users, { predicate }) => predicate((row) => row.name === 'Alice'),
  });

void db.query.users
  .withIndex('by_name', (q) => q.eq('name', 'Alice'))
  .findMany({
    where: (_users, { predicate }) => predicate((row) => row.name === 'Alice'),
  });

void db.query.users.findMany({
  where: (users, { eq }) => eq(users.email, 'alice@example.com'),
});

void db.query.users.findMany({
  // @ts-expect-error row callback is removed; use where(table, ops) + ops.predicate(...)
  where: (row: { name: string }) => row.name === 'Alice',
});

void db.query.users.findMany({
  where: (users, { eq }) => eq(users.name, 'Alice'),
  // @ts-expect-error top-level index config is removed; use .withIndex(...)
  index: { name: 'by_name' },
});

void db.query.users.withIndex(
  'by_name',
  // @ts-expect-error by_name index range cannot use non-index field
  (q) => q.eq('email', 'alice@example.com')
);

void db.query.posts.withIndex('by_author').findMany({
  // @ts-expect-error withIndex cannot be combined with search mode
  search: { index: 'text_search', query: 'hello' },
});

void db.query.posts.withIndex('by_author').findMany({
  // @ts-expect-error withIndex cannot be combined with vectorSearch mode
  vectorSearch: {
    index: 'embedding_vec',
    vector: [0.1, 0.2, 0.3],
    limit: 3,
  },
});

void db.query.users.withIndex('by_name').findMany({
  where: (users, { eq }) => eq(users.name, 'Alice'),
  // @ts-expect-error withIndex cannot be combined with allowFullScan on reads
  allowFullScan: true,
});
