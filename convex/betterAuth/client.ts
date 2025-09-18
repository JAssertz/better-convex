import {
  FunctionHandle,
  type FunctionReference,
  type HttpRouter,
  httpActionGeneric,
  internalMutationGeneric,
  paginationOptsValidator,
  internalQueryGeneric,
} from 'convex/server';
import { type GenericId, Infer, v } from 'convex/values';
import { betterAuth } from 'better-auth';
import { asyncMap } from 'convex-helpers';
import { partial } from 'convex-helpers/validators';
import { corsRouter } from 'convex-helpers/server/cors';
import { getAuthTables } from 'better-auth/db';
import { requireEnv } from '@convex-dev/better-auth/utils';
import { convexAdapter } from './convexAdapter';
import {
  checkUniqueFields,
  selectFields,
  adapterWhereValidator,
  listOne,
  paginate,
  hasUniqueFields,
} from './adapterUtils';
import schema from '../schema';
import { GenericCtx, MutationCtx } from '../_generated/server';
import { Schema } from '../shared/types';
import { Id } from '../_generated/dataModel';

export type CreateAuth =
  | ((ctx: GenericCtx) => ReturnType<typeof betterAuth>)
  | ((
      ctx: GenericCtx,
      opts?: { optionsOnly?: boolean }
    ) => ReturnType<typeof betterAuth>);

export const getStaticAuth = (createAuth: CreateAuth) => {
  return createAuth({} as any, { optionsOnly: true });
};

const whereValidator = (schema: Schema, tableName: keyof Schema['tables']) =>
  v.object({
    field: v.union(
      ...Object.keys(schema.tables[tableName].validator.fields).map((field) =>
        v.literal(field)
      ),
      v.literal('id')
    ),
    operator: v.optional(
      v.union(
        v.literal('lt'),
        v.literal('lte'),
        v.literal('gt'),
        v.literal('gte'),
        v.literal('eq'),
        v.literal('in'),
        v.literal('ne'),
        v.literal('contains'),
        v.literal('starts_with'),
        v.literal('ends_with')
      )
    ),
    value: v.union(
      v.string(),
      v.number(),
      v.boolean(),
      v.array(v.string()),
      v.array(v.number()),
      v.null()
    ),
    connector: v.optional(v.union(v.literal('AND'), v.literal('OR'))),
  });

export type AuthFunctions = {
  onCreate?: FunctionReference<'mutation', 'internal', { [key: string]: any }>;
  onUpdate?: FunctionReference<'mutation', 'internal', { [key: string]: any }>;
  onDelete?: FunctionReference<'mutation', 'internal', { [key: string]: any }>;
};

export const createApi = (createAuth: CreateAuth) => {
  const betterAuthSchema = getAuthTables(getStaticAuth(createAuth).options);

  return {
    create: internalMutationGeneric({
      args: {
        input: v.union(
          ...Object.entries(schema.tables).map(([model, table]) =>
            v.object({
              model: v.literal(model),
              data: v.object((table as any).validator.fields),
            })
          )
        ),
        select: v.optional(v.array(v.string())),
        onCreateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        await checkUniqueFields(
          ctx,
          schema,
          betterAuthSchema,
          args.input.model,
          args.input.data
        );
        const id = await ctx.db.insert(
          args.input.model as any,
          args.input.data
        );
        const doc = await ctx.db.get(id);
        if (!doc) {
          throw new Error(`Failed to create ${args.input.model}`);
        }
        const result = selectFields(doc, args.select);
        if (args.onCreateHandle) {
          await ctx.runMutation(
            args.onCreateHandle as FunctionHandle<'mutation'>,
            {
              model: args.input.model,
              doc,
            }
          );
        }
        return result;
      },
    }),
    findOne: internalQueryGeneric({
      args: {
        model: v.union(
          ...Object.keys(schema.tables).map((model) => v.literal(model))
        ),
        where: v.optional(v.array(adapterWhereValidator)),
        select: v.optional(v.array(v.string())),
      },
      handler: async (ctx, args) => {
        return await listOne(ctx, schema, betterAuthSchema, args);
      },
    }),
    findMany: internalQueryGeneric({
      args: {
        model: v.union(
          ...Object.keys(schema.tables).map((model) => v.literal(model))
        ),
        where: v.optional(v.array(adapterWhereValidator)),
        limit: v.optional(v.number()),
        sortBy: v.optional(
          v.object({
            direction: v.union(v.literal('asc'), v.literal('desc')),
            field: v.string(),
          })
        ),
        offset: v.optional(v.number()),
        paginationOpts: paginationOptsValidator,
      },
      handler: async (ctx, args) => {
        return await paginate(ctx, schema, betterAuthSchema, args);
      },
    }),
    updateOne: internalMutationGeneric({
      args: {
        input: v.union(
          ...Object.entries(schema.tables).map(
            ([tableName, table]: [
              keyof Schema['tables'],
              Schema['tables'][keyof Schema['tables']],
            ]) => {
              const fields = partial(table.validator.fields);
              return v.object({
                model: v.literal(tableName),
                update: v.object(fields),
                where: v.optional(v.array(whereValidator(schema, tableName))),
              });
            }
          )
        ),
        onUpdateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        const doc = await listOne(ctx, schema, betterAuthSchema, args.input);
        if (!doc) {
          throw new Error(`Failed to update ${args.input.model}`);
        }
        await checkUniqueFields(
          ctx,
          schema,
          betterAuthSchema,
          args.input.model,
          args.input.update,
          doc
        );
        await ctx.db.patch(
          doc._id as GenericId<string>,
          args.input.update as any
        );
        const updatedDoc = await ctx.db.get(doc._id as GenericId<string>);
        if (!updatedDoc) {
          throw new Error(`Failed to update ${args.input.model}`);
        }
        if (args.onUpdateHandle) {
          await ctx.runMutation(
            args.onUpdateHandle as FunctionHandle<'mutation'>,
            {
              model: args.input.model,
              oldDoc: doc,
              newDoc: updatedDoc,
            }
          );
        }
        return updatedDoc;
      },
    }),
    updateMany: internalMutationGeneric({
      args: {
        input: v.union(
          ...Object.entries(schema.tables).map(
            ([tableName, table]: [
              keyof Schema['tables'],
              Schema['tables'][keyof Schema['tables']],
            ]) => {
              const fields = partial(table.validator.fields);
              return v.object({
                model: v.literal(tableName),
                update: v.object(fields),
                where: v.optional(v.array(whereValidator(schema, tableName))),
              });
            }
          )
        ),
        paginationOpts: paginationOptsValidator,
        onUpdateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        const { page, ...result } = await paginate(
          ctx,
          schema,
          betterAuthSchema,
          {
            ...args.input,
            paginationOpts: args.paginationOpts,
          }
        );
        if (args.input.update) {
          if (
            hasUniqueFields(
              betterAuthSchema,
              args.input.model,
              args.input.update ?? {}
            ) &&
            page.length > 1
          ) {
            throw new Error(
              `Attempted to set unique fields in multiple documents in ${args.input.model} with the same value. Fields: ${Object.keys(args.input.update ?? {}).join(', ')}`
            );
          }
          await asyncMap(page, async (doc: any) => {
            await checkUniqueFields(
              ctx,
              schema,
              betterAuthSchema,
              args.input.model,
              args.input.update ?? {},
              doc
            );
            await ctx.db.patch(
              doc._id as GenericId<string>,
              args.input.update as any
            );

            if (args.onUpdateHandle) {
              await ctx.runMutation(
                args.onUpdateHandle as FunctionHandle<'mutation'>,
                {
                  model: args.input.model,
                  oldDoc: doc,
                  newDoc: await ctx.db.get(doc._id as GenericId<string>),
                }
              );
            }
          });
        }
        return {
          ...result,
          count: page.length,
          ids: page.map((doc) => doc._id),
        };
      },
    }),
    deleteOne: internalMutationGeneric({
      args: {
        input: v.union(
          ...Object.keys(schema.tables).map((tableName) => {
            return v.object({
              model: v.literal(tableName),
              where: v.optional(
                v.array(
                  whereValidator(schema, tableName as keyof Schema['tables'])
                )
              ),
            });
          })
        ),
        onDeleteHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        const doc = await listOne(ctx, schema, betterAuthSchema, args.input);
        if (!doc) {
          return;
        }
        await ctx.db.delete(doc._id as GenericId<string>);
        if (args.onDeleteHandle) {
          await ctx.runMutation(
            args.onDeleteHandle as FunctionHandle<'mutation'>,
            { model: args.input.model, doc }
          );
        }
        return doc;
      },
    }),
    deleteMany: internalMutationGeneric({
      args: {
        input: v.union(
          ...Object.keys(schema.tables).map((tableName) => {
            return v.object({
              model: v.literal(tableName),
              where: v.optional(
                v.array(
                  whereValidator(schema, tableName as keyof Schema['tables'])
                )
              ),
            });
          })
        ),
        paginationOpts: paginationOptsValidator,
        onDeleteHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        const { page, ...result } = await paginate(
          ctx,
          schema,
          betterAuthSchema,
          {
            ...args.input,
            paginationOpts: args.paginationOpts,
          }
        );
        await asyncMap(page, async (doc: any) => {
          if (args.onDeleteHandle) {
            await ctx.runMutation(
              args.onDeleteHandle as FunctionHandle<'mutation'>,
              {
                model: args.input.model,
                doc,
              }
            );
          }
          await ctx.db.delete(doc._id as GenericId<string>);
        });
        return {
          ...result,
          count: page.length,
          ids: page.map((doc) => doc._id),
        };
      },
    }),
  };
};

export type Triggers = {
  [K in keyof Schema['tables']]?: {
    onCreate?: <Ctx extends MutationCtx>(
      ctx: Ctx,
      doc: Infer<Schema['tables'][K]['validator']> & {
        _id: Id<K>;
        _creationTime: number;
      }
    ) => Promise<void>;
    onUpdate?: <Ctx extends MutationCtx>(
      ctx: Ctx,
      oldDoc: Infer<Schema['tables'][K]['validator']> & {
        _id: Id<K>;
        _creationTime: number;
      },
      newDoc: Infer<Schema['tables'][K]['validator']> & {
        _id: Id<K>;
        _creationTime: number;
      }
    ) => Promise<void>;
    onDelete?: <Ctx extends MutationCtx>(
      ctx: Ctx,
      doc: Infer<Schema['tables'][K]['validator']> & {
        _id: Id<K>;
        _creationTime: number;
      }
    ) => Promise<void>;
  };
};

export const createClient = (
  config: {
    local?: {
      schema?: Schema;
    };
    authFunctions?: AuthFunctions;
    verbose?: boolean;
    triggers?: Triggers;
  } = {}
) => {
  return {
    adapter: (ctx: GenericCtx) => convexAdapter(ctx, config),
    triggersApi: () => ({
      onCreate: internalMutationGeneric({
        args: {
          doc: v.any(),
          model: v.string(),
        },
        handler: async (ctx, args) => {
          await config?.triggers?.[args.model]?.onCreate?.(ctx, args.doc);
        },
      }),
      onUpdate: internalMutationGeneric({
        args: {
          oldDoc: v.any(),
          newDoc: v.any(),
          model: v.string(),
        },
        handler: async (ctx, args) => {
          await config?.triggers?.[args.model]?.onUpdate?.(
            ctx,
            args.oldDoc,
            args.newDoc
          );
        },
      }),
      onDelete: internalMutationGeneric({
        args: {
          doc: v.any(),
          model: v.string(),
        },
        handler: async (ctx, args) => {
          await config?.triggers?.[args.model]?.onDelete?.(ctx, args.doc);
        },
      }),
    }),

    registerRoutes: (
      http: HttpRouter,
      createAuth: CreateAuth,
      opts: {
        cors?:
          | boolean
          | {
              // These values are appended to the default values
              allowedOrigins?: string[];
              allowedHeaders?: string[];
              exposedHeaders?: string[];
            };
      } = {}
    ) => {
      const staticAuth = getStaticAuth(createAuth);
      const path = staticAuth.options.basePath ?? '/api/auth';
      const authRequestHandler = httpActionGeneric(async (ctx, request) => {
        if (config?.verbose) {
          console.log('options.baseURL', staticAuth.options.baseURL);
          console.log('request headers', request.headers);
        }
        const auth = createAuth(ctx as any);
        const response = await auth.handler(request);
        if (config?.verbose) {
          console.log('response headers', response.headers);
        }
        return response;
      });
      const wellKnown = http.lookup('/.well-known/openid-configuration', 'GET');

      // If registerRoutes is used multiple times, this may already be defined
      if (!wellKnown) {
        // Redirect root well-known to api well-known
        http.route({
          path: '/.well-known/openid-configuration',
          method: 'GET',
          handler: httpActionGeneric(async () => {
            const url = `${requireEnv('CONVEX_SITE_URL')}${path}/convex/.well-known/openid-configuration`;
            return Response.redirect(url);
          }),
        });
      }

      if (!opts.cors) {
        http.route({
          pathPrefix: `${path}/`,
          method: 'GET',
          handler: authRequestHandler,
        });

        http.route({
          pathPrefix: `${path}/`,
          method: 'POST',
          handler: authRequestHandler,
        });

        return;
      }
      const corsOpts =
        typeof opts.cors === 'boolean'
          ? { allowedOrigins: [], allowedHeaders: [], exposedHeaders: [] }
          : opts.cors;
      let trustedOriginsOption:
        | string[]
        | ((request: Request) => string[] | Promise<string[]>)
        | undefined;
      const cors = corsRouter(http, {
        allowedOrigins: async (request) => {
          trustedOriginsOption =
            trustedOriginsOption ??
            (await staticAuth.$context).options.trustedOrigins ??
            [];
          const trustedOrigins = Array.isArray(trustedOriginsOption)
            ? trustedOriginsOption
            : await trustedOriginsOption(request);
          return trustedOrigins
            .map((origin) =>
              // Strip trailing wildcards, unsupported for allowedOrigins
              origin.endsWith('*') && origin.length > 1
                ? origin.slice(0, -1)
                : origin
            )
            .concat(corsOpts.allowedOrigins ?? []);
        },
        allowCredentials: true,
        allowedHeaders: ['Content-Type', 'Better-Auth-Cookie'].concat(
          corsOpts.allowedHeaders ?? []
        ),
        exposedHeaders: ['Set-Better-Auth-Cookie'].concat(
          corsOpts.exposedHeaders ?? []
        ),
        debug: config?.verbose,
        enforceAllowOrigins: false,
      });

      cors.route({
        pathPrefix: `${path}/`,
        method: 'GET',
        handler: authRequestHandler,
      });

      cors.route({
        pathPrefix: `${path}/`,
        method: 'POST',
        handler: authRequestHandler,
      });
    },
  };
};
