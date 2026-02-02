/**
 * Test the ORIGINAL issue: fields showing as `never` instead of actual types
 * This was the bug we were trying to fix
 */

import {
  convexTable,
  type InferSelectModel,
  number,
  text,
} from 'better-convex/orm';
import { type Equal, Expect } from './utils';

const users = convexTable('users', {
  name: text().notNull(),
  age: number(),
});

type User = InferSelectModel<typeof users>;

// The ORIGINAL BUG would make these `never`
// After the fix, they should be proper types
type NameType = User['name'];
type AgeType = User['age'];

// These tests verify the types are NOT never
type NameIsNotNever = Equal<NameType, never> extends true ? 'BROKEN' : 'WORKS';
type AgeIsNotNever = Equal<AgeType, never> extends true ? 'BROKEN' : 'WORKS';

const nameTest: NameIsNotNever = 'WORKS'; // Will error if name is never
const ageTest: AgeIsNotNever = 'WORKS'; // Will error if age is never

// Verify actual types are correct
const nameIsString: Equal<NameType, string> extends true ? 'CORRECT' : 'WRONG' =
  'CORRECT';
const ageIsNullable: Equal<AgeType, number | null> extends true
  ? 'CORRECT'
  : 'WRONG' = 'CORRECT';

export {};
