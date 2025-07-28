import { HOUR, MINUTE, RateLimiter, SECOND } from '@convex-dev/rate-limiter';
import { ConvexError } from 'convex/values';

import type { ActionCtx, MutationCtx } from '../_generated/server';

import { components } from '../_generated/api';

// Define rate limits matching the existing Upstash configuration
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // AI rate limits
  'ai:free': { kind: 'token bucket', period: 10 * SECOND, rate: 10 },
  'ai:premium': { kind: 'token bucket', period: 10 * SECOND, rate: 50 },
  'ai:public': { kind: 'token bucket', period: 10 * SECOND, rate: 20 },

  // Character creation limits
  'character/create:free': { kind: 'fixed window', period: MINUTE, rate: 3 },
  'character/create:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 10,
  },

  // Character image limits
  'character/image:free': { kind: 'fixed window', period: MINUTE, rate: 5 },
  'character/image:premium': { kind: 'fixed window', period: MINUTE, rate: 15 },

  // Character profile limits
  'character/profile:free': { kind: 'fixed window', period: MINUTE, rate: 10 },
  'character/profile:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 30,
  },

  // Character relation limits
  'character/relation:free': { kind: 'fixed window', period: MINUTE, rate: 10 },
  'character/relation:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 30,
  },

  // Character skills limits
  'character/skills:free': { kind: 'fixed window', period: MINUTE, rate: 10 },
  'character/skills:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 30,
  },

  // Character update limits (for general character updates)
  'character/update:free': { kind: 'fixed window', period: MINUTE, rate: 20 },
  'character/update:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 60,
  },

  // Character star limits
  'character/star:free': { kind: 'fixed window', period: MINUTE, rate: 30 },
  'character/star:premium': { kind: 'fixed window', period: MINUTE, rate: 100 },

  // Chat limits
  'chat/delete:free': { kind: 'fixed window', period: MINUTE, rate: 10 },
  'chat/delete:premium': { kind: 'fixed window', period: MINUTE, rate: 30 },

  // Comment limits
  'comment/create:free': { kind: 'fixed window', period: MINUTE, rate: 10 },
  'comment/create:premium': { kind: 'fixed window', period: MINUTE, rate: 30 },

  'comment/update:free': { kind: 'fixed window', period: MINUTE, rate: 20 },
  'comment/update:premium': { kind: 'fixed window', period: MINUTE, rate: 60 },

  'comment/upvote:free': { kind: 'fixed window', period: MINUTE, rate: 30 },
  'comment/upvote:premium': { kind: 'fixed window', period: MINUTE, rate: 100 },

  // Project limits
  'project/create:free': { kind: 'fixed window', period: MINUTE, rate: 5 },
  'project/create:premium': { kind: 'fixed window', period: MINUTE, rate: 20 },

  'project/update:free': { kind: 'fixed window', period: MINUTE, rate: 20 },
  'project/update:premium': { kind: 'fixed window', period: MINUTE, rate: 60 },

  'project/member:free': { kind: 'fixed window', period: MINUTE, rate: 10 },
  'project/member:premium': { kind: 'fixed window', period: MINUTE, rate: 30 },

  // Tag limits
  'tag/create:free': { kind: 'fixed window', period: MINUTE, rate: 10 },
  'tag/create:premium': { kind: 'fixed window', period: MINUTE, rate: 30 },

  'tag/delete:free': { kind: 'fixed window', period: MINUTE, rate: 10 },
  'tag/delete:premium': { kind: 'fixed window', period: MINUTE, rate: 30 },

  'tag/update:free': { kind: 'fixed window', period: MINUTE, rate: 20 },
  'tag/update:premium': { kind: 'fixed window', period: MINUTE, rate: 60 },

  // Todo limits
  'todo/create:free': { kind: 'fixed window', period: MINUTE, rate: 20 },
  'todo/create:premium': { kind: 'fixed window', period: MINUTE, rate: 60 },

  'todo/update:free': { kind: 'fixed window', period: MINUTE, rate: 30 },
  'todo/update:premium': { kind: 'fixed window', period: MINUTE, rate: 100 },

  'todo/delete:free': { kind: 'fixed window', period: MINUTE, rate: 20 },
  'todo/delete:premium': { kind: 'fixed window', period: MINUTE, rate: 60 },

  // Todo comment limits
  'todoComment/create:free': { kind: 'fixed window', period: MINUTE, rate: 20 },
  'todoComment/create:premium': { kind: 'fixed window', period: MINUTE, rate: 60 },

  'todoComment/update:free': { kind: 'fixed window', period: MINUTE, rate: 30 },
  'todoComment/update:premium': { kind: 'fixed window', period: MINUTE, rate: 100 },

  'todoComment/reaction:free': { kind: 'fixed window', period: MINUTE, rate: 50 },
  'todoComment/reaction:premium': { kind: 'fixed window', period: MINUTE, rate: 200 },

  // Export limits
  'export/character:free': {
    kind: 'fixed window',
    period: 10 * MINUTE,
    rate: 5,
  },
  'export/character:premium': {
    kind: 'fixed window',
    period: 10 * MINUTE,
    rate: 15,
  },
  'export/skill:free': { kind: 'fixed window', period: 10 * MINUTE, rate: 5 },
  'export/skill:premium': {
    kind: 'fixed window',
    period: 10 * MINUTE,
    rate: 15,
  },

  // Import limits
  'import/character:free': {
    kind: 'fixed window',
    period: 10 * MINUTE,
    rate: 5,
  },
  'import/character:premium': {
    kind: 'fixed window',
    period: 10 * MINUTE,
    rate: 15,
  },
  'import/skill:free': { kind: 'fixed window', period: 10 * MINUTE, rate: 5 },
  'import/skill:premium': {
    kind: 'fixed window',
    period: 10 * MINUTE,
    rate: 15,
  },

  // Report/feedback limits
  'report/feedback:free': { kind: 'fixed window', period: HOUR, rate: 3 },
  'report/feedback:premium': { kind: 'fixed window', period: HOUR, rate: 10 },
  'report/feedback:public': { kind: 'fixed window', period: HOUR, rate: 2 },

  // Scraper limits (admin only)
  scraper: { kind: 'fixed window', period: MINUTE, rate: 10 },

  // General rate limits
  free: { kind: 'token bucket', period: 10 * SECOND, rate: 40 },
  premium: { kind: 'token bucket', period: 10 * SECOND, rate: 100 },
  public: { kind: 'token bucket', period: 10 * SECOND, rate: 20 },
  stripe: { kind: 'token bucket', period: 10 * SECOND, rate: 100 },
  vercel: { kind: 'token bucket', period: 10 * SECOND, rate: 3 },
});

// Helper function to get rate limit key based on user tier
export function getRateLimitKey(
  baseKey: string,
  tier: 'free' | 'premium' | 'public'
): string {
  // For general limits without tiers and admin-only limits
  if (
    ['free', 'premium', 'public', 'scraper', 'stripe', 'vercel'].includes(
      baseKey
    )
  ) {
    return baseKey;
  }

  // For specific feature limits with tiers
  return `${baseKey}:${tier}`;
}

// Helper to get user tier based on session user
export function getUserTier(
  user: { isAdmin?: boolean; isPremium?: boolean } | null
): 'free' | 'premium' | 'public' {
  if (!user) return 'public';
  if (user.isAdmin) return 'premium'; // Admins bypass rate limits by getting premium tier
  if (user.isPremium) return 'premium';

  return 'free';
}

// Helper function to check rate limit for mutations
export async function rateLimitGuard(
  ctx: (ActionCtx | MutationCtx) & {
    rateLimitKey: string;
    user: { id?: string; isAdmin?: boolean; isPremium?: boolean } | null;
  }
) {
  const tier = getUserTier(ctx.user);
  const limitKey = getRateLimitKey(ctx.rateLimitKey, tier) as any;
  const identifier = ctx.user?.id ?? 'anonymous';

  const status = await rateLimiter.limit(ctx, limitKey, {
    key: identifier,
  });

  if (!status.ok) {
    throw new ConvexError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: status.retryAfter,
    });
  }
}
