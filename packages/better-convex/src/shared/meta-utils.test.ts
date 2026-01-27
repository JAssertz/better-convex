/// <reference types="bun-types/test-globals" />

import { getFunctionMeta, getFunctionType, type Meta } from './meta-utils';

const testMeta: Meta = {
  todos: {
    create: { type: 'mutation' },
    list: { type: 'query' },
  },
  'items/queries': {
    list: { type: 'query' },
    get: { type: 'query' },
  },
  'deep/nested/path': {
    action: { type: 'action' },
  },
};

describe('getFunctionType', () => {
  it('returns type for flat namespace', () => {
    expect(getFunctionType(['todos', 'create'], testMeta)).toBe('mutation');
    expect(getFunctionType(['todos', 'list'], testMeta)).toBe('query');
  });

  it('returns type for nested namespace', () => {
    expect(getFunctionType(['items', 'queries', 'list'], testMeta)).toBe(
      'query'
    );
    expect(getFunctionType(['items', 'queries', 'get'], testMeta)).toBe(
      'query'
    );
  });

  it('returns type for deeply nested namespace', () => {
    expect(
      getFunctionType(['deep', 'nested', 'path', 'action'], testMeta)
    ).toBe('action');
  });

  it('returns query for unknown function', () => {
    expect(getFunctionType(['unknown', 'fn'], testMeta)).toBe('query');
  });

  it('returns query for path too short', () => {
    expect(getFunctionType(['single'], testMeta)).toBe('query');
    expect(getFunctionType([], testMeta)).toBe('query');
  });
});

describe('getFunctionMeta', () => {
  it('returns meta for flat namespace', () => {
    expect(getFunctionMeta(['todos', 'create'], testMeta)).toEqual({
      type: 'mutation',
    });
  });

  it('returns meta for nested namespace', () => {
    expect(getFunctionMeta(['items', 'queries', 'list'], testMeta)).toEqual({
      type: 'query',
    });
  });

  it('returns undefined for unknown function', () => {
    expect(getFunctionMeta(['unknown', 'fn'], testMeta)).toBeUndefined();
  });
});
