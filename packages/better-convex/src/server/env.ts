import type { z } from 'zod';
import { CRPCError } from './error';

export type CreateEnvOptions<TSchema extends z.ZodObject<z.ZodRawShape>> = {
  cache?: boolean;
  codegenFallback?: boolean;
  runtimeEnv?: NodeJS.ProcessEnv;
  schema: TSchema;
};

export function createEnv<TSchema extends z.ZodObject<z.ZodRawShape>>(
  options: CreateEnvOptions<TSchema>
): () => z.infer<TSchema> {
  const {
    schema,
    runtimeEnv = process.env,
    cache = true,
    codegenFallback = true,
  } = options;
  let cached: z.infer<TSchema> | undefined;

  return () => {
    if (cache && cached) {
      return cached;
    }

    const isCodegen = codegenFallback && !runtimeEnv.NODE_ENV;
    const envForParse = isCodegen
      ? {
          ...Object.fromEntries(
            Object.entries(schema.shape).map(([key, zodType]) => {
              const result = (zodType as z.ZodType).safeParse(undefined);
              if (!result.success) {
                return [key, ''];
              }
              return [
                key,
                typeof result.data === 'string' ? result.data : undefined,
              ];
            })
          ),
          ...runtimeEnv,
        }
      : runtimeEnv;

    const parsed = schema.safeParse(envForParse);

    if (!parsed.success) {
      throw new CRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Invalid environment variables',
      });
    }

    if (cache) {
      cached = parsed.data;
    }

    return parsed.data;
  };
}
