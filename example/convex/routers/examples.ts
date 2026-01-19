import { CRPCError } from 'better-convex/server';
import { publicRoute, router } from '../lib/crpc';

/** POST /webhooks/example - Webhook with signature verification */
export const webhook = publicRoute
  .post('/webhooks/example')
  .mutation(async ({ c }) => {
    const signature = c.req.header('x-webhook-signature');
    if (!signature) {
      throw new CRPCError({
        code: 'BAD_REQUEST',
        message: 'Missing signature',
      });
    }
    const _body = await c.req.text();
    return c.text('OK', 200);
  });

/** GET /api/old-path - Redirect example */
export const redirectExample = publicRoute
  .get('/api/old-path')
  .query(async ({ c }) => c.redirect('/api/health', 301));

export const examplesRouter = router({
  webhook,
  redirectExample,
});
