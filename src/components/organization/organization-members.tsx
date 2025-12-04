'use client';

import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import {
  Crown,
  Mail,
  MoreHorizontal,
  User,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WithSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthMutation, useAuthQuery } from '@/lib/convex/hooks';

type Member = {
  id: Id<'member'>;
  createdAt: number;
  organizationId: Id<'organization'>;
  role?: string;
  user: {
    id: Id<'user'>;
    email: string;
    image?: string | null;
    name?: string | null;
  };
  userId: Id<'user'>;
};

type OrganizationMembersProps = {
  organization?: {
    id: Id<'organization'>;
    isPersonal: boolean;
    role?: string;
    slug: string;
  } | null;
  members?: {
    currentUserRole?: string;
    isPersonal: boolean;
    members: Member[];
  } | null;
  isLoading: boolean;
};

export function OrganizationMembers({
  organization,
  members,
  isLoading,
}: OrganizationMembersProps) {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteData, setInviteData] = useState({
    email: '',
    role: 'member',
  });

  const _a = api;

  const { data: pendingInvitations, isLoading: invitationsLoading } =
    useAuthQuery(
      api.organization.listPendingInvitations,
      organization ? { slug: organization.slug } : 'skip',
      {
        placeholderData: [
          {
            id: '1' as any,
            createdAt: new Date('2025-11-04').getTime(),
            email: 'pending@example.com',
            expiresAt:
              new Date('2025-11-04').getTime() + 7 * 24 * 60 * 60 * 1000,
            organizationId: '1' as any,
            role: 'member',
            status: 'pending',
          },
        ],
      }
    );

  const inviteMember = useAuthMutation(api.organization.inviteMember, {
    onSuccess: () => {
      setShowInviteDialog(false);
      setInviteData({ email: '', role: 'member' });
      toast.success('Invitation sent successfully');
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to send invitation');
    },
  });

  const removeMember = useAuthMutation(api.organization.removeMember, {
    onSuccess: () => {
      toast.success('Member removed successfully');
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to remove member');
    },
  });

  const updateMemberRole = useAuthMutation(api.organization.updateMemberRole, {
    onSuccess: () => {
      toast.success('Member role updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to update member role');
    },
  });

  const cancelInvitation = useAuthMutation(api.organization.cancelInvitation, {
    onSuccess: () => {
      toast.success('Invitation cancelled successfully');
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to cancel invitation');
    },
  });

  if (!(organization && members)) {
    return null;
  }

  const handleInviteMember = async () => {
    if (!inviteData.email.trim()) {
      toast.error('Email is required');
      return;
    }

    inviteMember.mutate({
      email: inviteData.email.trim(),
      role: inviteData.role as 'owner' | 'member',
    });
  };

  const handleRemoveMember = (memberId: Id<'user'>) => {
    removeMember.mutate({ memberId });
  };

  const handleUpdateRole = (memberId: Id<'user'>, role: 'owner' | 'member') => {
    updateMemberRole.mutate({ memberId, role });
  };

  const handleCancelInvitation = (invitationId: Id<'invitation'>) => {
    cancelInvitation.mutate({ invitationId });
  };

  const isOwner = organization.role === 'owner';
  const canInvite = isOwner && !organization.isPersonal;

  const getRoleIcon = (role?: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-4 w-4 text-yellow-600" />;
      default:
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'owner':
        return <Badge variant="default">Owner</Badge>;
      default:
        return <Badge variant="secondary">Member</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-lg">Members</h3>
          <p className="text-muted-foreground text-sm">
            Manage organization members and their roles
          </p>
        </div>
        {canInvite && (
          <Button
            onClick={() => setShowInviteDialog(true)}
            size="sm"
            variant="secondary"
          >
            <UserPlus className="h-4 w-4" />
            Invite
          </Button>
        )}
      </div>

      {/* Members Table */}
      <section>
        <h2 className="mb-3 font-medium text-muted-foreground text-sm uppercase tracking-wide">
          Members ({members.members?.length || 0})
        </h2>
        <div className="rounded-lg bg-secondary/30">
          <WithSkeleton className="w-full" isLoading={isLoading}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {isOwner && (
                    <TableHead className="w-[70px]">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.members?.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.user.image || ''} />
                          <AvatarFallback>
                            {member.user.name?.charAt(0) ||
                              member.user.email.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {member.user.name || 'Unknown User'}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {member.user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(member.role)}
                        {getRoleBadge(member.role)}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(member.createdAt).toLocaleDateString()}
                    </TableCell>
                    {isOwner && (
                      <TableCell>
                        {member.role !== 'owner' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  handleUpdateRole(member.userId, 'owner')
                                }
                              >
                                <Crown className="h-4 w-4" />
                                Make Owner
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleUpdateRole(member.userId, 'member')
                                }
                              >
                                <User className="h-4 w-4" />
                                Make Member
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() =>
                                  handleRemoveMember(member.userId)
                                }
                              >
                                <UserMinus className="h-4 w-4" />
                                Remove Member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </WithSkeleton>
        </div>
      </section>

      {/* Pending Invitations */}
      {isOwner && pendingInvitations && pendingInvitations.length > 0 && (
        <section>
          <h2 className="mb-3 font-medium text-muted-foreground text-sm uppercase tracking-wide">
            Pending Invitations ({pendingInvitations.length})
          </h2>
          <div className="rounded-lg bg-secondary/30">
            <WithSkeleton className="w-full" isLoading={invitationsLoading}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[70px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {invitation.email}
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(invitation.role)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(invitation.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleCancelInvitation(invitation.id)}
                          size="sm"
                          variant="ghost"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </WithSkeleton>
          </div>
        </section>
      )}

      {/* Invite Member Dialog */}
      <Dialog onOpenChange={setShowInviteDialog} open={showInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join this organization
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                onChange={(e) =>
                  setInviteData({ ...inviteData, email: e.target.value })
                }
                placeholder="member@example.com"
                type="email"
                value={inviteData.email}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                onValueChange={(value) =>
                  setInviteData({ ...inviteData, role: value })
                }
                value={inviteData.role}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowInviteDialog(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={inviteMember.isPending}
              onClick={handleInviteMember}
              variant="secondary"
            >
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
