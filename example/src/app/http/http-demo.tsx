'use client';

import type { Id } from '@convex/dataModel';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useState } from 'react';
import { useCRPC, useCRPCClient } from '@/lib/convex/crpc';

/**
 * Demo page showcasing useCRPC HTTP patterns with TanStack Query.
 *
 * Demonstrates:
 * - queryOptions for GET requests (health check, list todos)
 * - mutationOptions for POST/PATCH/DELETE requests
 * - Cache invalidation via queryKey
 * - Loading and error states
 * - Form submission patterns
 */
export function HttpDemo() {
  const crpc = useCRPC();
  const client = useCRPCClient();
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState('');

  // Test vanilla client - direct procedural calls
  const _handleVanillaTest = async () => {
    // Direct query call (no React Query)
    const _todos = await client.todos.list.query();
  };

  // Todos query options
  const todosQueryOpts = crpc.http.todos.list.queryOptions({
    searchParams: { limit: '10' },
  });

  // 1. Health check (GET, public)
  const health = useSuspenseQuery(crpc.http.health.queryOptions());

  // 2. List todos (GET, public)
  const todos = useSuspenseQuery(todosQueryOpts);

  // 3. Create todo (POST, auth required)
  // mutationOptions(userOpts?, clientOpts?) - clean API
  const createTodo = useMutation(
    crpc.http.todos.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(crpc.http.todos.list.queryFilter());
        setNewTitle('');
      },
    })
  );

  // 4. Update todo (PATCH, auth required) - toggle completed
  const updateTodo = useMutation(
    crpc.http.todos.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(crpc.http.todos.list.queryFilter());
      },
    })
  );

  // 5. Delete todo (DELETE, auth required)
  const deleteTodo = useMutation(
    crpc.http.todos.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(crpc.http.todos.list.queryFilter());
      },
    })
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    // JSON body fields at root level (tRPC-style)
    createTodo.mutate({ title: newTitle.trim() });
  };

  const handleToggle = (id: Id<'todos'>, completed: boolean) => {
    // Path params explicit, JSON body at root
    updateTodo.mutate({ params: { id }, completed: !completed });
  };

  const handleDelete = (id: Id<'todos'>) => {
    // Path params only
    deleteTodo.mutate({ params: { id } });
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-8 font-bold text-2xl">HTTP cRPC Demo</h1>

      {/* Health Check Section */}
      <section className="mb-8 rounded-lg border p-4">
        <h2 className="mb-3 font-semibold text-lg">Health Check (GET)</h2>
        <div className="flex gap-4 text-sm">
          <span className="text-muted-foreground">
            Status:{' '}
            <span className="font-medium text-foreground">
              {health.data.status}
            </span>
          </span>
          <span className="text-muted-foreground">
            Timestamp:{' '}
            <span className="font-mono text-foreground">
              {health.data.timestamp}
            </span>
          </span>
        </div>
      </section>

      {/* Create Todo Form */}
      <section className="mb-8 rounded-lg border p-4">
        <h2 className="mb-3 font-semibold text-lg">Create Todo (POST)</h2>
        <form className="flex gap-2" onSubmit={handleSubmit}>
          <input
            className="flex-1 rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={createTodo.isPending}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Enter todo title..."
            type="text"
            value={newTitle}
          />
          <button
            className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground text-sm disabled:opacity-50"
            disabled={createTodo.isPending || !newTitle.trim()}
            type="submit"
          >
            {createTodo.isPending ? 'Creating...' : 'Add Todo'}
          </button>
        </form>
        {createTodo.error && (
          <p className="mt-2 text-destructive text-sm">
            Error: {createTodo.error.message}
          </p>
        )}
      </section>

      {/* Todos List */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold text-lg">
          Todo List (GET + PATCH + DELETE)
        </h2>
        {todos.data.length === 0 ? (
          <p className="text-muted-foreground">
            No todos yet. Create one above!
          </p>
        ) : (
          <ul className="space-y-2">
            {todos.data.map((todo) => (
              <li
                className="flex items-center gap-3 rounded border px-3 py-2"
                key={todo._id}
              >
                <button
                  aria-label={
                    todo.completed ? 'Mark incomplete' : 'Mark complete'
                  }
                  className="size-5 rounded border text-xs disabled:opacity-50"
                  disabled={
                    updateTodo.isPending &&
                    updateTodo.variables?.params?.id === todo._id
                  }
                  onClick={() => handleToggle(todo._id, todo.completed)}
                  type="button"
                >
                  {todo.completed && '✓'}
                </button>
                <span
                  className={`flex-1 ${todo.completed ? 'text-muted-foreground line-through' : ''}`}
                >
                  {todo.title}
                </span>
                {todo.description && (
                  <span className="text-muted-foreground text-sm">
                    {todo.description}
                  </span>
                )}
                <button
                  aria-label="Delete todo"
                  className="text-destructive hover:text-destructive/80 disabled:opacity-50"
                  disabled={
                    deleteTodo.isPending &&
                    deleteTodo.variables?.params?.id === todo._id
                  }
                  onClick={() => handleDelete(todo._id)}
                  type="button"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Examples Endpoints */}
      <ExamplesSection />
    </div>
  );
}

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL!;

function ExamplesSection() {
  const crpc = useCRPC();
  const client = useCRPCClient();
  const [webhookResult, setWebhookResult] = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Examples Router Usage - Full Type Coverage
  // -------------------------------------------------------------------------

  // GET with searchParams only
  const _searchExample = useSuspenseQuery(
    crpc.http.examples.searchExample.queryOptions({
      searchParams: { q: 'test', page: '1', tags: ['demo'] },
    })
  );

  // GET with params only
  const _paramsExample = useSuspenseQuery(
    crpc.http.examples.paramsExample.queryOptions({
      params: { id: 'k57a9gkc0dgfnvgptp2vc4sc2d7b248j' as Id<'todos'> },
    })
  );

  // GET with params + searchParams
  const _paramsSearchExample = useSuspenseQuery(
    crpc.http.examples.paramsSearchParamsExample.queryOptions({
      params: { id: 'k57a9gkc0dgfnvgptp2vc4sc2d7b248j' as Id<'todos'> },
      searchParams: { limit: '5', offset: '0' },
    })
  );

  // POST with input only (JSON body at root)
  const inputMutation = useMutation(
    crpc.http.examples.inputExample.mutationOptions()
  );
  const _handleInputExample = () => {
    inputMutation.mutate({ name: 'test', count: 5 });
  };

  // PATCH with params + input
  const paramsInputMutation = useMutation(
    crpc.http.examples.paramsInputExample.mutationOptions()
  );
  const _handleParamsInputExample = () => {
    paramsInputMutation.mutate({ params: { id: 'abc' }, name: 'updated' });
  };

  // POST with params + searchParams + input (all combined)
  const allCombinedMutation = useMutation(
    crpc.http.examples.allCombinedExample.mutationOptions()
  );
  const _handleAllCombinedExample = () => {
    allCombinedMutation.mutate({
      params: { id: 'abc' },
      searchParams: { notify: 'true' },
      tags: ['a'],
    });
  };

  // POST FormData upload (raw mutation)
  const uploadMutation = useMutation(
    crpc.http.examples.uploadExample.mutationOptions({
      onSuccess: (data) => {
        setUploadResult(`Success: ${JSON.stringify(data)}`);
      },
      onError: (err) => {
        setUploadResult(`Error: ${err.message}`);
      },
    })
  );

  const handleWebhook = async () => {
    setWebhookLoading(true);
    try {
      const res = await fetch(`${SITE_URL}/webhooks/example`, {
        method: 'POST',
        headers: { 'x-webhook-signature': 'test-signature-123' },
        body: JSON.stringify({ event: 'test' }),
      });
      const text = await res.text();
      setWebhookResult(`${res.status}: ${text}`);
    } catch (err) {
      setWebhookResult(
        `Error: ${err instanceof Error ? err.message : 'Unknown'}`
      );
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleDownload = async (format: 'json' | 'csv') => {
    // Direct HTTP call with vanilla client
    const data = await client.http.todos.download.query({ params: { format } });

    const content =
      format === 'json' ? JSON.stringify(data, null, 2) : (data as string);
    const mimeType = format === 'json' ? 'application/json' : 'text/csv';

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `todos.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRedirect = () => {
    window.open(`${SITE_URL}/api/old-path`, '_blank');
  };

  return (
    <section className="mt-8 rounded-lg border p-4">
      <h2 className="mb-3 font-semibold text-lg">Examples Endpoints</h2>
      <div className="space-y-4">
        {/* Webhook */}
        <div>
          <p className="mb-2 text-muted-foreground text-sm">
            POST /webhooks/example - Raw mode with signature verification
          </p>
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm disabled:opacity-50"
              disabled={webhookLoading}
              onClick={handleWebhook}
              type="button"
            >
              {webhookLoading ? 'Sending...' : 'Test Webhook'}
            </button>
            {webhookResult && (
              <span className="font-mono text-sm">{webhookResult}</span>
            )}
          </div>
        </div>

        {/* Download */}
        <div>
          <p className="mb-2 text-muted-foreground text-sm">
            GET /api/todos/export/:format - Export todos as file
          </p>
          <div className="flex gap-2">
            <button
              className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm"
              onClick={() => handleDownload('json')}
              type="button"
            >
              Download JSON
            </button>
            <button
              className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm"
              onClick={() => handleDownload('csv')}
              type="button"
            >
              Download CSV
            </button>
          </div>
        </div>

        {/* Redirect */}
        <div>
          <p className="mb-2 text-muted-foreground text-sm">
            GET /api/old-path - Redirect to /api/health (301)
          </p>
          <button
            className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm"
            onClick={handleRedirect}
            type="button"
          >
            Test Redirect
          </button>
        </div>

        {/* File Upload */}
        <div>
          <p className="mb-2 text-muted-foreground text-sm">
            POST /api/examples/upload - FormData file upload
          </p>
          <div className="flex items-center gap-2">
            <input
              accept="*/*"
              className="flex-1 rounded border bg-background px-3 py-1.5 text-sm"
              disabled={uploadMutation.isPending}
              id="file-upload"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  uploadMutation.mutate({
                    form: { file, description: file.name },
                  });
                }
              }}
              type="file"
            />
            {uploadMutation.isPending && (
              <span className="text-muted-foreground text-sm">
                Uploading...
              </span>
            )}
          </div>
          {uploadResult && (
            <p className="mt-2 font-mono text-sm">{uploadResult}</p>
          )}
        </div>
      </div>
    </section>
  );
}
