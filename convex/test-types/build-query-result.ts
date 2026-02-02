import { convexTable, relations, text, integer, id } from 'better-convex/orm';
import type { BuildQueryResult, InferSelectModel, TablesRelationalConfig } from 'better-convex/orm';
import { type Equal, Expect } from './utils';

// ============================================================================
// Setup test schema
// ============================================================================

const users = convexTable('users', {
  name: text().notNull(),
  email: text().notNull(),
  age: integer(), // nullable
  bio: text(), // nullable
});

const posts = convexTable('posts', {
  title: text().notNull(),
  content: text(), // nullable
  authorId: id('users').notNull(),
  published: integer().notNull(),
});

const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: ['authorId'] }),
}));

// Mock schema configuration (simplified for type testing)
type TestSchema = {
  users: {
    tsName: 'users';
    dbName: 'users';
    columns: typeof users['_']['columns'];
    relations: {
      posts: typeof usersRelations['config']['posts'];
    };
  };
  posts: {
    tsName: 'posts';
    dbName: 'posts';
    columns: typeof posts['_']['columns'];
    relations: {
      author: typeof postsRelations['config']['author'];
    };
  };
};

// ============================================================================
// InferSelectModel tests (uses GetColumnData)
// ============================================================================

// Test 1: Full user model with nullable fields
{
  type User = InferSelectModel<typeof users>;

  type Expected = {
    _id: string;
    _creationTime: number;
    name: string; // notNull
    email: string; // notNull
    age: number | null; // nullable
    bio: string | null; // nullable
  };

  Expect<Equal<User, Expected>>;
}

// Test 2: Full post model with nullable fields
{
  type Post = InferSelectModel<typeof posts>;

  type Expected = {
    _id: string;
    _creationTime: number;
    title: string; // notNull
    content: string | null; // nullable
    authorId: string; // notNull
    published: number; // notNull
  };

  Expect<Equal<Post, Expected>>;
}

// ============================================================================
// BuildQueryResult with column selection
// ============================================================================

// Test 3: Select specific columns only
{
  type UserPartial = BuildQueryResult<
    TestSchema,
    TestSchema['users'],
    { columns: { name: true; email: true } }
  >;

  type Expected = {
    name: string;
    email: string;
  };

  Expect<Equal<UserPartial, Expected>>;
}

// Test 4: Select columns including nullable field
{
  type UserWithAge = BuildQueryResult<
    TestSchema,
    TestSchema['users'],
    { columns: { name: true; age: true } }
  >;

  type Expected = {
    name: string;
    age: number | null;
  };

  Expect<Equal<UserWithAge, Expected>>;
}

// Test 5: No column selection = all fields with system fields
{
  type UserFull = BuildQueryResult<TestSchema, TestSchema['users'], true>;

  type Expected = {
    _id: string;
    _creationTime: number;
    name: string;
    email: string;
    age: number | null;
    bio: string | null;
  };

  Expect<Equal<UserFull, Expected>>;
}

// ============================================================================
// BuildQueryResult with relations (not fully implemented yet)
// ============================================================================

// Test 6: Query with relation loading
{
  type UserWithPosts = BuildQueryResult<
    TestSchema,
    TestSchema['users'],
    {
      with: {
        posts: true;
      };
    }
  >;

  // Should include posts relation
  type PostsField = UserWithPosts['posts'];

  // For now, just verify the type exists
  // Full relation type checking will be tested when relations are fully wired
  type Expected = {
    _id: string;
    _creationTime: number;
    name: string;
    email: string;
    age: number | null;
    bio: string | null;
    posts: any; // Will be properly typed once relations are fully implemented
  };

  // Just check that posts field exists
  type HasPosts = 'posts' extends keyof UserWithPosts ? true : false;
  Expect<Equal<HasPosts, true>>;
}

// Test 7: Query with column selection AND relations
{
  type UserPartialWithPosts = BuildQueryResult<
    TestSchema,
    TestSchema['users'],
    {
      columns: { name: true; email: true };
      with: { posts: true };
    }
  >;

  // Should only include selected columns + posts
  type HasName = 'name' extends keyof UserPartialWithPosts ? true : false;
  type HasEmail = 'email' extends keyof UserPartialWithPosts ? true : false;
  type HasAge = 'age' extends keyof UserPartialWithPosts ? true : false;
  type HasPosts = 'posts' extends keyof UserPartialWithPosts ? true : false;

  Expect<Equal<HasName, true>>;
  Expect<Equal<HasEmail, true>>;
  Expect<Equal<HasAge, false>>; // Should NOT have age
  Expect<Equal<HasPosts, true>>;
}
