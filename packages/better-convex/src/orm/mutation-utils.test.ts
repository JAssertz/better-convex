/** biome-ignore-all lint/performance/useTopLevelRegex: inline regex assertions are intentional in tests. */
import { and, eq, gt, isNull, not, or } from './filter-expression';
import { convexTable, date, integer, text } from './index';
import {
  decodeUndefinedDeep,
  deserializeFilterExpression,
  encodeUndefinedDeep,
  enforceCheckConstraints,
  evaluateCheckConstraintTriState,
  evaluateFilter,
  getMutationCollectionLimits,
  getSelectionColumnName,
  hydrateDateFieldsForRead,
  normalizeDateFieldsForWrite,
  selectReturningRow,
  selectReturningRowWithHydration,
  serializeFilterExpression,
  takeRowsWithinByteBudget,
  toConvexFilter,
} from './mutation-utils';

const users = convexTable('users', {
  name: text().notNull(),
  age: integer(),
  deletedAt: integer(),
  status: text(),
  birthday: date(),
});

const usersWithCreatedAt = convexTable('users_with_created_at', {
  name: text().notNull(),
  createdAt: integer().notNull(),
});

describe('mutation-utils', () => {
  test('encodeUndefinedDeep/decodeUndefinedDeep round-trip nested values', () => {
    const input = {
      name: 'Alice',
      optional: undefined,
      nested: {
        maybe: undefined,
        list: [1, undefined, { value: undefined }],
      },
    };

    const encoded = encodeUndefinedDeep(input);
    expect(encoded).not.toEqual(input);

    const decoded = decodeUndefinedDeep(encoded);
    expect(decoded).toEqual(input);
  });

  test('serialize/deserialize filter expressions validates malformed unary payloads', () => {
    const serialized = serializeFilterExpression(eq(users.name, 'Alice'));
    expect(serialized).toBeTruthy();
    expect(deserializeFilterExpression(serialized)).toBeTruthy();

    expect(() =>
      deserializeFilterExpression({
        type: 'unary',
        operator: 'not',
        operand: undefined as any,
      })
    ).toThrow(/missing/i);
  });

  test('serializeFilterExpression rejects binary expressions without field reference', () => {
    const invalid = {
      type: 'binary',
      operator: 'eq',
      operands: [123, 'x'],
      accept() {
        throw new Error('not used');
      },
    };

    expect(() => serializeFilterExpression(invalid as any)).toThrow(
      /FieldReference/
    );
  });

  test('selection helpers resolve column names and map returning rows', () => {
    expect(getSelectionColumnName({ columnName: 'name' })).toBe('name');
    expect(getSelectionColumnName({ config: { name: 'email' } })).toBe('email');
    expect(() => getSelectionColumnName({})).toThrow(
      /must reference a column/i
    );

    const row = { name: 'Alice', email: 'alice@example.com', age: 30 };
    const selected = selectReturningRow(row, {
      n: { columnName: 'name' },
      e: { config: { name: 'email' } },
    });
    expect(selected).toEqual({ n: 'Alice', e: 'alice@example.com' });
  });

  test('evaluateFilter supports binary/unary/logical operators', () => {
    const row = {
      name: 'Alice',
      age: 30,
      tags: ['a', 'b'],
      deletedAt: null,
    };

    expect(evaluateFilter(row, eq(users.name, 'Alice'))).toBe(true);
    expect(evaluateFilter(row, not(eq(users.name, 'Bob')))).toBe(true);
    expect(
      evaluateFilter(row, and(gt(users.age, 18), isNull(users.deletedAt))!)
    ).toBe(true);
    expect(
      evaluateFilter(row, or(eq(users.name, 'Zed'), eq(users.name, 'Alice'))!)
    ).toBe(true);
  });

  test('evaluateCheckConstraintTriState returns unknown for nullish comparisons', () => {
    const expression = gt(users.age, 18);

    expect(evaluateCheckConstraintTriState({ age: 30 }, expression)).toBe(true);
    expect(evaluateCheckConstraintTriState({ age: 10 }, expression)).toBe(
      false
    );
    expect(evaluateCheckConstraintTriState({ age: null }, expression)).toBe(
      'unknown'
    );
  });

  test('enforceCheckConstraints throws violations and allows unknown checks', () => {
    const table = {
      tableName: 'users',
      getChecks: () => [
        {
          name: 'age_positive',
          expression: gt(users.age, 0),
        },
      ],
    };

    expect(() => enforceCheckConstraints(table as any, { age: -1 })).toThrow(
      /violation/i
    );
    expect(() =>
      enforceCheckConstraints(table as any, { age: null })
    ).not.toThrow();
    expect(() =>
      enforceCheckConstraints(table as any, { age: 20 })
    ).not.toThrow();
  });

  test('toConvexFilter validates unary field-reference constraints', () => {
    const badUnary = {
      type: 'unary',
      operator: 'isNull',
      operands: [eq(users.name, 'Alice')],
      accept<R>(visitor: any): R {
        return visitor.visitUnary(this);
      },
    };

    expect(() => toConvexFilter(badUnary as any)).toThrow(
      /must operate on a field reference/i
    );
  });

  test('takeRowsWithinByteBudget enforces limits and detects truncation', () => {
    expect(() => takeRowsWithinByteBudget([], 0)).toThrow(/positive integer/i);

    const rows = [
      { id: 1, payload: 'x'.repeat(20) },
      { id: 2, payload: 'x'.repeat(20) },
      { id: 3, payload: 'x'.repeat(20) },
    ];

    const firstOnly = takeRowsWithinByteBudget(rows as any, 120);
    expect(firstOnly.rows.length).toBe(1);
    expect(firstOnly.hitLimit).toBe(true);

    const allRows = takeRowsWithinByteBudget(rows as any, 10_000);
    expect(allRows.rows.length).toBe(3);
    expect(allRows.hitLimit).toBe(false);
  });

  test('getMutationCollectionLimits validates defaults', () => {
    const defaults = getMutationCollectionLimits(undefined);
    expect(defaults.batchSize).toBeGreaterThan(0);
    expect(defaults.maxRows).toBeGreaterThan(0);

    expect(() =>
      getMutationCollectionLimits({
        defaults: {
          mutationBatchSize: 0,
        },
      } as any)
    ).toThrow(/mutationBatchSize/i);
  });

  test('normalizeDateFieldsForWrite converts Date fields and createdAt alias', () => {
    const birthday = new Date('2024-01-01T00:00:00.000Z');
    const createdAt = new Date('2024-02-01T00:00:00.000Z');

    const normalized = normalizeDateFieldsForWrite(
      users,
      {
        name: 'Alice',
        birthday,
        createdAt,
      },
      { createdAtAsDate: true }
    );

    expect(normalized).toMatchObject({
      name: 'Alice',
      birthday: birthday.getTime(),
      _creationTime: createdAt.getTime(),
    });
    expect(normalized).not.toHaveProperty('createdAt');
  });

  test('normalizeDateFieldsForWrite rejects _creationTime', () => {
    expect(() =>
      normalizeDateFieldsForWrite(
        users,
        {
          _creationTime: 1_700_000_000_000,
        } as any,
        { createdAtAsDate: true }
      )
    ).toThrow(/use `createdAt`/i);
  });

  test('normalizeDateFieldsForWrite keeps user createdAt column', () => {
    const normalized = normalizeDateFieldsForWrite(
      usersWithCreatedAt,
      {
        name: 'Alice',
        createdAt: 123,
      },
      { createdAtAsDate: true }
    ) as any;

    expect(normalized).toMatchObject({
      name: 'Alice',
      createdAt: 123,
    });
    expect(normalized).not.toHaveProperty('_creationTime');
  });

  test('hydrateDateFieldsForRead maps id and createdAt when date=true', () => {
    const hydrated = hydrateDateFieldsForRead(
      users,
      {
        _id: 'u1',
        _creationTime: 1_700_000_000_000,
        birthday: 1_600_000_000_000,
      },
      { createdAtAsDate: true }
    ) as any;

    expect(hydrated).toMatchObject({
      id: 'u1',
    });
    expect(hydrated).not.toHaveProperty('_id');
    expect(hydrated).not.toHaveProperty('_creationTime');
    expect(hydrated.createdAt).toBeInstanceOf(Date);
    expect(hydrated.birthday).toBeInstanceOf(Date);
  });

  test('hydrateDateFieldsForRead keeps user createdAt and hides _creationTime', () => {
    const hydrated = hydrateDateFieldsForRead(
      usersWithCreatedAt,
      {
        _id: 'u1',
        _creationTime: 1_700_000_000_000,
        name: 'Alice',
        createdAt: 123,
      },
      { createdAtAsDate: true }
    ) as any;

    expect(hydrated).toMatchObject({
      id: 'u1',
      name: 'Alice',
      createdAt: 123,
    });
    expect(hydrated).not.toHaveProperty('_creationTime');
  });

  test('selectReturningRowWithHydration hydrates date-like selections', () => {
    const selected = selectReturningRowWithHydration(
      users,
      {
        _id: 'u1',
        _creationTime: 1_700_000_000_000,
        birthday: 1_600_000_000_000,
      },
      {
        id: { columnName: '_id' },
        createdAt: { columnName: '_creationTime' },
        birthday: users.birthday,
      },
      { createdAtAsDate: true }
    ) as any;

    expect(selected.id).toBe('u1');
    expect(selected.createdAt).toBeInstanceOf(Date);
    expect(selected.birthday).toBeInstanceOf(Date);
  });

  test('hydrateDateFieldsForRead maps createdAt to number when date=false', () => {
    const hydrated = hydrateDateFieldsForRead(
      users,
      {
        _id: 'u1',
        _creationTime: 1_700_000_000_000,
      },
      { createdAtAsDate: false }
    ) as any;

    expect(hydrated).toMatchObject({
      id: 'u1',
      createdAt: 1_700_000_000_000,
    });
    expect(hydrated).not.toHaveProperty('_creationTime');
  });
});
