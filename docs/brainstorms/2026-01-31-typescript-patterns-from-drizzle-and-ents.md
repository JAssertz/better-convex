---
date: 2026-01-31
topic: typescript-patterns-analysis
source: drizzle-orm, convex-ents
---

# TypeScript Patterns from Drizzle ORM and Convex Ents

**Analysis of advanced TypeScript patterns to reuse when building Drizzle-Convex ORM.**

## Drizzle ORM - Key Patterns

### 1. Symbol-Based Metadata Storage

**Purpose**: Store internal metadata without polluting the public API

```typescript
// drizzle-orm/src/table.ts
export const Schema = Symbol.for('drizzle:Schema');
export const Columns = Symbol.for('drizzle:Columns');
export const ExtraConfigColumns = Symbol.for('drizzle:ExtraConfigColumns');
export const OriginalName = Symbol.for('drizzle:OriginalName');
export const BaseName = Symbol.for('drizzle:BaseName');
export const IsAlias = Symbol.for('drizzle:IsAlias');
export const ExtraConfigBuilder = Symbol.for('drizzle:ExtraConfigBuilder');

export class Table<T extends TableConfig = TableConfig> {
  static readonly Symbol = {
    Name: TableName as typeof TableName,
    Schema: Schema as typeof Schema,
    Columns: Columns as typeof Columns,
    // ... other symbols
  };

  [TableName]: string;
  [Schema]: string | undefined;
  [Columns]!: T['columns'];
}
```

**Benefits:**
- No namespace pollution
- Type-safe runtime introspection
- Hidden from autocomplete
- Can't accidentally override

**Apply to Convex**: Use symbols to store edge metadata, table names, and validators

---

### 2. Type Branding with `declare readonly _`

**Purpose**: Store type-level metadata accessible via `table._`

```typescript
// drizzle-orm/src/table.ts
export class Table<T extends TableConfig = TableConfig> {
  declare readonly _: {
    readonly brand: 'Table';
    readonly config: T;
    readonly name: T['name'];
    readonly schema: T['schema'];
    readonly columns: T['columns'];
    readonly inferSelect: InferSelectModel<Table<T>>;
    readonly inferInsert: InferInsertModel<Table<T>>;
  };

  declare readonly $inferSelect: InferSelectModel<Table<T>>;
  declare readonly $inferInsert: InferInsertModel<Table<T>>;
}
```

**Benefits:**
- Type-level info without runtime overhead
- Enables generic type extraction
- Supports nominal typing
- Clean autocomplete separation

**Apply to Convex**: Store Convex-specific types (validators, edge configs) in `_` property

---

### 3. Type Inference from Column Definitions

**Purpose**: Extract TypeScript types from column validators

```typescript
// drizzle-orm/src/table.ts
export type InferModelFromColumns<
  TColumns extends Record<string, Column>,
  TInferMode extends 'select' | 'insert' = 'select',
> = Simplify<
  TInferMode extends 'insert' ?
    & {
      [Key in RequiredKeys]: GetColumnData<TColumns[Key], 'query'>;
    }
    & {
      [Key in OptionalKeys]?: GetColumnData<TColumns[Key], 'query'>;
    }
  : {
      [Key in keyof TColumns]: GetColumnData<TColumns[Key], 'query'>;
    }
>;

export type InferSelectModel<TTable extends Table> =
  InferModelFromColumns<TTable['_']['columns'], 'select'>;

export type InferInsertModel<TTable extends Table> =
  InferModelFromColumns<TTable['_']['columns'], 'insert'>;
```

**Benefits:**
- Separate insert vs select types
- Handles optional fields automatically
- Full type safety from schema

**Apply to Convex**: Map Convex validators to TS types, distinguish insert (without `_id`) vs select (with `_id`)

---

### 4. Builder Pattern for Table Creation

**Purpose**: Fluent API for defining tables with columns

```typescript
// drizzle-orm/src/pg-core/table.ts
export function pgTableWithSchema<
  TTableName extends string,
  TColumnsMap extends Record<string, PgColumnBuilderBase>,
>(
  name: TTableName,
  columns: TColumnsMap | ((columnTypes: PgColumnsBuilders) => TColumnsMap),
  extraConfig?: (self: BuildExtraConfigColumns) => PgTableExtraConfig,
  schema?: string,
): PgTableWithColumns<{
  name: TTableName;
  schema: TSchema;
  columns: BuildColumns<TTableName, TColumnsMap, 'pg'>;
  dialect: 'pg';
}> {
  const rawTable = new PgTable(name, schema, baseName);

  // Parse columns (can be function or object)
  const parsedColumns = typeof columns === 'function'
    ? columns(getPgColumnBuilders())
    : columns;

  // Build columns from builders
  const builtColumns = Object.fromEntries(
    Object.entries(parsedColumns).map(([name, colBuilder]) => {
      colBuilder.setName(name);
      const column = colBuilder.build(rawTable);
      return [name, column];
    }),
  );

  // Merge table + columns into one object
  const table = Object.assign(rawTable, builtColumns);
  table[Table.Symbol.Columns] = builtColumns;

  return table;
}
```

**Process:**
1. Create raw table instance
2. Parse column builders (function or object)
3. Build each column (call `.build()`)
4. Merge columns into table object
5. Store columns in Symbol.Columns

**Apply to Convex**: Create `convexTable()` function that wraps Convex validators similarly

---

### 5. Relations Layer with Helper Functions

**Purpose**: Define relationships between tables with type inference

```typescript
// drizzle-orm/src/relations.ts
export class Relations<
  TTableName extends string,
  TConfig extends Record<string, Relation>,
> {
  constructor(
    readonly table: AnyTable<{ name: TTableName }>,
    readonly config: (helpers: TableRelationsHelpers<TTableName>) => TConfig,
  ) {}
}

export function relations<
  TTableName extends string,
  TRelations extends Record<string, Relation<any>>,
>(
  table: AnyTable<{ name: TTableName }>,
  relations: (helpers: TableRelationsHelpers<TTableName>) => TRelations,
): Relations<TTableName, TRelations> {
  return new Relations(table, (helpers) =>
    Object.fromEntries(
      Object.entries(relations(helpers)).map(([key, value]) => [
        key,
        value.withFieldName(key),
      ]),
    ),
  );
}

// Create helpers for each table
export function createTableRelationsHelpers<TTableName extends string>(
  sourceTable: AnyTable<{ name: TTableName }>,
) {
  return {
    one: createOne<TTableName>(sourceTable),
    many: createMany(sourceTable),
  };
}

// Usage:
const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles),
  posts: many(posts),
}));
```

**Key Features:**
- Helpers (`one`, `many`) hide implementation complexity
- Relations stored with `.withFieldName()` to track field name
- Config function receives helpers scoped to source table
- Type inference extracts relation types automatically

**Apply to Convex**: Create `relations()` API that generates edge metadata for Convex tables

---

### 6. Query Config Type with Nested Relations

**Purpose**: Type-safe query builder with relation loading

```typescript
// drizzle-orm/src/relations.ts
export type DBQueryConfig<
  TRelationType extends 'one' | 'many' = 'one' | 'many',
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig,
> = {
  columns?: {
    [K in keyof TTableConfig['columns']]?: boolean;
  };
  with?: {
    [K in keyof TTableConfig['relations']]?:
      | true
      | DBQueryConfig<
          TTableConfig['relations'][K] extends One ? 'one' : 'many',
          TSchema,
          FindTableByDBName<TSchema, TTableConfig['relations'][K]['referencedTableName']>
        >;
  };
  where?: SQL | ((fields, operators) => SQL);
  orderBy?: ValueOrArray<AnyColumn | SQL>;
  limit?: number;
  offset?: number;
};
```

**Benefits:**
- Nested type inference for relations
- Conditional types for `one` vs `many` cardinality
- Recursive relation loading
- Full autocomplete support

**Apply to Convex**: Adapt for Convex's edge traversal (no column selection, edge-based loading)

---

### 7. Result Type Inference from Query Config

**Purpose**: Infer result shape from query configuration

```typescript
// drizzle-orm/src/relations.ts
export type BuildQueryResult<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TFullSelection extends true | Record<string, unknown>,
> = Equal<TFullSelection, true> extends true
  ? InferModelFromColumns<TTableConfig['columns']>
  : TFullSelection extends Record<string, unknown>
    ? Simplify<
        & (TFullSelection['columns'] extends Record<string, unknown>
            ? InferModelFromColumns<FilteredColumns>
            : InferModelFromColumns<TTableConfig['columns']>)
        & (TFullSelection['with'] extends Record<string, unknown>
            ? BuildRelationResult<TSchema, TFullSelection['with'], TTableConfig['relations']>
            : {})
      >
    : never;

export type BuildRelationResult<
  TSchema,
  TInclude,
  TRelations extends Record<string, Relation>,
> = {
  [K in keyof TInclude & keyof TRelations]:
    TRelations[K] extends One
      ? BuildQueryResult<...> | null
      : BuildQueryResult<...>[]
};
```

**Benefits:**
- Result type matches query structure exactly
- Handles nullable one-to-one relations
- Flattens nested query config into clean type
- No manual type annotations needed

**Apply to Convex**: Similar pattern for `with` relations, but no column filtering

---

## Convex Ents - Key Patterns

### 1. Edge-Based Schema Definition

**Purpose**: Define edges (relationships) directly in schema with automatic index creation

```typescript
// convex-ents/src/schema.ts
export function defineEnt<
  DocumentSchema extends Validator<Record<string, any>, "required", any>,
>(documentSchema: DocumentSchema): EntDefinition<DocumentSchema>;

// Builder pattern for edges
export interface EntDefinition<DocumentType> {
  edge<EdgeName extends string>(
    edge: EdgeName,
    options?: { deletion: "hard" | "soft" },
  ): EntDefinition<
    AddField<DocumentType, `${EdgeName}Id`, VId<GenericId<`${EdgeName}s`>>>,
    Indexes & { [key in `${EdgeName}Id`]: [`${EdgeName}Id`, "_creationTime"] },
    Edges & {
      [key in EdgeName]: {
        name: EdgeName;
        to: `${EdgeName}s`;
        type: "field";
        cardinality: "single";
        optional: false;
      };
    }
  >;
}

// Usage:
const users = defineEnt({
  name: v.string(),
  email: v.string(),
}).edge("profile").edge("organization");
```

**Key Features:**
- Automatically adds `profileId` field to validator
- Auto-creates index on `profileId`
- Stores edge metadata in type system
- Pluralizes table name automatically (`profile` → `profiles`)

**Apply to Drizzle-Convex**: Adapt edge builder pattern, store edge metadata similarly

---

### 2. Type-Level Edge Metadata

**Purpose**: Store edge configuration at type level for inference

```typescript
// convex-ents/src/schema.ts
export type GenericEdgeConfig = {
  name: string;
  to: string;
  cardinality: "single" | "multiple";
  type: "field" | "ref";
  optional?: boolean;
};

type EdgeConfigSingleField = {
  name: string;
  to: string;
  cardinality: "single";
  type: "field";
  field: string;  // The field name (e.g., "userId")
  unique?: boolean;
  deletion?: "hard" | "soft";
};

type EdgeConfigMultipleRef = {
  name: string;
  to: string;
  cardinality: "multiple";
  type: "ref";
  table: string;  // Junction table name
  field: string;  // Forward field in junction table
  ref: string;    // Reverse field in junction table
  symmetric?: boolean;
};
```

**Key Insight:**
- **1:1 and 1:many**: Stored as field (`userId`)
- **many:many**: Auto-creates junction table with refs
- Edge config tracks field names, junction tables, deletion behavior

**Apply to Drizzle-Convex**: Same edge config structure, generate Convex-compatible edge fields

---

### 3. Inverse Edge Detection

**Purpose**: Automatically detect and link inverse edges during schema definition

```typescript
// convex-ents/src/schema.ts
export function defineEntSchema<Schema extends Record<string, EntDefinition>>(
  schema: Schema,
): SchemaDefinition<Schema> {
  // For each edge, find its inverse
  for (const tableName of Object.keys(schema)) {
    for (const edge of edgeConfigsBeforeDefineSchema(schema[tableName])) {
      const otherTable = schema[edge.to];

      // Find inverse edges in the other table
      const inverseEdgeCandidates = edgeConfigsBeforeDefineSchema(otherTable)
        .filter(canBeInverseEdge(tableName, edge));

      if (inverseEdgeCandidates.length > 1) {
        throw new Error(`Too many inverse edges found`);
      }

      const inverseEdge = inverseEdgeCandidates[0];

      // Link edges together
      if (edge.cardinality === "multiple" && inverseEdge) {
        // Create junction table
        const edgeTableName = `${tableName}_${inverseEdge.name}_to_${edge.name}`;
        schema[edgeTableName] = defineEnt({
          [forwardId]: v.id(tableName),
          [inverseId]: v.id(otherTableName),
        })
          .index(forwardId, [forwardId])
          .index(inverseId, [inverseId])
          .index(edgeCompoundIndexName, [forwardId, inverseId]);
      }
    }
  }

  return defineSchema(schema);
}
```

**Key Process:**
1. Iterate all tables and edges
2. For each edge, find inverse in target table
3. Validate exactly one inverse found (or explicit naming)
4. For many:many, auto-create junction table
5. Auto-create indexes for edge traversal

**Apply to Drizzle-Convex**: Implement similar inverse detection algorithm

---

### 4. Field Addition via Type Manipulation

**Purpose**: Add fields to validator type dynamically

```typescript
// convex-ents/src/schema.ts
type AddField<
  V extends GenericValidator,
  FieldName extends string,
  P extends GenericValidator,
> = V extends VObject<infer TypeScriptType, infer Fields>
  ? VObject<
      Expand<TypeScriptType & ObjectFieldType<FieldName, P>>,
      Expand<Fields & { FieldName: P }>,
      IsOptional,
      FieldPaths | FieldName
    >
  : never;

type ObjectFieldType<
  FieldName extends string,
  T extends Validator<any, any, any>,
> = T["isOptional"] extends "optional"
  ? { [key in FieldName]?: T["type"] }
  : { [key in FieldName]: T["type"] };
```

**Benefits:**
- Dynamically extends validator types
- Handles optional vs required correctly
- Maintains field paths for indexing
- Full type safety preserved

**Apply to Drizzle-Convex**: Use to add edge fields (`userId`, `postId`) to table validators

---

### 5. Promise-Based Query Builder

**Purpose**: Fluent query API with method chaining and promise interface

```typescript
// convex-ents/src/functions.ts
export interface PromiseOrderedQueryOrNull<
  EntsDataModel extends GenericEntsDataModel,
  Table extends TableNamesInDataModel<EntsDataModel>,
> extends Promise<Ent<Table>[] | null> {
  filter(
    predicate: (q: FilterBuilder) => ExpressionOrValue<boolean>,
  ): this;

  map<TOutput>(
    callbackFn: (value: Ent<Table>) => TOutput | Promise<TOutput>,
  ): PromiseArrayOrNull<TOutput>;

  paginate(opts: PaginationOptions): PromisePaginationResultOrNull;

  take(n: number): PromiseEntsOrNull;

  first(): PromiseEntOrNull;

  unique(): PromiseEntOrNull;

  docs(): Promise<DocumentByName[]>;
}

// Usage:
const posts = await ctx.table("posts")
  .filter(q => q.eq(q.field("published"), true))
  .order("desc")
  .take(10);
```

**Benefits:**
- Extends Promise interface
- Enables method chaining
- Type-safe at each step
- Lazy evaluation

**Apply to Drizzle-Convex**: Similar promise-based API for query building

---

### 6. Edge Traversal Helpers

**Purpose**: Navigate relationships with type-safe helper methods

```typescript
// convex-ents/src/functions.ts
export type Ent<
  Table extends TableNamesInDataModel<EntsDataModel>,
  Doc extends DocumentByName<EntsDataModel, Table>,
  EntsDataModel extends GenericEntsDataModel,
> = Doc & {
  // Edge traversal
  edge<EdgeName extends EdgesInTable<EntsDataModel, Table>>(
    edgeName: EdgeName,
  ): PromiseEdgeResult<EntsDataModel, Table, EdgeName>;

  edgeX<EdgeName extends EdgesInTable<EntsDataModel, Table>>(
    edgeName: EdgeName,
  ): PromiseEdgeResultNotNull<EntsDataModel, Table, EdgeName>;
};

// Usage:
const user = await ctx.table("users").get(userId);
const posts = await user.edge("posts");  // many
const profile = await user.edge("profile");  // one, nullable
const org = await user.edgeX("organization");  // one, throws if null
```

**Key Features:**
- `edge()`: Returns `Ent | null` or `Ent[]`
- `edgeX()`: Throws if null, non-nullable return
- Type inference from edge cardinality
- Lazy loading (Promise-based)

**Apply to Drizzle-Convex**: Similar edge traversal API via `ent.edge()`

---

## Synthesis: Patterns to Apply

### From Drizzle

1. **Symbol-based metadata**: Store Convex-specific metadata (validators, edge configs) in symbols
2. **Type branding with `_`**: Expose type-level metadata for generic inference
3. **Builder pattern**: `convexTable(name, validators)` API similar to `pgTable`
4. **Relations API**: `relations(table, ({ one, many }) => ({...}))` for defining edges
5. **Query config types**: Nested type for `with` relation loading
6. **Result inference**: Infer result type from query config automatically

### From Convex-Ents

1. **Edge builder**: `.edge(name, options)` fluent API for defining relationships
2. **Inverse detection**: Automatically find and link inverse edges during schema definition
3. **Auto junction tables**: Generate junction tables for many:many edges
4. **Type-level edge metadata**: Store edge config in type system for traversal inference
5. **Promise-based queries**: Extend Promise interface for query builders
6. **Edge traversal helpers**: `.edge()` and `.edgeX()` methods on ent instances

---

## Implementation Strategy

### Phase 1: Schema Foundation (Milestone 1)

**Goal**: TypeScript-first table definitions with type inference

**Patterns to Apply:**
- Drizzle's builder pattern for table creation
- Drizzle's symbol-based metadata storage
- Drizzle's type branding with `_` property
- Convex-ents' validator integration
- Drizzle's `InferSelectModel` and `InferInsertModel` types

**Implementation:**
```typescript
import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// Create table with Drizzle-style API
export const users = convexTable('users', {
  name: v.string(),
  email: v.string(),
});

// Type inference (Drizzle pattern)
type User = InferSelectModel<typeof users>;
// { _id: Id<'users'>, name: string, email: string, _creationTime: number }

type NewUser = InferInsertModel<typeof users>;
// { name: string, email: string }
```

### Phase 2: Relations Layer (Milestone 2)

**Goal**: Define relationships between tables

**Patterns to Apply:**
- Drizzle's `relations()` API
- Convex-ents' edge detection algorithm
- Convex-ents' auto junction table creation
- Convex-ents' edge metadata storage

**Implementation:**
```typescript
import { relations } from './drizzle-convex';

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.profileId],
    references: [profiles._id]
  }),
  posts: many(posts),
}));
```

### Phase 3: Query Builder (Milestone 3)

**Goal**: Drizzle-style query API for reads

**Patterns to Apply:**
- Drizzle's query config types
- Drizzle's result type inference
- Convex-ents' promise-based query builder
- Convex-ents' edge traversal helpers

**Implementation:**
```typescript
// Query with relations
const result = await ctx.db.query.users.findMany({
  with: {
    posts: { limit: 5 },
    profile: true
  },
  limit: 10
});

// Type inferred:
// { name: string, posts: Post[], profile: Profile | null }[]
```

---

## Key Takeaways

1. **Symbol-based metadata is crucial** - Keeps type system clean while enabling runtime introspection
2. **Builder patterns enable fluent APIs** - Essential for ergonomic schema definition
3. **Type inference eliminates manual types** - Users never write result types
4. **Promise-based queries are elegant** - Method chaining + type safety + lazy evaluation
5. **Edge detection is complex** - Need robust algorithm for finding inverse edges
6. **Convex constraints differ from SQL** - No column selection, always full documents

**This analysis provides the foundation for implementing Drizzle-Convex with high-quality TypeScript patterns learned from both libraries.**
