import { Triggers } from 'convex-helpers/server/triggers';

import type { DataModel } from './_generated/dataModel';
import {
  aggregateUsers,
  aggregateTodosByUser,
  aggregateTodosByProject,
  aggregateTodosByStatus,
  aggregateTagUsage,
  aggregateProjectMembers,
  aggregateCommentsByTodo,
} from './aggregates';

// Initialize triggers with DataModel type
export const triggers = new Triggers<DataModel>();

// ===========================================
// AGGREGATE MAINTENANCE TRIGGERS
// ===========================================
// These triggers automatically maintain aggregates when tables change
// No manual aggregate updates needed in mutations!

// User count aggregate
triggers.register('user', aggregateUsers.trigger());

// Todo aggregates - multiple aggregates on same table
triggers.register('todos', aggregateTodosByUser.trigger());
triggers.register('todos', aggregateTodosByProject.trigger());
triggers.register('todos', aggregateTodosByStatus.trigger());

// Many:many relationship aggregates
triggers.register('todoTags', aggregateTagUsage.trigger());
triggers.register('projectMembers', aggregateProjectMembers.trigger());

// Comment count aggregate
triggers.register('todoComments', aggregateCommentsByTodo.trigger());
