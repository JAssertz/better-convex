/* biome-ignore-all lint: compile-time type assertions only */

import type { InferInsertModel, InferSelectModel } from 'better-convex/orm';
import type { todosTable, userTable } from '../functions/schema';
import type { Insert, Select, TableName } from './types';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T,
>() => T extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

type _TableNameHasUser = Expect<Equal<'user' extends TableName ? true : false, true>>;
type _TableNameHasTodos = Expect<
  Equal<'todos' extends TableName ? true : false, true>
>;

type _SelectUserMatches = Expect<
  Equal<Select<'user'>, InferSelectModel<typeof userTable>>
>;
type _InsertUserMatches = Expect<
  Equal<Insert<'user'>, InferInsertModel<typeof userTable>>
>;

type _SelectTodosMatches = Expect<
  Equal<Select<'todos'>, InferSelectModel<typeof todosTable>>
>;
type _InsertTodosMatches = Expect<
  Equal<Insert<'todos'>, InferInsertModel<typeof todosTable>>
>;

// @ts-expect-error invalid table name must be rejected
type _InvalidTableSelect = Select<'invalid_table_name'>;
