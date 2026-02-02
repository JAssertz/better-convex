import { convexTable, text } from 'better-convex/orm';
import { defineSchema } from 'convex/server';
import { expect, test } from 'vitest';

test('convexTable works with defineSchema()', () => {
  const users = convexTable('users', {
    name: text().notNull(),
    email: text().notNull(),
  });

  const posts = convexTable('posts', {
    title: text().notNull(),
    content: text().notNull(),
  });

  // Should not throw
  const schema = defineSchema({
    users,
    posts,
  });

  expect(schema).toBeDefined();
  expect(schema.tables).toHaveProperty('users');
  expect(schema.tables).toHaveProperty('posts');
});

test('convexTable validator is compatible with Convex schema', () => {
  const users = convexTable('users', {
    name: text().notNull(),
    email: text().notNull(),
  });

  // Should have validator property
  expect(users.validator).toBeDefined();
  expect(users.tableName).toBe('users');
});
