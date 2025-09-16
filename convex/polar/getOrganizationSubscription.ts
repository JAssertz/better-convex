import type { PublicQueryCtx } from '@convex/functions';

import { getProduct } from '@convex/polar/product';

export const getOrganizationSubscription = async (
  ctx: PublicQueryCtx,
  args: {
    organizationId?: string | null;
  }
) => {
  if (!args.organizationId) {
    return null;
  }

  // Get active subscription for the organization
  const subscription = await ctx
    .table('subscriptions', 'organizationId_status', (q) =>
      q.eq('organizationId', args.organizationId!).eq('status', 'active')
    )
    .first();

  if (!subscription) {
    return null;
  }

  const product = getProduct(subscription.productId);

  return {
    ...subscription.doc(),
    product: product ?? null,
  };
};
