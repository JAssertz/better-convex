import { zid } from 'convex-helpers/server/zod4';
import { z } from 'zod';
import { api, internal } from '../functions/_generated/api';
import { authRoute, publicRoute, router } from '../lib/crpc';

const todoOutput = z.object({
  _id: zid('todos'),
  title: z.string(),
  completed: z.boolean(),
  description: z.string().optional(),
});

// To-do router - groups todo-related endpoints
export const todosRouter = router({
  // GET /api/todos - List todos with query params (public)
  list: publicRoute
    .get('/api/todos')
    .searchParams(z.object({ limit: z.coerce.number().optional() }))
    .output(z.array(todoOutput))
    .query(async ({ ctx, query }) => {
      const result = await ctx.runQuery(api.todos.list, {
        limit: query.limit ?? 10,
      });
      return result.page.map((t) => ({
        _id: t._id,
        title: t.title,
        completed: t.completed,
        description: t.description,
      }));
    }),

  // GET /api/todos/:id - Get single todo by ID (path params)
  get: publicRoute
    .get('/api/todos/:id')
    .params(z.object({ id: zid('todos') }))
    .output(todoOutput.nullable())
    .query(async ({ ctx, params }) => {
      const todo = await ctx.runQuery(api.todos.get, { id: params.id });
      if (!todo) return null;
      return {
        _id: todo._id,
        title: todo.title,
        completed: todo.completed,
        description: todo.description,
      };
    }),

  // POST /api/todos - Create new todo (JSON body, requires auth)
  create: authRoute
    .post('/api/todos')
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      })
    )
    .output(z.object({ id: zid('todos') }))
    .mutation(async ({ ctx, input }) => {
      const id = await ctx.runMutation(internal.todoInternal.create, {
        userId: ctx.userId,
        ...input,
      });
      return { id };
    }),

  // PATCH /api/todos/:id - Update todo (auth required)
  update: authRoute
    .patch('/api/todos/:id')
    .params(z.object({ id: zid('todos') }))
    .input(
      z.object({
        title: z.string().min(1).optional(),
        completed: z.boolean().optional(),
        description: z.string().optional(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, params, input }) => {
      await ctx.runMutation(internal.todoInternal.update, {
        userId: ctx.userId,
        id: params.id,
        ...input,
      });
      return { success: true };
    }),

  // DELETE /api/todos/:id - Delete todo (auth required)
  delete: authRoute
    .delete('/api/todos/:id')
    .params(z.object({ id: zid('todos') }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, params }) => {
      await ctx.runMutation(internal.todoInternal.deleteTodo, {
        userId: ctx.userId,
        id: params.id,
      });
      return { success: true };
    }),

  // GET /api/todos/export/:format - Export todos as file
  download: authRoute
    .get('/api/todos/export/:format')
    .params(z.object({ format: z.enum(['json', 'csv']) }))
    .query(async ({ ctx, params, c }) => {
      const result = await ctx.runQuery(api.todos.list, { limit: 100 });
      const todos = result.page;

      c.header(
        'Content-Disposition',
        `attachment; filename="todos.${params.format}"`
      );
      c.header('Cache-Control', 'no-cache');

      if (params.format === 'csv') {
        const csv = [
          'id,title,completed,description',
          ...todos.map(
            (t) => `${t._id},${t.title},${t.completed},${t.description ?? ''}`
          ),
        ].join('\n');
        return c.text(csv);
      }

      return c.json({ todos });
    }),
});
