import '../lib/http-polyfills';
import { authMiddleware } from 'better-convex/auth';
import { createHttpRouter } from 'better-convex/server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { router } from '../lib/crpc';
import { examplesRouter } from '../routers/examples';
import { health } from '../routers/health';
import { todosRouter } from '../routers/todos';
import { createAuth } from './auth';

const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: process.env.SITE_URL!,
    allowHeaders: ['Content-Type', 'Authorization', 'Better-Auth-Cookie'],
    exposeHeaders: ['Set-Better-Auth-Cookie'],
    credentials: true,
  })
);

app.use(authMiddleware(createAuth));

export const appRouter = router({
  health,
  todos: todosRouter,
  examples: examplesRouter,
});

export default createHttpRouter(app, appRouter);
