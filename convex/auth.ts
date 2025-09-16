// import './polar/polyfills';

import {
  type AuthFunctions,
  type GenericCtx,
  createClient,
} from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
// import {
//   checkout,
//   polar,
//   portal,
//   usage,
//   webhooks,
// } from '@polar-sh/better-auth';
// import { Polar } from '@polar-sh/sdk';
import { betterAuth } from 'better-auth';
import { admin, organization } from 'better-auth/plugins';

import type { DataModel, Id } from './_generated/dataModel';
import type { InternalMutationCtx } from './functions';

import { api, components, internal } from './_generated/api';
import { getBetterAuthUserById } from './betterAuth/getBetterAuthUser';
// import { convertToDatabaseSubscription } from './polar/helpers';
// import { getProduct } from './polar/product';
import authSchema from './betterAuth/schema';

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    authFunctions,
    local: { schema: authSchema },
    triggers: {
      user: {
        onCreate: async (ctx, user) => {
          const { email, image, name } = user;

          // Create app user before better-auth user
          const userId = await ctx.runMutation(
            internal.authInternal.onCreateUser,
            {
              bio: user.bio,
              email,
              image,
              name,
            }
          );

          await authComponent.setUserId(ctx, user._id, userId);
        },
        onDelete: async (ctx, userId) => {
          await ctx.runMutation(internal.authInternal.onDeleteUser, {
            userId: userId as unknown as Id<'users'>,
          });
        },
        onUpdate: async (ctx, user) => {
          await ctx.runMutation(internal.authInternal.onUpdateUser, {
            image: user.image,
            name: user.name,
            userId: user.userId as Id<'users'>,
          });
        },
      },
    },
    verbose: false,
  }
);

export const { onCreate, onDelete, onUpdate } = authComponent.triggersApi();

export const createAuth = (ctx: GenericCtx<DataModel>) => {
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
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            // After session is created (OAuth login), ensure user has a personal organization
            await (ctx as InternalMutationCtx).runMutation(
              internal.authInternal.afterSessionCreate,
              { token: session.token, userId: session.userId }
            );
          },
          before: async (session) => {
            const user = await getBetterAuthUserById(
              ctx as any,
              session.userId
            );
            // createAuth requires string
            const lastActiveOrgId: string = await ctx.runQuery(
              internal.authInternal.getLastActiveOrganizationId,
              { betterAuthUserId: session.userId, userId: user!.userId }
            );

            return {
              data: {
                ...session,
                activeOrganizationId: lastActiveOrgId,
              },
            };
          },
        },
      },
      // NOTE: not called when using components.betterAuth.adapter.create
      user: {
        create: {
          after: async (user) => {
            await (ctx as InternalMutationCtx).runMutation(
              internal.authInternal.afterUserCreate,
              {
                id: user.id,
                email: user.email,
              }
            );
          },
        },
      },
    },
    logger: {
      disabled: true,
    },
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
          await (ctx as any).scheduler.runAfter(
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
      // polar({
      //   client: new Polar({
      //     accessToken: process.env.POLAR_ACCESS_TOKEN!,
      //     server:
      //       process.env.DEPLOY_ENV === 'production' ? 'production' : 'sandbox',
      //   }),
      //   use: [
      //     checkout({
      //       authenticatedUsersOnly: true,
      //       products: [
      //         {
      //           productId: process.env.POLAR_PRODUCT_PREMIUM!,
      //           slug: 'premium',
      //         },
      //         // {
      //         //   productId: process.env.POLAR_PRODUCT_TEAM!,
      //         //   slug: 'team',
      //         // },
      //         {
      //           productId: process.env.POLAR_PRODUCT_CREDITS!,
      //           slug: 'credits',
      //         },
      //       ],
      //       successUrl: '/success?checkout_id={CHECKOUT_ID}',
      //       theme: 'light',
      //     }),
      //     portal(),
      //     usage(),
      //     webhooks({
      //       secret: process.env.POLAR_WEBHOOK_SECRET!,
      //       onCustomerCreated: async (payload) => {
      //         let userId = payload?.data.metadata.userId as
      //           | Id<'users'>
      //           | undefined;

      //         if (!userId) {
      //           const user = await getBetterAuthUserById(
      //             ctx as any,
      //             payload.data.id
      //           );
      //           userId = user?.userId;
      //         }
      //         if (!userId) {
      //           return;
      //         }

      //         await (ctx as InternalMutationCtx).runMutation(
      //           internal.polar.customer.updateUserPolarCustomerId,
      //           {
      //             customerId: payload.data.id,
      //             userId,
      //           }
      //         );
      //       },
      //       onOrderPaid: async (payload) => {
      //         // Check if it's a credits product purchase
      //         if (
      //           payload.data.productId === process.env.POLAR_PRODUCT_CREDITS
      //         ) {
      //           // Get the amount paid (in cents)
      //           const amountInCents =
      //             payload.data.netAmount || payload.data.totalAmount || 0;
      //           const credits = amountInCents;

      //           // Extract organization ID from referenceId metadata
      //           const organizationId = payload.data.metadata?.referenceId as
      //             | string
      //             | undefined;

      //           if (credits > 0 && organizationId) {
      //             // Add credits directly to organization
      //             await (ctx as InternalMutationCtx).runMutation(
      //               internal.polar.credit.addPurchasedCredits,
      //               {
      //                 amount: credits,
      //                 organizationId,
      //               }
      //             );
      //           }
      //         }
      //       },
      //       onSubscriptionCreated: async (payload) => {
      //         if (!payload.data.customer.metadata.userId) {
      //           return;
      //         }

      //         await (ctx as InternalMutationCtx).runMutation(
      //           internal.polar.subscription.createSubscription,
      //           {
      //             subscription: convertToDatabaseSubscription(payload.data),
      //           }
      //         );
      //       },
      //       onSubscriptionUpdated: async (payload) => {
      //         if (!payload.data.customer.metadata.userId) {
      //           return;
      //         }

      //         const updated = await (ctx as InternalMutationCtx).runMutation(
      //           internal.polar.subscription.updateSubscription,
      //           {
      //             subscription: convertToDatabaseSubscription(payload.data),
      //           }
      //         );

      //         if (!updated) {
      //           return;
      //         }

      //         // Handle monthly credits reset for organization-based subscriptions
      //         const organizationId = payload.data.metadata?.referenceId as
      //           | string
      //           | undefined;

      //         if (organizationId) {
      //           // Determine monthly credit amount based on product price
      //           const product = getProduct(payload.data.productId);
      //           const monthlyPrice = product?.prices.find(
      //             (p) => p.recurringInterval === 'month'
      //           );
      //           // Credits = price in cents (2000 cents = 2000 credits)
      //           const monthlyCreditsInCents = monthlyPrice?.priceAmount ?? 0;

      //           // Reset monthly credits for the organization
      //           if (monthlyCreditsInCents > 0) {
      //             await (ctx as InternalMutationCtx).runMutation(
      //               internal.polar.credit.resetMonthlyCredits,
      //               {
      //                 newAmount: monthlyCreditsInCents,
      //                 organizationId,
      //               }
      //             );
      //           }
      //         }
      //       },
      //     }),
      //   ],
      // }),
      convex(),
    ],
    session: {
      additionalFields: {
        activeOrganizationId: {
          required: false,
          type: 'string',
        },
      },
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
    // trustedOrigins: [process.env.NEXT_PUBLIC_SITE_URL!],
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

export const getHeaders = async (ctx: GenericCtx<DataModel>) => {
  return await authComponent.getHeaders(ctx);
};
