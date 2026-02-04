import type { GenericId } from 'convex/values';

// Shared test fixture types - used across multiple type test files
// These represent the expected types for test data structures

export type UserRow = {
  _id: GenericId<'users'>;
  _creationTime: number;
  name: string;
  email: string;
  height: number | null;
  age: number | null;
  status: string | null;
  role: string | null;
  deletedAt: number | null;
  cityId: GenericId<'cities'> | null;
  homeCityId: GenericId<'cities'> | null;
};

export type PostRow = {
  _id: GenericId<'posts'>;
  _creationTime: number;
  text: string;
  numLikes: number;
  type: string;
  embedding: number[] | null;
  title: string | null;
  content: string | null;
  createdAt: number | null;
  authorId: GenericId<'users'> | null;
  published: boolean | null;
};

export type CityRow = {
  _id: GenericId<'cities'>;
  _creationTime: number;
  name: string;
};

export type CommentRow = {
  _id: GenericId<'comments'>;
  _creationTime: number;
  text: string;
  postId: GenericId<'posts'>;
  authorId: GenericId<'users'> | null;
};
