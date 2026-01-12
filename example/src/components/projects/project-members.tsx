'use client';

import { api } from '@convex/api';
import type { Id } from '@convex/dataModel';
import { useMutation } from '@tanstack/react-query';
import { useMutation as useConvexMutation } from 'convex/react';
import {
  Crown,
  MoreVertical,
  UserCheck,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ProjectMembersProps = {
  projectId: Id<'projects'>;
  owner: {
    _id: Id<'user'>;
    name: string | null;
    email: string;
  };
  members: Array<{
    _id: Id<'user'>;
    name: string | null;
    email: string;
    joinedAt: number;
  }>;
  isOwner: boolean;
};

export function ProjectMembers({
  projectId,
  owner,
  members,
  isOwner,
}: ProjectMembersProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [email, setEmail] = useState('');

  const addMemberFn = useConvexMutation(api.projects.addMember);
  const removeMemberFn = useConvexMutation(api.projects.removeMember);
  const transferFn = useConvexMutation(api.projects.transfer);

  const addMember = useMutation({
    mutationFn: (args: any) => addMemberFn(args),
    onSuccess: () => {
      setShowAddDialog(false);
      setEmail('');
      toast.success('Member added successfully');
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to add member');
    },
  });

  const removeMember = useMutation({
    mutationFn: (args: any) => removeMemberFn(args),
    onSuccess: () => {
      toast.success('Member removed');
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to remove member');
    },
  });

  const transferOwnership = useMutation({
    mutationFn: (args: any) => transferFn(args),
    onSuccess: () => {
      toast.success('Ownership transferred');
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to transfer ownership');
    },
  });

  const handleAddMember = () => {
    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    addMember.mutate({
      projectId,
      userEmail: email.trim(),
    });
  };

  const handleRemoveMember = (userId: Id<'user'>) => {
    removeMember.mutate({
      projectId,
      userId,
    });
  };

  const handleTransferOwnership = (userId: Id<'user'>) => {
    if (
      // biome-ignore lint/suspicious/noAlert: demo
      confirm(
        'Are you sure you want to transfer ownership? This action cannot be undone.'
      )
    ) {
      transferOwnership.mutate({
        projectId,
        newOwnerId: userId,
      });
    }
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Project Members</CardTitle>
            <CardDescription>
              Manage who has access to this project
            </CardDescription>
          </div>
          {isOwner && (
            <Dialog onOpenChange={setShowAddDialog} open={showAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="mr-1 h-4 w-4" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Project Member</DialogTitle>
                  <DialogDescription>
                    Enter the email address of the user you want to add
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      type="email"
                      value={email}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => setShowAddDialog(false)}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={addMember.isPending}
                    onClick={handleAddMember}
                  >
                    Add Member
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Owner */}
        <div className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={undefined} />
              <AvatarFallback>
                {getInitials(owner.name, owner.email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{owner.name || owner.email}</div>
              {owner.name && (
                <div className="text-muted-foreground text-sm">
                  {owner.email}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-yellow-600" />
            <span className="text-muted-foreground text-sm">Owner</span>
          </div>
        </div>

        {/* Members */}
        {members.map((member) => (
          <div
            className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50"
            key={member._id}
          >
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={undefined} />
                <AvatarFallback>
                  {getInitials(member.name, member.email)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">{member.name || member.email}</div>
                {member.name && (
                  <div className="text-muted-foreground text-sm">
                    {member.email}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">
                Joined {new Date(member.joinedAt).toLocaleDateString()}
              </span>
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="h-8 w-8 p-0" size="sm" variant="ghost">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleTransferOwnership(member._id)}
                    >
                      <UserCheck className="h-4 w-4" />
                      Make Owner
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleRemoveMember(member._id)}
                    >
                      <UserMinus className="h-4 w-4" />
                      Remove Member
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        ))}

        {members.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            <p>No members yet</p>
            {isOwner && (
              <p className="mt-2 text-sm">
                Add members to collaborate on this project
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
