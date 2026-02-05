/**
 * Symbol-based metadata storage for ORM tables
 * Following Drizzle's pattern for type-safe runtime introspection
 */

export const TableName = Symbol.for('better-convex:TableName');
export const Columns = Symbol.for('better-convex:Columns');
export const Brand = Symbol.for('better-convex:Brand');
export const Relations = Symbol.for('better-convex:Relations');
export const OrmContext = Symbol.for('better-convex:OrmContext');
export const RlsPolicies = Symbol.for('better-convex:RlsPolicies');
export const EnableRLS = Symbol.for('better-convex:EnableRLS');
