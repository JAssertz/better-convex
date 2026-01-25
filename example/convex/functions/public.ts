import { z } from 'zod';
import { publicQuery } from '../lib/crpc';

export const hello = publicQuery
  .input(z.object({ message: z.string() }))
  .output(z.object({ message: z.string() }))
  .query(async () => ({ message: 'Hello from Convex!' }));
