import {
  boolean,
  convexTable,
  id,
  integer,
  relations,
  text,
} from 'better-convex/orm';

// Test schema following Drizzle pattern with builders
export const users = convexTable('users', {
  name: text().notNull(),
  email: text().notNull(),
  age: integer(),
  cityId: id('cities').notNull(),
  homeCityId: id('cities'),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  city: one(cities, { fields: ['cityId'] }),
  homeCity: one(cities, { fields: ['homeCityId'] }),
  posts: many(posts),
  comments: many(comments),
}));

export const cities = convexTable('cities', {
  name: text().notNull(),
});

export const citiesRelations = relations(cities, ({ many }) => ({
  users: many(users),
}));

export const posts = convexTable('posts', {
  title: text().notNull(),
  content: text().notNull(),
  authorId: id('users'),
  published: boolean(),
});

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: ['authorId'] }),
  comments: many(comments),
}));

export const comments = convexTable('comments', {
  postId: id('posts').notNull(),
  authorId: id('users'),
  text: text().notNull(),
});

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, { fields: ['postId'] }),
  author: one(users, { fields: ['authorId'] }),
}));

export const books = convexTable('books', {
  name: text().notNull(),
});

export const booksRelations = relations(books, ({ many }) => ({
  authors: many(bookAuthors),
}));

export const bookAuthors = convexTable('bookAuthors', {
  bookId: id('books').notNull(),
  authorId: id('users').notNull(),
  role: text().notNull(),
});

export const bookAuthorsRelations = relations(bookAuthors, ({ one }) => ({
  book: one(books, { fields: ['bookId'] }),
  author: one(users, { fields: ['authorId'] }),
}));

// Self-referential relations
export const node = convexTable('node', {
  parentId: id('node'),
  leftId: id('node'),
  rightId: id('node'),
});

export const nodeRelations = relations(node, ({ one }) => ({
  parent: one(node, { fields: ['parentId'] }),
  left: one(node, { fields: ['leftId'] }),
  right: one(node, { fields: ['rightId'] }),
}));
