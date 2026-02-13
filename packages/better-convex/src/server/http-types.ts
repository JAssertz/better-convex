import type { GenericActionCtx, GenericDataModel } from 'convex/server';
import type { Context } from 'hono';
import type { z } from 'zod';
import type { CombinedDataTransformer } from '../crpc/transformer';
import type { AnyMiddleware, UnsetMarker } from './types';

// Procedure metadata (same as TMeta generic)
export type ProcedureMeta = object;

// HTTP Methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Route definition stored on the procedure
export interface HttpRouteDefinition<TMethod extends HttpMethod = HttpMethod> {
  path: string;
  method: TMethod;
  pathParamNames: string[];
  usePathPrefix: boolean;
}

/**
 * Infer output type from schema, defaulting to void for UnsetMarker
 */
export type InferHttpInput<T> = T extends UnsetMarker
  ? undefined
  : T extends z.ZodTypeAny
    ? z.output<T>
    : never;

/**
 * Internal definition for HttpProcedureBuilder
 * Stores schema types directly (like QueryProcedureBuilder)
 */
export interface HttpProcedureBuilderDef<
  TCtx,
  TInput extends UnsetMarker | z.ZodTypeAny,
  TOutput extends UnsetMarker | z.ZodTypeAny,
  TParams extends UnsetMarker | z.ZodTypeAny,
  TQuery extends UnsetMarker | z.ZodTypeAny,
  TMeta extends ProcedureMeta,
  TMethod extends HttpMethod = HttpMethod,
  TForm extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
> {
  middlewares: AnyMiddleware[];
  meta: TMeta;
  inputSchema?: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  paramsSchema?: z.ZodTypeAny;
  querySchema?: z.ZodTypeAny;
  formSchema?: z.ZodTypeAny;
  route?: HttpRouteDefinition<TMethod>;
  functionConfig: {
    base: HttpActionConstructor;
    createContext: (ctx: GenericActionCtx<GenericDataModel>) => TCtx;
    transformer: CombinedDataTransformer;
  };
  /** @internal Phantom types for type inference */
  _types?: {
    input: TInput;
    output: TOutput;
    params: TParams;
    query: TQuery;
    form: TForm;
  };
}

// Type for httpAction constructor from convex/server (HttpActionBuilder)
export type HttpActionConstructor = (
  handler: (
    ctx: GenericActionCtx<GenericDataModel>,
    request: Request
  ) => Promise<Response>
) => HttpActionHandler;

// Return type of httpAction() - matches Convex's PublicHttpAction
export interface HttpActionHandler {
  isHttp: true;
}

// Final HTTP procedure with route metadata and def for client type inference
export interface HttpProcedure<
  TInput extends UnsetMarker | z.ZodTypeAny = any,
  TOutput extends UnsetMarker | z.ZodTypeAny = any,
  TParams extends UnsetMarker | z.ZodTypeAny = any,
  TQuery extends UnsetMarker | z.ZodTypeAny = any,
  TMethod extends HttpMethod = HttpMethod,
  TForm extends UnsetMarker | z.ZodTypeAny = any,
> extends HttpActionHandler {
  _crpcHttpRoute: HttpRouteDefinition<TMethod>;
  /** @internal Expose def for client-side type inference */
  _def: {
    inputSchema?: TInput;
    outputSchema?: TOutput;
    paramsSchema?: TParams;
    querySchema?: TQuery;
    formSchema?: TForm;
  };
}

/**
 * Handler options with ctx namespace (consistent with cRPC queries/mutations).
 * - ctx: context properties (userId, db, runQuery, etc.)
 * - input: parsed JSON body
 * - params: parsed path params
 * - searchParams: parsed query params
 * - form: parsed form data
 * - c: Hono Context for Response helpers (c.json, c.text, c.redirect, c.header, c.req)
 */
export type HttpHandlerOpts<
  TCtx,
  TInput extends UnsetMarker | z.ZodTypeAny,
  TParams extends UnsetMarker | z.ZodTypeAny,
  TSearchParams extends UnsetMarker | z.ZodTypeAny,
  TForm extends UnsetMarker | z.ZodTypeAny,
> = { ctx: TCtx; c: Context } & (TInput extends UnsetMarker
  ? object
  : { input: z.output<TInput> }) &
  (TParams extends UnsetMarker ? object : { params: z.output<TParams> }) &
  (TSearchParams extends UnsetMarker
    ? object
    : { searchParams: z.output<TSearchParams> }) &
  (TForm extends UnsetMarker ? object : { form: z.output<TForm> });

/**
 * Hono handler with cRPC route metadata attached
 */
export interface CRPCHonoHandler {
  (c: Context): Promise<Response>;
  _crpcRoute: {
    path: string;
    method: HttpMethod;
  };
}
