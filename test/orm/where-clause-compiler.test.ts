import { describe, expect, test } from 'vitest';
import {
  between,
  eq,
  fieldRef,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  notBetween,
  notInArray,
  or,
  startsWith,
} from '../../packages/better-convex/src/orm/filter-expression';
import { WhereClauseCompiler } from '../../packages/better-convex/src/orm/where-clause-compiler';

describe('WhereClauseCompiler advanced index planning', () => {
  test('plans inArray as multi-probe index union', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const result = compiler.compile(
      inArray(fieldRef<string>('status') as any, ['active', 'pending'])
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_status');
    expect(result.probeFilters).toHaveLength(2);
  });

  test('plans isNull as indexed equality to null', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_deleted_at', indexFields: ['deletedAt'] },
    ]);

    const result = compiler.compile(
      isNull(fieldRef<number | null>('deletedAt') as any)
    ) as any;

    expect(result.strategy).toBe('singleIndex');
    expect(result.selectedIndex?.indexName).toBe('by_deleted_at');
    expect(result.indexFilters).toHaveLength(1);
  });

  test('plans startsWith as index range', () => {
    const compiler = new WhereClauseCompiler('posts', [
      { indexName: 'by_title', indexFields: ['title'] },
    ]);

    const result = compiler.compile(
      startsWith(fieldRef<string>('title') as any, 'Java')
    ) as any;

    expect(result.strategy).toBe('rangeIndex');
    expect(result.selectedIndex?.indexName).toBe('by_title');
    expect(result.indexFilters).toHaveLength(2);
  });

  test("plans like('prefix%') as index range", () => {
    const compiler = new WhereClauseCompiler('posts', [
      { indexName: 'by_title', indexFields: ['title'] },
    ]);

    const result = compiler.compile(
      like(fieldRef<string>('title') as any, 'Java%')
    ) as any;

    expect(result.strategy).toBe('rangeIndex');
    expect(result.selectedIndex?.indexName).toBe('by_title');
    expect(result.indexFilters).toHaveLength(2);
  });

  test('plans between as index range', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_age', indexFields: ['age'] },
    ]);

    const result = compiler.compile(
      between(fieldRef<number>('age') as any, 18, 65)
    ) as any;

    expect(result.strategy).toBe('rangeIndex');
    expect(result.selectedIndex?.indexName).toBe('by_age');
    expect(result.indexFilters).toHaveLength(2);
    expect(result.indexFilters[0].operator).toBe('gte');
    expect(result.indexFilters[1].operator).toBe('lte');
  });

  test('plans notBetween as multi-probe complement ranges', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_age', indexFields: ['age'] },
    ]);

    const result = compiler.compile(
      notBetween(fieldRef<number>('age') as any, 18, 65)
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_age');
    expect(result.probeFilters).toHaveLength(2);
    expect(result.probeFilters[0][0].operator).toBe('lt');
    expect(result.probeFilters[1][0].operator).toBe('gt');
  });

  test('plans OR eq branches on same field as multi-probe', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const expression = or(
      eq(fieldRef<string>('status') as any, 'active'),
      eq(fieldRef<string>('status') as any, 'pending')
    )!;
    const result = compiler.compile(expression) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_status');
    expect(result.probeFilters).toHaveLength(2);
  });

  test('keeps mixed OR as non-index compiled', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
      { indexName: 'by_age', indexFields: ['age'] },
    ]);

    const expression = or(
      eq(fieldRef<string>('status') as any, 'active'),
      startsWith(fieldRef<string>('name') as any, 'A')
    )!;
    const result = compiler.compile(expression) as any;

    expect(result.strategy).toBe('none');
    expect(result.selectedIndex).toBeNull();
    expect(result.postFilters).toHaveLength(1);
  });

  test('plans ne as multi-probe complement ranges', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const result = compiler.compile(
      ne(fieldRef<string>('status') as any, 'deleted')
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_status');
    expect(result.probeFilters).toHaveLength(2);
  });

  test('plans notInArray as multi-probe complement ranges', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_status', indexFields: ['status'] },
    ]);

    const result = compiler.compile(
      notInArray(fieldRef<string>('status') as any, ['deleted', 'pending'])
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_status');
    expect(result.probeFilters.length).toBeGreaterThanOrEqual(1);
  });

  test('plans isNotNull as multi-probe complement of null', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_deleted_at', indexFields: ['deletedAt'] },
    ]);

    const result = compiler.compile(
      isNotNull(fieldRef<number | null>('deletedAt') as any)
    ) as any;

    expect(result.strategy).toBe('multiProbe');
    expect(result.selectedIndex?.indexName).toBe('by_deleted_at');
    expect(result.probeFilters).toHaveLength(2);
  });

  test('keeps ne/notInArray/isNotNull non-indexed when no usable index exists', () => {
    const compiler = new WhereClauseCompiler('users', [
      { indexName: 'by_email', indexFields: ['email'] },
    ]);

    expect(
      compiler.compile(ne(fieldRef<string>('status') as any, 'deleted'))
        .strategy
    ).toBe('none');
    expect(
      compiler.compile(
        notInArray(fieldRef<string>('status') as any, ['deleted'])
      ).strategy
    ).toBe('none');
    expect(
      compiler.compile(isNotNull(fieldRef<number | null>('deletedAt') as any))
        .strategy
    ).toBe('none');
    expect(
      compiler.compile(between(fieldRef<number>('age') as any, 18, 65)).strategy
    ).toBe('none');
    expect(
      compiler.compile(notBetween(fieldRef<number>('age') as any, 18, 65))
        .strategy
    ).toBe('none');
  });
});
