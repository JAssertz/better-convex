import {
  bigint,
  boolean,
  convexTable,
  defineRelations,
  defineSchema,
  id,
  index,
  integer,
  searchIndex,
  text,
  vector,
  vectorIndex,
} from 'better-convex/orm';

// ============================================================================
// Better Convex ORM Schema (Drizzle-style)
// ============================================================================

export const users = convexTable(
  'users',
  {
    name: text().notNull(),
    email: text().notNull(),
    height: integer(),
    age: integer(),
    status: text(),
    role: text(),
    deletedAt: integer(),
    cityId: id('cities'),
    homeCityId: id('cities'),
  },
  (t) => [
    index('by_city').on(t.cityId),
    index('by_name').on(t.name),
    index('by_email').on(t.email),
    index('by_status').on(t.status),
    index('by_age').on(t.age),
    index('by_deleted_at').on(t.deletedAt),
  ]
);

export const cities = convexTable('cities', {
  name: text().notNull(),
});

export const posts = convexTable(
  'posts',
  {
    text: text().notNull(),
    numLikes: integer().notNull(),
    type: text().notNull(),
    title: text(),
    content: text(),
    published: boolean(),
    authorId: id('users'),
    createdAt: integer(),
    embedding: vector(1536),
  },
  (t) => [
    index('by_author').on(t.authorId),
    index('by_published').on(t.published),
    index('by_created_at').on(t.createdAt),
    index('by_title').on(t.title),
    index('numLikesAndType').on(t.type, t.numLikes),
    searchIndex('text_search').on(t.text).filter(t.type),
    vectorIndex('embedding_vec')
      .on(t.embedding)
      .dimensions(1536)
      .filter(t.type),
  ]
);

export const comments = convexTable(
  'comments',
  {
    postId: id('posts').notNull(),
    authorId: id('users'),
    text: text().notNull(),
  },
  (t) => [index('by_post').on(t.postId), index('by_author').on(t.authorId)]
);

export const books = convexTable('books', {
  name: text().notNull(),
});

export const bookAuthors = convexTable(
  'bookAuthors',
  {
    bookId: id('books').notNull(),
    authorId: id('users').notNull(),
    role: text().notNull(),
  },
  (t) => [index('by_book').on(t.bookId), index('by_author').on(t.authorId)]
);

export const node = convexTable('node', {
  parentId: id('node'),
  leftId: id('node'),
  rightId: id('node'),
});

export const metrics = convexTable(
  'metrics',
  {
    total: bigint().notNull(),
    ratio: integer(),
    active: boolean().notNull(),
    ownerId: id('users'),
  },
  (t) => [index('by_owner').on(t.ownerId)]
);

export const tables = {
  users,
  cities,
  posts,
  comments,
  books,
  bookAuthors,
  node,
  metrics,
};

export default defineSchema(tables, {
  defaults: {
    defaultLimit: 1000,
    mutationMaxRows: 10000,
  },
});

// ============================================================================
// ORM Relations Config
// ============================================================================

export const relations = defineRelations(tables, (r) => ({
  users: {
    city: r.one.cities({
      from: r.users.cityId,
      to: r.cities._id,
      alias: 'UsersInCity',
    }),
    homeCity: r.one.cities({
      from: r.users.homeCityId,
      to: r.cities._id,
    }),
    posts: r.many.posts({
      from: r.users._id,
      to: r.posts.authorId,
    }),
    comments: r.many.comments({
      from: r.users._id,
      to: r.comments.authorId,
    }),
  },
  cities: {
    users: r.many.users({
      from: r.cities._id,
      to: r.users.cityId,
      alias: 'UsersInCity',
    }),
  },
  posts: {
    author: r.one.users({
      from: r.posts.authorId,
      to: r.users._id,
    }),
    comments: r.many.comments({
      from: r.posts._id,
      to: r.comments.postId,
    }),
  },
  comments: {
    post: r.one.posts({
      from: r.comments.postId,
      to: r.posts._id,
    }),
    author: r.one.users({
      from: r.comments.authorId,
      to: r.users._id,
    }),
  },
  books: {
    authors: r.many.users({
      from: r.books._id.through(r.bookAuthors.bookId),
      to: r.users._id.through(r.bookAuthors.authorId),
    }),
  },
  bookAuthors: {
    book: r.one.books({
      from: r.bookAuthors.bookId,
      to: r.books._id,
    }),
    author: r.one.users({
      from: r.bookAuthors.authorId,
      to: r.users._id,
    }),
  },
}));
