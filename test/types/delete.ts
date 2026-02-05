import {
  buildSchema,
  createDatabase,
  eq,
  extractRelationsConfig,
} from 'better-convex/orm';
import type { GenericDatabaseWriter } from 'convex/server';
import { UserRow } from './fixtures/types';
import { users } from './tables-rel';
import { type Equal, Expect, IsAny, Not } from './utils';

const schemaConfig = buildSchema({ users });
const edgeMetadata = extractRelationsConfig(schemaConfig);
const mockDb = {} as GenericDatabaseWriter<any>;
const db = createDatabase(mockDb, schemaConfig, edgeMetadata);

// ============================================================================
// DELETE TYPE TESTS
// ============================================================================

// Test 1: delete without returning
{
  const result = await db.delete(users);

  Expect<Equal<undefined, typeof result>>;
}

// Test 2: delete with where clause
{
  const result = await db.delete(users).where(eq(users.name, 'Alice'));

  Expect<Equal<undefined, typeof result>>;
}

// Test 3: delete returning all
{
  const result = await db.delete(users).returning();

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4: delete returning partial
{
  const result = await db.delete(users).returning({
    name: users.name,
  });

  type Expected = Array<{
    name: string;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 5: returning() cannot be called twice
{
  db.delete(users)
    .returning()
    // @ts-expect-error - returning already called
    .returning();
}

// ============================================================================
// NEGATIVE TYPE TESTS
// ============================================================================

// where() should enforce column value types
{
  db.delete(users)
    // @ts-expect-error - age expects number
    .where(eq(users.age, 'not-a-number'));
}

// where() requires an argument
{
  db.delete(users)
    // @ts-expect-error - where() requires a filter expression
    .where();
}

// returning selection must use column builders
{
  db.delete(users).returning({
    name: users.name,
    // @ts-expect-error - returning selection must be a column builder
    invalid: 'nope',
  });
}

// ============================================================================
// ANY-PROTECTION TESTS
// ============================================================================

// Returning row type should not be any
{
  const result = await db.delete(users).returning();
  type Row = (typeof result)[number];
  Expect<Not<IsAny<Row>>>;
}

export {};
