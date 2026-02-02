/**
 * M2 Relations Layer - Basic Validation Tests
 *
 * Tests core functionality:
 * - Relation definition with one() and many()
 * - Type inference
 * - Schema extraction
 * - Validation errors
 */

import {
  convexTable,
  type ExtractTablesWithRelations,
  extractRelationsConfig,
  type InferRelations,
  id,
  relations,
  text,
} from 'better-convex/orm';
import { describe, expect, it } from 'vitest';

describe('M2 Relations Layer', () => {
  describe('Relation Definition', () => {
    it('should create one() relation', () => {
      const users = convexTable('users', {
        name: text().notNull(),
        profileId: id('profiles').notNull(),
      });

      const profiles = convexTable('profiles', {
        bio: text().notNull(),
      });

      const usersRelations = relations(users, ({ one }) => ({
        profile: one(profiles, { fields: ['profileId'] }),
      }));

      expect(usersRelations).toBeDefined();
      expect(usersRelations.table).toBe(users);
    });

    it('should create many() relation', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        userId: id('users').notNull(),
      });

      const usersRelations = relations(users, ({ many }) => ({
        posts: many(posts),
      }));

      expect(usersRelations).toBeDefined();
      expect(usersRelations.table).toBe(users);
    });

    it('should create bidirectional relations', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        userId: id('users').notNull(),
      });

      const usersRelations = relations(users, ({ many }) => ({
        posts: many(posts),
      }));

      const postsRelations = relations(posts, ({ one }) => ({
        user: one(users, { fields: ['userId'] }),
      }));

      expect(usersRelations).toBeDefined();
      expect(postsRelations).toBeDefined();
    });
  });

  describe('Schema Extraction', () => {
    it('should extract simple one-to-many relation', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        userId: id('users').notNull(),
      });

      const usersRelations = relations(users, ({ many }) => ({
        posts: many(posts),
      }));

      const postsRelations = relations(posts, ({ one }) => ({
        user: one(users, { fields: ['userId'] }),
      }));

      const schema = {
        users,
        posts,
        usersRelations,
        postsRelations,
      };

      const edges = extractRelationsConfig(schema);

      expect(edges).toHaveLength(2);

      const postsEdge = edges.find((e) => e.edgeName === 'posts');
      expect(postsEdge).toMatchObject({
        sourceTable: 'users',
        edgeName: 'posts',
        targetTable: 'posts',
        cardinality: 'many',
        fieldName: 'postsId',
      });

      const userEdge = edges.find((e) => e.edgeName === 'user');
      expect(userEdge).toMatchObject({
        sourceTable: 'posts',
        edgeName: 'user',
        targetTable: 'users',
        cardinality: 'one',
        fieldName: 'userId',
      });
    });

    it('should detect inverse relations', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        userId: id('users').notNull(),
      });

      const usersRelations = relations(users, ({ many }) => ({
        posts: many(posts),
      }));

      const postsRelations = relations(posts, ({ one }) => ({
        user: one(users, { fields: ['userId'] }),
      }));

      const schema = {
        users,
        posts,
        usersRelations,
        postsRelations,
      };

      const edges = extractRelationsConfig(schema);

      const postsEdge = edges.find((e) => e.edgeName === 'posts');
      const userEdge = edges.find((e) => e.edgeName === 'user');

      expect(postsEdge?.inverseEdge).toBe(userEdge);
      expect(userEdge?.inverseEdge).toBe(postsEdge);
    });
  });

  describe('Validation', () => {
    it('should reject invalid relation names', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
      });

      expect(() => {
        relations(users, ({ many }) => ({
          'invalid-name': many(posts),
        }));
      }).toThrow(/Invalid relation name/);
    });

    it('should reject undefined target table', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        userId: id('users').notNull(),
      });

      const postsRelations = relations(posts, ({ one }) => ({
        user: one(users, { fields: ['userId'] }),
      }));

      const schema = {
        posts,
        postsRelations,
        // Missing 'users' table
      };

      expect(() => {
        extractRelationsConfig(schema);
      }).toThrow(/references undefined table/);
    });

    it('should reject missing field in table schema', () => {
      const users = convexTable('users', {
        name: text().notNull(),
        // Missing 'profileId' field
      });

      const profiles = convexTable('profiles', {
        bio: text().notNull(),
      });

      const usersRelations = relations(users, ({ one }) => ({
        profile: one(profiles, { fields: ['profileId'] }),
      }));

      const schema = {
        users,
        profiles,
        usersRelations,
      };

      expect(() => {
        extractRelationsConfig(schema);
      }).toThrow(/Field 'profileId' does not exist/);
    });

    it('should reject circular dependencies', () => {
      const users = convexTable('users', {
        name: text().notNull(),
        managerId: id('users').notNull(),
      });

      const usersRelations = relations(users, ({ one }) => ({
        manager: one(users, { fields: ['managerId'] }),
      }));

      const schema = {
        users,
        usersRelations,
      };

      // This should throw because of circular dependency
      expect(() => {
        extractRelationsConfig(schema);
      }).toThrow(/Circular dependency/);
    });
  });

  describe('Relation Name Disambiguation', () => {
    it('should use relationName for disambiguation', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        authorId: id('users').notNull(),
        editorId: id('users').notNull(),
      });

      const postsRelations = relations(posts, ({ one }) => ({
        author: one(users, {
          fields: ['authorId'],
          relationName: 'authored',
        }),
        editor: one(users, {
          fields: ['editorId'],
          relationName: 'edited',
        }),
      }));

      const usersRelations = relations(users, ({ many }) => ({
        authoredPosts: many(posts, { relationName: 'authored' }),
        editedPosts: many(posts, { relationName: 'edited' }),
      }));

      const schema = {
        users,
        posts,
        usersRelations,
        postsRelations,
      };

      const edges = extractRelationsConfig(schema);

      expect(edges).toHaveLength(4);

      const authorEdge = edges.find((e) => e.edgeName === 'author');
      const authoredPostsEdge = edges.find(
        (e) => e.edgeName === 'authoredPosts'
      );

      expect(authorEdge?.inverseEdge).toBe(authoredPostsEdge);
      expect(authoredPostsEdge?.inverseEdge).toBe(authorEdge);
    });
  });
});
