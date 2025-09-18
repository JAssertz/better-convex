import { createAuth } from '../auth';
import { createApi } from './client';

export const {
  create,
  deleteMany,
  deleteOne,
  findMany,
  findOne,
  updateMany,
  updateOne,
} = createApi(createAuth);
