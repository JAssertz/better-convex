import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';
import { admin, organization } from 'better-auth/plugins';

import { type AuthFunctions, createClient } from './betterAuth/client';
import { api, internal } from './_generated/api';
import { ActionCtx, type GenericCtx } from './_generated/server';
import { entsTableFactory } from 'convex-ents';
import { entDefinitions } from './schema';
import { createPersonalOrganization } from './organizationHelpers';
import { getEnv } from './helpers/getEnv';

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient({
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, user) => {
        const table = entsTableFactory(ctx, entDefinitions);

        const env = getEnv();
        const adminEmails = env.ADMIN;

        // Check if this user email is in the admin list
        if (user.role !== 'admin' && adminEmails?.includes(user.email)) {
          await table('user').getX(user._id).patch({ role: 'admin' });
        }

        // Create personal organization for the new user
        await createPersonalOrganization(ctx, {
          email: user.email,
          image: user.image || null,
          name: user.name,
          userId: user._id,
        });

        // Create Polar customer for the new user
        // await ctx.scheduler.runAfter(0, internal.polar.customer.createCustomer, {
        //   userId: args.userId,
        //   email: user.email,
        //   name: user.name,
        //   userId: user.userId,
        // });
      },
    },
    session: {
      onCreate: async (ctx, session) => {
        const table = entsTableFactory(ctx, entDefinitions);

        if (!session.activeOrganizationId) {
          const user = await table('user').getX(session.userId);

          await table('session')
            .getX(session._id)
            .patch({
              activeOrganizationId:
                user.lastActiveOrganizationId || user.personalOrganizationId,
            });
        }
      },
    },
  },
  verbose: false,
});

export const { onCreate, onDelete, onUpdate } = authComponent.triggersApi();

export const createAuth = <Ctx extends GenericCtx = ActionCtx>(_ctx: Ctx) => {
  const ctx = _ctx as ActionCtx;
  const baseURL = process.env.NEXT_PUBLIC_SITE_URL!;

  return betterAuth({
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'github'],
      },
    },
    baseURL,
    database: authComponent.adapter(ctx),
    logger: { disabled: true },
    plugins: [
      admin(),
      organization({
        allowUserToCreateOrganization: true, // Will gate with
        creatorRole: 'owner',
        invitationExpiresIn: 24 * 60 * 60 * 7, // 7 days
        membershipLimit: 100,
        organizationLimit: 3,
        schema: {
          organization: {
            additionalFields: {
              monthlyCredits: {
                required: true,
                type: 'number',
              },
            },
          },
        },
        sendInvitationEmail: async (data) => {
          // Send invitation email via Resend
          await ctx.scheduler.runAfter(
            0,
            api.emails.sendOrganizationInviteEmail,
            {
              acceptUrl: `${process.env.NEXT_PUBLIC_SITE_URL!}/w/${data.organization.slug}?invite=${data.id}`,
              invitationId: data.id,
              inviterEmail: data.inviter.user.email,
              inviterName: data.inviter.user.name || 'Team Admin',
              organizationName: data.organization.name,
              role: data.role,
              to: data.email,
            }
          );
        },
      }),
      convex(),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24 * 15, // 15 days
    },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        mapProfileToUser: async (profile) => {
          return {
            // Better Auth standard fields
            email: profile.email,
            image: profile.avatar_url,
            name: profile.name || profile.login,
            // Additional fields that will be available in onCreateUser
            bio: profile.bio || undefined,
            firstName: profile.name?.split(' ')[0] || undefined,
            github: profile.login,
            lastName: profile.name?.split(' ').slice(1).join(' ') || undefined,
            location: profile.location || undefined,
            username: profile.login,
            x: profile.twitter_username || undefined,
          };
        },
      },
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        mapProfileToUser: async (profile) => {
          return {
            // Better Auth standard fields
            email: profile.email,
            image: profile.picture,
            name: profile.name,
            // Additional fields that will be available in onCreateUser
            firstName: profile.given_name || undefined,
            lastName: profile.family_name || undefined,
          };
        },
      },
    },
    telemetry: { enabled: false },
    user: {
      additionalFields: {
        bio: {
          required: false,
          type: 'string',
        },
        firstName: {
          required: false,
          type: 'string',
        },
        github: {
          required: false,
          type: 'string',
        },
        lastName: {
          required: false,
          type: 'string',
        },
        linkedin: {
          required: false,
          type: 'string',
        },
        location: {
          required: false,
          type: 'string',
        },
        username: {
          required: false,
          type: 'string',
        },
        website: {
          required: false,
          type: 'string',
        },
        x: {
          required: false,
          type: 'string',
        },
      },
      changeEmail: {
        enabled: false,
      },
      deleteUser: {
        enabled: false,
      },
    },
  });
};
