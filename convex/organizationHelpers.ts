import { Id } from './_generated/dataModel';
import { MutationCtx } from './_generated/server';
import { entDefinitions } from './schema';
import { entsTableFactory } from 'convex-ents';

export const createPersonalOrganization = async (
  ctx: MutationCtx,
  args: {
    email: string;
    image: string | null;
    name: string;
    userId: Id<'user'>;
  }
) => {
  const table = entsTableFactory(ctx, entDefinitions);
  // Check if user already has any organizations
  const user = await table('user').getX(args.userId);

  if (user.personalOrganizationId) {
    return null;
  }

  // Generate unique slug for personal org
  const slug = `personal-${args.userId.slice(-8)}`;

  const orgId = await table('organization').insert({
    logo: args.image || undefined,
    monthlyCredits: 0,
    name: `${args.name}'s Organization`,
    slug,
    createdAt: Date.now(),
  });
  await table('member').insert({
    createdAt: Date.now(),
    role: 'owner',
    organizationId: orgId,
    userId: args.userId,
  });

  // Update the user's last active organization and personal organization ID for future sessions
  await table('user').getX(args.userId).patch({
    lastActiveOrganizationId: orgId,
    personalOrganizationId: orgId,
  });

  return {
    id: orgId,
    slug: slug,
  };
};
