/**
 * Minimal type test to verify NotNull type brand inference
 * Following TDD approach - this should pass if our types are correct
 */

import { boolean, id, integer, text } from 'better-convex/orm';
import { type Equal, Expect } from './utils';

// Test 1: Basic NotNull inference on phantom _ property
{
  const col = text().notNull();

  type UnderscoreType = (typeof col)['_'];
  type NotNullValue = UnderscoreType['notNull'];
  type DataValue = UnderscoreType['data'];

  // Should infer notNull as literal true
  Expect<Equal<NotNullValue, true>>;

  // Should infer data as string
  Expect<Equal<DataValue, string>>;
}

// Test 2: Nullable column (without .notNull())
{
  const col = text();

  type NotNullValue = (typeof col)['_']['notNull'];

  // Should infer notNull as boolean (not yet determined)
  Expect<Equal<NotNullValue, boolean>>;
}

// Test 3: Integer column with NotNull
{
  const col = integer().notNull();

  type NotNullValue = (typeof col)['_']['notNull'];
  type DataValue = (typeof col)['_']['data'];

  Expect<Equal<NotNullValue, true>>;
  Expect<Equal<DataValue, number>>;
}

// Test 4: Boolean column with NotNull
{
  const col = boolean().notNull();

  type NotNullValue = (typeof col)['_']['notNull'];
  type DataValue = (typeof col)['_']['data'];

  Expect<Equal<NotNullValue, true>>;
  Expect<Equal<DataValue, boolean>>;
}

// Test 5: ID column with NotNull
{
  const col = id('users').notNull();

  type NotNullValue = (typeof col)['_']['notNull'];

  Expect<Equal<NotNullValue, true>>;
}

// Test 6: Chained methods (notNull + default)
{
  const col = text().notNull().default('hello');

  type NotNullValue = (typeof col)['_']['notNull'];
  type HasDefaultValue = (typeof col)['_']['hasDefault'];

  Expect<Equal<NotNullValue, true>>;
  Expect<Equal<HasDefaultValue, true>>;
}

// Export to avoid "unused" warnings
export {};
