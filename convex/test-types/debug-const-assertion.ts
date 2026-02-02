/**
 * Debug: Does const assertion help?
 */

import { text } from 'better-convex/orm';
import { type Equal, Expect } from './utils';

// Test 1: Direct column
{
  const col = text().notNull();
  type NotNullValue = (typeof col)['_']['notNull'];

  // This works - we proved it earlier
  Expect<Equal<NotNullValue, true>>;
}

// Test 2: Column in object (no const assertion)
{
  const columns = {
    name: text().notNull(),
  };

  type NotNullValue = (typeof columns)['name']['_']['notNull'];

  // Does this work?
  Expect<Equal<NotNullValue, true>>;
}

// Test 3: Column in object (with const assertion)
{
  const columns = {
    name: text().notNull(),
  } as const;

  type NotNullValue = (typeof columns)['name']['_']['notNull'];

  // Does this work?
  Expect<Equal<NotNullValue, true>>;
}

export {};
