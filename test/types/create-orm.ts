import { buildSchema, createOrm } from 'better-convex/orm';
import type {
  GenericDatabaseWriter,
  SchedulableFunctionReference,
} from 'convex/server';
import { users } from './tables-rel';
import { type Equal, Expect, IsAny } from './utils';

const schemaConfig = buildSchema({ users });
const mockDb = {} as GenericDatabaseWriter<any>;

const orm = createOrm({ schema: schemaConfig });
const db = orm.db(mockDb);

{
  const result = await db.query.users.findMany({ limit: 1 });
  Expect<Equal<false, IsAny<typeof result>>>;
}

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
