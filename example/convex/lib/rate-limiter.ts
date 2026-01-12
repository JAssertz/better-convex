import { HOUR, MINUTE, RateLimiter, SECOND } from '@convex-dev/rate-limiter';
import { CRPCError } from 'better-convex/server';
import { components } from '../functions/_generated/api';
import type { ActionCtx, MutationCtx } from '../functions/_generated/server';
import type { SessionUser } from './auth/auth-helpers';

// Define rate limits matching the existing Upstash configuration
export const rateLimiter = new RateLimiter(components.rateLimiter, {
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

  // Organization limits
  'organization/create:free': { kind: 'fixed window', period: HOUR, rate: 3 },
  'organization/create:premium': {
    kind: 'fixed window',
    period: HOUR,
    rate: 10,
  },

  'organization/update:free': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 10,
  },
  'organization/update:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 30,
  },

  'organization/invite:free': { kind: 'fixed window', period: MINUTE, rate: 5 },
  'organization/invite:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 20,
  },

  'organization/cancelInvite:free': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 10,
  },
  'organization/cancelInvite:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 30,
  },

  'organization/removeMember:free': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 5,
  },
  'organization/removeMember:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 15,
  },

  'organization/leave:free': { kind: 'fixed window', period: MINUTE, rate: 3 },
  'organization/leave:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 10,
  },

  'organization/updateRole:free': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 5,
  },
  'organization/updateRole:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 15,
  },

  'organization/setActive:free': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 10,
  },
  'organization/setActive:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 30,
  },

  'organization/rejectInvite:free': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 10,
  },
  'organization/rejectInvite:premium': {
    kind: 'fixed window',
    period: MINUTE,
    rate: 30,
  },

  // General rate limits
  free: { kind: 'token bucket', period: 10 * SECOND, rate: 40 },
  premium: { kind: 'token bucket', period: 10 * SECOND, rate: 100 },
  public: { kind: 'token bucket', period: 10 * SECOND, rate: 20 },
});

// Helper function to get rate limit key based on user tier
export function getRateLimitKey(
  baseKey: string,
  tier: 'free' | 'premium' | 'public'
): string {
  // For general limits without tiers and admin-only limits
  if (['free', 'premium', 'public'].includes(baseKey)) {
    return baseKey;
  }

  // For specific feature limits with tiers
  return `${baseKey}:${tier}`;
}

// Helper to get user tier based on session user
export function getUserTier(
  user: { isAdmin?: boolean; plan?: SessionUser['plan'] } | null
): 'free' | 'premium' | 'public' {
  if (!user) {
    return 'public';
  }
  if (user.isAdmin) {
    return 'premium'; // Admins bypass rate limits by getting premium tier
  }
  if (user.plan) {
    return 'premium';
  }

  return 'free';
}

// Helper function to check rate limit for mutations
export async function rateLimitGuard(
  ctx: (ActionCtx | MutationCtx) & {
    rateLimitKey: string;
    user: Pick<SessionUser, 'id' | 'plan'> | null;
  }
) {
  const tier = getUserTier(ctx.user);
  const limitKey = getRateLimitKey(ctx.rateLimitKey, tier);
  const identifier = ctx.user?.id ?? 'anonymous';

  const status = await rateLimiter.limit(ctx, limitKey, {
    key: identifier,
  });

  if (!status.ok) {
    throw new CRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please try again later.',
    });
  }
}
