"use client";

import { useState } from "react";
import { useAuthPaginatedQuery, useAuthMutation } from "@/lib/convex/hooks";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Archive, Users, CheckSquare, Square, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { WithSkeleton } from "@/components/ui/skeleton";
import Link from "next/link";

export default function ProjectsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    isPublic: false,
  });

  const { data, hasNextPage, isLoading, isFetchingNextPage, fetchNextPage } =
    useAuthPaginatedQuery(
      api.projects.list,
      { includeArchived },
      { initialNumItems: 10 }
    );

  const createProject = useAuthMutation(api.projects.create, {
    onSuccess: () => {
      setShowCreateDialog(false);
      setNewProject({ name: "", description: "", isPublic: false });
      toast.success("Project created successfully");
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? "Failed to create project");
    },
  });

  const archiveProject = useAuthMutation(api.projects.archive);
  const restoreProject = useAuthMutation(api.projects.restore);
  const generateSamples = useAuthMutation(api.projects.generateSamples);

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      toast.error("Project name is required");
      return;
    }

    createProject.mutate({
      name: newProject.name.trim(),
      description: newProject.description.trim() || undefined,
      isPublic: newProject.isPublic,
    });
  };

  const handleArchiveToggle = async (
    projectId: Id<"projects">,
    isArchived: boolean
  ) => {
    const mutation = isArchived ? restoreProject : archiveProject;

    toast.promise(mutation.mutateAsync({ projectId }), {
      loading: isArchived ? "Restoring project..." : "Archiving project...",
      success: isArchived ? "Project restored" : "Project archived",
      error: (e) => e.data?.message ?? "Failed to update project",
    });
  };

  const projects = data || [];

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Projects</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              toast.promise(
                generateSamples.mutateAsync({ count: 100 }),
                {
                  loading: "Generating sample projects with todos...",
                  success: (result) => `Created ${result.created} projects with ${result.todosCreated} todos!`,
                  error: (e) => e.data?.message ?? "Failed to generate samples",
                }
              );
            }}
            disabled={generateSamples.isPending}
          >
            <TestTube2 className="h-4 w-4" />
            Add Samples
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                Create a new project to organize your todos
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newProject.name}
                  onChange={(e) =>
                    setNewProject({ ...newProject, name: e.target.value })
                  }
                  placeholder="My Awesome Project"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newProject.description}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      description: e.target.value,
                    })
                  }
                  placeholder="Brief description of your project"
                  rows={3}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isPublic"
                  checked={newProject.isPublic}
                  onCheckedChange={(checked) =>
                    setNewProject({
                      ...newProject,
                      isPublic: checked as boolean,
                    })
                  }
                />
                <Label htmlFor="isPublic" className="text-sm font-normal">
                  Make this project public
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateProject}
                disabled={createProject.isPending}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="mb-4 flex items-center space-x-2">
        <Checkbox
          id="includeArchived"
          checked={includeArchived}
          onCheckedChange={(checked) => setIncludeArchived(checked as boolean)}
        />
        <Label htmlFor="includeArchived" className="text-sm font-normal">
          Show archived projects
        </Label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project, index) => (
          <WithSkeleton key={project._id || index} isLoading={isLoading}>
            <Card className={project.archived ? "opacity-60" : ""}>
              <CardHeader>
                <Link href={`/projects/${project._id}`}>
                  <CardTitle className="hover:underline cursor-pointer">
                    {project.name}
                  </CardTitle>
                </Link>
                <CardDescription>
                  {project.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4" />
                      <span>{project.memberCount} members</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {project.completedTodoCount > 0 ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                      <span>
                        {project.completedTodoCount}/{project.todoCount} todos
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs">
                      {project.isOwner ? "Owner" : "Member"}
                    </span>
                    {project.isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleArchiveToggle(project._id, project.archived)
                        }
                        className="h-7 px-2"
                      >
                        <Archive className="h-3 w-3 mr-1" />
                        {project.archived ? "Restore" : "Archive"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </WithSkeleton>
        ))}
      </div>

      {projects.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            {includeArchived ? "No projects found" : "No active projects found"}
          </p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Create your first project
          </Button>
        </div>
      )}

      {hasNextPage && (
        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
