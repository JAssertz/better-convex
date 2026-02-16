import {
  createOrm,
  defineRelations,
  type GenericOrm,
  type GenericOrmCtx,
  type OrmReader,
  type OrmWriter,
} from 'better-convex/orm';
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  SchedulableFunctionReference,
} from 'convex/server';
import { users } from './tables-rel';
import { type Equal, Expect, IsAny } from './utils';

const schemaConfig = defineRelations({ users });
const mockDb = {} as GenericDatabaseWriter<any>;

const orm = createOrm({ schema: schemaConfig });
const db = orm.db(mockDb);

{
  const _writer: OrmWriter<typeof schemaConfig> = db;
  _writer.skipRules.query.users.findMany;
  // @ts-expect-error - skipRules does not itself have skipRules
  _writer.skipRules.skipRules;
}

{
  const mockReader = {} as GenericDatabaseReader<any>;
  const dbReader = orm.db(mockReader);
  const _reader: OrmReader<typeof schemaConfig> = dbReader;
  _reader.skipRules.query.users.findMany;
  // @ts-expect-error - skipRules does not itself have skipRules
  _reader.skipRules.skipRules;
  // @ts-expect-error - insert is not available on a reader db
  _reader.insert;
}

type ReaderCtx = { db: GenericDatabaseReader<any> };
type WriterCtx = { db: GenericDatabaseWriter<any> };
type ReaderOrm = GenericOrm<ReaderCtx, typeof schemaConfig>;
type WriterOrm = GenericOrm<WriterCtx, typeof schemaConfig>;
type ReaderOrWriterOrm = GenericOrm<ReaderCtx | WriterCtx, typeof schemaConfig>;
type ReaderWithOrmCtx = GenericOrmCtx<ReaderCtx, typeof schemaConfig>;
type WriterWithOrmCtx = GenericOrmCtx<WriterCtx, typeof schemaConfig>;
type ReaderOrWriterWithOrmCtx = GenericOrmCtx<
  ReaderCtx | WriterCtx,
  typeof schemaConfig
>;

Expect<Equal<ReaderOrm, OrmReader<typeof schemaConfig>>>;
Expect<Equal<WriterOrm, OrmWriter<typeof schemaConfig>>>;
Expect<
  Equal<
    ReaderOrWriterOrm,
    OrmReader<typeof schemaConfig> | OrmWriter<typeof schemaConfig>
  >
>;
Expect<Equal<ReaderWithOrmCtx['orm'], OrmReader<typeof schemaConfig>>>;
Expect<Equal<WriterWithOrmCtx['orm'], OrmWriter<typeof schemaConfig>>>;
Expect<
  Equal<
    ReaderOrWriterWithOrmCtx['orm'],
    OrmReader<typeof schemaConfig> | OrmWriter<typeof schemaConfig>
  >
>;

// ORM db intentionally does NOT expose raw Convex db methods. It only exposes:
// - `query.*` builders
// - `insert/update/delete(table)` ORM mutation builders
// - `system` passthrough for system tables
// (Raw writes bypass constraints/defaults/RLS.)
// @ts-expect-error - raw Convex get is not exposed on ORM db
db.get;
// @ts-expect-error - raw Convex patch is not exposed on ORM db
db.patch;
// @ts-expect-error - raw Convex replace is not exposed on ORM db
db.replace;
// @ts-expect-error - insert expects a ConvexTable, not a tableName string
db.insert('users');

{
  const result = await db.query.users.findMany({ limit: 1 });
  Expect<Equal<false, IsAny<typeof result>>>;
}

// Raw Convex db methods should NOT be exposed on `ctx.orm`.
// (They bypass ORM runtime checks like constraints/defaults/RLS.)
// @ts-expect-error - patch is a raw Convex writer method (not exposed)
db.patch;
// @ts-expect-error - get is a raw Convex reader method (not exposed)
db.get;
// @ts-expect-error - raw insert by table name is not exposed (use insert(users).values(...))
db.insert('users', { name: 'Ada' });

// @ts-expect-error - api() is only available when ormFunctions are provided
orm.api();

const schedulable = {} as SchedulableFunctionReference;

const ormWithScheduling = createOrm({
  schema: schemaConfig,
  ormFunctions: {
    scheduledMutationBatch: schedulable,
    scheduledDelete: schedulable,
  },
});

const api = ormWithScheduling.api();
api.scheduledMutationBatch;
api.scheduledDelete;
