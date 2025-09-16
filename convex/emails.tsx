'use node';

import { Resend } from '@convex-dev/resend';
import { render } from '@react-email/render';
import { v } from 'convex/values';

import { components } from './_generated/api';
import { action } from './_generated/server';
import OrganizationInviteEmail from './emails/organizationInvite';

// Initialize Resend component
export const resend: Resend = new Resend(components.resend, {
  testMode: process.env.NODE_ENV !== 'production',
});

// Send organization invitation email action
export const sendOrganizationInviteEmail = action({
  args: {
    acceptUrl: v.string(),
    invitationId: v.string(),
    inviterEmail: v.string(),
    inviterName: v.string(),
    organizationName: v.string(),
    role: v.string(),
    to: v.string(),
  },
  returns: v.string(), // Return email ID as string
  handler: async (ctx, args) => {
    const html = await render(
      <OrganizationInviteEmail
        acceptUrl={args.acceptUrl}
        invitationId={args.invitationId}
        inviterEmail={args.inviterEmail}
        inviterName={args.inviterName}
        organizationName={args.organizationName}
        role={args.role}
        to={args.to}
      />
    );

    const emailId = await resend.sendEmail(ctx, {
      from: 'Team <team@notifications.com>',
      html,
      subject: `${args.inviterName} invited you to join ${args.organizationName}`,
      to: args.to,
    });

    return emailId as string; // Return the email ID for tracking
  },
});
