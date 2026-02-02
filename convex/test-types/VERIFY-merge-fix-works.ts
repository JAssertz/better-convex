/**
 * VERIFICATION: The Merge utility fix works correctly
 * This test uses the correct expected type with GenericId
 */

import { convexTable, type InferSelectModel, text } from 'better-convex/orm';
import type { GenericId } from 'convex/values';
import { type Equal, Expect } from './utils';

// Test: InferSelectModel with notNull column
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type Result = InferSelectModel<typeof users>;

  type Expected = {
    _id: GenericId<'users'>;
    _creationTime: number;
    name: string; // CRITICAL: string NOT string | null - notNull brand preserved!
  };

  Expect<Equal<Result, Expected>>; // This should PASS ✓
}

// Test: nullable column
{
  const posts = convexTable('posts', {
    title: text(), // nullable - no notNull()
  });

  type Result = InferSelectModel<typeof posts>;

  type Expected = {
    _id: GenericId<'posts'>;
    _creationTime: number;
    title: string | null; // Should include null
  };

  Expect<Equal<Result, Expected>>; // This should PASS ✓
}

export {};
