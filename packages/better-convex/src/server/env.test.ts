import { z } from 'zod';
import { createEnv } from './env';
import { CRPCError } from './error';

describe('server/env', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
      return;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('parses runtimeEnv and applies schema defaults', () => {
    const schema = z.object({
      ADMIN: z
        .string()
        .default('')
        .transform((s) => (s ? s.split(',') : []))
        .pipe(z.array(z.string())),
      BC_TEST_REQUIRED_20260213: z.string(),
      SITE_URL: z.string().default('http://localhost:3005'),
    });

    const getEnv = createEnv({
      schema,
      runtimeEnv: {
        BC_TEST_REQUIRED_20260213: 'secret',
      } as NodeJS.ProcessEnv,
    });

    expect(getEnv()).toEqual({
      ADMIN: [],
      BC_TEST_REQUIRED_20260213: 'secret',
      SITE_URL: 'http://localhost:3005',
    });
  });

  test('throws generic CRPCError when env is invalid', () => {
    const schema = z.object({
      BC_TEST_REQUIRED_20260213: z.string(),
    });

    const getEnv = createEnv({
      schema,
      runtimeEnv: { NODE_ENV: 'production' } as NodeJS.ProcessEnv,
    });

    try {
      getEnv();
      throw new Error('Expected getEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CRPCError);
      expect((error as CRPCError).code).toBe('INTERNAL_SERVER_ERROR');
      expect((error as Error).message).toBe('Invalid environment variables');
    }
  });

  test('memoizes successful parse by default', () => {
    const schema = z.object({
      BC_TEST_REQUIRED_20260213: z.string(),
    });
    const safeParseSpy = spyOn(schema, 'safeParse');

    const getEnv = createEnv({
      schema,
      runtimeEnv: {
        BC_TEST_REQUIRED_20260213: 'secret',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv,
    });

    getEnv();
    getEnv();

    expect(safeParseSpy).toHaveBeenCalledTimes(1);
  });

  test('re-parses on every call when cache is disabled', () => {
    const schema = z.object({
      BC_TEST_REQUIRED_20260213: z.string(),
    });
    const safeParseSpy = spyOn(schema, 'safeParse');

    const getEnv = createEnv({
      schema,
      cache: false,
      runtimeEnv: {
        BC_TEST_REQUIRED_20260213: 'secret',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv,
    });

    getEnv();
    getEnv();

    expect(safeParseSpy).toHaveBeenCalledTimes(2);
  });

  test('does not cache failures', () => {
    const schema = z.object({
      BC_TEST_REQUIRED_20260213: z.string(),
    });
    const safeParseSpy = spyOn(schema, 'safeParse');
    const getEnv = createEnv({
      schema,
      runtimeEnv: { NODE_ENV: 'production' } as NodeJS.ProcessEnv,
    });

    expect(() => getEnv()).toThrow(CRPCError);
    expect(() => getEnv()).toThrow(CRPCError);
    expect(safeParseSpy).toHaveBeenCalledTimes(2);
  });

  test('supports codegen fallback when NODE_ENV is missing', () => {
    delete process.env.NODE_ENV;

    const schema = z.object({
      ADMIN: z
        .string()
        .default('')
        .transform((s) => (s ? s.split(',') : []))
        .pipe(z.array(z.string())),
      BC_REQUIRED_A: z.string(),
      SITE_URL: z.string().default('http://localhost:3005'),
    });

    const getEnv = createEnv({
      schema,
      runtimeEnv: {} as NodeJS.ProcessEnv,
    });

    expect(getEnv()).toEqual({
      ADMIN: [],
      BC_REQUIRED_A: '',
      SITE_URL: 'http://localhost:3005',
    });
  });

  test('codegen fallback merges defaults and keeps runtimeEnv precedence', () => {
    delete process.env.NODE_ENV;

    const schema = z.object({
      BC_REQUIRED_A: z.string(),
      BC_REQUIRED_B: z.string(),
    });

    const getEnv = createEnv({
      schema,
      runtimeEnv: {
        BC_REQUIRED_B: 'from-runtime',
      } as NodeJS.ProcessEnv,
    });

    expect(getEnv()).toEqual({
      BC_REQUIRED_A: '',
      BC_REQUIRED_B: 'from-runtime',
    });
  });
});
