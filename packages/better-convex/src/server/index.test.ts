import * as server from './index';

describe('server public exports', () => {
  test('re-exports expected runtime surfaces', () => {
    expect(server.initCRPC).toBeDefined();
    expect(typeof server.initCRPC.create).toBe('function');

    expect(server.CRPCError).toBeDefined();
    expect(typeof server.getCRPCErrorFromUnknown).toBe('function');

    expect(typeof server.createHttpRouter).toBe('function');
    expect(typeof server.createServerCaller).toBe('function');
    expect(typeof server.createLazyCaller).toBe('function');
    expect(typeof server.createEnv).toBe('function');
    expect(typeof server.requireActionCtx).toBe('function');
    expect(typeof server.requireMutationCtx).toBe('function');
    expect(typeof server.requireQueryCtx).toBe('function');
    expect(typeof server.requireRunMutationCtx).toBe('function');
    expect(typeof server.zid).toBe('function');
  });
});
