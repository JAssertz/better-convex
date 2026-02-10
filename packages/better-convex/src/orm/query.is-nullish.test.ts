import { fieldRef, isNotNull, isNull } from './filter-expression';
import { GelRelationalQuery } from './query';

describe('GelRelationalQuery nullish filter compilation', () => {
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
});
