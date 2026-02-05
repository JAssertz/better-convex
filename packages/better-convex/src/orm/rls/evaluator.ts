import type { FilterExpression } from '../filter-expression';
import { evaluateFilter } from '../mutation-utils';
import { EnableRLS, RlsPolicies } from '../symbols';
import type { ConvexTable } from '../table';
import type { RlsPolicy, RlsPolicyToOption } from './policies';
import { isRlsRole } from './roles';
import type { RlsContext } from './types';

export type RlsOperation = 'select' | 'insert' | 'update' | 'delete';

type PolicyCheckType = 'using' | 'withCheck';

type EvaluatePolicyInput = {
  table: ConvexTable<any>;
  operation: RlsOperation;
  checkType: PolicyCheckType;
  row: Record<string, unknown>;
  rls?: RlsContext;
};

export function isRlsEnabled(table: ConvexTable<any>): boolean {
  return Boolean((table as any)[EnableRLS] || getRlsPolicies(table).length > 0);
}

export function getRlsPolicies(table: ConvexTable<any>): RlsPolicy[] {
  return ((table as any)[RlsPolicies] ?? []) as RlsPolicy[];
}

function policyApplies(policy: RlsPolicy, operation: RlsOperation): boolean {
  const target = policy.for ?? 'all';
  return target === 'all' || target === operation;
}

function flattenRoles(
  target: RlsPolicyToOption | undefined
): 'public' | string[] {
  if (!target) return 'public';

  const roles: string[] = [];
  let hasPublic = false;

  const visit = (value: RlsPolicyToOption) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === 'public') {
      hasPublic = true;
      return;
    }
    if (isRlsRole(value)) {
      roles.push(value.name);
      return;
    }
    roles.push(value as string);
  };

  visit(target);

  return hasPublic ? 'public' : roles;
}

function roleMatches(policy: RlsPolicy, rls?: RlsContext): boolean {
  const resolver = rls?.roleResolver;
  if (!resolver) return true;

  const roles = resolver(rls?.ctx ?? {}) ?? [];
  const targetRoles = flattenRoles(policy.to);

  if (targetRoles === 'public') return true;
  return targetRoles.some((role) => roles.includes(role));
}

function resolveExpression(
  policy: RlsPolicy,
  checkType: PolicyCheckType,
  ctx: unknown,
  table: ConvexTable<any>
): FilterExpression<boolean> | undefined {
  const candidate =
    checkType === 'withCheck'
      ? (policy.withCheck ?? policy.using)
      : policy.using;

  if (!candidate) return;
  if (typeof candidate === 'function') {
    return candidate(ctx as any, table as any);
  }
  return candidate as FilterExpression<boolean>;
}

function evaluatePolicySet({
  table,
  operation,
  checkType,
  row,
  rls,
}: EvaluatePolicyInput): boolean {
  if (!isRlsEnabled(table)) return true;
  if (rls?.mode === 'skip') return true;

  const ctx = rls?.ctx ?? {};
  const policies = getRlsPolicies(table).filter(
    (policy) => policyApplies(policy, operation) && roleMatches(policy, rls)
  );

  if (policies.length === 0) {
    return false;
  }

  const permissive = policies.filter(
    (policy) => (policy.as ?? 'permissive') !== 'restrictive'
  );

  if (permissive.length === 0) {
    return false;
  }

  const permissivePasses = permissive.some((policy) => {
    const expression = resolveExpression(policy, checkType, ctx, table);
    if (!expression) return true;
    return evaluateFilter(row, expression);
  });

  if (!permissivePasses) return false;

  const restrictive = policies.filter(
    (policy) => (policy.as ?? 'permissive') === 'restrictive'
  );

  return restrictive.every((policy) => {
    const expression = resolveExpression(policy, checkType, ctx, table);
    if (!expression) return true;
    return evaluateFilter(row, expression);
  });
}

export function canSelectRow(options: {
  table: ConvexTable<any>;
  row: Record<string, unknown>;
  rls?: RlsContext;
}): boolean {
  return evaluatePolicySet({
    table: options.table,
    operation: 'select',
    checkType: 'using',
    row: options.row,
    rls: options.rls,
  });
}

export function canInsertRow(options: {
  table: ConvexTable<any>;
  row: Record<string, unknown>;
  rls?: RlsContext;
}): boolean {
  return evaluatePolicySet({
    table: options.table,
    operation: 'insert',
    checkType: 'withCheck',
    row: options.row,
    rls: options.rls,
  });
}

export function canDeleteRow(options: {
  table: ConvexTable<any>;
  row: Record<string, unknown>;
  rls?: RlsContext;
}): boolean {
  return evaluatePolicySet({
    table: options.table,
    operation: 'delete',
    checkType: 'using',
    row: options.row,
    rls: options.rls,
  });
}

export function canUpdateRow(options: {
  table: ConvexTable<any>;
  existingRow: Record<string, unknown>;
  updatedRow: Record<string, unknown>;
  rls?: RlsContext;
}): boolean {
  const decision = evaluateUpdateDecision(options);
  return decision.allowed;
}

export function evaluateUpdateDecision(options: {
  table: ConvexTable<any>;
  existingRow: Record<string, unknown>;
  updatedRow: Record<string, unknown>;
  rls?: RlsContext;
}): {
  allowed: boolean;
  usingAllowed: boolean;
  withCheckAllowed: boolean;
} {
  const usingAllowed = evaluatePolicySet({
    table: options.table,
    operation: 'update',
    checkType: 'using',
    row: options.existingRow,
    rls: options.rls,
  });

  const withCheckAllowed = evaluatePolicySet({
    table: options.table,
    operation: 'update',
    checkType: 'withCheck',
    row: options.updatedRow,
    rls: options.rls,
  });

  return {
    allowed: usingAllowed && withCheckAllowed,
    usingAllowed,
    withCheckAllowed,
  };
}

export function filterSelectRows(options: {
  table: ConvexTable<any>;
  rows: Record<string, unknown>[];
  rls?: RlsContext;
}): Record<string, unknown>[] {
  if (!isRlsEnabled(options.table)) return options.rows;
  if (options.rls?.mode === 'skip') return options.rows;

  return options.rows.filter((row) =>
    canSelectRow({ table: options.table, row, rls: options.rls })
  );
}
