// Shared test fixture types - used across multiple type test files
// These represent the expected types for test data structures

export type UserRow = {
  id: string;
  createdAt: number;
  name: string;
  email: string;
  height: number | null;
  age: number | null;
  status: string | null;
  role: string | null;
  deletedAt: number | null;
  cityId: string | null;
  homeCityId: string | null;
};

export type PostRow = {
  id: string;
  createdAt: number;
  text: string;
  numLikes: number;
  type: string;
  embedding: number[] | null;
  title: string | null;
  content: string | null;
  publishedAt: number | null;
  authorId: string | null;
  published: boolean | null;
};

export type CityRow = {
  id: string;
  createdAt: number;
  name: string;
};

export type CommentRow = {
  id: string;
  createdAt: number;
  text: string;
  postId: string;
  authorId: string | null;
};
