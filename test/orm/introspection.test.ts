import {
  check,
  convexTable,
  getTableColumns,
  getTableConfig,
  id,
  index,
  isNotNull,
  text,
  uniqueIndex,
} from 'better-convex/orm';
import { expect, test } from 'vitest';

test('getTableColumns includes system fields', () => {
  const users = convexTable('users', {
    name: text().notNull(),
    email: text().notNull(),
  });

  const columns = getTableColumns(users);

  expect(columns).toHaveProperty('name');
  expect(columns).toHaveProperty('email');
  expect(columns).toHaveProperty('_id');
  expect(columns).toHaveProperty('_creationTime');
});

test('getTableConfig includes indexes/unique/fk/rls/checks', () => {
  const users = convexTable.withRLS(
    'users',
    {
      name: text().notNull(),
      email: text().notNull(),
    },
    (t) => [
      index('by_name').on(t.name),
      uniqueIndex('unique_email').on(t.email),
      check('name_present', isNotNull(t.name)),
    ]
  );

  const posts = convexTable('posts', {
    userId: id('users').notNull(),
    title: text().notNull(),
  });

  const usersConfig = getTableConfig(users);
  expect(usersConfig.name).toBe('users');
  expect(usersConfig.indexes.some((idx) => idx.name === 'by_name')).toBe(true);
  expect(
    usersConfig.uniqueIndexes.some((idx) => idx.name === 'unique_email')
  ).toBe(true);
  expect(usersConfig.rls.enabled).toBe(true);
  expect(usersConfig.checks.some((c) => c.name === 'name_present')).toBe(true);

  const postsConfig = getTableConfig(posts);
  expect(postsConfig.foreignKeys.length).toBe(1);
  expect(postsConfig.foreignKeys[0].foreignTableName).toBe('users');
  expect(postsConfig.foreignKeys[0].foreignColumns).toEqual(['_id']);
});
