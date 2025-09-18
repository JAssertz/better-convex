import { ConvexError } from 'convex/values';
import { z } from 'zod';
import { zid } from 'convex-helpers/server/zod';

import { api } from './_generated/api';
import { createAuth } from './auth';
import { getHeaders } from './betterAuth/helpers';
import { createAuthMutation, createAuthQuery } from './functions';
import { asyncMap } from 'convex-helpers';

const MEMBER_LIMIT = 5;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 50);
}

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
      const existingOrg = await ctx.table('organization').get('slug', slug);

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
        const existingOrg = await ctx.table('organization').get('slug', slug!);

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
    organizationId: zid('organization'),
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
    invitationId: zid('invitation'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    // Validate that the invitation is for the current user's email
    const invitation = await ctx.table('invitation').get(args.invitationId);
    const validInvitation =
      invitation?.email === ctx.user.email ? invitation : null;

    if (!validInvitation) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'This invitation is not found for your email address',
      });
    }
    if (validInvitation.status !== 'pending') {
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
    invitationId: zid('invitation'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    // Get the specific invitation directly
    const invitation = await ctx.table('invitation').get(args.invitationId);
    const validInvitation =
      invitation?.email === ctx.user.email ? invitation : null;

    if (!validInvitation) {
      throw new ConvexError({
        code: 'FORBIDDEN',
        message: 'This invitation is not found for your email address',
      });
    }
    if (validInvitation.status !== 'pending') {
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
    memberId: zid('member'),
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
  handler: async (ctx) => {
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
    memberId: zid('member'),
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

// Delete organization (owner only)
export const deleteOrganization = createAuthMutation({})({
  args: {},
  returns: z.null(),
  handler: async (ctx) => {
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
    const org = await ctx.table('organization').get('slug', args.slug);

    if (!org) return null;

    // Get full organization data with members
    const fullOrg = await auth.api.getFullOrganization({
      headers,
      query: { organizationId: org._id },
    });

    if (!fullOrg) return null;

    // Get user's role from full organization members
    const currentMember = fullOrg.members?.find((m) => m.userId === ctx.userId);

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
    inviteId: zid('invitation').optional(),
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
    const org = await ctx.table('organization').get('slug', args.slug);

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
      const invitation = await (async () => {
        if (args.inviteId) {
          // If inviteId is provided, fetch specific invitation
          const invitation = await ctx.table('invitation').get(args.inviteId);

          if (!invitation || invitation.organizationId !== org._id) {
            return null;
          }
          return invitation;
        } else {
          // If no inviteId, search for pending invitations for current user's email
          const invitations = await ctx.table(
            'invitation',
            'email_status',
            (q) => q.eq('email', ctx.user.email).eq('status', 'pending')
          );

          // Find invitation matching this organization
          return (
            invitations.find((inv) => inv.organizationId === org._id) || null
          );
        }
      })();

      if (!invitation) {
        return null;
      }

      // Get inviter details
      const inviter = await ctx.table('user').get(invitation.inviterId);

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

    console.time('betterAuth.findOne organization');
    const org = await ctx.table('organization').get('slug', args.slug);
    console.timeEnd('betterAuth.findOne organization');

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

    console.time('ctx.table.listMembers');
    const members = await ctx
      .table('member')
      .getManyX('organizationId', [org._id]);

    const membersWithUsers = await asyncMap(members, async (member) => {
      const user = await member.edgeX('user');

      return {
        id: member._id,
        createdAt: member.createdAt,
        role: member.role,
        user: {
          id: user._id,
          email: user.email,
          image: user.image ?? undefined,
          name: user.name,
        },
        userId: member.userId,
      };
    });

    const response = {
      members: membersWithUsers.filter(Boolean) as any[],
    };
    console.timeEnd('ctx.table.listMembers');
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
    const enrichedMembersList = response.members.map((member) => {
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
      members: enrichedMembersList,
    };
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
    const existingInvitations = await ctx.table(
      'invitation',
      'organizationId_email_status',
      (q) =>
        q
          .eq('organizationId', orgId)
          .eq('email', args.email)
          .eq('status', 'pending')
    );

    for (const existingInvitation of existingInvitations) {
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
    invitationId: zid('invitation'),
  },
  returns: z.null(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const headers = await getHeaders(ctx);

    const invitation = await ctx.table('invitation').get(args.invitationId);

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
