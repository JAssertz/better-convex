"use client";

import { useState } from "react";
import { useAuthPaginatedQuery, useAuthMutation } from "@/lib/convex/hooks";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { TodoItem } from "./todo-item";
import { TodoForm } from "./todo-form";
import { TodoSearch } from "./todo-search";
import { Button } from "@/components/ui/button";
import { WithSkeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Archive, TestTube2 } from "lucide-react";
import { toast } from "sonner";

interface TodoListProps {
  projectId?: Id<"projects">;
  showFilters?: boolean;
}

export function TodoList({ projectId, showFilters = true }: TodoListProps) {
  const [completedFilter, setCompletedFilter] = useState<boolean | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<
    "low" | "medium" | "high" | undefined
  >();
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const generateSamples = useAuthMutation(api.todos.generateSamples);

  // Use search API when there's a query, otherwise use the regular list
  const listResult = useAuthPaginatedQuery(
    searchQuery ? api.todos.search : api.todos.list,
    searchQuery 
      ? {
          query: searchQuery,
          completed: completedFilter,
          projectId,
        }
      : {
          completed: completedFilter,
          projectId,
          priority: priorityFilter,
        },
    {
      initialNumItems: 10,
      placeholderData: [
          {
            _id: "1" as any,
            _creationTime: Date.now(),
            title: "Example Todo 1",
            description: "This is a placeholder todo item",
            completed: false,
            priority: "medium" as const,
            dueDate: Date.now() + 86400000,
            userId: "user1" as any,
            tags: [],
            project: null,
          },
          {
            _id: "2" as any,
            _creationTime: Date.now() - 86400000,
            title: "Example Todo 2",
            description: "Another placeholder todo item",
            completed: true,
            priority: "low" as const,
            userId: "user1" as any,
            tags: [],
            project: null,
          },
        ],
      }
    );

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = listResult;

  const allTodos = data || [];
  const todos = showDeleted
    ? allTodos.filter((todo: any) => todo.deletionTime)
    : allTodos.filter((todo: any) => !todo.deletionTime);
  const isEmpty = !isLoading && todos.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Todos</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast.promise(
                generateSamples.mutateAsync({ count: 100, projectId }),
                {
                  loading: "Generating sample todos...",
                  success: (result) => `Created ${result.created} sample todos!`,
                  error: (e) => e.data?.message ?? "Failed to generate samples",
                }
              );
            }}
            disabled={generateSamples.isPending}
          >
            <TestTube2 className="h-4 w-4" />
            Add Samples
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleted(!showDeleted)}
            className={showDeleted ? "bg-muted" : ""}
          >
            <Archive className="h-4 w-4" />
            {showDeleted ? "Hide" : "Show"} Deleted
          </Button>
          <TodoForm defaultProjectId={projectId} />
        </div>
      </div>

      {showFilters && (
        <div className="space-y-4">
          <TodoSearch onSearchChange={setSearchQuery} />
          
          <div className="flex flex-wrap gap-2">
            <Tabs
            value={
              completedFilter === undefined
                ? "all"
                : completedFilter
                  ? "completed"
                  : "active"
            }
            onValueChange={(value) => {
              setCompletedFilter(
                value === "all" ? undefined : value === "completed"
              );
            }}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select
            value={priorityFilter || "all"}
            onValueChange={(value) =>
              setPriorityFilter(value === "all" ? undefined : (value as any))
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {isEmpty ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchQuery
              ? `No todos found for "${searchQuery}"`
              : showDeleted
                ? "No deleted todos."
                : completedFilter === false
                  ? "No active todos. Great job!"
                  : completedFilter === true
                    ? "No completed todos yet."
                    : "No todos yet. Create your first one!"}
          </div>
        ) : (
          <>
            {todos.map((todo: any, index: number) => (
              <WithSkeleton
                key={todo._id || index}
                isLoading={isLoading}
                className="w-full"
              >
                <TodoItem todo={todo} />
              </WithSkeleton>
            ))}

            {hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
