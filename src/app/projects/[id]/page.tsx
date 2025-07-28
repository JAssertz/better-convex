"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePublicQuery, useAuthMutation } from "@/lib/convex/hooks";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TodoList } from "@/components/todos/todo-list";
import { ProjectMembers } from "@/components/projects/project-members";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, Archive, Trash2, UserMinus, Crown } from "lucide-react";
import { toast } from "sonner";
import { WithSkeleton } from "@/components/ui/skeleton";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as Id<"projects">;

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editData, setEditData] = useState({
    name: "",
    description: "",
    isPublic: false,
  });

  const { data: project, isLoading } = usePublicQuery(
    api.projects.get,
    { projectId },
    {
      placeholderData: {
        _id: "1" as any,
        _creationTime: Date.now(),
        name: "Loading Project",
        description: "Loading description...",
        ownerId: "1" as any,
        isPublic: false,
        archived: false,
        owner: {
          _id: "1" as any,
          name: "Loading",
          email: "loading@example.com",
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
      toast.success("Project updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? "Failed to update project");
    },
  });

  const archiveProject = useAuthMutation(api.projects.archive, {
    onSuccess: () => {
      toast.success("Project archived");
      router.push("/projects");
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? "Failed to archive project");
    },
  });

  const leaveProject = useAuthMutation(api.projects.leave, {
    onSuccess: () => {
      toast.success("Left project successfully");
      router.push("/projects");
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? "Failed to leave project");
    },
  });

  if (!project && !isLoading) {
    return (
      <div className="container mx-auto py-6 px-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Project not found or you don't have access
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleEditProject = () => {
    if (!project) return;
    setEditData({
      name: project.name,
      description: project.description || "",
      isPublic: project.isPublic,
    });
    setShowEditDialog(true);
  };

  const handleUpdateProject = async () => {
    if (!editData.name.trim()) {
      toast.error("Project name is required");
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
    <div className="container mx-auto py-6 px-4">
      <WithSkeleton isLoading={isLoading} className="w-full">
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold mb-2">{project?.name}</h1>
              <p className="text-muted-foreground">
                {project?.description || "No description"}
              </p>
            </div>
            <div className="flex gap-2">
              {isOwner && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditProject}
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    Settings
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleArchive}>
                    <Archive className="h-4 w-4 mr-1" />
                    Archive
                  </Button>
                </>
              )}
              {!isOwner && project && (
                <Button variant="outline" size="sm" onClick={handleLeave}>
                  <UserMinus className="h-4 w-4 mr-1" />
                  Leave Project
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4" />
              <span>Owner: {project?.owner.name || project?.owner.email}</span>
            </div>
            <div>
              {project?.members.length || 0} member
              {project?.members.length !== 1 ? "s" : ""}
            </div>
            <div>
              {completionRate}% complete ({project?.completedTodoCount}/
              {project?.todoCount} todos)
            </div>
            {project?.isPublic && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                Public
              </span>
            )}
          </div>
        </div>

        <Tabs defaultValue="todos" className="space-y-4">
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="todos" className="space-y-4">
            <TodoList projectId={projectId} />
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            {project && (
              <ProjectMembers
                projectId={projectId}
                owner={project.owner}
                members={project.members}
                isOwner={isOwner}
              />
            )}
          </TabsContent>
        </Tabs>
      </WithSkeleton>

      {/* Edit Project Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
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
                value={editData.name}
                onChange={(e) =>
                  setEditData({ ...editData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editData.description}
                onChange={(e) =>
                  setEditData({ ...editData, description: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-isPublic"
                checked={editData.isPublic}
                onCheckedChange={(checked) =>
                  setEditData({ ...editData, isPublic: checked as boolean })
                }
              />
              <Label htmlFor="edit-isPublic" className="text-sm font-normal">
                Make this project public
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateProject}
              disabled={updateProject.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
