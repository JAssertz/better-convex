"use client";

import { useState } from "react";
import { useAuthQuery, useAuthMutation } from "@/lib/convex/hooks";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  GitMerge,
  Tag,
  Hash,
  TestTube2,
} from "lucide-react";
import { toast } from "sonner";
import { WithSkeleton } from "@/components/ui/skeleton";

export default function TagsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [selectedTag, setSelectedTag] = useState<{
    _id: Id<"tags">;
    name: string;
    color: string;
  } | null>(null);
  const [newTag, setNewTag] = useState({ name: "", color: "" });
  const [editTag, setEditTag] = useState({ name: "", color: "" });
  const [mergeTarget, setMergeTarget] = useState<Id<"tags"> | null>(null);

  const { data: tags, isLoading } = useAuthQuery(
    api.tags.list,
    {},
    {
      placeholderData: [
        {
          _id: "1" as any,
          _creationTime: Date.now(),
          name: "Work",
          color: "#3B82F6",
          usageCount: 5,
        },
        {
          _id: "2" as any,
          _creationTime: Date.now(),
          name: "Personal",
          color: "#10B981",
          usageCount: 3,
        },
        {
          _id: "3" as any,
          _creationTime: Date.now(),
          name: "Urgent",
          color: "#EF4444",
          usageCount: 2,
        },
      ],
    }
  );

  const { data: popularTags } = useAuthQuery(api.tags.popular, { limit: 5 });

  const createTag = useAuthMutation(api.tags.create, {
    onSuccess: () => {
      setShowCreateDialog(false);
      setNewTag({ name: "", color: "" });
      toast.success("Tag created successfully");
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? "Failed to create tag");
    },
  });

  const updateTag = useAuthMutation(api.tags.update, {
    onSuccess: () => {
      setShowEditDialog(false);
      setSelectedTag(null);
      toast.success("Tag updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? "Failed to update tag");
    },
  });

  const deleteTag = useAuthMutation(api.tags.deleteTag, {
    onSuccess: () => {
      toast.success("Tag deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? "Failed to delete tag");
    },
  });

  const mergeTag = useAuthMutation(api.tags.merge, {
    onSuccess: () => {
      setShowMergeDialog(false);
      setSelectedTag(null);
      setMergeTarget(null);
      toast.success("Tags merged successfully");
    },
    onError: (error: any) => {
      toast.error(error.data?.message ?? "Failed to merge tags");
    },
  });

  const generateSamples = useAuthMutation(api.tags.generateSamples);

  const handleCreateTag = () => {
    if (!newTag.name.trim()) {
      toast.error("Tag name is required");
      return;
    }

    createTag.mutate({
      name: newTag.name.trim(),
      color: newTag.color || undefined,
    });
  };

  const handleEditTag = () => {
    if (!selectedTag || !editTag.name.trim()) {
      toast.error("Tag name is required");
      return;
    }

    updateTag.mutate({
      tagId: selectedTag._id,
      name: editTag.name.trim(),
      color: editTag.color || undefined,
    });
  };

  const handleDeleteTag = (tagId: Id<"tags">) => {
    if (
      confirm(
        "Are you sure you want to delete this tag? It will be removed from all todos."
      )
    ) {
      deleteTag.mutate({ tagId });
    }
  };

  const handleMergeTags = () => {
    if (!selectedTag || !mergeTarget) {
      toast.error("Please select a target tag");
      return;
    }

    mergeTag.mutate({
      sourceTagId: selectedTag._id,
      targetTagId: mergeTarget,
    });
  };

  const openEditDialog = (tag: {
    _id: Id<"tags">;
    name: string;
    color: string;
  }) => {
    setSelectedTag(tag);
    setEditTag({ name: tag.name, color: tag.color });
    setShowEditDialog(true);
  };

  const openMergeDialog = (tag: {
    _id: Id<"tags">;
    name: string;
    color: string;
  }) => {
    setSelectedTag(tag);
    setMergeTarget(null);
    setShowMergeDialog(true);
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Tags</h1>
          <p className="text-muted-foreground mt-2">
            Organize your todos with tags
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              toast.promise(
                generateSamples.mutateAsync({ count: 100 }),
                {
                  loading: "Generating sample tags...",
                  success: (result) => `Created ${result.created} sample tags!`,
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
                New Tag
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Tag</DialogTitle>
                <DialogDescription>
                  Create a new tag to organize your todos
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="tag-name">Name</Label>
                  <Input
                    id="tag-name"
                    value={newTag.name}
                    onChange={(e) =>
                      setNewTag({ ...newTag, name: e.target.value })
                    }
                    placeholder="e.g., Work, Personal, Urgent"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tag-color">Color (optional)</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="tag-color"
                      type="color"
                      value={newTag.color || "#3B82F6"}
                      onChange={(e) =>
                        setNewTag({ ...newTag, color: e.target.value })
                      }
                      className="w-20 h-10 cursor-pointer"
                    />
                    <Input
                      value={newTag.color}
                      onChange={(e) =>
                        setNewTag({ ...newTag, color: e.target.value })
                      }
                      placeholder="#3B82F6"
                      className="flex-1"
                    />
                  </div>
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
                  onClick={handleCreateTag}
                  disabled={createTag.isPending}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Popular Tags */}
      {popularTags && popularTags.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Popular Tags</CardTitle>
            <CardDescription>Most used tags across all users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {popularTags.map((tag) => (
                <Badge
                  key={tag._id}
                  style={{
                    backgroundColor: tag.color + "20",
                    color: tag.color,
                    borderColor: tag.color,
                  }}
                  variant="outline"
                  className="px-3 py-1"
                >
                  <Hash className="h-3 w-3 mr-1" />
                  {tag.name}
                  <span className="ml-2 text-xs opacity-70">
                    ({tag.usageCount})
                  </span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* User's Tags */}
      <Card>
        <CardHeader>
          <CardTitle>Your Tags</CardTitle>
          <CardDescription>
            {tags?.length || 0} tag{tags?.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {tags?.map((tag, index) => (
              <WithSkeleton
                key={tag._id || index}
                isLoading={isLoading}
                className="w-full"
              >
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: tag.color + "20" }}
                    >
                      <Tag className="h-4 w-4" style={{ color: tag.color }} />
                    </div>
                    <div>
                      <div className="font-medium">{tag.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Used in {tag.usageCount} todo
                        {tag.usageCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(tag)}>
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      {tags.length > 1 && (
                        <DropdownMenuItem onClick={() => openMergeDialog(tag)}>
                          <GitMerge className="h-4 w-4" />
                          Merge into...
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleDeleteTag(tag._id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </WithSkeleton>
            ))}
          </div>

          {tags?.length === 0 && !isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No tags yet</p>
              <p className="text-sm mt-2">
                Create your first tag to start organizing
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Tag Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tag</DialogTitle>
            <DialogDescription>Update tag name or color</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tag-name">Name</Label>
              <Input
                id="edit-tag-name"
                value={editTag.name}
                onChange={(e) =>
                  setEditTag({ ...editTag, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tag-color">Color</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="edit-tag-color"
                  type="color"
                  value={editTag.color}
                  onChange={(e) =>
                    setEditTag({ ...editTag, color: e.target.value })
                  }
                  className="w-20 h-10 cursor-pointer"
                />
                <Input
                  value={editTag.color}
                  onChange={(e) =>
                    setEditTag({ ...editTag, color: e.target.value })
                  }
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditTag} disabled={updateTag.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Tag Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Tag</DialogTitle>
            <DialogDescription>
              Merge "{selectedTag?.name}" into another tag. All todos will be
              updated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select target tag</Label>
              <div className="grid gap-2">
                {tags
                  ?.filter((t) => t._id !== selectedTag?._id)
                  .map((tag) => (
                    <div
                      key={tag._id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 ${
                        mergeTarget === tag._id ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => setMergeTarget(tag._id)}
                    >
                      <div
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <div className="font-medium">{tag.name}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMergeTags}
              disabled={!mergeTarget || mergeTag.isPending}
            >
              Merge Tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
