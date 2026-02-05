import {
  convexTable,
  createDatabase,
  defineRelations,
  extractRelationsConfig,
  type InferInsertModel,
  type InferSelectModel,
  id,
  integer,
  text,
} from 'better-convex/orm';
import type { GenericDatabaseReader } from 'convex/server';
import type { GenericId } from 'convex/values';
import { UserRow } from './fixtures/types';
import {
  bookAuthors,
  books,
  cities,
  comments,
  node,
  posts,
  relations,
  users,
} from './tables-rel';
import { type Equal, Expect, IsAny, Not } from './utils';

// Build schema following Better Convex pattern
const schemaConfig = relations;
const edgeMetadata = extractRelationsConfig(relations);

type SchemaUsersName = typeof schemaConfig.users.name;
Expect<Equal<SchemaUsersName, 'users'>>;

type SchemaKeys = keyof typeof schemaConfig;
type ExpectedSchemaKeys =
  | 'users'
  | 'cities'
  | 'posts'
  | 'comments'
  | 'books'
  | 'bookAuthors'
  | 'node'
  | 'metrics';
Expect<Equal<SchemaKeys, ExpectedSchemaKeys>>;

type SchemaUserRelationKeys = keyof typeof schemaConfig.users.relations;
type ExpectedSchemaUserRelationKeys =
  | 'city'
  | 'homeCity'
  | 'posts'
  | 'comments';
Expect<Equal<SchemaUserRelationKeys, ExpectedSchemaUserRelationKeys>>;

const schemaRelationKeyOk: SchemaUserRelationKeys = 'posts';
// @ts-expect-error - invalid relation key should not be allowed
const schemaRelationKeyBad: SchemaUserRelationKeys = 'invalidRelationKey';
void schemaRelationKeyOk;
void schemaRelationKeyBad;

// Mock database reader for type testing
const mockDb = {} as GenericDatabaseReader<any>;
const db = createDatabase(mockDb, schemaConfig, edgeMetadata);

// ============================================================================
// DATABASE TYPE TESTS (Convex-backend inspired)
// ============================================================================

// Invalid table access on db.query should error
{
  // @ts-expect-error - table does not exist on schema
  db.query.nonExistentTable;
}

// ============================================================================
// WHERE CLAUSE TYPE TESTS
// ============================================================================

// Test 1: eq operator
{
  const result = await db.query.users.findMany({
    where: { name: 'Alice' },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 2: Multiple filter operators
{
  const result = await db.query.users.findMany({
    where: { age: { gt: 18, lt: 65 } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 3: inArray operator
{
  const result = await db.query.users.findMany({
    where: { name: { in: ['Alice', 'Bob'] } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4: isNull / isNotNull for optional fields
{
  const result = await db.query.users.findMany({
    where: { age: { isNull: true } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4b: notIn operator
{
  const result = await db.query.users.findMany({
    where: { name: { notIn: ['Alice', 'Bob'] } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// LOGICAL OPERATOR TYPE TESTS
// ============================================================================

// Test 4c: OR at table level
{
  const result = await db.query.users.findMany({
    where: {
      OR: [{ name: 'Alice' }, { name: 'Bob' }],
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4d: AND at table level
{
  const result = await db.query.users.findMany({
    where: {
      AND: [{ age: { gt: 18 } }, { age: { lt: 65 } }],
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4e: NOT at table level
{
  const result = await db.query.users.findMany({
    where: {
      NOT: { age: { isNull: true } },
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4f: OR inside a single column filter
{
  const result = await db.query.users.findMany({
    where: {
      age: { OR: [{ lt: 18 }, { gt: 65 }] },
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4g: AND inside a single column filter
{
  const result = await db.query.users.findMany({
    where: {
      age: { AND: [{ gt: 18 }, { lt: 65 }] },
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4h: NOT inside a single column filter
{
  const result = await db.query.users.findMany({
    where: {
      age: { NOT: { isNull: true } },
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// ORDER BY TYPE TESTS
// ============================================================================

// Test 5: orderBy asc
{
  const result = await db.query.users.findMany({
    orderBy: { name: 'asc' },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 6: orderBy desc
{
  const result = await db.query.users.findMany({
    orderBy: { age: 'desc' },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 6b: orderBy callback with column builder
{
  const result = await db.query.users.findMany({
    orderBy: (users) => users.name,
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 6c: orderBy callback with multiple fields
{
  const result = await db.query.users.findMany({
    orderBy: (users, { asc, desc }) => [desc(users.age), asc(users.name)],
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// LIMIT / OFFSET TYPE TESTS
// ============================================================================

// Test 7: limit
{
  const result = await db.query.users.findMany({
    limit: 10,
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 8: offset
{
  const result = await db.query.users.findMany({
    offset: 5,
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 9: Combined where + orderBy + limit
{
  const result = await db.query.users.findMany({
    where: { age: { gt: 18 } },
    orderBy: { name: 'desc' },
    limit: 10,
    offset: 5,
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// COLUMN SELECTION TYPE TESTS
// ============================================================================

// Test 10: Select specific columns
{
  const result = await db.query.users.findMany({
    columns: {
      name: true,
      email: true,
    },
  });

  type Expected = Array<{
    name: string;
    email: string;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 11: Exclude columns with false
{
  const result = await db.query.users.findMany({
    columns: {
      age: false,
    },
  });

  type Expected = Array<Omit<UserRow, 'age'>>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 11b: Empty columns returns no table columns
{
  const result = await db.query.users.findMany({
    columns: {},
  });

  type Expected = Array<{}>;

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// COMBINED WHERE + RELATIONS TYPE TESTS
// ============================================================================

// Test 12: Where clause with nested relations
// TODO(Phase 4): Enable once relation loading implemented
// Relation loading with `with` option is not yet implemented
// _loadRelations() currently returns rows unchanged
// {
//   const result = await db.query.users.findMany({
//     where: { name: 'Alice' },
//     with: {
//       posts: {
//         where: { published: true },
//         columns: {
//           title: true,
//         },
//       },
//     },
//   });
//
//   type Expected = Array<{
//     _id: string;
//     _creationTime: number;
//     name: string;
//     email: string;
//     age: number | null;
//     cityId: GenericId<'cities'>;
//     homeCityId: GenericId<'cities'> | null;
//     posts: Array<{
//       title: string;
//     }>;
//   }>;
//
//   Expect<Equal<Expected, typeof result>>;
// }

// Test 12b: one() relation with where is nullable (even if optional false)
{
  const authors = convexTable('authors_where', {
    name: text().notNull(),
  });

  const books = convexTable('books_where', {
    authorId: id('authors_where').notNull(),
    title: text().notNull(),
  });

  const relationsWhere = defineRelations({ authors, books }, (r) => ({
    authors: {
      books: r.many.books(),
    },
    books: {
      author: r.one.authors({
        from: r.books.authorId,
        to: r.authors._id,
        optional: false,
      }),
    },
  }));

  const edgesWhere = extractRelationsConfig(relationsWhere);
  const dbWhere = createDatabase(mockDb, relationsWhere, edgesWhere);

  const result = await dbWhere.query.books.findMany({
    with: {
      author: {
        where: { name: 'Alice' },
      },
    },
  });

  type AuthorRow = InferSelectModel<typeof authors>;
  type Row = (typeof result)[number];

  Expect<Equal<Row['author'], AuthorRow | null>>;
}

// Test 12c: columns {} in relations keeps nested relations only
{
  const result = await db.query.users.findMany({
    with: {
      posts: {
        columns: {},
        with: {
          author: true,
        },
      },
    },
  });

  type Post = (typeof result)[number]['posts'][number];
  type ExpectedPost = {
    author: UserRow | null;
  };

  Expect<Equal<Post, ExpectedPost>>;
}

// Test 12d: offset in nested relations preserves types
{
  const result = await db.query.users.findMany({
    with: {
      posts: {
        offset: 1,
        limit: 2,
      },
    },
  });

  type Post = (typeof result)[number]['posts'][number];
  type ExpectedPost = InferSelectModel<typeof posts>;

  Expect<Equal<Post, ExpectedPost>>;
}

// ============================================================================
// FINDFIRST RESULT TYPE TESTS
// ============================================================================

// Test: findFirst returns T | undefined
{
  const result = await db.query.users.findFirst({
    where: { name: 'Alice' },
  });

  type Expected = UserRow | undefined;

  Expect<Equal<Expected, typeof result>>;
}

// Test: findFirst with orderBy
{
  const result = await db.query.users.findFirst({
    orderBy: { age: 'desc' },
  });

  type Expected = UserRow | undefined;

  Expect<Equal<Expected, typeof result>>;
}

// Test: findFirst with no match returns undefined
{
  const result = await db.query.users.findFirst({
    where: { name: 'NonExistent' },
  });

  type Expected = UserRow | undefined;

  Expect<Equal<Expected, typeof result>>;
}

// Test: findFirst never returns array
{
  const result = await db.query.users.findFirst();

  // Verify it's not an array type
  type IsArray = typeof result extends Array<any> ? true : false;
  Expect<Equal<IsArray, false>>;
}

// ============================================================================
// GETCOLUMNDATA MODE VERIFICATION TESTS
// ============================================================================

// Test: InferSelectModel uses 'query' mode (includes null for nullable fields)
{
  type User = InferSelectModel<typeof users>;

  // Age is nullable, should include null (query mode)
  Expect<Equal<User['age'], number | null>>;

  // Name is notNull, should NOT include null
  Expect<Equal<User['name'], string>>;
}

// Test: BuildQueryResult column selection uses 'query' mode
{
  const result = await db.query.users.findMany({
    columns: { age: true },
  });

  type Row = (typeof result)[number];

  // Selected age field preserves nullability
  Expect<Equal<Row['age'], number | null>>;
}

// Test: Filter values use 'raw' mode (don't accept null)
{
  // eq should accept `number`, NOT `number | null`
  await db.query.users.findMany({
    where: { age: 30 }, // ✓ Should work
  });

  // This test verifies eq doesn't accept null by attempting it in negative test section
  // See negative tests below for the @ts-expect-error version
}

// ============================================================================
// COMPLEX COMBINATIONS
// ============================================================================

// Test: where + orderBy + limit combined
{
  const result = await db.query.users.findMany({
    where: { age: { gt: 18 } },
    orderBy: { age: 'desc' },
    limit: 10,
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: columns + where combined
{
  const result = await db.query.users.findMany({
    columns: {
      name: true,
      email: true,
    },
    where: { name: 'Alice' },
  });

  type Row = (typeof result)[number];
  type Expected = {
    name: string;
    email: string;
  };

  Expect<Equal<Row, Expected>>;
}

// Test: orderBy on posts table
{
  const result = await db.query.posts.findMany({
    orderBy: { title: 'desc' },
  });

  // Should return array of posts
  type IsArray = typeof result extends Array<any> ? true : false;
  Expect<Equal<IsArray, true>>;
}

// Test: Complex where with multiple operators
{
  const result = await db.query.users.findMany({
    where: { age: { gt: 18 } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// M5 STRING OPERATOR TESTS
// ============================================================================

// Test: like prefix pattern
{
  const result = await db.query.users.findMany({
    where: { name: { like: 'A%' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: like suffix pattern
{
  const result = await db.query.users.findMany({
    where: { email: { like: '%@example.com' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: like substring pattern
{
  const result = await db.query.users.findMany({
    where: { name: { like: '%ice%' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: startsWith operator
{
  const result = await db.query.users.findMany({
    where: { email: { startsWith: 'a' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: endsWith operator
{
  const result = await db.query.users.findMany({
    where: { email: { endsWith: '@example.com' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: contains operator
{
  const result = await db.query.users.findMany({
    where: { name: { contains: 'ice' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// M5 ORDERBY EXTENDED TESTS
// ============================================================================

// Test: orderBy with system field _creationTime
{
  const result = await db.query.users.findMany({
    orderBy: { _creationTime: 'desc' },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: orderBy with nullable field
{
  const result = await db.query.users.findMany({
    orderBy: { age: 'desc' }, // age is nullable
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// M6 COLUMN BUILDER TESTS
// ============================================================================

// Test: Method chaining - notNull().default()
{
  const posts = convexTable('posts', {
    title: text().notNull(),
    status: text().notNull().default('draft'),
  });

  type Insert = InferInsertModel<typeof posts>;

  Expect<
    Equal<
      Insert,
      {
        title: string;
        status?: string; // Defaults make fields optional (Drizzle parity)
      }
    >
  >;
}

// Test: Default value type inference
{
  const posts = convexTable('posts', {
    viewCount: integer().default(0),
  });

  type Post = InferSelectModel<typeof posts>;
  type ViewCountType = Post['viewCount'];

  // Default doesn't change nullability - still nullable in select
  Expect<Equal<ViewCountType, number | null>>;
}

// ============================================================================
// M5/M6 NEGATIVE TYPE TESTS
// ============================================================================

// Negative: orderBy on invalid field
db.query.users.findMany({
  // @ts-expect-error - Property 'nonExistent' does not exist
  orderBy: { nonExistent: 'asc' },
});

// Negative: Invalid default value type
{
  convexTable('invalid', {
    // @ts-expect-error - Argument of type 'string' is not assignable to parameter of type 'number'
    age: integer().default('not a number'),
  });
}

// ============================================================================
// NEGATIVE TYPE TESTS - Invalid usage should error
// ============================================================================

// Invalid field in where clause
db.query.users.findMany({
  // @ts-expect-error - Property 'invalidField' does not exist
  where: { invalidField: 'test' },
});

// Type mismatch in eq operator
db.query.users.findMany({
  // @ts-expect-error - Argument of type 'string' is not assignable to parameter of type 'number'
  where: { age: 'not a number' },
});

// Invalid field in orderBy
db.query.users.findMany({
  // @ts-expect-error - Property 'invalidField' does not exist
  orderBy: (users, { asc }) => asc(users.invalidField),
});

// Invalid orderBy direction
db.query.users.findMany({
  // @ts-expect-error - orderBy direction must be 'asc' | 'desc'
  orderBy: { age: 'up' },
});

// Invalid operator for field type
db.query.users.findMany({
  // @ts-expect-error - Argument of type 'number' is not assignable to parameter of type 'string'
  where: { name: { gt: 100 } },
});

// inArray with wrong value type
db.query.users.findMany({
  // @ts-expect-error - Type 'string' is not assignable to type 'number'
  where: { age: { in: ['not', 'numbers'] } },
});

// inArray expects array
db.query.users.findMany({
  // @ts-expect-error - 'in' expects an array of values
  where: { age: { in: 123 } },
});

// like operator expects string pattern
db.query.users.findMany({
  // @ts-expect-error - like expects a string pattern
  where: { name: { like: 123 } },
});

// FilterOperators use 'raw' mode - eq should NOT accept null
db.query.users.findMany({
  // @ts-expect-error - Argument of type 'null' is not assignable to parameter of type 'number'
  where: { age: null },
});

// findFirst should not be assignable to array type
{
  const result = await db.query.users.findFirst();
  // @ts-expect-error - Type 'UserRow | undefined' is not assignable to type 'UserRow[]'
  const arr: UserRow[] = [result];
}

// isNull expects boolean
db.query.users.findMany({
  // @ts-expect-error - Type 'string' is not assignable to type 'true'
  where: { name: { isNull: 'nope' } },
});

// OR must be an array of filters
db.query.users.findMany({
  where: {
    // @ts-expect-error - OR expects an array of filters
    OR: { name: 'Alice' },
  },
});

// Column-level OR must be an array of filters
db.query.users.findMany({
  where: {
    age: {
      // @ts-expect-error - OR expects an array of field filters
      OR: { gt: 18 },
    },
  },
});

// isNull only accepts true
db.query.users.findMany({
  where: {
    age: {
      // @ts-expect-error - isNull only accepts true
      isNull: false,
    },
  },
});

// NOT must be a single filter, not an array
db.query.users.findMany({
  where: {
    age: {
      // @ts-expect-error - NOT expects a single field filter
      NOT: [{ gt: 18 }],
    },
  },
});

// Invalid column in selection
db.query.users.findMany({
  columns: {
    // @ts-expect-error - 'invalidColumn' does not exist
    invalidColumn: true,
  },
});

// Columns values must be boolean
db.query.users.findMany({
  columns: {
    // @ts-expect-error - columns values must be boolean
    name: 'yes',
  },
});

// Where in nested one() relation (allowed)
db.query.posts.findMany({
  with: {
    author: {
      where: { name: 'Alice' },
    },
  },
});

// Limit is not allowed in nested one() relation
db.query.posts.findMany({
  with: {
    author: {
      // @ts-expect-error - limit is only allowed on many() relations
      limit: 10,
    },
  },
});

// Invalid nested relation option type
db.query.users.findMany({
  with: {
    posts: {
      // @ts-expect-error - limit must be a number
      limit: '10',
    },
  },
});

// ============================================================================
// PHASE 4: COMPREHENSIVE NEGATIVE TESTS
// ============================================================================

// A. Invalid Column Access - Invalid column in relation config
db.query.posts.findMany({
  with: {
    // @ts-expect-error - Invalid relation name
    nonExistentRelation: true,
  },
});

// B. Type Mismatches - Wrong GenericId table reference
{
  const posts = convexTable('posts', {
    authorId: id('users').notNull(),
  });

  type Post = InferSelectModel<typeof posts>;

  const invalidPost: Post = {
    _id: '123' as GenericId<'posts'>,
    _creationTime: 123,
    // @ts-expect-error - Type 'GenericId<"posts">' is not assignable to type 'GenericId<"users">'
    authorId: '456' as GenericId<'posts'>, // Wrong table reference
  };
}

// B. Type Mismatches - Array for single value operator
db.query.users.findMany({
  // @ts-expect-error - Type 'number' is not assignable to type 'string'
  where: { name: { eq: 123 } },
});

// C. Invalid Operations - gt on boolean field
// Note: This currently doesn't produce a type error due to type system limitations
db.query.posts.findMany({
  where: { published: { gt: true } },
});

// C. Invalid Operations - lt on boolean field
// Note: This currently doesn't produce a type error due to type system limitations
db.query.posts.findMany({
  where: { published: { lt: false } },
});

// D. Invalid Query Config - Unknown query option
db.query.users.findMany({
  // @ts-expect-error - Object literal may only specify known properties
  unknownOption: true,
});

// D. Invalid Query Config - limit with string value
db.query.users.findMany({
  // @ts-expect-error - Type 'string' is not assignable to type 'number'
  limit: '10',
});

// D. Invalid Query Config - offset with string value
db.query.users.findMany({
  // @ts-expect-error - Type 'string' is not assignable to type 'number'
  offset: '5',
});

// E. Relation Constraints - Invalid relation name in with
{
  type UsersQueryConfig = import('better-convex/orm').DBQueryConfig<
    'many',
    true,
    typeof schemaConfig,
    typeof schemaConfig.users
  >;

  const invalidConfig: UsersQueryConfig = {
    with: {
      // @ts-expect-error - Invalid relation name
      invalidRelation: true,
    },
  };

  void invalidConfig;
}

// ============================================================================
// PHASE 5: EDGE CASES
// ============================================================================

// Edge Case 1: Empty result arrays
{
  const result = await db.query.users.findMany({
    where: { name: 'NonExistentUser12345' },
  });

  // Should still be Array<UserRow>, not undefined or never
  type Expected = UserRow[];

  Expect<Equal<typeof result, Expected>>;
}

// Edge Case 2: Null handling in complex queries
{
  const result = await db.query.users.findMany({
    where: { age: { isNull: true } },
    columns: {
      name: true,
      age: true,
    },
    orderBy: { _creationTime: 'desc' },
  });

  type Row = (typeof result)[number];

  // Age should preserve nullability
  Expect<Equal<Row['age'], number | null>>;
}

// Edge Case 3: System field ordering (_id, _creationTime)
{
  const result = await db.query.users.findMany({
    orderBy: { _creationTime: 'asc' },
  });

  type Expected = UserRow[];

  Expect<Equal<typeof result, Expected>>;
}

// Edge Case 4: GenericId across multiple tables
{
  const result = await db.query.posts.findMany({
    columns: {
      authorId: true,
    },
  });

  type Row = (typeof result)[number];

  // authorId should be GenericId<'users'>, not GenericId<'posts'>
  Expect<Equal<Row['authorId'], GenericId<'users'> | null>>;
}

// Edge Case 5: Deeply nested query configs (type check only)
{
  const result = await db.query.users.findMany({
    where: { name: 'Alice' },
    columns: {
      name: true,
      email: true,
      age: true,
    },
    orderBy: { age: 'desc' },
    limit: 10,
    offset: 5,
  });

  // Should compile without errors
  type Row = (typeof result)[number];

  Expect<
    Equal<
      Row,
      {
        name: string;
        email: string;
        age: number | null;
      }
    >
  >;
}

// ============================================================================
// PAGINATE TYPE TESTS
// ============================================================================

// Paginate returns page + cursor metadata
{
  const result = await db.query.users.paginate(
    { where: { name: 'Alice' } },
    { cursor: null, numItems: 10 }
  );

  type Expected = {
    page: UserRow[];
    continueCursor: string | null;
    isDone: boolean;
  };

  Expect<Equal<typeof result, Expected>>;
}

// Paginate config should not accept limit/offset
db.query.users.paginate(
  // @ts-expect-error - limit is not allowed in paginate config
  { limit: 10 },
  { cursor: null, numItems: 5 }
);

// Paginate requires numItems when options provided
db.query.users.paginate(
  {},
  // @ts-expect-error - numItems is required
  { cursor: null }
);

// ============================================================================
// EXTRAS TYPE TESTS (runtime-computed fields)
// ============================================================================

// Extras appear on result rows with inferred types (function return types + constants)
{
  const result = await db.query.users.findMany({
    extras: {
      nameUpper: (row) => row.name.toUpperCase(),
      constant: 123,
    },
  });

  type Row = (typeof result)[number];

  Expect<Equal<Row['nameUpper'], string>>;
  Expect<Equal<Row['constant'], number>>;
}

// Extras are preserved even when columns selection is empty
{
  const result = await db.query.users.findMany({
    columns: {},
    extras: {
      nameUpper: (row) => row.name.toUpperCase(),
    },
  });

  type Row = (typeof result)[number];

  Expect<
    Equal<
      Row,
      {
        nameUpper: string;
      }
    >
  >;
}

// Nested extras work inside `with`
{
  const result = await db.query.users.findMany({
    with: {
      posts: {
        extras: {
          textLength: (row) => row.text.length,
        },
      },
    },
  });

  type Post = (typeof result)[number]['posts'][number];
  Expect<Equal<Post['textLength'], number>>;
}

// ============================================================================
// ANY-PROTECTION TESTS
// ============================================================================

// findMany row type should not be any
{
  const result = await db.query.users.findMany();
  type Row = (typeof result)[number];
  Expect<Not<IsAny<Row>>>;
}

// findFirst row type should not be any
{
  const result = await db.query.users.findFirst();
  type Row = NonNullable<typeof result>;
  Expect<Not<IsAny<Row>>>;
}

// paginate row type should not be any
{
  const result = await db.query.users.paginate(
    {},
    { cursor: null, numItems: 1 }
  );
  type Row = (typeof result)['page'][number];
  Expect<Not<IsAny<Row>>>;
}

export {};
