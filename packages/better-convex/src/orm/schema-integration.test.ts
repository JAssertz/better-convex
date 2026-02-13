import { convexTable, defineSchema, getTableConfig, id, text } from './index';

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

test.each([
  'id',
  '_id',
  '_creationTime',
])('convexTable rejects reserved column name: %s', (columnName) => {
  expect(() =>
    convexTable('users', {
      [columnName]: text().notNull(),
    } as Record<string, ReturnType<typeof text>>)
  ).toThrow(/reserved/i);
});

test('convexTable allows createdAt as user column', () => {
  const users = convexTable('users_with_created_at', {
    name: text().notNull(),
    createdAt: text().notNull(),
  });

  expect((users as any).createdAt?.config?.name).toBe('createdAt');
});

test('references accepts detached id(_id, table) columns', () => {
  const comments = convexTable('comments', {
    content: text().notNull(),
    parentId: id('comments')
      .references(() => id('_id', 'comments'), { onDelete: 'cascade' })
      .notNull(),
  });

  expect(() => defineSchema({ comments })).not.toThrow();

  const config = getTableConfig(comments);
  expect(config.foreignKeys).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        columns: ['parentId'],
        foreignTableName: 'comments',
        foreignColumns: ['_id'],
        onDelete: 'cascade',
      }),
    ])
  );
});
