"use client";

import { useState } from "react";
import { useAuthMutation, useAuthQuery } from "@/lib/convex/hooks";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CalendarIcon, Plus } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TagPicker } from "./tag-picker";

export function TodoForm({ 
  onSuccess,
  defaultProjectId 
}: { 
  onSuccess?: () => void;
  defaultProjectId?: Id<"projects">;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<
    "low" | "medium" | "high" | undefined
  >();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [projectId, setProjectId] = useState<Id<"projects"> | undefined>(defaultProjectId);
  const [selectedTagIds, setSelectedTagIds] = useState<Id<"tags">[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const createTodo = useAuthMutation(api.todos.create);
  const { data: projects } = useAuthQuery(api.projects.listForDropdown, {});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    toast.promise(
      createTodo.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate?.getTime(),
        projectId,
        tagIds: selectedTagIds,
      }),
      {
        loading: "Creating todo...",
        success: () => {
          setTitle("");
          setDescription("");
          setPriority(undefined);
          setDueDate(undefined);
          setProjectId(defaultProjectId);
          setSelectedTagIds([]);
          setIsOpen(false);
          onSuccess?.();
          return "Todo created!";
        },
        error: (e) => e.data?.message ?? "Failed to create todo",
      }
    );
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority(undefined);
    setDueDate(undefined);
    setProjectId(defaultProjectId);
    setSelectedTagIds([]);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add Todo
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[500px] p-0" align="end">
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Add more details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project">Project (optional)</Label>
            <Select 
              value={projectId || "no-project"} 
              onValueChange={(v) => setProjectId(v === "no-project" ? undefined : v as Id<"projects">)}
            >
              <SelectTrigger id="project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no-project">No Project</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project._id} value={project._id}>
                    {project.name} {project.isOwner ? "(Owner)" : "(Member)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger id="priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="dueDate"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags (optional)</Label>
            <TagPicker
              selectedTagIds={selectedTagIds}
              onTagsChange={setSelectedTagIds}
              disabled={createTodo.isPending}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                setIsOpen(false);
              }}
              disabled={createTodo.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createTodo.isPending}>
              Create Todo
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}