'use client';

import { useState } from 'react';
import { useAuthMutation, useAuthQuery } from '@/lib/convex/hooks';
import { api } from '@convex/_generated/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  UserPlus,
  MoreHorizontal,
  Crown,
  User,
  Mail,
  Calendar,
  Trash2,
  UserMinus,
  Shield,
  Clock,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { WithSkeleton } from '@/components/ui/skeleton';

interface Member {
  id: string;
  createdAt: number;
  organizationId: string;
  role?: string;
  user: {
    id: string;
    email: string;
    image?: string | null;
    name?: string | null;
  };
  userId: string;
}

interface PendingInvitation {
  id: string;
  createdAt: number;
  email: string;
  expiresAt: number;
  organizationId: string;
  role: string;
  status: string;
}

interface OrganizationMembersProps {
  organization: {
    id: string;
    isPersonal: boolean;
    role?: string;
    slug: string;
  } | null;
  members: {
    currentUserRole?: string;
    isPersonal: boolean;
    members: Member[];
  } | null;
  isLoading: boolean;
}

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

  const { data: pendingInvitations, isLoading: invitationsLoading } = useAuthQuery(
    api.organization.listPendingInvitations,
    organization ? { slug: organization.slug } : 'skip',
    {
      placeholderData: [
        {
          id: '1',
          createdAt: Date.now(),
          email: 'pending@example.com',
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          organizationId: '1',
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

  if (!organization || !members) {
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

  const handleRemoveMember = (memberId: string) => {
    removeMember.mutate({ memberId });
  };

  const handleUpdateRole = (memberId: string, role: 'owner' | 'member') => {
    updateMemberRole.mutate({ memberId, role });
  };

  const handleCancelInvitation = (invitationId: string) => {
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
          <h3 className="text-lg font-medium">Members</h3>
          <p className="text-sm text-muted-foreground">
            Manage organization members and their roles
          </p>
        </div>
        {canInvite && (
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Members ({members.members?.length || 0})
          </CardTitle>
          <CardDescription>
            Current members of this organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WithSkeleton isLoading={isLoading} className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {isOwner && <TableHead className="w-[70px]">Actions</TableHead>}
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
                          <p className="text-sm text-muted-foreground">
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
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(member.createdAt).toLocaleDateString()}
                    </TableCell>
                    {isOwner && (
                      <TableCell>
                        {member.role !== 'owner' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
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
                                onClick={() => handleRemoveMember(member.userId)}
                                className="text-destructive"
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
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {isOwner && pendingInvitations && pendingInvitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Invitations ({pendingInvitations.length})
            </CardTitle>
            <CardDescription>
              Invitations that have been sent but not yet accepted
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WithSkeleton isLoading={invitationsLoading} className="w-full">
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
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(invitation.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelInvitation(invitation.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </WithSkeleton>
          </CardContent>
        </Card>
      )}

      {/* Invite Member Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
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
                type="email"
                value={inviteData.email}
                onChange={(e) =>
                  setInviteData({ ...inviteData, email: e.target.value })
                }
                placeholder="member@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteData.role}
                onValueChange={(value) =>
                  setInviteData({ ...inviteData, role: value })
                }
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
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInviteMember}
              disabled={inviteMember.isPending}
            >
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}