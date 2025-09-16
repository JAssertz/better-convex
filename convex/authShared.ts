import type { InvitationStatus } from 'better-auth/plugins';

import type { Doc, Id } from './_generated/dataModel';

export type Session = {
  session: AuthSession;
  user: AuthUser;
};

export type AuthSession = {
  id: string;
  createdAt: number;
  expiresAt: number;
  token: string;
  updatedAt: number;
  userId: string;
  activeOrganizationId?: string | null;
  activeTeamId?: string | null;
  impersonatedBy?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type BetterAuthUser = {
  _id: string;
  _creationTime: number;
  createdAt: number;
  email: string;
  emailVerified: boolean;
  name: string;
  updatedAt: number;
  userId: Id<'users'>;
  banExpires?: number | null;
  banned?: boolean | null;
  banReason?: string | null;
  displayUsername?: string | null;
  image?: string | null;
  isAnonymous?: boolean | null;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean | null;
  role?: string | null;
  stripeCustomerId?: string | null;
  teamId?: string | null;
  twoFactorEnabled?: boolean | null;
  username?: string | null;
};

export type AuthUser = Pick<
  BetterAuthUser,
  | 'banExpires'
  | 'banned'
  | 'banReason'
  | 'email'
  | 'emailVerified'
  | 'image'
  | 'name'
  | 'role'
> & {
  id: string;
  createdAt: number;
  updatedAt: number;
  userId: Id<'users'>;
};

export type SessionUser = Omit<AuthUser, 'image' | 'name'> &
  Doc<'users'> & {
    id: Id<'users'>;
    activeOrganization: Omit<BetterAuthOrganization, '_id'> &
      Pick<BetterAuthMember, 'role'> & {
        id: string;
      };
    isAdmin: boolean;
    session: AuthSession;
    plan?: 'premium' | 'team';
  };

export type BetterAuthOrganization = {
  _id: string;
  createdAt: number;
  logo: string | null;
  metadata: string | null;
  monthlyCredits: number;
  name: string;
  slug: string;
};

export type BetterAuthMember = {
  _id: string;
  createdAt: number;
  organizationId: string;
  role: 'member' | 'owner';
  userId: string;
};

export type BetterAuthInvitation = {
  _id: string;
  email: string;
  expiresAt: number;
  inviterId: string;
  organizationId: string;
  role: 'member' | 'owner';
  status: InvitationStatus;
  teamId: string | null;
};
