import type { Triggers } from 'better-convex/auth';
import {
  convexTable,
  defineSchema,
  id,
  integer,
  text,
} from 'better-convex/orm';
import type { GenericId } from 'convex/values';
import { type Equal, Expect, IsAny } from './utils';

// ============================================================================
// Auth createClient() trigger typing
// ============================================================================
//
// Regression test:
// Passing a better-convex ORM schema to auth createClient() used to cause
// trigger callback docs (eg `session`) to become effectively `any`.
//
// This test is intentionally minimal: it asserts *field-level* typing is not
// `any` and that unknown fields are rejected.

const session = convexTable('session', {
  token: text().notNull(),
  userId: id('user').notNull(),
  expiresAt: integer().notNull(),
  createdAtMs: integer().notNull(),
  updatedAt: integer().notNull(),
  activeOrganizationId: text(),
});

const schema = defineSchema({ session });

type DataModel = {
  session: {
    document: {
      token: string;
      userId: GenericId<'user'>;
      expiresAt: number;
      createdAtMs: number;
      updatedAt: number;
      activeOrganizationId?: string | null;
      id: GenericId<'session'>;
      _creationTime: number;
    };
    // Not relevant to this test, but required by GenericDataModel.
    fieldPaths: any;
    indexes: {};
    searchIndexes: {};
    vectorIndexes: {};
  };
};

type SessionTriggers = NonNullable<
  Triggers<DataModel, typeof schema>['session']
>;

{
  const triggers: Triggers<DataModel, typeof schema> = {
    // @ts-expect-error - unknown table names should be rejected (typo guard)
    sessoin: {},
  };

  void triggers;
}

{
  type OnCreate = NonNullable<SessionTriggers['onCreate']>;
  type Doc = Parameters<OnCreate>[1];

  Expect<Equal<false, IsAny<Doc['activeOrganizationId']>>>;

  const doc = {} as Doc;
  // @ts-expect-error - unknown fields should not be allowed (no index signature)
  doc.notARealField;
}

{
  type BeforeCreate = NonNullable<SessionTriggers['beforeCreate']>;
  type Data = Parameters<BeforeCreate>[1];

  Expect<Equal<false, IsAny<Data['activeOrganizationId']>>>;
}
