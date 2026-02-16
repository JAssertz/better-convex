import {
  bookAuthors,
  books,
  cities,
  comments,
  node,
  posts,
  relations,
  users,
} from '../../convex/schema';
import { type Equal, Expect } from './utils';

export { bookAuthors, books, cities, comments, node, posts, relations, users };

type UsersTableName = typeof users._.name;
Expect<Equal<UsersTableName, 'users'>>;

type UsersRelationKeys = keyof typeof relations.users.relations;
type ExpectedUsersRelationKeys = 'city' | 'homeCity' | 'posts' | 'comments';
Expect<Equal<UsersRelationKeys, ExpectedUsersRelationKeys>>;
