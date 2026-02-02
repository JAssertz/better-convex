/**
 * Debug what typeof columns actually gives us
 */

import { text } from 'better-convex/orm';

const columns = {
  name: text().notNull(),
};

// What is the type of columns?
type ColumnsType = typeof columns;

// What is the type of columns.name?
type NameColumnType = typeof columns.name;

// What is columns.name['_']?
type NameUnderscoreType = NameColumnType['_'];

// What is columns.name['_']['notNull']?
type NameNotNullType = NameUnderscoreType['notNull'];

// What is columns.name['_']['data']?
type NameDataType = NameUnderscoreType['data'];

// Debug: Check if notNull extends true
type IsNotNullTrue = NameNotNullType extends true ? 'YES' : 'NO';

// Export types to see them in IDE
export type {
  ColumnsType,
  NameColumnType,
  NameUnderscoreType,
  NameNotNullType,
  NameDataType,
  IsNotNullTrue,
};
