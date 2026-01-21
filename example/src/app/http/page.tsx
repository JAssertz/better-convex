import { headers } from 'next/headers';
import { Suspense } from 'react';
import { crpc, getQueryClient, prefetch } from '@/lib/convex/rsc';
import { createContext } from '@/lib/convex/server';

import { HttpDemo } from './http-demo';

export default async function HttpPage() {
  // Prefetch HTTP queries on server (Hono-style args)
  prefetch(crpc.http.health.queryOptions());

  await getQueryClient().prefetchQuery(
    crpc.http.todos.list.queryOptions({ searchParams: { limit: '10' } })
  );

  // Server-side calls using caller
  const ctx = await createContext({ headers: await headers() });
  const _todos = await ctx.caller.todos.list({ limit: 10 });

  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-6 py-8" />}>
      <HttpDemo />
    </Suspense>
  );
}
