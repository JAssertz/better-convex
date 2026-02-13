import { text } from './builders/text';
import { fieldRef, isNotNull, isNull } from './filter-expression';
import { GelRelationalQuery } from './query';
import { OrmContext } from './symbols';
import { convexTable } from './table';

describe('GelRelationalQuery nullish filter compilation', () => {
  const users = convexTable('users_query_mode_test', {
    name: text().notNull(),
  });
  const usersWithCreatedAt = convexTable('users_query_mode_created_at_test', {
    name: text().notNull(),
    createdAt: text().notNull(),
  });

  const createQuery = (date: boolean, table: any = users) =>
    new (GelRelationalQuery as any)(
      {},
      { table, name: table.tableName, relations: {} },
      [],
      { [OrmContext]: { types: { date } } },
      {},
      'many'
    );

  it('compiles isNull() to (field == null OR field == undefined)', () => {
    const expr = isNull(fieldRef<any>('deletedAt') as any) as any;

    const toConvex = (GelRelationalQuery.prototype as any)._toConvexExpression;
    const fn = toConvex.call({}, expr);

    const q = {
      field: (name: string) => ({ type: 'field', name }),
      eq: (l: unknown, r: unknown) => ({ type: 'eq', l, r }),
      or: (a: unknown, b: unknown) => ({ type: 'or', a, b }),
    };

    expect(fn(q)).toEqual({
      type: 'or',
      a: {
        type: 'eq',
        l: { type: 'field', name: 'deletedAt' },
        r: null,
      },
      b: {
        type: 'eq',
        l: { type: 'field', name: 'deletedAt' },
        r: undefined,
      },
    });
  });

  it('compiles isNotNull() to (field != null AND field != undefined)', () => {
    const expr = isNotNull(fieldRef<any>('deletedAt') as any) as any;

    const toConvex = (GelRelationalQuery.prototype as any)._toConvexExpression;
    const fn = toConvex.call({}, expr);

    const q = {
      field: (name: string) => ({ type: 'field', name }),
      neq: (l: unknown, r: unknown) => ({ type: 'neq', l, r }),
      and: (a: unknown, b: unknown) => ({ type: 'and', a, b }),
    };

    expect(fn(q)).toEqual({
      type: 'and',
      a: {
        type: 'neq',
        l: { type: 'field', name: 'deletedAt' },
        r: null,
      },
      b: {
        type: 'neq',
        l: { type: 'field', name: 'deletedAt' },
        r: undefined,
      },
    });
  });

  it('maps createdAt field name and rejects _creationTime', () => {
    const query = createQuery(true);

    expect((query as any)._normalizePublicFieldName('createdAt')).toBe(
      '_creationTime'
    );
    expect(() =>
      (query as any)._normalizePublicFieldName('_creationTime')
    ).toThrow(/use `createdAt`/i);
  });

  it('hydrates createdAt Date when types.date=true', () => {
    const query = createQuery(true);

    const row = (query as any)._toPublicRow({
      _id: 'u1',
      _creationTime: 1_700_000_000_000,
      name: 'Alice',
    });

    expect(row).toMatchObject({
      id: 'u1',
      name: 'Alice',
    });
    expect(row).not.toHaveProperty('_creationTime');
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('keeps user createdAt column and hides _creationTime', () => {
    const query = createQuery(true, usersWithCreatedAt);

    expect((query as any)._normalizePublicFieldName('createdAt')).toBe(
      'createdAt'
    );

    const row = (query as any)._toPublicRow({
      _id: 'u1',
      _creationTime: 1_700_000_000_000,
      createdAt: '2024-01-01T00:00:00.000Z',
      name: 'Alice',
    });

    expect(row).toMatchObject({
      id: 'u1',
      name: 'Alice',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(row).not.toHaveProperty('_creationTime');
  });

  it('hydrates createdAt number when types.date=false', () => {
    const query = createQuery(false);

    const row = (query as any)._toPublicRow({
      _id: 'u1',
      _creationTime: 1_700_000_000_000,
      name: 'Alice',
    });

    expect(row).toMatchObject({
      id: 'u1',
      name: 'Alice',
      createdAt: 1_700_000_000_000,
    });
    expect(row).not.toHaveProperty('_creationTime');
  });

  it('allows cursor pagination ordering by _creationTime when a where index is used', async () => {
    const paginate = async () => ({
      page: [],
      continueCursor: null,
      isDone: true,
    });

    const queryBuilder: any = {
      withIndex: (_indexName: string, apply: (q: any) => any) => {
        apply({});
        return queryBuilder;
      },
      order: (_direction: 'asc' | 'desc') => queryBuilder,
      paginate,
    };

    const query = new (GelRelationalQuery as any)(
      {},
      { table: users, name: users.tableName, relations: {} },
      [],
      {
        query: (_tableName: string) => queryBuilder,
        [OrmContext]: { types: { date: false } },
      },
      {
        cursor: null,
        limit: 10,
      },
      'many'
    );

    (query as any)._toConvexQuery = () => ({
      table: users.tableName,
      strategy: 'singleIndex',
      index: {
        name: 'by_name',
        filters: [],
      },
      probeFilters: [],
      postFilters: [],
      order: [{ field: '_creationTime', direction: 'desc' }],
    });

    await expect(query.execute()).resolves.toMatchObject({
      page: [],
      continueCursor: null,
      isDone: true,
    });
  });
});
