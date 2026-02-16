import type { GenericDatabaseWriter } from 'convex/server';
import { describe, expect, test } from 'vitest';
import { text } from './builders/text';
import { createOrm } from './create-orm';
import { defineRelations } from './relations';
import { convexTable, onChange, onDelete, onInsert, onUpdate } from './table';

const createWriter = () => {
  const docs = new Map<string, Record<string, unknown>>();
  let counter = 0;

  return {
    docs,
    writer: {
      delete: async (_table: string, id: string) => {
        docs.delete(id);
      },
      get: async (_table: string, id: string) => docs.get(id) ?? null,
      insert: async (table: string, value: Record<string, unknown>) => {
        const id = `${table}:${++counter}`;
        docs.set(id, {
          ...value,
          _creationTime: Date.now(),
          _id: id,
        });
        return id;
      },
      normalizeId: (tableName: string, id: string) =>
        id.startsWith(`${tableName}:`) ? id : null,
      patch: async (
        _table: string,
        id: string,
        value: Record<string, unknown>
      ) => {
        const current = docs.get(id);
        if (!current) {
          return;
        }
        docs.set(id, { ...current, ...value });
      },
      query: () => {
        throw new Error('query() is not implemented in this unit test');
      },
      replace: async (
        _table: string,
        id: string,
        value: Record<string, unknown>
      ) => {
        const current = docs.get(id);
        if (!current) {
          return;
        }
        docs.set(id, {
          _creationTime: current._creationTime,
          _id: id,
          ...value,
        });
      },
      system: {},
    },
  };
};

describe('orm lifecycle hooks', () => {
  test('orm.with(ctx) wraps raw db writes and dispatches lifecycle hooks', async () => {
    const events: string[] = [];

    const users = convexTable(
      'users_lifecycle_test',
      {
        name: text().notNull(),
      },
      () => [
        onInsert(async (_ctx, change) => {
          events.push(`insert:${change.newDoc.name}`);
        }),
        onUpdate(async (_ctx, change) => {
          events.push(`update:${change.newDoc.name}`);
        }),
        onDelete(async (_ctx, change) => {
          events.push(`delete:${change.oldDoc.name}`);
        }),
        onChange(async (_ctx, change) => {
          events.push(`change:${change.operation}`);
        }),
      ]
    );

    const schema = defineRelations({ users });
    const orm = createOrm({ schema });

    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_test', {
      name: 'Ada',
    } as any);
    await ctx.db.patch(
      'users_lifecycle_test',
      id as any,
      { name: 'Grace' } as any
    );
    await ctx.db.delete('users_lifecycle_test', id as any);

    expect(events).toEqual([
      'insert:Ada',
      'change:insert',
      'update:Grace',
      'change:update',
      'delete:Grace',
      'change:delete',
    ]);
  });

  test('orm.db(ctx) runs lifecycle hooks for ORM writes', async () => {
    const events: string[] = [];

    const users = convexTable(
      'users_lifecycle_orm_write_test',
      {
        name: text().notNull(),
      },
      () => [
        onInsert(async (_ctx, change) => {
          events.push(`insert:${change.newDoc.name}`);
        }),
      ]
    );

    const schema = defineRelations({ users });
    const orm = createOrm({ schema });

    const { writer } = createWriter();
    const db = orm.db(writer as unknown as GenericDatabaseWriter<any>);

    await db
      .insert(users)
      .values({ name: 'Ada' } as any)
      .execute();

    expect(events).toEqual(['insert:Ada']);
  });

  test('trigger-like callback dispatches insert/update/delete lifecycle changes', async () => {
    const events: string[] = [];

    const users = convexTable(
      'users_lifecycle_trigger_like_test',
      {
        name: text().notNull(),
      },
      () => [
        async (_ctx: unknown, change: any) => {
          events.push(change.operation);
          if (change.operation === 'insert') {
            events.push(`new:${change.newDoc?.name}`);
          }
          if (change.operation === 'update') {
            events.push(
              `update:${change.oldDoc?.name}->${change.newDoc?.name}`
            );
          }
          if (change.operation === 'delete') {
            events.push(`old:${change.oldDoc?.name}`);
          }
        },
      ]
    );

    const schema = defineRelations({ users });
    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_trigger_like_test', {
      name: 'Ada',
    } as any);
    await ctx.db.patch(
      'users_lifecycle_trigger_like_test',
      id as any,
      { name: 'Grace' } as any
    );
    await ctx.db.delete('users_lifecycle_trigger_like_test', id as any);

    expect(events).toEqual([
      'insert',
      'new:Ada',
      'update',
      'update:Ada->Grace',
      'delete',
      'old:Grace',
    ]);
  });

  test('supports multiple trigger-like callbacks on the same table', async () => {
    const events: string[] = [];

    const users = convexTable(
      'users_lifecycle_multi_trigger_like_test',
      {
        name: text().notNull(),
      },
      () => [
        async (_ctx: unknown, change: { operation: string }) => {
          events.push(`a:${change.operation}`);
        },
        async (_ctx: unknown, change: { operation: string }) => {
          events.push(`b:${change.operation}`);
        },
      ]
    );

    const schema = defineRelations({ users });
    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_multi_trigger_like_test', {
      name: 'Ada',
    } as any);
    await ctx.db.delete('users_lifecycle_multi_trigger_like_test', id as any);

    expect(events).toEqual(['a:insert', 'b:insert', 'a:delete', 'b:delete']);
  });

  test('raw db writes do not run hooks without orm.with(ctx)', async () => {
    const events: string[] = [];

    const users = convexTable(
      'users_lifecycle_unwrapped_test',
      {
        name: text().notNull(),
      },
      () => [
        onInsert(async (_ctx, change) => {
          events.push(`insert:${change.newDoc.name}`);
        }),
      ]
    );

    const schema = defineRelations({ users });
    createOrm({ schema });

    const { writer } = createWriter();
    await writer.insert('users_lifecycle_unwrapped_test', {
      name: 'Ada',
    } as any);

    expect(events).toEqual([]);
  });

  test('onChange receives operation-aware payload shape and stable id', async () => {
    const changes: Array<{
      id: unknown;
      operation: 'insert' | 'update' | 'delete';
      oldDoc: any;
      newDoc: any;
    }> = [];

    const users = convexTable(
      'users_lifecycle_change_shape_test',
      {
        name: text().notNull(),
      },
      () => [
        onChange(async (_ctx, change) => {
          changes.push(change as any);
        }),
      ]
    );

    const schema = defineRelations({ users });
    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_change_shape_test', {
      name: 'Ada',
    } as any);
    await ctx.db.patch(
      'users_lifecycle_change_shape_test',
      id as any,
      { name: 'Grace' } as any
    );
    await ctx.db.delete('users_lifecycle_change_shape_test', id as any);

    expect(changes).toHaveLength(3);
    expect(changes[0]).toMatchObject({
      id,
      operation: 'insert',
      oldDoc: null,
      newDoc: { _id: id, name: 'Ada' },
    });
    expect(changes[1]).toMatchObject({
      id,
      operation: 'update',
      oldDoc: { _id: id, name: 'Ada' },
      newDoc: { _id: id, name: 'Grace' },
    });
    expect(changes[2]).toMatchObject({
      id,
      operation: 'delete',
      oldDoc: { _id: id, name: 'Grace' },
      newDoc: null,
    });
  });

  test('forwards scheduler and custom context fields to triggers', async () => {
    const runAfterCalls: Array<{ delayMs: number; payload: unknown }> = [];
    const scheduler = {
      runAfter: async (
        delayMs: number,
        _functionRef: unknown,
        payload: unknown
      ) => {
        runAfterCalls.push({ delayMs, payload });
      },
    };

    const users = convexTable(
      'users_lifecycle_scheduler_test',
      {
        name: text().notNull(),
      },
      () => [
        onInsert(async (ctx, change) => {
          expect((ctx as any).requestId).toBe('req-1');
          await (ctx as any).scheduler.runAfter(
            0,
            'internal.user.sendWelcomeEmail',
            {
              userId: change.id,
            }
          );
        }),
      ]
    );

    const schema = defineRelations({ users });
    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer, requestId: 'req-1', scheduler } as any);

    const id = await ctx.db.insert('users_lifecycle_scheduler_test', {
      name: 'Ada',
    } as any);

    expect(runAfterCalls).toEqual([
      {
        delayMs: 0,
        payload: { userId: id },
      },
    ]);
  });

  test('forwards ctx.orm to trigger handlers on orm.with(ctx)', async () => {
    let seenOrm = false;

    const users = convexTable(
      'users_lifecycle_ctx_orm_test',
      {
        name: text().notNull(),
      },
      () => [
        onInsert(async (ctx) => {
          seenOrm = !!(ctx as any).orm;
        }),
      ]
    );

    const schema = defineRelations({ users });
    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    await ctx.db.insert('users_lifecycle_ctx_orm_test', {
      name: 'Ada',
    } as any);

    expect(seenOrm).toBe(true);
  });

  test('trigger errors propagate to caller', async () => {
    const users = convexTable(
      'users_lifecycle_validation_test',
      {
        email: text().notNull(),
      },
      () => [
        onInsert(async (_ctx, change) => {
          const email = (change.newDoc as { email: string }).email;
          if (!email.includes('@')) {
            throw new Error(`Invalid email: ${email}`);
          }
        }),
      ]
    );

    const schema = defineRelations({ users });
    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    await expect(
      ctx.db.insert('users_lifecycle_validation_test', {
        email: 'invalid-email',
      } as any)
    ).rejects.toThrow('Invalid email: invalid-email');
  });

  test('innerDb is available for direct writes without recursive trigger dispatch', async () => {
    const events: string[] = [];

    const users = convexTable(
      'users_lifecycle_innerdb_test',
      {
        name: text().notNull(),
        touched: text(),
      },
      () => [
        onInsert(async (ctx, change) => {
          events.push('insert');
          await (ctx as any).innerDb.patch(
            'users_lifecycle_innerdb_test',
            change.id as any,
            { touched: 'yes' } as any
          );
        }),
        onUpdate(async () => {
          events.push('update');
        }),
        onChange(async (_ctx, change) => {
          events.push(`change:${change.operation}`);
        }),
      ]
    );

    const schema = defineRelations({ users });
    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_innerdb_test', {
      name: 'Ada',
    } as any);
    const doc = await writer.get('users_lifecycle_innerdb_test', id as any);

    expect(doc).toMatchObject({ _id: id, name: 'Ada', touched: 'yes' });
    expect(events).toEqual(['insert', 'change:insert']);
  });

  test('trigger handlers can enqueue recursive writes for cascade-style updates', async () => {
    const events: string[] = [];

    const users = convexTable(
      'users_lifecycle_recursive_test',
      {
        name: text().notNull(),
      },
      () => [
        onInsert(async (ctx, change) => {
          events.push(`insert:${change.newDoc.name}`);
          await (ctx as any).db.patch(
            'users_lifecycle_recursive_test',
            change.id as any,
            { name: 'Grace' } as any
          );
        }),
        onUpdate(async (_ctx, change) => {
          events.push(`update:${change.oldDoc.name}->${change.newDoc.name}`);
        }),
        onChange(async (_ctx, change) => {
          events.push(`change:${change.operation}`);
        }),
      ]
    );

    const schema = defineRelations({ users });
    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    await ctx.db.insert('users_lifecycle_recursive_test', {
      name: 'Ada',
    } as any);

    expect(events).toEqual([
      'insert:Ada',
      'change:insert',
      'update:Ada->Grace',
      'change:update',
    ]);
  });
});
