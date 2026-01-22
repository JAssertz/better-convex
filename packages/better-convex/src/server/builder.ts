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

import {
  createHttpProcedureBuilder,
  type HttpProcedureBuilder,
} from './http-builder';
import {
  type CRPCHttpRouter,
  createHttpRouterFactory,
  type HttpRouterRecord,
} from './http-router';
import type { HttpActionConstructor, HttpMethod } from './http-types';
import type {
  AnyMiddleware,
  GetRawInputFn,
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
 * Infer input type from ZodObject schema (for handlers)
 */
type InferInput<T> = T extends UnsetMarker
  ? Record<string, never>
  : T extends z.ZodObject<any>
    ? z.infer<T>
    : never;

/**
 * Infer input type for middleware (returns unknown for UnsetMarker, matching tRPC)
 * Middleware before .input() receives unknown input
 */
type InferMiddlewareInput<T> = T extends UnsetMarker
  ? unknown
  : T extends z.ZodObject<any>
    ? z.infer<T>
    : unknown;

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
  httpAction?: unknown;
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

/** Result from middleware execution including potentially modified input */
type MiddlewareExecutionResult = MiddlewareResult<unknown> & {
  input: unknown;
};

/** Execute middleware chain recursively with input access */
async function executeMiddlewares(
  middlewares: AnyMiddleware[],
  ctx: unknown,
  meta: unknown,
  input: unknown,
  getRawInput: GetRawInputFn,
  index = 0
): Promise<MiddlewareExecutionResult> {
  // Base case: no more middleware, return final context and input
  if (index >= middlewares.length) {
    return {
      marker: undefined as never, // Runtime doesn't need the marker
      ctx,
      input,
    };
  }

  const middleware = middlewares[index];

  // Track input modifications through the chain
  let currentInput = input;

  // Create next function for this middleware (tRPC-compatible signature)
  const next = async (opts?: { ctx?: unknown; input?: unknown }) => {
    const nextCtx = opts?.ctx ?? ctx;
    const nextInput = opts?.input ?? currentInput;
    // Track input modification
    if (opts?.input !== undefined) {
      currentInput = opts.input;
    }
    const result = await executeMiddlewares(
      middlewares,
      nextCtx,
      meta,
      nextInput,
      getRawInput,
      index + 1
    );
    return result;
  };

  // Execute current middleware with input and getRawInput
  const result = await middleware({
    ctx: ctx as any,
    meta,
    input,
    getRawInput,
    next,
  });

  // Return result with potentially modified context and input
  return {
    marker: undefined as never,
    ctx: result.ctx ?? ctx,
    input: currentInput,
  };
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

    // Use customCtx for initial context transformation only
    const customFunction = customFn(
      baseFunction,
      customCtx(async (_ctx) => functionConfig.createContext(_ctx))
    );

    const fn = customFunction({
      args: mergedInput ?? {},
      ...(outputSchema ? { returns: outputSchema } : {}),
      handler: async (ctx: any, rawInput: any) => {
        // Create getRawInput function for middleware
        const getRawInput: GetRawInputFn = async () => rawInput;

        // Execute middleware chain with input access
        const result = await executeMiddlewares(
          middlewares,
          ctx,
          meta,
          rawInput,
          getRawInput
        );

        // Call handler with middleware-modified context and input
        return handler({ ctx: result.ctx, input: result.input ?? rawInput });
      },
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
  /**
   * Add middleware that transforms the context
   * Middleware receives typed input if called after .input(), unknown otherwise
   * $ContextOverridesOut is inferred from next()
   */
  use<$ContextOverridesOut extends object>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
      | MiddlewareBuilder<
          TBaseCtx,
          TMeta,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
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
  /**
   * Add middleware that transforms the context
   * Middleware receives typed input if called after .input(), unknown otherwise
   * $ContextOverridesOut is inferred from next()
   */
  use<$ContextOverridesOut extends object>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
      | MiddlewareBuilder<
          TBaseCtx,
          TMeta,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
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
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
      | MiddlewareBuilder<
          TBaseCtx,
          TMeta,
          $ContextOverridesOut,
          InferMiddlewareInput<TInput>
        >
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

/** Return type for create() - action/httpAction only present when configured */
type CRPCInstance<
  _DataModel extends GenericDataModel,
  TQueryCtx,
  TMutationCtx,
  TActionCtx,
  THttpActionCtx = never,
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
  /** Create HTTP router (like tRPC's t.router) */
  router: <TRecord extends HttpRouterRecord>(
    record: TRecord
  ) => CRPCHttpRouter<TRecord>;
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
    }) &
  ([THttpActionCtx] extends [never]
    ? object
    : {
        httpAction: HttpProcedureBuilder<
          THttpActionCtx,
          THttpActionCtx,
          UnsetMarker,
          UnsetMarker,
          UnsetMarker,
          UnsetMarker,
          TMeta,
          HttpMethod
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
  THttpActionCtx = never,
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
    THttpActionCtx,
    TNewMeta
  > {
    return this as unknown as CRPCBuilderWithContext<
      DataModel,
      TQueryCtx,
      TMutationCtx,
      TActionCtx,
      THttpActionCtx,
      TNewMeta
    >;
  }

  /**
   * Create the CRPC instance with function builders
   */
  create(
    config: CreateConfig<TMeta>
  ): CRPCInstance<
    DataModel,
    TQueryCtx,
    TMutationCtx,
    TActionCtx,
    THttpActionCtx,
    TMeta
  > {
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
      router: createHttpRouterFactory(),
    } as CRPCInstance<
      DataModel,
      TQueryCtx,
      TMutationCtx,
      TActionCtx,
      THttpActionCtx,
      TMeta
    >;

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

    if (functionsConfig.httpAction) {
      (
        result as {
          httpAction: HttpProcedureBuilder<
            THttpActionCtx,
            THttpActionCtx,
            UnsetMarker,
            UnsetMarker,
            UnsetMarker,
            UnsetMarker,
            TMeta,
            HttpMethod
          >;
        }
      ).httpAction = createHttpProcedureBuilder({
        base: functionsConfig.httpAction as HttpActionConstructor,
        // httpAction uses action context or default to identity
        createContext: this.contextConfig.action ?? ((ctx: any) => ctx),
        meta: defaultMeta,
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
    InferActionCtx<TConfig, DataModel>, // httpAction uses action context
    TMeta
  > {
    return new CRPCBuilderWithContext(config);
  }

  /**
   * Create the CRPC instance directly (uses default passthrough context)
   */
  create(config: CreateConfig<TMeta>): CRPCInstance<
    DataModel,
    GenericQueryCtx<DataModel>,
    GenericMutationCtx<DataModel>,
    GenericActionCtx<DataModel>,
    GenericActionCtx<DataModel>, // httpAction uses action context
    TMeta
  > {
    return new CRPCBuilderWithContext<
      DataModel,
      GenericQueryCtx<DataModel>,
      GenericMutationCtx<DataModel>,
      GenericActionCtx<DataModel>,
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
    InferActionCtx<TConfig, DataModel>,
    InferActionCtx<TConfig, DataModel> // httpAction uses action context
  > {
    return new CRPCBuilderWithContext(config);
  }

  /**
   * Create the CRPC instance directly (uses default passthrough context)
   */
  create(config: CreateConfig<object>): CRPCInstance<
    DataModel,
    GenericQueryCtx<DataModel>,
    GenericMutationCtx<DataModel>,
    GenericActionCtx<DataModel>,
    GenericActionCtx<DataModel>, // httpAction uses action context
    object
  > {
    return new CRPCBuilderWithContext<
      DataModel,
      GenericQueryCtx<DataModel>,
      GenericMutationCtx<DataModel>,
      GenericActionCtx<DataModel>,
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
    InferActionCtx<TConfig, GenericDataModel>,
    InferActionCtx<TConfig, GenericDataModel> // httpAction uses action context
  > {
    return new CRPCBuilderWithContext(config);
  },

  /**
   * Create the CRPC instance directly (uses GenericDataModel and default passthrough context)
   */
  create(config: CreateConfig<object>): CRPCInstance<
    GenericDataModel,
    GenericQueryCtx<GenericDataModel>,
    GenericMutationCtx<GenericDataModel>,
    GenericActionCtx<GenericDataModel>,
    GenericActionCtx<GenericDataModel>, // httpAction uses action context
    object
  > {
    return new CRPCBuilderWithContext<
      GenericDataModel,
      GenericQueryCtx<GenericDataModel>,
      GenericMutationCtx<GenericDataModel>,
      GenericActionCtx<GenericDataModel>,
      GenericActionCtx<GenericDataModel>
    >({}).create(config);
  },
};
