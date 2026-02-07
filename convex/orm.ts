import { createOrm, type OrmFunctions } from 'better-convex/orm';
import { internal } from './_generated/api';
import { internalMutation } from './functions';
import { relations } from './schema';

const ormFunctions: OrmFunctions = internal.orm;

const orm = createOrm({
  schema: relations,
  ormFunctions,
  internalMutation,
});

export const { scheduledMutationBatch, scheduledDelete } = orm.api();
