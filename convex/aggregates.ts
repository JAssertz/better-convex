import { TableAggregate } from '@convex-dev/aggregate';

import type { DataModel } from './_generated/dataModel';
import type { Id } from './_generated/dataModel';

import { components } from './_generated/api';

// Aggregate for users
export const aggregateUsers = new TableAggregate<{
  DataModel: DataModel;
  Key: null; // No sorting, just counting
  Namespace: string; // userId
  TableName: 'user';
}>(components.aggregateUsers, {
  namespace: (doc) => doc._id,
  sortKey: () => null, // We only care about counting, not sorting
});

// Todo counts by user with priority breakdown
export const aggregateTodosByUser = new TableAggregate<{
  DataModel: DataModel;
  Key: [string, boolean, boolean]; // [priority, completed, isDeleted]
  Namespace: Id<'user'>;
  TableName: 'todos';
}>(components.aggregateTodosByUser, {
  namespace: (doc) => doc.userId,
  sortKey: (doc) => {
    // Include deletion status in the key to handle soft deletion properly
    const isDeleted = doc.deletionTime !== undefined;
    return [doc.priority ?? 'none', doc.completed, isDeleted];
  },
});

// Todo counts by project
export const aggregateTodosByProject = new TableAggregate<{
  DataModel: DataModel;
  Key: [boolean, number, boolean]; // [completed, creationTime, isDeleted]
  Namespace: Id<'projects'> | 'no-project';
  TableName: 'todos';
}>(components.aggregateTodosByProject, {
  namespace: (doc) => doc.projectId ?? 'no-project',
  sortKey: (doc) => {
    // Include deletion status in the key to handle soft deletion properly
    const isDeleted = doc.deletionTime !== undefined;
    return [doc.completed, doc._creationTime, isDeleted];
  },
});

// Todo counts by completion status (global)
export const aggregateTodosByStatus = new TableAggregate<{
  DataModel: DataModel;
  Key: [boolean, string, number, boolean]; // [completed, priority, dueDate, isDeleted]
  TableName: 'todos';
}>(components.aggregateTodosByStatus, {
  sortKey: (doc) => {
    // Include deletion status in the key to handle soft deletion properly
    const isDeleted = doc.deletionTime !== undefined;
    return [
      doc.completed,
      doc.priority ?? 'none',
      doc.dueDate ?? Infinity,
      isDeleted,
    ];
  },
});

// Tag usage counts (for many:many relationship demo)
export const aggregateTagUsage = new TableAggregate<{
  DataModel: DataModel;
  Key: number; // usage count (updated via trigger)
  Namespace: Id<'tags'>;
  TableName: 'todoTags';
}>(components.aggregateTagUsage, {
  namespace: (doc) => doc.tagId,
  sortKey: () => 1, // Each join counts as 1
  sumValue: () => 1, // Sum to get total usage
});

// Project member counts
export const aggregateProjectMembers = new TableAggregate<{
  DataModel: DataModel;
  Key: number; // join time
  Namespace: Id<'projects'>;
  TableName: 'projectMembers';
}>(components.aggregateProjectMembers, {
  namespace: (doc) => doc.projectId,
  sortKey: (doc) => doc._creationTime,
});

// Comments count by todo
export const aggregateCommentsByTodo = new TableAggregate<{
  DataModel: DataModel;
  Key: number; // creation time
  Namespace: Id<'todos'>;
  TableName: 'todoComments';
}>(components.aggregateCommentsByTodo, {
  namespace: (doc) => doc.todoId,
  sortKey: (doc) => doc._creationTime,
});
