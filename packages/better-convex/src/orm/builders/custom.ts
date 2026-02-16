/**
 * Custom Column Builder
 *
 * Wraps an arbitrary Convex validator so you can use object/array validators
 * as ORM columns with full TypeScript inference.
 *
 * @example
 * custom(v.object({ key: v.string() })).notNull()
 */

import type { Validator, Value } from 'convex/values';
import { v } from 'convex/values';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

type AnyValidator = Validator<any, any, any>;

export type ConvexCustomBuilderInitial<
  TName extends string,
  TValidator extends AnyValidator,
> = ConvexCustomBuilder<
  {
    name: TName;
    dataType: 'any';
    columnType: 'ConvexCustom';
    data: TValidator['type'];
    driverParam: TValidator['type'];
    enumValues: undefined;
  },
  TValidator
>;

export class ConvexCustomBuilder<
  T extends ColumnBuilderBaseConfig<'any', 'ConvexCustom'>,
  TValidator extends AnyValidator,
> extends ConvexColumnBuilder<T, { validator: TValidator }> {
  static override readonly [entityKind]: string = 'ConvexCustomBuilder';

  constructor(name: T['name'], validator: TValidator) {
    super(name, 'any', 'ConvexCustom');
    this.config.validator = validator;
  }

  get convexValidator(): Validator<any, any, any> {
    const validator = this.config.validator;
    if (this.config.notNull) {
      return validator;
    }
    return v.optional(v.union(v.null(), validator));
  }

  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

export function custom<TValidator extends AnyValidator>(
  validator: TValidator
): ConvexCustomBuilderInitial<'', TValidator>;
export function custom<TName extends string, TValidator extends AnyValidator>(
  name: TName,
  validator: TValidator
): ConvexCustomBuilderInitial<TName, TValidator>;
export function custom(a: string | AnyValidator, b?: AnyValidator) {
  if (b !== undefined) {
    return new ConvexCustomBuilder(a as string, b);
  }
  return new ConvexCustomBuilder('', a as AnyValidator);
}

/**
 * Convenience wrapper for Convex "JSON" values.
 *
 * Note: This is Convex JSON (runtime `v.any()`), not SQL JSON/JSONB.
 */
export function json<T = Value>() {
  return custom(v.any()).$type<T>();
}
