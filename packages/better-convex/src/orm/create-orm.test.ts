import { text } from './builders/text';
import { createOrm } from './create-orm';
import { defineRelations } from './relations';
import { OrmContext } from './symbols';
import { convexTable } from './table';

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

  test('does not attach global date mode in orm context', () => {
    const orm = createOrm({ schema });
    const db = orm.db(createReader()) as any;

    expect(db[OrmContext]).toBeDefined();
    expect(Object.hasOwn(db[OrmContext], 'types')).toBe(false);
  });
});
