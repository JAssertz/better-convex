import type {
  DefineSchemaOptions,
  GenericSchema,
  SchemaDefinition,
} from 'convex/server';
import { defineSchema as defineConvexSchema } from 'convex/server';
import { OrmSchemaDefinition, OrmSchemaOptions } from './symbols';

/**
 * Better Convex schema definition
 *
 * Wraps Convex's defineSchema to keep schema authoring inside better-convex.
 * Mirrors drizzle's schema-first approach while returning a Convex-compatible
 * SchemaDefinition for codegen and convex-test.
 */
export function defineSchema<
  TSchema extends GenericSchema,
  StrictTableNameTypes extends boolean = true,
>(
  schema: TSchema,
  options?: DefineSchemaOptions<StrictTableNameTypes> & { strict?: boolean }
): SchemaDefinition<TSchema, StrictTableNameTypes> {
  const strict = options?.strict ?? true;
  Object.defineProperty(schema, OrmSchemaOptions, {
    value: { strict },
    enumerable: false,
  });

  const { strict: _strict, ...convexOptions } = options ?? {};
  const convexSchema = defineConvexSchema(
    schema,
    convexOptions as DefineSchemaOptions<StrictTableNameTypes>
  );
  Object.defineProperty(convexSchema as object, OrmSchemaOptions, {
    value: { strict },
    enumerable: false,
  });
  Object.defineProperty(schema, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  Object.defineProperty(convexSchema as object, OrmSchemaDefinition, {
    value: convexSchema,
    enumerable: false,
  });
  return convexSchema;
}
