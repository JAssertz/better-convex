import {
  buildSchema,
  createDatabase,
  extractRelationsConfig,
} from 'better-convex/orm';
import type { GenericDatabaseReader } from 'convex/server';
import * as schema from './tables-rel';
import { type Equal, Expect } from './utils';

// Build schema following Better Convex pattern
const rawSchema = {
  users: schema.users,
  cities: schema.cities,
  posts: schema.posts,
  comments: schema.comments,
  books: schema.books,
  bookAuthors: schema.bookAuthors,
  node: schema.node,
  usersRelations: schema.usersRelations,
  citiesRelations: schema.citiesRelations,
  postsRelations: schema.postsRelations,
  commentsRelations: schema.commentsRelations,
  booksRelations: schema.booksRelations,
  bookAuthorsRelations: schema.bookAuthorsRelations,
  nodeRelations: schema.nodeRelations,
};

const schemaConfig = buildSchema(rawSchema);
const edgeMetadata = extractRelationsConfig(rawSchema);

// Mock database reader for type testing
const mockDb = {} as GenericDatabaseReader<any>;
const db = createDatabase(mockDb, schemaConfig, edgeMetadata);

// Test 1: Basic findMany with relations
{
  const result = await db.query.users.findMany({
    with: {
      posts: true,
    },
  });

  type Expected = Array<{
    _id: string;
    _creationTime: number;
    name: string;
    email: string;
    age: number | undefined;
    cityId: string;
    homeCityId: string | undefined;
    posts: Array<{
      _id: string;
      _creationTime: number;
      title: string;
      content: string;
      authorId: string | undefined;
      published: boolean | undefined;
    }>;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 2: Nested relations
{
  const result = await db.query.users.findMany({
    with: {
      posts: {
        with: {
          comments: true,
        },
      },
    },
  });

  type Expected = Array<{
    _id: string;
    _creationTime: number;
    name: string;
    email: string;
    age: number | undefined;
    cityId: string;
    homeCityId: string | undefined;
    posts: Array<{
      _id: string;
      _creationTime: number;
      title: string;
      content: string;
      authorId: string | undefined;
      published: boolean | undefined;
      comments: Array<{
        _id: string;
        _creationTime: number;
        postId: string;
        authorId: string | undefined;
        text: string;
      }>;
    }>;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 3: Column selection with relations
{
  const result = await db.query.users.findMany({
    columns: {
      name: true,
      email: true,
    },
    with: {
      posts: {
        columns: {
          title: true,
        },
      },
    },
  });

  type Expected = Array<{
    name: string;
    email: string;
    posts: Array<{
      title: string;
    }>;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 4: One relation (nullable)
{
  const result = await db.query.posts.findMany({
    with: {
      author: true,
    },
  });

  type Expected = Array<{
    _id: string;
    _creationTime: number;
    title: string;
    content: string;
    authorId: string | undefined;
    published: boolean | undefined;
    author: {
      _id: string;
      _creationTime: number;
      name: string;
      email: string;
      age: number | undefined;
      cityId: string;
      homeCityId: string | undefined;
    } | null;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 5: Self-referential relations
{
  const result = await db.query.node.findMany({
    with: {
      parent: true,
      left: true,
      right: true,
    },
  });

  type NodeType = {
    _id: string;
    _creationTime: number;
    parentId: string | undefined;
    leftId: string | undefined;
    rightId: string | undefined;
  };

  type Expected = Array<
    NodeType & {
      parent: NodeType | null;
      left: NodeType | null;
      right: NodeType | null;
    }
  >;

  Expect<Equal<Expected, typeof result>>;
}

// Test 6: Many-to-many through join table
{
  const result = await db.query.books.findMany({
    with: {
      authors: {
        with: {
          author: true,
        },
      },
    },
  });

  type Expected = Array<{
    _id: string;
    _creationTime: number;
    name: string;
    authors: Array<{
      _id: string;
      _creationTime: number;
      bookId: string;
      authorId: string;
      role: string;
      author: {
        _id: string;
        _creationTime: number;
        name: string;
        email: string;
        age: number | undefined;
        cityId: string;
        homeCityId: string | undefined;
      } | null;
    }>;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 7: findFirst returns single item or null
{
  const result = await db.query.users.findFirst({
    with: {
      posts: true,
    },
  });

  type Expected = {
    _id: string;
    _creationTime: number;
    name: string;
    email: string;
    age: number | undefined;
    cityId: string;
    homeCityId: string | undefined;
    posts: Array<{
      _id: string;
      _creationTime: number;
      title: string;
      content: string;
      authorId: string | undefined;
      published: boolean | undefined;
    }>;
  } | null;

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// NEGATIVE TYPE TESTS - Invalid usage should error
// ============================================================================

// @ts-expect-error - Invalid relation name
db.query.users.findMany({
  with: {
    invalidRelation: true,
  },
});

// @ts-expect-error - Invalid column name in selection
db.query.users.findMany({
  columns: {
    invalidColumn: true,
  },
});

// @ts-expect-error - Invalid nested relation
db.query.users.findMany({
  with: {
    posts: {
      with: {
        invalidNestedRelation: true,
      },
    },
  },
});

// @ts-expect-error - Cannot use where/orderBy/limit on findFirst
db.query.users.findFirst({
  where: (users, { eq }) => eq(users.name, 'test'),
});

// @ts-expect-error - Cannot use where/orderBy/limit on findFirst
db.query.users.findFirst({
  orderBy: (users, { asc }) => asc(users.name),
});

// @ts-expect-error - Cannot use where/orderBy/limit on findFirst
db.query.users.findFirst({
  limit: 10,
});
