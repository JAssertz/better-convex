# ✨ feat: Auto-coerce searchParams to numbers/booleans

## Overview

Automatically convert string URL searchParams to numbers and booleans when the Zod schema expects those types, eliminating the need for `z.coerce.*` boilerplate.

**Before:**
```typescript
.searchParams(z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  active: z.coerce.boolean().optional(),
}))
```

**After:**
```typescript
.searchParams(z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  active: z.boolean().optional(),
}))
```

## Problem Statement

URL query parameters are always strings. Currently, users must use `z.coerce.number()` and `z.coerce.boolean()` for every numeric/boolean searchParam. This is:

1. **Verbose** - Extra boilerplate for every field
2. **Error-prone** - Easy to forget `z.coerce` and get validation errors
3. **Inconsistent** - We already auto-coerce arrays (via recent `isArraySchema` implementation)

## Proposed Solution

Extend the existing `parseQueryParams()` function in `http-builder.ts` to:
1. Detect when a schema field expects `z.number()` or `z.boolean()`
2. Pre-coerce the string value before Zod validation

This follows the same pattern as the existing array auto-coercion.

## Technical Approach

### File: `packages/better-convex/src/server/http-builder.ts`

#### 1. Add type detection helpers (after `isArraySchema`)

```typescript
// Helper to get base schema type (unwrap Optional/Nullable/Default)
function getBaseSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if ('unwrap' in schema && typeof schema.unwrap === 'function') {
    return getBaseSchema((schema as z.ZodOptional<z.ZodTypeAny>).unwrap());
  }
  // ZodDefault doesn't have unwrap(), use _def.innerType
  if (schema instanceof z.ZodDefault) {
    return getBaseSchema(schema._def.innerType);
  }
  return schema;
}

// Helper to check if schema expects number
function isNumberSchema(schema: z.ZodTypeAny): boolean {
  return getBaseSchema(schema) instanceof z.ZodNumber;
}

// Helper to check if schema expects boolean
function isBooleanSchema(schema: z.ZodTypeAny): boolean {
  return getBaseSchema(schema) instanceof z.ZodBoolean;
}
```

#### 2. Update `parseQueryParams()` to coerce values

```typescript
function parseQueryParams(
  url: URL,
  schema?: z.ZodTypeAny
): Record<string, string | string[] | number | boolean> {
  const params: Record<string, string | string[] | number | boolean> = {};
  const keys = new Set(url.searchParams.keys());

  const shape =
    schema instanceof z.ZodObject
      ? (schema.shape as Record<string, z.ZodTypeAny>)
      : {};

  for (const key of keys) {
    const values = url.searchParams.getAll(key);
    const fieldSchema = shape[key];

    if (fieldSchema) {
      if (isArraySchema(fieldSchema)) {
        params[key] = values;
      } else if (isNumberSchema(fieldSchema)) {
        // Coerce to number
        params[key] = Number(values[0]);
      } else if (isBooleanSchema(fieldSchema)) {
        // Coerce to boolean (handle "true"/"false"/"1"/"0")
        const val = values[0].toLowerCase();
        params[key] = val === 'true' || val === '1';
      } else {
        params[key] = values.length === 1 ? values[0] : values;
      }
    } else {
      params[key] = values.length === 1 ? values[0] : values;
    }
  }
  return params;
}
```

### File: `example/convex/routers/examples.ts`

Remove `z.coerce` usage:

```typescript
// Before
.searchParams(z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  notify: z.coerce.boolean().optional(),
}))

// After
.searchParams(z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
  notify: z.boolean().optional(),
}))
```

## Acceptance Criteria

- [x] `z.number()` in searchParams receives parsed number, not string
- [x] `z.boolean()` in searchParams receives true/false, not string
- [x] Works with `.optional()`, `.nullable()`, `.default()` wrappers
- [x] Backward compatible - `z.coerce.*` still works if users prefer explicit coercion
- [x] Boolean coercion handles: `"true"`, `"false"`, `"1"`, `"0"` (case-insensitive)
- [x] Invalid number strings (e.g., "abc") result in `NaN` which Zod will reject

## Edge Cases

| Input | Schema | Output |
|-------|--------|--------|
| `?page=5` | `z.number()` | `5` (number) |
| `?page=abc` | `z.number()` | `NaN` → Zod validation error |
| `?active=true` | `z.boolean()` | `true` |
| `?active=false` | `z.boolean()` | `false` |
| `?active=1` | `z.boolean()` | `true` |
| `?active=0` | `z.boolean()` | `false` |
| `?active=yes` | `z.boolean()` | `false` (not "true" or "1") |
| `?tags=a&tags=b` | `z.array(z.string())` | `["a", "b"]` |
| `?tags=a` | `z.array(z.string())` | `["a"]` |

## Verification

1. `bun --cwd packages/better-convex build`
2. `touch example/convex/functions/schema.ts`
3. `bun typecheck`
4. Test in browser:
   - `/api/examples/search?q=test&page=5` → page should be number 5
   - `/api/examples/items/:id/tags?notify=true` → notify should be boolean true

## References

- Current array coercion: [http-builder.ts:94-135](packages/better-convex/src/server/http-builder.ts#L94-L135)
- Example usage: [examples.ts:30-34](example/convex/routers/examples.ts#L30-L34)
- Zod coercion docs: https://zod.dev/api#coerce
- Best practice: All major frameworks (tRPC, Hono, Next.js) require explicit `z.coerce` - we're providing better DX by auto-detecting
