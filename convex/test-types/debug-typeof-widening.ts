/**
 * Debug: Is typeof widening the NotNull brand?
 */

import { text } from 'better-convex/orm';
import { type Equal, Expect } from './utils';

// Direct column
const col1 = text().notNull();
type Col1Type = typeof col1;
type Col1NotNull = Col1Type['_']['notNull'];

// This works
Expect<Equal<Col1NotNull, true>>;

// Column in object - what is the type?
const columns1 = {
  name: text().notNull(),
};

type Columns1Type = typeof columns1;
type Name1Type = Columns1Type['name'];
type Name1NotNull = Name1Type['_']['notNull'];

// Does this work?
Expect<Equal<Name1NotNull, true>>;

// Now test with Record type constraint
type ColumnsRecord = Record<
  string,
  import('better-convex/orm').ColumnBuilder<any, any, any>
>;

const columns2: ColumnsRecord = {
  name: text().notNull(),
};

type Columns2Type = typeof columns2;
type Name2Type = Columns2Type['name'];
type Name2NotNull = Name2Type['_']['notNull'];

// Does this still work with Record constraint?
Expect<Equal<Name2NotNull, true>>;

export {};
