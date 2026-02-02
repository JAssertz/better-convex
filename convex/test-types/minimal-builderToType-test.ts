/**
 * Test BuilderToType type extraction
 * This is what ColumnToType uses internally
 */

import type { ColumnBuilder } from 'better-convex/orm';
import { integer, text } from 'better-convex/orm';
import { type Equal, Expect } from './utils';

// Inline BuilderToType from types.ts
type BuilderToType<TBuilder extends ColumnBuilder<any, any, any>> =
  TBuilder['_']['notNull'] extends true
    ? TBuilder['_']['data']
    : TBuilder['_']['data'] | null;

// Test 1: NotNull column should extract to just the data type
{
  const col = text().notNull();
  type Result = BuilderToType<typeof col>;

  // Should be string, NOT string | null
  Expect<Equal<Result, string>>;
}

// Test 2: Nullable column should extract to data | null
{
  const col = text();
  type Result = BuilderToType<typeof col>;

  // Should be string | null
  Expect<Equal<Result, string | null>>;
}

// Test 3: Integer notNull
{
  const col = integer().notNull();
  type Result = BuilderToType<typeof col>;

  Expect<Equal<Result, number>>;
}

// Test 4: Integer nullable
{
  const col = integer();
  type Result = BuilderToType<typeof col>;

  Expect<Equal<Result, number | null>>;
}

export {};
