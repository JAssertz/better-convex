import {
  type CreateOrmDbOptions,
  convexTable,
  type DatabaseWithMutations,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  foreignKey,
  id,
  index,
  number,
  scheduledMutationBatchFactory,
  text,
} from 'better-convex/orm';
import type {
  GenericDatabaseWriter,
  SchedulableFunctionReference,
} from 'convex/server';
import { describe, expect, it, vi } from 'vitest';
import { withOrmCtx } from '../setup.testing';

const users = convexTable(
  'fk_action_users',
  {
    slug: text().notNull(),
    deletionTime: number(),
  },
  (t) => [index('by_slug').on(t.slug)]
);

const membershipsCascade = convexTable(
  'fk_action_memberships_cascade',
  {
    userId: id('fk_action_users').notNull(),
  },
  (t) => [
    index('by_user').on(t.userId),
    foreignKey({ columns: [t.userId], foreignColumns: [users._id] }).onDelete(
      'cascade'
    ),
  ]
);

const membershipsRestrict = convexTable(
  'fk_action_memberships_restrict',
  {
    userId: id('fk_action_users').notNull(),
  },
  (t) => [
    index('by_user').on(t.userId),
    foreignKey({ columns: [t.userId], foreignColumns: [users._id] }).onDelete(
      'restrict'
    ),
  ]
);

const membershipsSetNull = convexTable(
  'fk_action_memberships_null',
  {
    userId: id('fk_action_users'),
  },
  (t) => [
    index('by_user').on(t.userId),
    foreignKey({ columns: [t.userId], foreignColumns: [users._id] }).onDelete(
      'set null'
    ),
  ]
);

const membershipsSetDefault = convexTable(
  'fk_action_memberships_default',
  {
    userSlug: text().default('unknown'),
  },
  (t) => [
    index('by_user_slug').on(t.userSlug),
    foreignKey({
      columns: [t.userSlug],
      foreignColumns: [users.slug],
    }).onDelete('set default'),
  ]
);

const membershipsUpdateCascade = convexTable(
  'fk_action_memberships_update_cascade',
  {
    userSlug: text().notNull(),
  },
  (t) => [
    index('by_user_slug').on(t.userSlug),
    foreignKey({
      columns: [t.userSlug],
      foreignColumns: [users.slug],
    }).onUpdate('cascade'),
  ]
);

const membershipsUpdateRestrict = convexTable(
  'fk_action_memberships_update_restrict',
  {
    userSlug: text().notNull(),
  },
  (t) => [
    index('by_user_slug').on(t.userSlug),
    foreignKey({
      columns: [t.userSlug],
      foreignColumns: [users.slug],
    }).onUpdate('restrict'),
  ]
);

const membershipsNoIndex = convexTable(
  'fk_action_memberships_no_index',
  {
    userId: id('fk_action_users').notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.userId], foreignColumns: [users._id] }).onDelete(
      'cascade'
    ),
  ]
);

const baseSchemaTables = {
  fk_action_users: users,
  fk_action_memberships_cascade: membershipsCascade,
  fk_action_memberships_restrict: membershipsRestrict,
  fk_action_memberships_null: membershipsSetNull,
  fk_action_memberships_default: membershipsSetDefault,
  fk_action_memberships_update_cascade: membershipsUpdateCascade,
  fk_action_memberships_update_restrict: membershipsUpdateRestrict,
};

const createSchemaArtifacts = (
  options?: Parameters<typeof defineSchema>[1]
) => {
  const tables = { ...baseSchemaTables };
  const schema = defineSchema(tables, options);
  const relations = defineRelations(tables);
  const edges = extractRelationsConfig(relations);
  return { schema, relations, edges };
};

const { schema, relations, edges } = createSchemaArtifacts();
const {
  schema: cappedSchema,
  relations: cappedRelations,
  edges: cappedEdges,
} = createSchemaArtifacts({
  defaults: { mutationBatchSize: 1, mutationMaxRows: 2 },
});
const {
  schema: relaxedCapSchema,
  relations: relaxedCapRelations,
  edges: relaxedCapEdges,
} = createSchemaArtifacts({
  defaults: { mutationBatchSize: 1, mutationMaxRows: 5 },
});
const {
  schema: asyncCappedSchema,
  relations: asyncCappedRelations,
  edges: asyncCappedEdges,
} = createSchemaArtifacts({
  defaults: {
    mutationBatchSize: 1,
    mutationMaxRows: 2,
    mutationExecutionMode: 'async',
  },
});

const withCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof relations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmDbOptions
) =>
  withOrmCtx(
    schema,
    relations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const withCappedCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof cappedRelations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmDbOptions
) =>
  withOrmCtx(
    cappedSchema,
    cappedRelations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const withRelaxedCapCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof relaxedCapRelations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmDbOptions
) =>
  withOrmCtx(
    relaxedCapSchema,
    relaxedCapRelations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

const withAsyncCappedCtx = async <T>(
  fn: (ctx: {
    orm: DatabaseWithMutations<typeof asyncCappedRelations>;
    db: GenericDatabaseWriter<any>;
  }) => Promise<T>,
  options?: CreateOrmDbOptions
) =>
  withOrmCtx(
    asyncCappedSchema,
    asyncCappedRelations,
    async ({ orm, db }) => fn({ orm, db }),
    options
  );

describe('foreign key actions', () => {
  it('cascades deletes', async () =>
    withCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      const [member] = await orm
        .insert(membershipsCascade)
        .values({ userId: user._id })
        .returning();

      await orm.delete(users).where(eq(users._id, user._id)).execute();

      expect(await db.get(member._id)).toBeNull();
    }));

  it('restricts deletes', async () =>
    withCtx(async ({ orm }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .insert(membershipsRestrict)
        .values({ userId: user._id })
        .returning();

      await expect(
        orm.delete(users).where(eq(users._id, user._id)).execute()
      ).rejects.toThrow(/restrict/i);
    }));

  it('sets null on delete', async () =>
    withCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      const [member] = await orm
        .insert(membershipsSetNull)
        .values({ userId: user._id })
        .returning();

      await orm.delete(users).where(eq(users._id, user._id)).execute();

      const updated = await db.get(member._id);
      expect(updated?.userId ?? null).toBeNull();
    }));

  it('sets default on delete', async () =>
    withCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      const [member] = await orm
        .insert(membershipsSetDefault)
        .values({ userSlug: 'ada' })
        .returning();

      await orm.delete(users).where(eq(users._id, user._id)).execute();

      const updated = await db.get(member._id);
      expect(updated?.userSlug).toBe('unknown');
    }));

  it('cascades updates', async () =>
    withCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      const [member] = await orm
        .insert(membershipsUpdateCascade)
        .values({ userSlug: 'ada' })
        .returning();

      await orm
        .update(users)
        .set({ slug: 'ada-lovelace' })
        .where(eq(users._id, user._id))
        .execute();

      const updated = await db.get(member._id);
      expect(updated?.userSlug).toBe('ada-lovelace');
    }));

  it('restricts updates', async () =>
    withCtx(async ({ orm }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .insert(membershipsUpdateRestrict)
        .values({ userSlug: 'ada' })
        .returning();

      await expect(
        orm
          .update(users)
          .set({ slug: 'ada-lovelace' })
          .where(eq(users._id, user._id))
          .execute()
      ).rejects.toThrow(/restrict/i);
    }));

  it('requires indexes for cascading actions', async () => {
    const schemaWithNoIndex = defineSchema({
      ...baseSchemaTables,
      fk_action_memberships_no_index: membershipsNoIndex,
    });
    const relationsWithNoIndex = defineRelations({
      ...baseSchemaTables,
      fk_action_memberships_no_index: membershipsNoIndex,
    });
    const edgesWithNoIndex = extractRelationsConfig(relationsWithNoIndex);

    await withOrmCtx(
      schemaWithNoIndex,
      relationsWithNoIndex,
      async ({ orm }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .insert(membershipsNoIndex)
          .values({ userId: user._id })
          .returning();

        await expect(
          orm.delete(users).where(eq(users._id, user._id)).execute()
        ).rejects.toThrow(/index/i);
      }
    );
  });

  it('fails fast when cascade delete exceeds mutationMaxRows', async () =>
    withCappedCtx(async ({ orm }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .insert(membershipsCascade)
        .values([
          { userId: user._id },
          { userId: user._id },
          { userId: user._id },
        ]);

      await expect(
        orm.delete(users).where(eq(users._id, user._id)).execute()
      ).rejects.toThrow(/mutationMaxRows|matched more than|exceed/i);
    }));

  it('fails fast when cascade update exceeds mutationMaxRows', async () =>
    withCappedCtx(async ({ orm }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .insert(membershipsUpdateCascade)
        .values([
          { userSlug: 'ada' },
          { userSlug: 'ada' },
          { userSlug: 'ada' },
        ]);

      await expect(
        orm
          .update(users)
          .set({ slug: 'ada-lovelace' })
          .where(eq(users._id, user._id))
          .execute()
      ).rejects.toThrow(/mutationMaxRows|matched more than|exceed/i);
    }));

  it('allows larger cascade fan-out when mutationMaxRows is increased', async () =>
    withRelaxedCapCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm
        .insert(membershipsCascade)
        .values([
          { userId: user._id },
          { userId: user._id },
          { userId: user._id },
        ]);

      await orm.delete(users).where(eq(users._id, user._id)).execute();

      const remaining = await db
        .query('fk_action_memberships_cascade')
        .withIndex('by_user', (q) => q.eq('userId', user._id))
        .collect();
      expect(remaining).toHaveLength(0);
    }));

  it('async mode batches cascade delete fan-out beyond mutationMaxRows', async () => {
    const queue: any[] = [];
    const scheduler = {
      runAfter: vi.fn(async (_delay: number, _ref: any, args: any) => {
        queue.push(args);
        return 'scheduled';
      }),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;
    const worker = scheduledMutationBatchFactory(
      asyncCappedRelations,
      asyncCappedEdges,
      scheduledMutationBatch
    );

    await withAsyncCappedCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .insert(membershipsCascade)
          .values([
            { userId: user._id },
            { userId: user._id },
            { userId: user._id },
          ]);

        await orm.delete(users).where(eq(users._id, user._id)).execute();

        while (queue.length > 0) {
          const args = queue.shift();
          await worker({ db, scheduler: scheduler as any }, args);
        }

        expect(await db.get(user._id)).toBeNull();
        const remaining = await db
          .query('fk_action_memberships_cascade')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect();
        expect(remaining).toHaveLength(0);
      },
      { scheduler: scheduler as any, scheduledMutationBatch }
    );
  });

  it('async mode batches cascade update fan-out beyond mutationMaxRows', async () => {
    const queue: any[] = [];
    const scheduler = {
      runAfter: vi.fn(async (_delay: number, _ref: any, args: any) => {
        queue.push(args);
        return 'scheduled';
      }),
      runAt: vi.fn(async () => 'scheduled'),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledMutationBatch = {} as SchedulableFunctionReference;
    const worker = scheduledMutationBatchFactory(
      asyncCappedRelations,
      asyncCappedEdges,
      scheduledMutationBatch
    );

    await withAsyncCappedCtx(
      async ({ orm, db }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .insert(membershipsUpdateCascade)
          .values([
            { userSlug: 'ada' },
            { userSlug: 'ada' },
            { userSlug: 'ada' },
          ]);

        await orm
          .update(users)
          .set({ slug: 'ada-lovelace' })
          .where(eq(users._id, user._id))
          .execute();

        while (queue.length > 0) {
          const args = queue.shift();
          await worker({ db, scheduler: scheduler as any }, args);
        }

        const updated = await db
          .query('fk_action_memberships_update_cascade')
          .withIndex('by_user_slug', (q) => q.eq('userSlug', 'ada-lovelace'))
          .collect();
        expect(updated).toHaveLength(3);
      },
      { scheduler: scheduler as any, scheduledMutationBatch }
    );
  });
});

describe('soft and scheduled deletes', () => {
  it('soft deletes set deletionTime', async () =>
    withCtx(async ({ orm, db }) => {
      const [user] = await orm
        .insert(users)
        .values({ slug: 'ada' })
        .returning();

      await orm.delete(users).where(eq(users._id, user._id)).soft().execute();

      const updated = await db.get(user._id);
      expect(updated?.deletionTime).toBeTypeOf('number');
    }));

  it('scheduled deletes enqueue a job', async () => {
    const scheduler = {
      runAfter: vi.fn(async () => 'scheduled' as any),
      runAt: vi.fn(async () => 'scheduled' as any),
      cancel: vi.fn(async () => undefined),
    };
    const scheduledDelete = {} as SchedulableFunctionReference;

    await withCtx(
      async ({ orm }) => {
        const [user] = await orm
          .insert(users)
          .values({ slug: 'ada' })
          .returning();

        await orm
          .delete(users)
          .where(eq(users._id, user._id))
          .scheduled({ delayMs: 500 })
          .execute();

        expect(scheduler.runAfter).toHaveBeenCalledWith(500, scheduledDelete, {
          table: 'fk_action_users',
          id: user._id,
          cascadeMode: 'hard',
        });
      },
      { scheduler, scheduledDelete }
    );
  });
});
