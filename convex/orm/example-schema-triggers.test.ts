import { describe, expect, test } from 'vitest';
import { tables } from '../../example/convex/functions/schema';
import { getTableLifecycleHooks } from '../../packages/better-convex/src/orm/table';

describe('example schema aggregate triggers', () => {
  test('registers aggregate trigger handlers on expected tables', () => {
    const expectedTriggerCounts = {
      projectMembers: 1,
      todoComments: 2,
      todoTags: 1,
      todos: 3,
      user: 1,
    } as const;

    let totalTriggers = 0;

    for (const [tableName, triggerCount] of Object.entries(
      expectedTriggerCounts
    )) {
      const triggers = getTableLifecycleHooks(
        tables[tableName as keyof typeof tables] as any
      );
      expect(triggers).toHaveLength(triggerCount);
      expect(triggers.every((trigger) => trigger.operation === 'change')).toBe(
        true
      );
      totalTriggers += triggers.length;
    }

    expect(totalTriggers).toBe(8);
  });

  test('registers triggers only on aggregate-backed tables', () => {
    const aggregateTables = new Set([
      'projectMembers',
      'todoComments',
      'todoTags',
      'todos',
      'user',
    ]);

    for (const [tableName, table] of Object.entries(tables)) {
      const triggers = getTableLifecycleHooks(table as any);

      if (aggregateTables.has(tableName)) {
        expect(triggers.length).toBeGreaterThan(0);
        expect(
          triggers.every((trigger) => typeof trigger.handler === 'function')
        ).toBe(true);
        continue;
      }

      expect(triggers).toHaveLength(0);
    }
  });
});
