import {
  Columns,
  OrmContext,
  type OrmTypeOptions,
  type ResolvedOrmTypeOptions,
} from './symbols';

export const PUBLIC_CREATED_AT_FIELD = 'createdAt';
export const INTERNAL_CREATION_TIME_FIELD = '_creationTime';

export const CREATED_AT_MIGRATION_MESSAGE =
  '`_creationTime` is no longer public. Use `createdAt` instead.';

const DEFAULT_TYPES: ResolvedOrmTypeOptions = {
  date: false,
};

export const resolveTypeOptions = (
  options?: OrmTypeOptions
): ResolvedOrmTypeOptions => ({
  date: options?.date === true,
});

export const getTypeOptions = (source: unknown): ResolvedOrmTypeOptions => {
  if (!source || typeof source !== 'object') {
    return DEFAULT_TYPES;
  }

  const direct = (source as { types?: unknown }).types;
  if (direct && typeof direct === 'object') {
    return resolveTypeOptions(direct as OrmTypeOptions);
  }

  const ormContext = (source as Record<PropertyKey, unknown>)[OrmContext] as
    | { types?: unknown }
    | undefined;
  if (ormContext?.types && typeof ormContext.types === 'object') {
    return resolveTypeOptions(ormContext.types as OrmTypeOptions);
  }

  return DEFAULT_TYPES;
};

export const getDateTypeMode = (source: unknown): 'date' | 'number' =>
  getTypeOptions(source).date ? 'date' : 'number';

export const shouldHydrateCreatedAtAsDate = (source: unknown): boolean =>
  getTypeOptions(source).date;

export const hasUserCreatedAtColumn = (table: unknown): boolean => {
  if (!table || typeof table !== 'object') {
    return false;
  }
  const columns = (table as Record<PropertyKey, unknown>)[Columns];
  if (!columns || typeof columns !== 'object') {
    return false;
  }
  return Object.hasOwn(columns, PUBLIC_CREATED_AT_FIELD);
};

export const usesSystemCreatedAtAlias = (table: unknown): boolean =>
  !hasUserCreatedAtColumn(table);
