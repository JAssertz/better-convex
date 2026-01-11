/**
 * CRPC - Convex RPC Builder
 * A tRPC-style fluent API for Convex functions
 *
 * Core library - no project-specific dependencies
 */
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server';
import { customCtx } from 'convex-helpers/server/customFunctions';
import {
  zCustomAction,
  zCustomMutation,
  zCustomQuery,
} from 'convex-helpers/server/zod4';
import { z } from 'zod';

import type {
  AnyMiddleware,
  IntersectIfDefined,
  MiddlewareBuilder,
  MiddlewareFunction,
  MiddlewareResult,
  Overwrite,
  UnsetMarker,
} from './types';

// =============================================================================
// Pagination Types
// =============================================================================

/**
 * Paginated schema for type inference ONLY.
 * After .paginated() applies defaults, cursor and limit are always defined.
 * The actual runtime schema uses .default() and .transform() for validation.
 */
const paginatedSchemaForTypes = z.object({
  cursor: z.union([z.string(), z.null()]),
  limit: z.number(),
});

/** Paginated schema type - both cursor and limit are required after .paginated() */
type PaginatedInputSchema = typeof paginatedSchemaForTypes;

/**
 * Infer input type from ZodObject schema
 */
type InferInput<T> = T extends UnsetMarker
  ? Record<string, never>
  : T extends z.ZodObject<any>
    ? z.infer<T>
    : never;

// =============================================================================
// Types for Configuration
// =============================================================================

/** Base config shape for function builders */
type FunctionBuilderConfig = {
  /** Base function builder (query, mutation, or action from Convex) */
  base: unknown;
  /** Internal function builder (internalQuery, etc.) */
  internal?: unknown;
};

/** Internal config combining context creator with function builders */
type InternalFunctionConfig = FunctionBuilderConfig & {
  /** Transform raw Convex context to the base context for procedures */
  createContext: (ctx: any) => unknown;
};

/** Context creators for each function type - all optional, defaults to passthrough */
type ContextConfig<DataModel extends GenericDataModel> = {
  query?: (ctx: GenericQueryCtx<DataModel>) => unknown;
  mutation?: (ctx: GenericMutationCtx<DataModel>) => unknown;
  action?: (ctx: GenericActionCtx<DataModel>) => unknown;
};

/** Infer context types from config - defaults to raw Convex ctx when not specified */
type InferQueryCtx<T, DataModel extends GenericDataModel> = T extends {
  query: (...args: never[]) => infer R;
}
  ? R
  : GenericQueryCtx<DataModel>;
type InferMutationCtx<T, DataModel extends GenericDataModel> = T extends {
  mutation: (...args: never[]) => infer R;
}
  ? R
  : GenericMutationCtx<DataModel>;
type InferActionCtx<T, DataModel extends GenericDataModel> = T extends {
  action: (...args: never[]) => infer R;
}
  ? R
  : GenericActionCtx<DataModel>;

/** Function builders for each function type */
type FunctionsConfig = {
  query: unknown;
  internalQuery?: unknown;
  mutation: unknown;
  internalMutation?: unknown;
  action?: unknown;
  internalAction?: unknown;
};

/** Config for create() including optional defaultMeta */
type CreateConfig<TMeta extends object> = FunctionsConfig & {
  defaultMeta?: TMeta;
};

// =============================================================================
// Middleware Factory
// =============================================================================

/**
 * Create a middleware factory for building reusable middleware chains
 *
 * @example
 * ```typescript
 * const loggedIn = c.middleware(({ ctx, next }) => {
 *   if (!ctx.userId) throw new CRPCError({ code: 'UNAUTHORIZED' });
 *   return next({ ctx });
 * });
 *
 * const isAdmin = loggedIn.pipe(({ ctx, next }) => {
 *   if (!ctx.user.isAdmin) throw new CRPCError({ code: 'FORBIDDEN' });
 *   return next({ ctx });
 * });
 * ```
 */
export function createMiddlewareFactory<TDefaultContext, TMeta = object>() {
  function createMiddlewareInner<TContext, $ContextOverridesOut>(
    middlewares: AnyMiddleware[]
  ): MiddlewareBuilder<TContext, TMeta, $ContextOverridesOut> {
    return {
      _middlewares: middlewares,
      pipe<$NewContextOverrides>(
        fn: MiddlewareFunction<
          TContext,
          TMeta,
          $ContextOverridesOut,
          $NewContextOverrides
        >
      ) {
        return createMiddlewareInner<
          TContext,
          Overwrite<$ContextOverridesOut, $NewContextOverrides>
        >([...middlewares, fn as AnyMiddleware]);
      },
    };
  }

  return function createMiddleware<
    TContext = TDefaultContext,
    $ContextOverridesOut = object,
  >(
    fn: MiddlewareFunction<TContext, TMeta, object, $ContextOverridesOut>
  ): MiddlewareBuilder<TContext, TMeta, $ContextOverridesOut> {
    return createMiddlewareInner<TContext, $ContextOverridesOut>([
      fn as AnyMiddleware,
    ]);
  };
}

// =============================================================================
// Middleware Execution
// =============================================================================

/** Execute middleware chain recursively */
async function executeMiddlewares(
  middlewares: AnyMiddleware[],
  ctx: unknown,
  meta: unknown,
  index = 0
): Promise<MiddlewareResult<unknown>> {
  // Base case: no more middleware, return final context
  if (index >= middlewares.length) {
    return {
      marker: undefined as never, // Runtime doesn't need the marker
      ctx,
    };
  }

  const middleware = middlewares[index];

  // Create next function for this middleware
  const next = async (opts?: { ctx: any }) => {
    const nextCtx = opts?.ctx ?? ctx;
    return executeMiddlewares(middlewares, nextCtx, meta, index + 1);
  };

  // Execute current middleware
  return middleware({ ctx: ctx as any, meta, next });
}

// =============================================================================
// Procedure Builder
// =============================================================================

/** Internal definition storing procedure state */
type ProcedureBuilderDef<TMeta = object> = {
  middlewares: AnyMiddleware[];
  inputSchemas: Record<string, any>[];
  outputSchema?: z.ZodTypeAny;
  meta?: TMeta;
  functionConfig: InternalFunctionConfig;
  /** Whether this procedure uses internal function (not exposed to clients) */
  isInternal?: boolean;
};

/**
 * Fluent procedure builder with full type inference
 *
 * @typeParam TBaseCtx - Base context type from config
 * @typeParam TContext - Current context type (starts as TBaseCtx)
 * @typeParam TContextOverrides - Accumulated context from middleware (starts as UnsetMarker)
 * @typeParam TInput - Input schema (starts as UnsetMarker)
 * @typeParam TOutput - Output schema (starts as UnsetMarker)
 * @typeParam TMeta - Procedure metadata type
 */
export class ProcedureBuilder<
  TBaseCtx,
  // biome-ignore lint/correctness/noUnusedVariables: used in subclasses for type inference
  TContext,
  TContextOverrides extends UnsetMarker | object = UnsetMarker,
  // biome-ignore lint/correctness/noUnusedVariables: used in subclasses for type inference
  TInput extends UnsetMarker | z.ZodObject<any> = UnsetMarker,
  // biome-ignore lint/correctness/noUnusedVariables: used in subclasses for type inference
  TOutput extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TMeta extends object = object,
> {
  protected readonly _def: ProcedureBuilderDef<TMeta>;

  constructor(def: ProcedureBuilderDef<TMeta>) {
    this._def = def;
  }

  /** Add middleware that transforms the context - to be overridden by subclasses */
  protected _use<$ContextOverridesOut>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          TBaseCtx,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<TBaseCtx, TMeta, $ContextOverridesOut>
  ): ProcedureBuilderDef<TMeta> {
    const middlewares =
      '_middlewares' in middlewareOrBuilder
        ? middlewareOrBuilder._middlewares
        : [middlewareOrBuilder as AnyMiddleware];
    return {
      ...this._def,
      middlewares: [...this._def.middlewares, ...middlewares],
    };
  }

  /** Define input schema (chainable - schemas are merged) - to be overridden by subclasses */
  protected _input<TNewInput extends z.ZodObject<any>>(
    schema: TNewInput
  ): ProcedureBuilderDef<TMeta> {
    return {
      ...this._def,
      inputSchemas: [...this._def.inputSchemas, schema.shape],
    };
  }

  /** Define output schema - to be overridden by subclasses */
  protected _output<TNewOutput extends z.ZodTypeAny>(
    schema: TNewOutput
  ): ProcedureBuilderDef<TMeta> {
    return {
      ...this._def,
      outputSchema: schema,
    };
  }

  /** Set procedure metadata (shallow merged when chained) - to be overridden by subclasses */
  protected _meta(value: TMeta): ProcedureBuilderDef<TMeta> {
    return {
      ...this._def,
      meta: this._def.meta ? { ...this._def.meta, ...value } : value,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /** Merge all input schemas into one */
  protected _getMergedInput(): Record<string, any> | undefined {
    const { inputSchemas } = this._def;
    if (inputSchemas.length === 0) return;
    return Object.assign({}, ...inputSchemas);
  }

  protected _createFunction(
    handler: any,
    baseFunction: any,
    customFn:
      | typeof zCustomQuery
      | typeof zCustomMutation
      | typeof zCustomAction,
    fnType: 'query' | 'mutation' | 'action'
  ) {
    const { middlewares, outputSchema, meta, functionConfig, isInternal } =
      this._def;
    const mergedInput = this._getMergedInput();

    const customFunction = customFn(
      baseFunction,
      customCtx(async (_ctx) => {
        const baseCtx = functionConfig.createContext(_ctx);
        const result = await executeMiddlewares(middlewares, baseCtx, meta);
        return result.ctx;
      })
    );

    const fn = customFunction({
      args: mergedInput ?? {},
      ...(outputSchema ? { returns: outputSchema } : {}),
      handler: async (ctx: any, input: any) => handler({ ctx, input }),
    });

    // Attach metadata for codegen extraction
    (fn as any)._crpcMeta = {
      type: fnType,
      internal: isInternal ?? false,
      ...meta,
    };

    return fn;
  }
}

// =============================================================================
// Query Procedure Builder
// =============================================================================

/**
 * Query-specific procedure builder
 * Only exposes .query() and .internalQuery() methods
 */
export class QueryProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides extends UnsetMarker | object = UnsetMarker,
  TInput extends UnsetMarker | z.ZodObject<any> = UnsetMarker,
  TOutput extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TMeta extends object = object,
> extends ProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides,
  TInput,
  TOutput,
  TMeta
> {
  /** Add middleware that transforms the context - $ContextOverridesOut is inferred from next() */
  use<$ContextOverridesOut extends object>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<TBaseCtx, TMeta, $ContextOverridesOut>
  ): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInput,
    TOutput,
    TMeta
  > {
    return new QueryProcedureBuilder(this._use(middlewareOrBuilder as any));
  }

  /** Set procedure metadata (shallow merged when chained) */
  meta(
    value: TMeta
  ): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TOutput,
    TMeta
  > {
    return new QueryProcedureBuilder(this._meta(value));
  }

  /** Define input schema (chainable - schemas are merged) */
  input<TNewInput extends z.ZodObject<any>>(
    schema: TNewInput
  ): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    IntersectIfDefined<TInput, TNewInput>,
    TOutput,
    TMeta
  > {
    return new QueryProcedureBuilder(this._input(schema));
  }

  /**
   * Add pagination input (chainable before .query())
   *
   * Creates flat { cursor, limit } input like tRPC and auto-wraps output.
   * User accesses args.cursor and args.limit directly.
   *
   * @param opts.limit - Default/max items per page
   * @param opts.item - Zod schema for each item in the page array
   */
  paginated<TItem extends z.ZodTypeAny>(opts: {
    limit: number;
    item: TItem;
  }): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    IntersectIfDefined<TInput, PaginatedInputSchema>,
    z.ZodObject<{
      continueCursor: z.ZodString;
      isDone: z.ZodBoolean;
      page: z.ZodArray<TItem>;
    }>,
    TMeta
  > {
    // Flat pagination schema - user sees { cursor, limit } at top level
    const paginationSchemaWithDefault = z.object({
      cursor: z.union([z.string(), z.null()]).default(null),
      limit: z
        .number()
        .default(opts.limit)
        .transform((n) => Math.min(n, opts.limit)),
    });

    // Auto-wrap output with pagination result structure
    const outputSchema = z.object({
      continueCursor: z.string(),
      isDone: z.boolean(),
      page: z.array(opts.item),
    });

    return new QueryProcedureBuilder({
      ...this._def,
      inputSchemas: [
        ...this._def.inputSchemas,
        paginationSchemaWithDefault.shape,
      ],
      outputSchema,
      meta: {
        ...this._def.meta,
        limit: opts.limit, // Server default for tooling/codegen
      } as TMeta,
    });
  }

  /** Define output schema */
  output<TNewOutput extends z.ZodTypeAny>(
    schema: TNewOutput
  ): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TNewOutput,
    TMeta
  > {
    return new QueryProcedureBuilder(this._output(schema));
  }

  /** Create a query */
  query<TResult>(
    handler: (opts: {
      ctx: Overwrite<TContext, TContextOverrides>;
      input: InferInput<TInput>;
    }) => Promise<TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult>
  ) {
    return this._createFunction(
      handler,
      this._def.functionConfig.base,
      zCustomQuery,
      'query'
    );
  }

  /** Mark as internal - returns chainable builder using internal function */
  internal(): QueryProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TOutput,
    TMeta
  > {
    const internal = this._def.functionConfig.internal;
    if (!internal) {
      throw new Error('internalQuery base function not configured');
    }
    return new QueryProcedureBuilder({
      ...this._def,
      isInternal: true,
      functionConfig: {
        ...this._def.functionConfig,
        base: internal,
      },
    });
  }
}

// =============================================================================
// Mutation Procedure Builder
// =============================================================================

/**
 * Mutation-specific procedure builder
 * Only exposes .mutation() and .internalMutation() methods
 */
export class MutationProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides extends UnsetMarker | object = UnsetMarker,
  TInput extends UnsetMarker | z.ZodObject<any> = UnsetMarker,
  TOutput extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TMeta extends object = object,
> extends ProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides,
  TInput,
  TOutput,
  TMeta
> {
  /** Add middleware that transforms the context - $ContextOverridesOut is inferred from next() */
  use<$ContextOverridesOut extends object>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<TBaseCtx, TMeta, $ContextOverridesOut>
  ): MutationProcedureBuilder<
    TBaseCtx,
    TContext,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInput,
    TOutput,
    TMeta
  > {
    return new MutationProcedureBuilder(this._use(middlewareOrBuilder as any));
  }

  /** Set procedure metadata (shallow merged when chained) */
  meta(
    value: TMeta
  ): MutationProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TOutput,
    TMeta
  > {
    return new MutationProcedureBuilder(this._meta(value));
  }

  /** Define input schema (chainable - schemas are merged) */
  input<TNewInput extends z.ZodObject<any>>(
    schema: TNewInput
  ): MutationProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    IntersectIfDefined<TInput, TNewInput>,
    TOutput,
    TMeta
  > {
    return new MutationProcedureBuilder(this._input(schema));
  }

  /** Define output schema */
  output<TNewOutput extends z.ZodTypeAny>(
    schema: TNewOutput
  ): MutationProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TNewOutput,
    TMeta
  > {
    return new MutationProcedureBuilder(this._output(schema));
  }

  /** Create a mutation */
  mutation<TResult>(
    handler: (opts: {
      ctx: Overwrite<TContext, TContextOverrides>;
      input: InferInput<TInput>;
    }) => Promise<TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult>
  ) {
    return this._createFunction(
      handler,
      this._def.functionConfig.base,
      zCustomMutation,
      'mutation'
    );
  }

  /** Mark as internal - returns chainable builder using internal function */
  internal(): MutationProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TOutput,
    TMeta
  > {
    const internal = this._def.functionConfig.internal;
    if (!internal) {
      throw new Error('internalMutation base function not configured');
    }
    return new MutationProcedureBuilder({
      ...this._def,
      isInternal: true,
      functionConfig: {
        ...this._def.functionConfig,
        base: internal,
      },
    });
  }
}

// =============================================================================
// Action Procedure Builder
// =============================================================================

/**
 * Action-specific procedure builder
 * Only exposes .action() and .internalAction() methods
 */
export class ActionProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides extends UnsetMarker | object = UnsetMarker,
  TInput extends UnsetMarker | z.ZodObject<any> = UnsetMarker,
  TOutput extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TMeta extends object = object,
> extends ProcedureBuilder<
  TBaseCtx,
  TContext,
  TContextOverrides,
  TInput,
  TOutput,
  TMeta
> {
  /** Add middleware that transforms the context - $ContextOverridesOut is inferred from next() */
  use<$ContextOverridesOut extends object>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<TBaseCtx, TMeta, $ContextOverridesOut>
  ): ActionProcedureBuilder<
    TBaseCtx,
    TContext,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInput,
    TOutput,
    TMeta
  > {
    return new ActionProcedureBuilder(this._use(middlewareOrBuilder as any));
  }

  /** Set procedure metadata (shallow merged when chained) */
  meta(
    value: TMeta
  ): ActionProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TOutput,
    TMeta
  > {
    return new ActionProcedureBuilder(this._meta(value));
  }

  /** Define input schema (chainable - schemas are merged) */
  input<TNewInput extends z.ZodObject<any>>(
    schema: TNewInput
  ): ActionProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    IntersectIfDefined<TInput, TNewInput>,
    TOutput,
    TMeta
  > {
    return new ActionProcedureBuilder(this._input(schema));
  }

  /** Define output schema */
  output<TNewOutput extends z.ZodTypeAny>(
    schema: TNewOutput
  ): ActionProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TNewOutput,
    TMeta
  > {
    return new ActionProcedureBuilder(this._output(schema));
  }

  /** Create an action */
  action<TResult>(
    handler: (opts: {
      ctx: Overwrite<TContext, TContextOverrides>;
      input: InferInput<TInput>;
    }) => Promise<TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult>
  ) {
    return this._createFunction(
      handler,
      this._def.functionConfig.base,
      zCustomAction,
      'action'
    );
  }

  /** Mark as internal - returns chainable builder using internal function */
  internal(): ActionProcedureBuilder<
    TBaseCtx,
    TContext,
    TContextOverrides,
    TInput,
    TOutput,
    TMeta
  > {
    const internal = this._def.functionConfig.internal;
    if (!internal) {
      throw new Error('internalAction base function not configured');
    }
    return new ActionProcedureBuilder({
      ...this._def,
      isInternal: true,
      functionConfig: {
        ...this._def.functionConfig,
        base: internal,
      },
    });
  }
}

// =============================================================================
// Factory - tRPC-style Builder Chain
// =============================================================================

/** Return type for create() - action is only present when configured */
type CRPCInstance<
  TQueryCtx,
  TMutationCtx,
  TActionCtx,
  TMeta extends object = object,
> = {
  query: QueryProcedureBuilder<
    TQueryCtx,
    TQueryCtx,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    TMeta
  >;
  mutation: MutationProcedureBuilder<
    TMutationCtx,
    TMutationCtx,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    TMeta
  >;
  /** Create reusable middleware - defaults to query context, override with generic */
  middleware: <TContext = TQueryCtx, $ContextOverridesOut = object>(
    fn: MiddlewareFunction<TContext, TMeta, object, $ContextOverridesOut>
  ) => MiddlewareBuilder<TContext, TMeta, $ContextOverridesOut>;
} & ([TActionCtx] extends [never]
  ? object
  : {
      action: ActionProcedureBuilder<
        TActionCtx,
        TActionCtx,
        UnsetMarker,
        UnsetMarker,
        UnsetMarker,
        TMeta
      >;
    });

/**
 * Builder with context configured, ready to create instance
 */
class CRPCBuilderWithContext<
  DataModel extends GenericDataModel,
  TQueryCtx,
  TMutationCtx,
  TActionCtx = never,
  TMeta extends object = object,
> {
  private readonly contextConfig: ContextConfig<DataModel>;

  constructor(contextConfig: ContextConfig<DataModel>) {
    this.contextConfig = contextConfig;
  }

  /**
   * Define the metadata type for procedures (can be called after context)
   */
  meta<TNewMeta extends object>(): CRPCBuilderWithContext<
    DataModel,
    TQueryCtx,
    TMutationCtx,
    TActionCtx,
    TNewMeta
  > {
    return this as unknown as CRPCBuilderWithContext<
      DataModel,
      TQueryCtx,
      TMutationCtx,
      TActionCtx,
      TNewMeta
    >;
  }

  /**
   * Create the CRPC instance with function builders
   */
  create(
    config: CreateConfig<TMeta>
  ): CRPCInstance<TQueryCtx, TMutationCtx, TActionCtx, TMeta> {
    const { defaultMeta = {} as TMeta, ...functionsConfig } = config;

    const result = {
      query: new QueryProcedureBuilder<
        TQueryCtx,
        TQueryCtx,
        UnsetMarker,
        UnsetMarker,
        UnsetMarker,
        TMeta
      >({
        middlewares: [],
        inputSchemas: [],
        meta: defaultMeta,
        functionConfig: {
          base: functionsConfig.query,
          internal: functionsConfig.internalQuery,
          createContext: this.contextConfig.query ?? ((ctx) => ctx),
        },
      }),
      mutation: new MutationProcedureBuilder<
        TMutationCtx,
        TMutationCtx,
        UnsetMarker,
        UnsetMarker,
        UnsetMarker,
        TMeta
      >({
        middlewares: [],
        inputSchemas: [],
        meta: defaultMeta,
        functionConfig: {
          base: functionsConfig.mutation,
          internal: functionsConfig.internalMutation,
          createContext: this.contextConfig.mutation ?? ((ctx) => ctx),
        },
      }),
      middleware: createMiddlewareFactory<TQueryCtx, TMeta>(),
    } as CRPCInstance<TQueryCtx, TMutationCtx, TActionCtx, TMeta>;

    if (functionsConfig.action) {
      (
        result as {
          action: ActionProcedureBuilder<
            TActionCtx,
            TActionCtx,
            UnsetMarker,
            UnsetMarker,
            UnsetMarker,
            TMeta
          >;
        }
      ).action = new ActionProcedureBuilder<
        TActionCtx,
        TActionCtx,
        UnsetMarker,
        UnsetMarker,
        UnsetMarker,
        TMeta
      >({
        middlewares: [],
        inputSchemas: [],
        meta: defaultMeta,
        functionConfig: {
          base: functionsConfig.action,
          internal: functionsConfig.internalAction,
          // Use custom action context or default to identity
          createContext: this.contextConfig.action ?? ((ctx) => ctx),
        },
      });
    }

    return result;
  }
}

/**
 * Builder with meta type configured
 */
class CRPCBuilderWithMeta<
  DataModel extends GenericDataModel,
  TMeta extends object = object,
> {
  /**
   * Configure context creators for each function type
   */
  context<TConfig extends ContextConfig<DataModel>>(
    config: TConfig
  ): CRPCBuilderWithContext<
    DataModel,
    InferQueryCtx<TConfig, DataModel>,
    InferMutationCtx<TConfig, DataModel>,
    InferActionCtx<TConfig, DataModel>,
    TMeta
  > {
    return new CRPCBuilderWithContext(config);
  }

  /**
   * Create the CRPC instance directly (uses default passthrough context)
   */
  create(
    config: CreateConfig<TMeta>
  ): CRPCInstance<
    GenericQueryCtx<DataModel>,
    GenericMutationCtx<DataModel>,
    GenericActionCtx<DataModel>,
    TMeta
  > {
    return new CRPCBuilderWithContext<
      DataModel,
      GenericQueryCtx<DataModel>,
      GenericMutationCtx<DataModel>,
      GenericActionCtx<DataModel>,
      TMeta
    >({}).create(config);
  }
}

/**
 * Initial CRPC builder - configure meta and context
 */
class CRPCBuilder<DataModel extends GenericDataModel> {
  /**
   * Define the metadata type for procedures
   */
  meta<TMeta extends object>(): CRPCBuilderWithMeta<DataModel, TMeta> {
    return new CRPCBuilderWithMeta();
  }

  /**
   * Configure context creators for each function type
   */
  context<TConfig extends ContextConfig<DataModel>>(
    config: TConfig
  ): CRPCBuilderWithContext<
    DataModel,
    InferQueryCtx<TConfig, DataModel>,
    InferMutationCtx<TConfig, DataModel>,
    InferActionCtx<TConfig, DataModel>
  > {
    return new CRPCBuilderWithContext(config);
  }

  /**
   * Create the CRPC instance directly (uses default passthrough context)
   */
  create(
    config: CreateConfig<object>
  ): CRPCInstance<
    GenericQueryCtx<DataModel>,
    GenericMutationCtx<DataModel>,
    GenericActionCtx<DataModel>,
    object
  > {
    return new CRPCBuilderWithContext<
      DataModel,
      GenericQueryCtx<DataModel>,
      GenericMutationCtx<DataModel>,
      GenericActionCtx<DataModel>
    >({}).create(config);
  }
}

/**
 * CRPC entry point - tRPC-style object
 *
 * @example
 * ```typescript
 * // With explicit DataModel type
 * const c = initCRPC
 *   .dataModel<DataModel>()
 *   .context({...})
 *   .create({...});
 *
 * // Without DataModel (uses GenericDataModel)
 * const c = initCRPC
 *   .context({...})
 *   .create({...});
 * ```
 */
export const initCRPC = {
  /**
   * Set the DataModel type for the CRPC instance
   */
  dataModel<DataModel extends GenericDataModel>(): CRPCBuilder<DataModel> {
    return new CRPCBuilder();
  },

  /**
   * Define the metadata type (uses GenericDataModel)
   */
  meta<TMeta extends object>(): CRPCBuilderWithMeta<GenericDataModel, TMeta> {
    return new CRPCBuilderWithMeta();
  },

  /**
   * Configure context creators (uses GenericDataModel)
   */
  context<TConfig extends ContextConfig<GenericDataModel>>(
    config: TConfig
  ): CRPCBuilderWithContext<
    GenericDataModel,
    InferQueryCtx<TConfig, GenericDataModel>,
    InferMutationCtx<TConfig, GenericDataModel>,
    InferActionCtx<TConfig, GenericDataModel>
  > {
    return new CRPCBuilderWithContext(config);
  },

  /**
   * Create the CRPC instance directly (uses GenericDataModel and default passthrough context)
   */
  create(
    config: CreateConfig<object>
  ): CRPCInstance<
    GenericQueryCtx<GenericDataModel>,
    GenericMutationCtx<GenericDataModel>,
    GenericActionCtx<GenericDataModel>,
    object
  > {
    return new CRPCBuilderWithContext<
      GenericDataModel,
      GenericQueryCtx<GenericDataModel>,
      GenericMutationCtx<GenericDataModel>,
      GenericActionCtx<GenericDataModel>
    >({}).create(config);
  },
};
