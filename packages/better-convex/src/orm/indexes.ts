import { type ColumnBuilderBase, entityKind } from './builders/column-builder';

export type ConvexIndexColumn = ColumnBuilderBase;

export interface ConvexIndexConfig {
  name: string;
  columns: ConvexIndexColumn[];
  unique: boolean;
  where?: unknown;
}

export interface ConvexSearchIndexConfig {
  name: string;
  searchField: ConvexIndexColumn;
  filterFields: ConvexIndexColumn[];
  staged: boolean;
}

export interface ConvexVectorIndexConfig {
  name: string;
  vectorField: ConvexIndexColumn;
  dimensions: number;
  filterFields: ConvexIndexColumn[];
  staged: boolean;
}

export class ConvexIndexBuilderOn {
  static readonly [entityKind] = 'ConvexIndexBuilderOn';
  readonly [entityKind] = 'ConvexIndexBuilderOn';

  constructor(
    private name: string,
    private unique: boolean
  ) {}

  on(
    ...columns: [ConvexIndexColumn, ...ConvexIndexColumn[]]
  ): ConvexIndexBuilder {
    return new ConvexIndexBuilder(this.name, columns, this.unique);
  }
}

export class ConvexIndexBuilder {
  static readonly [entityKind] = 'ConvexIndexBuilder';
  readonly [entityKind] = 'ConvexIndexBuilder';

  declare _: {
    brand: 'ConvexIndexBuilder';
  };

  config: ConvexIndexConfig;

  constructor(name: string, columns: ConvexIndexColumn[], unique: boolean) {
    this.config = {
      name,
      columns,
      unique,
      where: undefined,
    };
  }

  /**
   * Partial index conditions are not supported in Convex.
   * This method is kept for Drizzle API parity.
   */
  where(condition: unknown): this {
    this.config.where = condition;
    return this;
  }
}

export class ConvexSearchIndexBuilderOn {
  static readonly [entityKind] = 'ConvexSearchIndexBuilderOn';
  readonly [entityKind] = 'ConvexSearchIndexBuilderOn';

  constructor(private name: string) {}

  on(searchField: ConvexIndexColumn): ConvexSearchIndexBuilder {
    return new ConvexSearchIndexBuilder(this.name, searchField);
  }
}

export class ConvexSearchIndexBuilder {
  static readonly [entityKind] = 'ConvexSearchIndexBuilder';
  readonly [entityKind] = 'ConvexSearchIndexBuilder';

  declare _: {
    brand: 'ConvexSearchIndexBuilder';
  };

  config: ConvexSearchIndexConfig;

  constructor(name: string, searchField: ConvexIndexColumn) {
    this.config = {
      name,
      searchField,
      filterFields: [],
      staged: false,
    };
  }

  filter(...fields: ConvexIndexColumn[]): this {
    this.config.filterFields = fields;
    return this;
  }

  staged(): this {
    this.config.staged = true;
    return this;
  }
}

type ConvexVectorIndexConfigInternal = Omit<
  ConvexVectorIndexConfig,
  'dimensions'
> & { dimensions?: number };

export class ConvexVectorIndexBuilderOn {
  static readonly [entityKind] = 'ConvexVectorIndexBuilderOn';
  readonly [entityKind] = 'ConvexVectorIndexBuilderOn';

  constructor(private name: string) {}

  on(vectorField: ConvexIndexColumn): ConvexVectorIndexBuilder {
    return new ConvexVectorIndexBuilder(this.name, vectorField);
  }
}

export class ConvexVectorIndexBuilder {
  static readonly [entityKind] = 'ConvexVectorIndexBuilder';
  readonly [entityKind] = 'ConvexVectorIndexBuilder';

  declare _: {
    brand: 'ConvexVectorIndexBuilder';
  };

  config: ConvexVectorIndexConfigInternal;

  constructor(name: string, vectorField: ConvexIndexColumn) {
    this.config = {
      name,
      vectorField,
      dimensions: undefined,
      filterFields: [],
      staged: false,
    };
  }

  dimensions(dimensions: number): this {
    if (!Number.isInteger(dimensions)) {
      throw new Error(
        `Vector index '${this.config.name}' dimensions must be an integer, got ${dimensions}`
      );
    }
    if (dimensions <= 0) {
      throw new Error(
        `Vector index '${this.config.name}' dimensions must be positive, got ${dimensions}`
      );
    }
    if (dimensions > 10_000) {
      console.warn(
        `Vector index '${this.config.name}' has unusually large dimensions (${dimensions}). Common values: 768, 1536, 3072`
      );
    }
    this.config.dimensions = dimensions;
    return this;
  }

  filter(...fields: ConvexIndexColumn[]): this {
    this.config.filterFields = fields;
    return this;
  }

  staged(): this {
    this.config.staged = true;
    return this;
  }
}

export function index(name: string): ConvexIndexBuilderOn {
  return new ConvexIndexBuilderOn(name, false);
}

export function uniqueIndex(name: string): ConvexIndexBuilderOn {
  return new ConvexIndexBuilderOn(name, true);
}

export function searchIndex(name: string): ConvexSearchIndexBuilderOn {
  return new ConvexSearchIndexBuilderOn(name);
}

export function vectorIndex(name: string): ConvexVectorIndexBuilderOn {
  return new ConvexVectorIndexBuilderOn(name);
}
