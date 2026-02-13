import { text } from './builders/text';
import { createOrm } from './create-orm';
import { defineRelations } from './relations';
import { OrmContext } from './symbols';
import { convexTable } from './table';
import { getDateTypeMode } from './timestamp-mode';

const createReader = () =>
  ({
    query: () => ({}),
    system: {},
  }) as any;

describe('createOrm type adapters', () => {
  const users = convexTable('users_mode_test', {
    name: text().notNull(),
  });
  const schema = defineRelations({ users });

  test('defaults to number date mode', () => {
    const orm = createOrm({ schema });
    const db = orm.db(createReader()) as any;

    expect(getDateTypeMode(db[OrmContext])).toBe('number');
  });

  test('propagates types.date globally with per-call override', () => {
    const orm = createOrm({ schema, types: { date: true } });

    const dateDb = orm.db(createReader()) as any;
    expect(getDateTypeMode(dateDb[OrmContext])).toBe('date');

    const numberDb = orm.db(createReader(), {
      types: { date: false },
    }) as any;
    expect(getDateTypeMode(numberDb[OrmContext])).toBe('number');
  });
});
