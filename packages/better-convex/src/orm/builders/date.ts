import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

export type ConvexDateBuilderInitial<TName extends string> = ConvexDateBuilder<{
  name: TName;
  dataType: 'number';
  columnType: 'ConvexDate';
  data: Date;
  driverParam: number;
  enumValues: undefined;
}>;

export class ConvexDateBuilder<
  T extends ColumnBuilderBaseConfig<'number', 'ConvexDate'>,
> extends ConvexColumnBuilder<T> {
  static override readonly [entityKind]: string = 'ConvexDateBuilder';

  constructor(name: T['name']) {
    super(name, 'number', 'ConvexDate');
  }

  get convexValidator(): Validator<any, any, any> {
    if (this.config.notNull) {
      return v.number();
    }
    return v.optional(v.union(v.null(), v.number()));
  }

  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

export function date(): ConvexDateBuilderInitial<''>;
export function date<TName extends string>(
  name: TName
): ConvexDateBuilderInitial<TName>;
export function date(name?: string) {
  return new ConvexDateBuilder(name ?? '');
}
