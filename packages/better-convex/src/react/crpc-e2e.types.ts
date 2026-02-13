/* biome-ignore-all lint: compile-time type assertions with intentional errors */

import type { FunctionReference } from 'convex/server';
import { z } from 'zod';
import type { Meta } from '../crpc/types';
import type { CRPCHttpRouter } from '../server/http-router';
import type { HttpProcedure } from '../server/http-types';
import type { UnsetMarker } from '../server/types';
import { createCRPCContext } from './context';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

type OrgGetRef = FunctionReference<
  'query',
  'public',
  { slug: string },
  { id: string; name: string; slug: string }
>;

type OrgListRef = FunctionReference<
  'query',
  'public',
  {},
  Array<{ id: string; name: string }>
>;

type OrgMembersRef = FunctionReference<
  'query',
  'public',
  { cursor: string | null; limit?: number; organizationId: string },
  {
    continueCursor: string | null;
    isDone: boolean;
    page: Array<{ id: string; role: string }>;
  }
>;

type OrgUpdateRef = FunctionReference<
  'mutation',
  'public',
  { id: string; name: string },
  { ok: true }
>;

type ReindexRef = FunctionReference<
  'action',
  'public',
  { force: boolean },
  { started: boolean }
>;

type BaseApi = {
  organization: {
    get: OrgGetRef;
    list: OrgListRef;
    listMembers: OrgMembersRef;
    update: OrgUpdateRef;
  };
  jobs: {
    reindex: ReindexRef;
  };
};

const healthOutputSchema = z.object({
  status: z.string(),
  timestamp: z.number(),
});
const todoOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
});
const todoListOutputSchema = z.array(todoOutputSchema);
const todosListQuerySchema = z.object({
  limit: z.coerce.number().optional(),
});
const todosCreateInputSchema = z.object({
  title: z.string(),
});

type HealthHttpProcedure = HttpProcedure<
  UnsetMarker,
  typeof healthOutputSchema,
  UnsetMarker,
  UnsetMarker,
  'GET',
  UnsetMarker
>;

type TodosListHttpProcedure = HttpProcedure<
  UnsetMarker,
  typeof todoListOutputSchema,
  UnsetMarker,
  typeof todosListQuerySchema,
  'GET',
  UnsetMarker
>;

type TodosCreateHttpProcedure = HttpProcedure<
  typeof todosCreateInputSchema,
  typeof todoOutputSchema,
  UnsetMarker,
  UnsetMarker,
  'POST',
  UnsetMarker
>;

type HttpRouter = CRPCHttpRouter<{
  health: HealthHttpProcedure;
  todos: CRPCHttpRouter<{
    list: TodosListHttpProcedure;
    create: TodosCreateHttpProcedure;
  }>;
}>;

type ApiWithHttp = BaseApi & {
  http?: HttpRouter;
};

const meta = {
  organization: {
    get: { auth: 'required', type: 'query' },
    list: { auth: 'required', type: 'query' },
    listMembers: { auth: 'required', type: 'query' },
    update: { auth: 'required', type: 'mutation' },
  },
  jobs: {
    reindex: { auth: 'required', type: 'action' },
  },
  _http: {
    health: { path: '/api/health', method: 'GET' },
    'todos.list': { path: '/api/todos', method: 'GET' },
    'todos.create': { path: '/api/todos', method: 'POST' },
  },
} as unknown as Meta;

const crpcWithHttpContext = createCRPCContext<ApiWithHttp>({
  api: {} as ApiWithHttp,
  convexSiteUrl: 'https://demo.convex.site',
  meta,
});

type CRPCWithHttp = ReturnType<typeof crpcWithHttpContext.useCRPC>;
type VanillaWithHttp = ReturnType<typeof crpcWithHttpContext.useCRPCClient>;

declare const crpc: CRPCWithHttp;
declare const vanilla: VanillaWithHttp;

// ============================================================================
// Query typing (positive + negative)
// ============================================================================

crpc.organization.get.queryOptions({ slug: 'acme' });
// @ts-expect-error required args missing
crpc.organization.get.queryOptions();
// @ts-expect-error wrong arg key
crpc.organization.get.queryOptions({ id: 'acme' });
// @ts-expect-error wrong arg type
crpc.organization.get.queryOptions({ slug: 123 });

crpc.organization.list.queryOptions();
// @ts-expect-error query has no args
crpc.organization.list.queryOptions({ unexpected: 'x' });

// ============================================================================
// Mutation typing (negative variables coverage)
// ============================================================================

const updateMutation = crpc.organization.update.mutationOptions();
updateMutation.mutationFn?.({ id: 'org_1', name: 'New Name' }, {} as any);
// @ts-expect-error missing required field
updateMutation.mutationFn?.({ id: 'org_1' }, {} as any);
// @ts-expect-error wrong field type
updateMutation.mutationFn?.({ id: 1, name: 'x' }, {} as any);

// ============================================================================
// Action typing (query + mutation paths)
// ============================================================================

crpc.jobs.reindex.queryOptions({ force: true });
// @ts-expect-error action args required
crpc.jobs.reindex.queryOptions();
const reindexMutation = crpc.jobs.reindex.mutationOptions();
reindexMutation.mutationFn?.({ force: true }, {} as any);
// @ts-expect-error action mutation vars type mismatch
reindexMutation.mutationFn?.({ force: 'yes' }, {} as any);

// ============================================================================
// Infinite query typing (paginated queries only)
// ============================================================================

crpc.organization.listMembers.infiniteQueryOptions({ organizationId: 'org_1' });
// @ts-expect-error missing required non-pagination arg
crpc.organization.listMembers.infiniteQueryOptions();
crpc.organization.listMembers.infiniteQueryOptions({
  // @ts-expect-error cursor is managed by infinite query internals
  cursor: null,
  organizationId: 'org_1',
});
// @ts-expect-error non-paginated query should not expose infinite API
crpc.organization.get.infiniteQueryOptions({ slug: 'acme' });

// ============================================================================
// HTTP typing via useCRPC
// ============================================================================

crpc.http.health.queryOptions();
crpc.http.todos.list.queryOptions({ searchParams: { limit: '20' } });
// @ts-expect-error unknown query key
crpc.http.todos.list.queryOptions({ searchParams: { nope: '1' } });
// @ts-expect-error query params are URL strings on client input
crpc.http.todos.list.queryOptions({ searchParams: { limit: 20 } });

const createTodoMutation = crpc.http.todos.create.mutationOptions();
createTodoMutation.mutationFn?.({ title: 'Ship' }, {} as any);
// @ts-expect-error wrong HTTP mutation body type
createTodoMutation.mutationFn?.({ title: 1 }, {} as any);
// @ts-expect-error queryOptions not available on POST endpoints
crpc.http.todos.create.queryOptions({ title: 'x' });

// ============================================================================
// HTTP typing via useCRPCClient
// ============================================================================

async function assertVanillaTypes(client: VanillaWithHttp) {
  const org = await client.organization.get.query({ slug: 'acme' });
  org.name;
  // @ts-expect-error unknown output property
  org.nope;

  await client.organization.update.mutate({ id: 'org_1', name: 'Renamed' });
  // @ts-expect-error required mutation field missing
  await client.organization.update.mutate({ id: 'org_1' });

  await client.jobs.reindex.query({ force: true });
  // @ts-expect-error action args type mismatch
  await client.jobs.reindex.query({ force: 'y' });

  await client.http.todos.create.mutate({ title: 'New Todo' });
  // @ts-expect-error POST body field type mismatch
  await client.http.todos.create.mutate({ title: 999 });
}

void assertVanillaTypes;
void vanilla;

// ============================================================================
// Any-regression guards
// ============================================================================

type OrgGetOutput = Awaited<
  ReturnType<VanillaWithHttp['organization']['get']['query']>
>;
type _orgGetOutputNotAny = Expect<Equal<false, IsAny<OrgGetOutput>>>;

type HttpListOutput = Awaited<
  ReturnType<VanillaWithHttp['http']['todos']['list']['query']>
>;
type _httpListOutputNotAny = Expect<Equal<false, IsAny<HttpListOutput>>>;

// ============================================================================
// No-HTTP API should not expose http namespace
// ============================================================================

const crpcNoHttpContext = createCRPCContext<BaseApi>({
  api: {} as BaseApi,
  meta: {
    organization: {
      get: { type: 'query' },
      list: { type: 'query' },
      listMembers: { type: 'query' },
      update: { type: 'mutation' },
    },
    jobs: {
      reindex: { type: 'action' },
    },
  } as unknown as Meta,
});

type CRPCNoHttp = ReturnType<typeof crpcNoHttpContext.useCRPC>;
declare const crpcNoHttp: CRPCNoHttp;
// @ts-expect-error http namespace should not exist without HTTP router types
crpcNoHttp.http;
