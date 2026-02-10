import { createOrm, defineRelations } from 'better-convex/orm';
import type {
  GenericDatabaseWriter,
  SchedulableFunctionReference,
} from 'convex/server';
import { users } from './tables-rel';
import { type Equal, Expect, IsAny } from './utils';

const schemaConfig = defineRelations({ users });
const mockDb = {} as GenericDatabaseWriter<any>;

const orm = createOrm({ schema: schemaConfig });
const db = orm.db(mockDb);

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
