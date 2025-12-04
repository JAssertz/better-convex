'use client';

import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Archive, Crown, Settings, UserMinus } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ProjectMembers } from '@/components/projects/project-members';
import { TodoList } from '@/components/todos/todo-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WithSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuthMutation, usePublicQuery } from '@/lib/convex/hooks';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as Id<'projects'>;

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [_showDeleteDialog, _setShowDeleteDialog] = useState(false);
  const [editData, setEditData] = useState({
    name: '',
    description: '',
    isPublic: false,
  });

  const { data: project, isLoading } = usePublicQuery(
    api.projects.get,
    { projectId },
    {
      placeholderData: {
        _id: '1' as any,
        _creationTime: new Date('2025-11-04').getTime(),
        name: 'Loading Project',
        description: 'Loading description...',
        ownerId: '1' as any,
        isPublic: false,
        archived: false,
        owner: {
          _id: '1' as any,
          name: 'Loading',
          email: 'loading@example.com',
        },
        members: [],
        todoCount: 0,
        completedTodoCount: 0,
      },
    }
  );

  const updateProject = useAuthMutation(api.projects.update, {
    onSuccess: () => {
      setShowEditDialog(false);
      toast.success('Project updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to update project');
    },
  });

  const archiveProject = useAuthMutation(api.projects.archive, {
    onSuccess: () => {
      toast.success('Project archived');
      router.push('/projects');
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to archive project');
    },
  });

  const leaveProject = useAuthMutation(api.projects.leave, {
    onSuccess: () => {
      toast.success('Left project successfully');
      router.push('/projects');
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? 'Failed to leave project');
    },
  });

  if (!(project || isLoading)) {
    return (
      <div className="mx-auto max-w-5xl @3xl:px-8 px-6 @3xl:py-12 py-8">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">
            Project not found or you don't have access
          </p>
        </div>
      </div>
    );
  }

  const handleEditProject = () => {
    if (!project) {
      return;
    }
    setEditData({
      name: project.name,
      description: project.description || '',
      isPublic: project.isPublic,
    });
    setShowEditDialog(true);
  };

  const handleUpdateProject = async () => {
    if (!editData.name.trim()) {
      toast.error('Project name is required');
      return;
    }

    updateProject.mutate({
      projectId,
      name: editData.name.trim(),
      description: editData.description.trim() || null,
      isPublic: editData.isPublic,
    });
  };

  const handleArchive = () => {
    archiveProject.mutate({ projectId });
  };

  const handleLeave = () => {
    leaveProject.mutate({ projectId });
  };

  const isOwner = !!project && project.owner._id === project.ownerId;
  const completionRate =
    project && project.todoCount > 0
      ? Math.round((project.completedTodoCount / project.todoCount) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-5xl @3xl:px-8 px-6 @3xl:py-12 py-8">
      <WithSkeleton className="w-full" isLoading={isLoading}>
        <header className="mb-10">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="font-semibold text-2xl tracking-tight">
                {project?.name}
              </h1>
              <p className="text-muted-foreground">
                {project?.description || 'No description'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Crown className="h-3.5 w-3.5" />
                  {project?.owner.name || project?.owner.email}
                </span>
                <span>{project?.members.length || 0} members</span>
                <span>{completionRate}% complete</span>
                {project?.isPublic && (
                  <Badge className="text-xs" variant="secondary">
                    Public
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {isOwner && (
                <>
                  <Button onClick={handleEditProject} size="sm" variant="ghost">
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button onClick={handleArchive} size="sm" variant="ghost">
                    <Archive className="h-4 w-4" />
                  </Button>
                </>
              )}
              {!isOwner && project && (
                <Button onClick={handleLeave} size="sm" variant="ghost">
                  <UserMinus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </header>

        <Tabs className="space-y-6" defaultValue="todos">
          <TabsList className="h-auto gap-1 bg-transparent p-0">
            <TabsTrigger
              className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-secondary"
              value="todos"
            >
              Todos
            </TabsTrigger>
            <TabsTrigger
              className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-secondary"
              value="members"
            >
              Members
            </TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-4" value="todos">
            <TodoList projectId={projectId} />
          </TabsContent>

          <TabsContent className="space-y-4" value="members">
            {project && (
              <ProjectMembers
                isOwner={isOwner}
                members={project.members}
                owner={project.owner}
                projectId={projectId}
              />
            )}
          </TabsContent>
        </Tabs>
      </WithSkeleton>

      {/* Edit Project Dialog */}
      <Dialog onOpenChange={setShowEditDialog} open={showEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update your project details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                onChange={(e) =>
                  setEditData({ ...editData, name: e.target.value })
                }
                value={editData.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                onChange={(e) =>
                  setEditData({ ...editData, description: e.target.value })
                }
                rows={3}
                value={editData.description}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={editData.isPublic}
                id="edit-isPublic"
                onCheckedChange={(checked) =>
                  setEditData({ ...editData, isPublic: checked as boolean })
                }
              />
              <Label className="font-normal text-sm" htmlFor="edit-isPublic">
                Make this project public
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowEditDialog(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={updateProject.isPending}
              onClick={handleUpdateProject}
              variant="secondary"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
