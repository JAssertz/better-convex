import { makeFunctionReference } from 'convex/server';

import { createServerCRPCProxy } from './proxy-server';

const HTTP_ROUTE_NOT_FOUND_MISSING_RE = /HTTP route not found: missing/i;

describe('rsc/proxy-server', () => {
  test('queryOptions delegates to convexQuery and attaches correct key/meta', () => {
    const api = {
      posts: {
        list: makeFunctionReference<'query'>('posts:list'),
      },
    } as const;

    const meta = {
      posts: {
        list: { type: 'query', auth: 'optional' },
      },
    } as any;

    const crpc = createServerCRPCProxy({ api, meta });
    const opts = crpc.posts.list.queryOptions(
      { tag: 'x' },
      { skipUnauth: true }
    );

    expect(opts.queryKey).toEqual(['convexQuery', 'posts:list', { tag: 'x' }]);
    expect(opts.meta).toMatchObject({ authType: 'optional', skipUnauth: true });
  });

  test('infiniteQueryKey uses the function name and defaults args to empty object', () => {
    const api = {
      posts: {
        list: makeFunctionReference<'query'>('posts:list'),
      },
    } as const;

    const crpc = createServerCRPCProxy({ api, meta: {} as any });
    expect(crpc.posts.list.infiniteQueryKey()).toEqual([
      'convexQuery',
      'posts:list',
      {},
    ]);
  });

  test('meta returns function metadata from the provided meta object', () => {
    const api = {
      posts: {
        list: makeFunctionReference<'query'>('posts:list'),
      },
    } as const;

    const meta = {
      posts: {
        list: { type: 'query', auth: 'required', limit: 10 },
      },
    } as any;

    const crpc = createServerCRPCProxy({ api, meta });
    expect(crpc.posts.list.meta).toEqual({
      type: 'query',
      auth: 'required',
      limit: 10,
    });
  });

  test('http.queryOptions uses meta._http route map and throws on missing routes', () => {
    const api = {} as const;
    const meta = {
      _http: {
        health: { path: '/api/health', method: 'GET' },
      },
    } as any;

    const crpc = createServerCRPCProxy({ api, meta }) as any;

    expect(crpc.http.health.queryOptions({})).toMatchObject({
      queryKey: ['httpQuery', 'health', {}],
      meta: { path: '/api/health', method: 'GET' },
    });

    expect(() => crpc.http.missing.queryOptions({})).toThrow(
      HTTP_ROUTE_NOT_FOUND_MISSING_RE
    );
  });
});
