/**
 * Test InferModelFromColumns with actual table columns
 */

import { convexTable, id, integer, text } from 'better-convex/orm';
import { type Equal, Expect } from './utils';

// Inline InferModelFromColumns for testing
type ColumnBuilder = import('better-convex/orm').ColumnBuilder<any, any, any>;

type BuilderToType<TBuilder extends ColumnBuilder> =
  TBuilder['_']['notNull'] extends true
    ? TBuilder['_']['data']
    : TBuilder['_']['data'] | null;

type ColumnToType<V> = V extends ColumnBuilder ? BuilderToType<V> : never;

type ColumnsToType<T> =
  T extends Record<string, ColumnBuilder>
    ? {
        [K in keyof T]: ColumnToType<T[K]>;
      }
    : never;

type InferModelFromColumns<TColumns> =
  TColumns extends Record<string, ColumnBuilder>
    ? {
        _id: string;
        _creationTime: number;
      } & ColumnsToType<TColumns>
    : never;

// Test with actual columns from tables-rel.ts
{
  const columns = {
    name: text().notNull(),
    email: text().notNull(),
    age: integer(),
    cityId: id('cities').notNull(),
    homeCityId: id('cities'),
  };

  type Result = InferModelFromColumns<typeof columns>;

  type Expected = {
    _id: string;
    _creationTime: number;
    name: string; // Should be string (notNull)
    email: string; // Should be string (notNull)
    age: number | null; // Should be number | null (nullable)
    cityId: string; // Should be string (notNull ID)
    homeCityId: string | null; // Should be string | null (nullable ID)
  };

  Expect<Equal<Result, Expected>>;
}

// Test with convexTable
{
  const users = convexTable('users', {
    name: text().notNull(),
    email: text().notNull(),
  });

  type Columns = (typeof users)['_']['columns'];
  type Result = InferModelFromColumns<Columns>;

  type Expected = {
    _id: string;
    _creationTime: number;
    name: string;
    email: string;
  };

  Expect<Equal<Result, Expected>>;
}

export {};
