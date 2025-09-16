import type { QueryCtx } from '@convex/_generated/server';
import type {
  BetterAuthInvitation,
  BetterAuthOrganization,
} from '@convex/authShared';

import { ConvexError } from 'convex/values';
import { z } from 'zod';

import type { Id } from './_generated/dataModel';

import { api, components } from './_generated/api';
import { createAuth, getHeaders } from './auth';
import {
  getBetterAuthUser,
  getBetterAuthUserById,
} from './betterAuth/getBetterAuthUser';
import {
  type AuthQueryCtx,
  createAuthMutation,
  createAuthQuery,
  createInternalMutation,
  createPublicMutation,
} from './functions';
import { getRateLimitKey, rateLimiter } from './helpers/rateLimiter';

const MEMBER_LIMIT = 5;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 50);
}

// Helper function to get organization by slug using Better Auth's findOne method
const getBetterAuthOrganization = async (
  ctx: QueryCtx,
  slug: string
): Promise<BetterAuthOrganization | null> => {
  const org: BetterAuthOrganization | null = await ctx.runQuery(
    components.betterAuth.adapter.findOne,
    {
      model: 'organization',
      where: [{ field: 'slug', value: slug }],
    }
  );

  return org;
};

// List all organizations for current user (excluding active organization)
export const listOrganizations = createAuthQuery()({
  args: {},
  returns: z.object({
    canCreateOrganization: z.boolean(),
    organizations: z.array(
      z.object({
        id: z.string(),
        createdAt: z.number(),
        isPersonal: z.boolean(),
        logo: z.string().nullish(),
        name: z.string(),
        slug: z.string(),
      })
    ),
  }),
  handler: async (ctx) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    // Get all organizations for user
    const orgs = await auth.api.listOrganizations({ headers });

    if (!orgs || orgs.length === 0) {
      return {
        canCreateOrganization: true, // No orgs, can create first one
        organizations: [],
      };
    }

    const activeOrgId = ctx.user.session.activeOrganizationId;

    // Simple check: can always create organizations (up to Better Auth's limit)
    const canCreateOrganization = true;

    // Filter out active organization and enrich with extension data
    const filteredOrgs = orgs.filter((org) => org.id !== activeOrgId);

    // Map organizations
    const enrichedOrgs = filteredOrgs.map((org) => ({
      id: org.id,
      createdAt: org.createdAt as any,
      isPersonal: org.id === ctx.user.personalOrganizationId,
      logo: org.logo || null,
      name: org.name,
      slug: org.slug,
    }));

    return {
      canCreateOrganization,
      organizations: enrichedOrgs,
    };
  },
});

// Create a new organization (max 1 without subscription)
export const createOrganization = createAuthMutation({
  rateLimit: 'organization/create',
})({
  args: {
    name: z.string().min(1).max(100),
  },
  returns: z.object({
    id: z.string(),
    slug: z.string(),
  }),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    // Generate unique slug
    const baseSlug = generateSlug(args.name);
    let slug = baseSlug;
    let attempt = 0;

    while (attempt < 10) {
      // Check if slug is already taken
      const existingOrg = await getBetterAuthOrganization(ctx, slug);

      if (!existingOrg) {
        break; // Slug is available!
      }

      // Add random suffix for uniqueness
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 10)}`;
      attempt++;
    }

    if (attempt >= 10) {
      throw new ConvexError({
        code: 'BAD_REQUEST',
        message:
          'Could not generate a unique slug. Please provide a custom slug.',
      });
    }

    // Create organization via Better Auth
    const org = await auth.api.createOrganization({
      body: {
        monthlyCredits: 0,
        name: args.name,
        slug,
      },
      headers,
    });

    if (!org) {
      throw new ConvexError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create organization',
      });
    }

    // Set as active organization
    await ctx.runMutation(api.organization.setActiveOrganization, {
      organizationId: org.id,
    });

    return {
      id: org.id,
      slug: org.slug,
    };
  },
});

// Update organization details
export const updateOrganization = createAuthMutation({
  rateLimit: 'organization/update',
})({
  args: {
    logo: z.string().url().optional(),
    name: z.string().min(1).max(100).optional(),
    slug: z.string().optional(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    if (ctx.user.activeOrganization.role !== 'owner') {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only owners can update organization details',
      });
    }

    let slug = args.slug;

    // If slug is provided, validate it
    if (args.slug) {
      if (ctx.user.activeOrganization.id === ctx.user.personalOrganizationId) {
        slug = undefined;
      } else {
        slugSchema.parse(args.slug);

        // Check if slug is taken
        const existingOrg = await getBetterAuthOrganization(ctx, args.slug);

        if (existingOrg && existingOrg._id !== ctx.user.activeOrganization.id) {
          throw new ConvexError({
            code: 'BAD_REQUEST',
            message: 'This slug is already taken',
          });
        }
      }
    }

    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    await auth.api.updateOrganization({
      body: {
        data: slug
          ? {
              logo: args.logo,
              name: args.name,
              slug: args.slug,
            }
          : {
              logo: args.logo,
              name: args.name,
            },
        organizationId: ctx.user.activeOrganization.id,
      },
      headers,
    });

    return null;
  },
});

const slugSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9-]+$/);

// Set active organization
export const setActiveOrganization = createAuthMutation({
  rateLimit: 'organization/setActive',
})({
  args: {
    organizationId: z.string(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    await auth.api.setActiveOrganization({
      body: { organizationId: args.organizationId },
      headers,
    });

    // Update the user's last active organization for future sessions
    await ctx.user.patch({
      lastActiveOrganizationId: args.organizationId,
    });

    return null;
  },
});

// Accept invitation
export const acceptInvitation = createAuthMutation({})({
  args: {
    invitationId: z.string(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    // Validate that the invitation is for the current user's email (optimized)
    const invitation: BetterAuthInvitation | null = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: 'invitation',
        where: [
          { field: 'id', value: args.invitationId },
          { field: 'email', value: ctx.user.email },
        ],
      }
    );

    if (!invitation) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'This invitation is not found for your email address',
      });
    }
    if (invitation.status !== 'pending') {
      throw new ConvexError({
        code: 'BAD_REQUEST',
        message: 'This invitation has already been processed',
      });
    }

    await auth.api.acceptInvitation({
      body: { invitationId: args.invitationId },
      headers,
    });

    return null;
  },
});

// Reject invitation
export const rejectInvitation = createAuthMutation({
  rateLimit: 'organization/rejectInvite',
})({
  args: {
    invitationId: z.string(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    // Get the specific invitation directly
    const invitation: BetterAuthInvitation | null = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: 'invitation',
        where: [
          { field: 'id', value: args.invitationId },
          { field: 'email', value: ctx.user.email },
        ],
      }
    );

    if (!invitation) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'This invitation is not found for your email address',
      });
    }
    if (invitation.status !== 'pending') {
      throw new ConvexError({
        code: 'BAD_REQUEST',
        message: 'This invitation has already been processed',
      });
    }

    await auth.api.rejectInvitation({
      body: { invitationId: args.invitationId },
      headers,
    });

    return null;
  },
});

// Remove member from organization
export const removeMember = createAuthMutation({
  rateLimit: 'organization/removeMember',
})({
  args: {
    memberId: z.string(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    if (ctx.user.activeOrganization.role !== 'owner') {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only owners and admins can remove members',
      });
    }

    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    await auth.api.removeMember({
      body: {
        memberIdOrEmail: args.memberId,
        organizationId: ctx.user.activeOrganization.id,
      },
      headers,
    });

    return null;
  },
});

// Leave organization (self-leave)
export const leaveOrganization = createAuthMutation({
  rateLimit: 'organization/leave',
})({
  args: {},
  returns: z.null(),
  handler: async (ctx, args) => {
    // Get current member info to check role
    if (ctx.user.activeOrganization.role !== 'owner') {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only owners can update member roles',
      });
    }

    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    // Prevent leaving personal organizations (similar to personal org deletion protection)
    // Personal organizations typically have a specific naming pattern or metadata
    if (ctx.user.activeOrganization.id === ctx.user.personalOrganizationId) {
      throw new ConvexError({
        code: 'BAD_REQUEST',
        message:
          'You cannot leave your personal organization. Personal organizations are required for your account.',
      });
    }

    await auth.api.leaveOrganization({
      body: { organizationId: ctx.user.activeOrganization.id },
      headers,
    });

    // Automatically switch to personal organization
    await ctx.runMutation(api.organization.setActiveOrganization, {
      organizationId: ctx.user.personalOrganizationId,
    });

    return null;
  },
});

// Update member role
export const updateMemberRole = createAuthMutation({
  rateLimit: 'organization/updateRole',
})({
  args: {
    memberId: z.string(),
    role: z.enum(['owner', 'member']),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    // Only owners can update roles
    if (ctx.user.activeOrganization.role !== 'owner') {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only owners can update member roles',
      });
    }

    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    await auth.api.updateMemberRole({
      body: {
        memberId: args.memberId,
        role: args.role,
      },
      headers,
    });

    return null;
  },
});

// Internal: Create personal organization for new user
export const createPersonalOrganization = createInternalMutation()({
  args: {
    email: z.string(),
    image: z.string().nullish(),
    name: z.string(),
    token: z.string(),
    userId: z.string(),
  },
  returns: z
    .object({
      id: z.string(),
      slug: z.string(),
    })
    .nullable(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);

    const headers = new Headers({
      authorization: `Bearer ${args.token}`,
    });

    // Check if user already has any organizations
    const existingOrgs = await auth.api.listOrganizations({ headers });

    if (existingOrgs.length > 0) {
      return null;
    }

    // Generate unique slug for personal org
    const slug = `personal-${args.userId.slice(-8)}`;

    const org = await auth.api.createOrganization({
      body: {
        logo: args.image || undefined,
        monthlyCredits: 0,
        name: `${args.name}'s Organization`,
        slug,
      },
      headers,
    });

    if (!org) {
      throw new ConvexError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create personal organization',
      });
    }

    // Set as active organization (can't use internal.organization.setActiveOrganization without headers)
    await auth.api.setActiveOrganization({
      body: { organizationId: org.id },
      headers,
    });

    // Update the user's last active organization and personal organization ID for future sessions
    const userId = args.userId as Id<'users'>;

    await ctx.table('users').getX(userId).patch({
      lastActiveOrganizationId: org.id,
      personalOrganizationId: org.id,
    });

    return {
      id: org.id,
      slug: org.slug,
    };
  },
});

// Delete organization (owner only)
export const deleteOrganization = createAuthMutation({})({
  args: {},
  returns: z.null(),
  handler: async (ctx, args) => {
    // Check if user is owner
    if (ctx.user.activeOrganization.role !== 'owner') {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only owners can update member roles',
      });
    }

    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    const organizationId = ctx.user.activeOrganization.id;

    // Prevent deletion of personal organizations
    if (organizationId === ctx.user.personalOrganizationId) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message:
          'Personal organizations can be deleted only by deleting your account.',
      });
    }

    // Delete organization via Better Auth
    await auth.api.deleteOrganization({
      body: { organizationId: organizationId },
      headers,
    });

    return null;
  },
});

// Get organization details by slug
export const getOrganization = createAuthQuery()({
  args: {
    slug: z.string(),
  },
  returns: z
    .object({
      id: z.string(),
      createdAt: z.number(),
      isActive: z.boolean(),
      isPersonal: z.boolean(),
      logo: z.string().nullish(),
      membersCount: z.number(),
      name: z.string(),
      role: z.string().optional(),
      slug: z.string(),
    })
    .nullable(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    // Get organization by slug using Better Auth's findOne method (O(1) instead of O(n))
    const org = await getBetterAuthOrganization(ctx, args.slug);

    if (!org) return null;

    // Get full organization data with members
    const fullOrg = await auth.api.getFullOrganization({
      headers,
      query: { organizationId: org._id },
    });

    if (!fullOrg) return null;

    // Get Better Auth user for member comparison
    const betterAuthUser = await getBetterAuthUser(ctx, ctx.userId);

    if (!betterAuthUser) {
      return null;
    }

    // Get user's role from full organization members
    const currentMember = fullOrg.members?.find(
      (m) => m.userId === betterAuthUser._id
    );

    return {
      id: org._id,
      createdAt: org.createdAt as any,
      isActive: org._id === ctx.user.session.activeOrganizationId,
      isPersonal: org._id === ctx.user.personalOrganizationId,
      logo: org.logo || null,
      membersCount: fullOrg.members?.length || 1,
      name: org.name,
      role: currentMember?.role,
      slug: org.slug,
    };
  },
});

// Get organization overview with optional invitation details
export const getOrganizationOverview = createAuthQuery()({
  args: {
    inviteId: z.string().optional(),
    slug: z.string(),
  },
  returns: z
    .object({
      id: z.string(),
      createdAt: z.number(),
      invitation: z
        .object({
          id: z.string(),
          email: z.string(),
          expiresAt: z.number(),
          inviterEmail: z.string(),
          inviterId: z.string(),
          inviterName: z.string(),
          organizationId: z.string(),
          organizationName: z.string(),
          organizationSlug: z.string(),
          role: z.string(),
          status: z.string(),
        })
        .nullable(),
      isActive: z.boolean(),
      isPersonal: z.boolean(),
      logo: z.string().nullish(),
      name: z.string(),
      role: z.string().optional(),
      slug: z.string(),
    })
    .nullable(),
  handler: async (ctx, args) => {
    // Get organization details
    const org = await getBetterAuthOrganization(ctx, args.slug);

    if (!org) {
      return null;
    }

    const organizationData = {
      id: org._id,
      createdAt: org.createdAt,
      isActive: ctx.user.session.activeOrganizationId === org._id,
      isPersonal: org._id === ctx.user.personalOrganizationId,
      logo: org.logo,
      name: org.name,
      role: ctx.user.activeOrganization.role,
      slug: org.slug,
    };

    // Handle invitation - either by ID or auto-find by user email
    const invitationData = await (async () => {
      let invitation: BetterAuthInvitation | null = null;

      if (args.inviteId) {
        // If inviteId is provided, fetch specific invitation
        invitation = await ctx.runQuery(components.betterAuth.adapter.findOne, {
          model: 'invitation',
          where: [{ field: 'id', value: args.inviteId }],
        });

        if (!invitation || invitation.organizationId !== org._id) {
          return null;
        }
      } else {
        // If no inviteId, search for pending invitations for current user's email
        const invitationsResponse: { page: BetterAuthInvitation[] } | null =
          await ctx.runQuery(components.betterAuth.adapter.findMany, {
            model: 'invitation',
            paginationOpts: {
              cursor: null,
              numItems: 100,
            },
          });

        // Find invitation matching user's email and this organization
        const invitationsList = invitationsResponse?.page || [];
        invitation =
          invitationsList.find(
            (inv) =>
              inv.email === ctx.user.email &&
              inv.organizationId === org._id &&
              inv.status === 'pending'
          ) || null;

        if (!invitation) {
          return null;
        }
      }

      // Get inviter details
      const inviter = await getBetterAuthUserById(ctx, invitation.inviterId);

      return {
        id: invitation._id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        inviterEmail: inviter?.email ?? '',
        inviterId: invitation.inviterId,
        inviterName: inviter?.name ?? 'Team Admin',
        organizationId: invitation.organizationId,
        organizationName: org.name,
        organizationSlug: org.slug,
        role: invitation.role ?? 'member',
        status: invitation.status,
      };
    })();

    return {
      ...organizationData,
      invitation: invitationData,
    };
  },
});

// List members by organization slug
export const listMembers = createAuthQuery()({
  args: {
    slug: z.string(),
  },
  returns: z.object({
    currentUserRole: z.string().optional(),
    isPersonal: z.boolean(),
    members: z.array(
      z.object({
        id: z.string(),
        createdAt: z.number(),
        organizationId: z.string(),
        role: z.string().optional(),
        user: z.object({
          id: z.string(),
          email: z.string(),
          image: z.string().nullish(),
          name: z.string().nullish(),
        }),
        userId: z.string(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    console.time('createAuth');
    const auth = createAuth(ctx);
    console.timeEnd('createAuth');

    console.time('getHeaders');
    const headers = await getHeaders(ctx);
    console.timeEnd('getHeaders');

    console.time('betterAuth.adapter.findOne organization');
    const org = await getBetterAuthOrganization(ctx, args.slug);
    console.timeEnd('betterAuth.adapter.findOne organization');

    if (!org) {
      return {
        isPersonal: false,
        members: [],
      };
    }
    if (ctx.user.activeOrganization.id !== org._id) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'You are not a member of this organization',
      });
    }

    console.time('betterAuth.adapter.listMembers');
    const response = await ctx.runQuery(
      components.betterAuth.adapter.listMembers,
      {
        organizationId: org._id,
      }
    );
    console.timeEnd('betterAuth.adapter.listMembers');
    console.time('auth.api.listMembers');
    await auth.api.listMembers({
      headers,
      query: {
        limit: 100,
        organizationId: org._id,
      },
    });
    console.timeEnd('auth.api.listMembers');

    if (!response || !response.members) {
      return {
        isPersonal: org._id === ctx.user.personalOrganizationId,
        members: [],
      };
    }

    // Enrich with user data
    const enrichedMembers = response.members.map((member) => {
      return {
        id: member.id,
        createdAt: member.createdAt,
        organizationId: org._id,
        role: member.role,
        user: {
          id: member.user.id,
          email: member.user.email,
          image: member.user.image,
          name: member.user.name,
        },
        userId: member.userId,
      };
    });

    return {
      currentUserRole: ctx.user.activeOrganization.role,
      isPersonal: org._id === ctx.user.personalOrganizationId,
      members: enrichedMembers,
    };
  },
});

// List pending invitations by organization slug
export const listPendingInvitations = createAuthQuery()({
  args: {
    slug: z.string(),
  },
  returns: z.array(
    z.object({
      id: z.string(),
      createdAt: z.number(),
      email: z.string(),
      expiresAt: z.number(),
      organizationId: z.string(),
      role: z.string(),
      status: z.string(),
    })
  ),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    // Get organization by slug using Better Auth's findOne method (O(1) instead of O(n))
    const org = await getBetterAuthOrganization(ctx, args.slug);

    if (!org) return [];
    if (
      ctx.user.activeOrganization.role !== 'owner' ||
      ctx.user.activeOrganization.id !== org._id
    ) {
      return [];
    }

    // Check if user is owner or admin of this organization (optimized query)
    const betterAuthUser = await getBetterAuthUser(ctx, ctx.userId);

    if (!betterAuthUser) return [];

    const response = await auth.api.listInvitations({
      headers,
      query: { organizationId: org._id },
    });

    if (!response) return [];

    // Filter for pending invitations and enrich
    const pendingInvitations = response
      .filter((invitation) => invitation.status === 'pending')
      .map((invitation) => ({
        id: invitation.id,
        createdAt: Date.now(), // Use current timestamp since createdAt not available
        email: invitation.email,
        expiresAt: invitation.expiresAt as any,
        organizationId: invitation.organizationId,
        role: invitation.role,
        status: invitation.status,
      }));

    return pendingInvitations;
  },
});

// Invite member to organization by slug
export const inviteMember = createAuthMutation({
  rateLimit: 'organization/invite',
})({
  args: {
    email: z.string().email(),
    role: z.enum(['owner', 'member']),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    if (ctx.user.activeOrganization.role !== 'owner') {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only owners and admins can invite members',
      });
    }

    const orgId = ctx.user.activeOrganization.id;

    // Simple member count check
    const fullOrg = await auth.api.getFullOrganization({
      headers,
      query: { organizationId: orgId },
    });

    if (!fullOrg) {
      throw new ConvexError({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      });
    }

    const currentMemberCount = fullOrg.members?.length || 0;
    if (currentMemberCount >= MEMBER_LIMIT) {
      throw new ConvexError({
        code: 'LIMIT_EXCEEDED',
        message: `Organization member limit reached. Maximum ${MEMBER_LIMIT} members allowed.`,
      });
    }

    // Check for existing pending invitations and cancel them
    const existingInvitations: { page: BetterAuthInvitation[] } =
      await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: 'invitation',
        paginationOpts: {
          cursor: null,
          numItems: 100,
        },
        where: [
          { field: 'organizationId', value: orgId },
          { field: 'status', value: 'pending' },
          { field: 'email', value: args.email },
        ],
      });

    for (const existingInvitation of existingInvitations.page) {
      await auth.api.cancelInvitation({
        body: { invitationId: existingInvitation._id },
        headers,
      });
    }

    // Create new invitation
    try {
      const newInvitation = await auth.api.createInvitation({
        body: {
          email: args.email,
          organizationId: orgId,
          role: args.role,
        },
        headers,
      });

      if (!newInvitation?.id) {
        throw new ConvexError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get new invitation ID',
        });
      }
    } catch (error: any) {
      if (error.message?.includes('already a member')) {
        throw new ConvexError({
          code: 'CONFLICT',
          message: `${args.email} is already a member of this organization`,
        });
      }

      throw new ConvexError({
        code: 'BAD_REQUEST',
        message: `Failed to send invitation: ${error.message || 'Unknown error'}`,
      });
    }

    return null;
  },
});

// Cancel invitation
export const cancelInvitation = createAuthMutation({
  rateLimit: 'organization/cancelInvite',
})({
  args: {
    invitationId: z.string(),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    const invitation: BetterAuthInvitation | null = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: 'invitation',
        where: [{ field: 'id', value: args.invitationId }],
      }
    );

    if (
      ctx.user.activeOrganization.role !== 'owner' ||
      ctx.user.activeOrganization.id !== invitation?.organizationId
    ) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'Only owners and admins can invite members',
      });
    }

    // Cancel the invitation in Better Auth
    try {
      await auth.api.cancelInvitation({
        body: { invitationId: args.invitationId },
        headers,
      });
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        throw new ConvexError({
          code: 'NOT_FOUND',
          message: 'Invitation not found or already processed',
        });
      }

      throw new ConvexError({
        code: 'BAD_REQUEST',
        message: `Failed to cancel invitation: ${error.message || 'Unknown error'}`,
      });
    }

    // Note: Email cancellation through Resend is non-critical
    // The invitation being cancelled is the primary action

    return null;
  },
});
