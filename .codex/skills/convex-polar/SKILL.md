---
name: convex-polar
description: Use when integrating Polar payment system with Better Auth - provides checkout flows, subscription management, webhook handlers, and customer portal patterns
---

# Convex Polar with Better Auth

Integration guide for Polar payment system after completing `convex-setup.md`.

## Prerequisites

- Better Auth configured via `convex-setup.md`
- Polar account with products created
- Environment variables configured

## Architecture

**Integration:** Better Auth Polar plugin → Webhooks → Convex mutations → Database
**Key Files:** `convex/functions/auth.ts`, `convex/functions/polar*.ts` for functions, `convex/lib/polar-*.ts` for helpers

## File Structure

```
convex/
├── functions/
│   ├── auth.ts               # Better Auth with Polar plugin
│   ├── polarSubscription.ts  # Subscription operations
│   └── polarCustomer.ts      # Customer management
├── lib/
│   ├── polar-client.ts       # Polar SDK client
│   ├── polar-helpers.ts      # Subscription conversion helpers
│   └── polar-polyfills.ts    # Required Buffer polyfill
└── shared/
    └── polar-shared.ts       # Product config and types
```

## Step 1: Install Dependencies

```bash
bun add @polar-sh/better-auth @polar-sh/sdk buffer
```

## Step 2: Add Schema Fields

**Edit:** `convex/functions/schema.ts`

```typescript
import { defineEnt, defineEntSchema } from "convex-ents";
import { v } from "convex/values";

const schema = defineEntSchema({
  // User table - add Polar customer ID
  user: defineEnt({
    // ... your existing fields ...
  })
    .field("customerId", v.optional(v.string()), { index: true }) // Polar customer ID
    .edges("subscriptions", { to: "subscriptions", ref: "userId" }),

  // Organization table - add subscription edge
  organization: defineEnt({
    // ... your existing fields ...
  }).edge("subscription", { to: "subscriptions", ref: true }),

  // Subscriptions table - organization-based
  subscriptions: defineEnt({
    amount: v.optional(v.union(v.number(), v.null())),
    cancelAtPeriodEnd: v.boolean(),
    checkoutId: v.optional(v.union(v.string(), v.null())),
    createdAt: v.string(),
    currency: v.optional(v.union(v.string(), v.null())),
    currentPeriodEnd: v.optional(v.union(v.string(), v.null())),
    currentPeriodStart: v.string(),
    customerCancellationComment: v.optional(v.union(v.string(), v.null())),
    customerCancellationReason: v.optional(v.union(v.string(), v.null())),
    endedAt: v.optional(v.union(v.string(), v.null())),
    metadata: v.record(v.string(), v.any()),
    modifiedAt: v.optional(v.union(v.string(), v.null())),
    priceId: v.optional(v.string()),
    productId: v.string(),
    recurringInterval: v.optional(v.union(v.string(), v.null())),
    startedAt: v.optional(v.union(v.string(), v.null())),
    status: v.string(), // 'active', 'canceled', 'trialing', 'past_due'
  })
    .field("subscriptionId", v.string(), { unique: true })
    .edge("organization", { to: "organization", field: "organizationId" })
    .edge("user", { to: "user", field: "userId" })
    .index("organizationId_status", ["organizationId", "status"]),
});
```

## Step 3: Create Helper Files

### Polyfills (REQUIRED)

**Create:** `convex/lib/polar-polyfills.ts`

```typescript
import { Buffer as BufferPolyfill } from "buffer";

// Required for Polar SDK in Convex environment
globalThis.Buffer = BufferPolyfill;
```

### Polar Client

**Create:** `convex/lib/polar-client.ts`

```typescript
import { Polar } from "@polar-sh/sdk";

export const getPolarClient = () =>
  new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    server:
      process.env.POLAR_SERVER === "production" ? "production" : "sandbox",
  });
```

### Subscription Conversion Helper

**Create:** `convex/lib/polar-helpers.ts`

```typescript
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";
import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../functions/_generated/dataModel";

// Convert Polar SDK subscription to database format
export const convertToDatabaseSubscription = (
  subscription: Subscription
): WithoutSystemFields<Doc<"subscriptions">> => {
  // Extract organizationId from subscription metadata (referenceId)
  const organizationId = subscription.metadata
    ?.referenceId as Id<"organization">;

  if (!organizationId) {
    throw new Error(
      "Subscription missing organizationId in metadata.referenceId"
    );
  }

  return {
    amount: subscription.amount,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    checkoutId: subscription.checkoutId,
    createdAt: subscription.createdAt.toISOString(),
    currency: subscription.currency,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    currentPeriodStart: subscription.currentPeriodStart.toISOString(),
    customerCancellationComment: subscription.customerCancellationComment,
    customerCancellationReason: subscription.customerCancellationReason,
    endedAt: subscription.endedAt?.toISOString() ?? null,
    metadata: subscription.metadata ?? {},
    modifiedAt: subscription.modifiedAt?.toISOString() ?? null,
    organizationId,
    productId: subscription.productId,
    recurringInterval: subscription.recurringInterval as
      | "month"
      | "year"
      | null
      | undefined,
    startedAt: subscription.startedAt?.toISOString() ?? null,
    status: subscription.status,
    subscriptionId: subscription.id,
    // IMPORTANT: Use externalId, not metadata.userId
    userId: subscription.customer.externalId as Id<"user">,
  };
};
```

## Step 4: Configure Better Auth with Polar

**Edit:** `convex/functions/auth.ts`

```typescript
// IMPORTANT: Import polyfills FIRST
import "../lib/polar-polyfills";

import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { createClient } from "better-convex/auth";
import { convertToDatabaseSubscription } from "../lib/polar-helpers";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

export const authClient = createClient({
  // ... your existing config ...
  triggers: {
    user: {
      onCreate: async (ctx, user) => {
        // ... your existing user creation logic ...

        // Create Polar customer asynchronously via scheduler
        await ctx.scheduler.runAfter(0, internal.polarCustomer.createCustomer, {
          email: user.email,
          name: user.name || user.username,
          userId: user._id,
        });
      },
    },
  },
});

// In createAuthOptions function
const createAuthOptions = (ctx: GenericCtx) => ({
  // ... your existing config ...
  plugins: [
    // ... other plugins ...
    polar({
      client: new Polar({
        accessToken: process.env.POLAR_ACCESS_TOKEN!,
        server:
          process.env.POLAR_SERVER === "production" ? "production" : "sandbox",
      }),
      // NO createCustomerOnSignUp - handled via scheduler in user.onCreate trigger
      use: [
        checkout({
          authenticatedUsersOnly: true,
          products: [
            { productId: process.env.POLAR_PRODUCT_PREMIUM!, slug: "premium" },
          ],
          successUrl: `${process.env.SITE_URL}/success?checkout_id={CHECKOUT_ID}`,
          theme: "light",
        }),
        portal(), // Customer portal management
        webhooks({
          secret: process.env.POLAR_WEBHOOK_SECRET!,

          // Link Polar customer to user via externalId
          onCustomerCreated: async (payload) => {
            // IMPORTANT: Use externalId, not metadata.userId
            const userId = payload?.data.externalId as Id<"user"> | undefined;
            if (!userId) return;

            await (ctx as ActionCtx).runMutation(
              internal.polarCustomer.updateUserPolarCustomerId,
              {
                customerId: payload.data.id,
                userId,
              }
            );
          },

          // Create subscription record
          onSubscriptionCreated: async (payload) => {
            // IMPORTANT: Check customer.externalId, not customer.metadata.userId
            if (!payload.data.customer.externalId) return;

            await (ctx as ActionCtx).runMutation(
              internal.polarSubscription.createSubscription,
              { subscription: convertToDatabaseSubscription(payload.data) }
            );
          },

          // Update subscription
          onSubscriptionUpdated: async (payload) => {
            if (!payload.data.customer.externalId) return;

            await (ctx as ActionCtx).runMutation(
              internal.polarSubscription.updateSubscription,
              { subscription: convertToDatabaseSubscription(payload.data) }
            );
          },
        }),
      ],
    }),
  ],
});
```

## Step 5: Create Polar Functions

### Customer Management

**Create:** `convex/functions/polarCustomer.ts`

```typescript
import "../lib/polar-polyfills";

import { CRPCError } from "better-convex/server";
import { zid } from "convex-helpers/server/zod4";
import { z } from "zod";
import { privateAction, privateMutation } from "../lib/crpc";
import { getPolarClient } from "../lib/polar-client";

// Create Polar customer (called from user.onCreate trigger)
export const createCustomer = privateAction
  .input(
    z.object({
      email: z.string().email(),
      name: z.string().optional(),
      userId: zid("user"),
    })
  )
  .output(z.null())
  .action(async ({ input: args }) => {
    const polar = getPolarClient();

    try {
      await polar.customers.create({
        email: args.email,
        externalId: args.userId, // IMPORTANT: Use userId as externalId
        name: args.name,
      });
    } catch (error) {
      // Don't fail signup if Polar customer creation fails
      console.error("Failed to create Polar customer:", error);
    }

    return null;
  });

// Link Polar customer ID to user (called from webhook)
export const updateUserPolarCustomerId = privateMutation
  .input(
    z.object({
      customerId: z.string(),
      userId: zid("user"),
    })
  )
  .output(z.null())
  .mutation(async ({ ctx, input: args }) => {
    const user = await ctx.table("user").getX(args.userId);

    // Check for duplicate customer IDs
    const existingUser = await ctx
      .table("user")
      .get("customerId", args.customerId);

    if (existingUser && existingUser._id !== args.userId) {
      throw new CRPCError({
        code: "CONFLICT",
        message: `Another user already has Polar customer ID ${args.customerId}`,
      });
    }

    await user.patch({ customerId: args.customerId });
    return null;
  });
```

### Subscription Management

**Create:** `convex/functions/polarSubscription.ts`

```typescript
import "../lib/polar-polyfills";

import { CRPCError } from "better-convex/server";
import { zid } from "convex-helpers/server/zod4";
import { z } from "zod";
import { authAction, privateMutation, privateQuery } from "../lib/crpc";
import { getPolarClient } from "../lib/polar-client";
import { internal } from "./_generated/api";

const subscriptionSchema = z.object({
  amount: z.number().nullish(),
  cancelAtPeriodEnd: z.boolean(),
  checkoutId: z.string().nullish(),
  createdAt: z.string(),
  currency: z.string().nullish(),
  currentPeriodEnd: z.string().nullish(),
  currentPeriodStart: z.string(),
  customerCancellationComment: z.string().nullish(),
  customerCancellationReason: z.string().nullish(),
  endedAt: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()),
  modifiedAt: z.string().nullish(),
  organizationId: zid("organization"),
  priceId: z.optional(z.string()),
  productId: z.string(),
  recurringInterval: z.string().nullish(),
  startedAt: z.string().nullish(),
  status: z.string(),
  subscriptionId: z.string(),
  userId: zid("user"),
});

// Create organization subscription (called from webhook)
export const createSubscription = privateMutation
  .input(z.object({ subscription: subscriptionSchema }))
  .output(z.null())
  .mutation(async ({ ctx, input: args }) => {
    // Check if subscription already exists
    const existing = await ctx
      .table("subscriptions")
      .get("subscriptionId", args.subscription.subscriptionId);

    if (existing) {
      throw new CRPCError({
        code: "CONFLICT",
        message: `Subscription ${args.subscription.subscriptionId} already exists`,
      });
    }

    // Validate organizationId
    if (!args.subscription.organizationId) {
      throw new CRPCError({
        code: "PRECONDITION_FAILED",
        message: "All subscriptions must be tied to an organization",
      });
    }

    // Check for existing active subscription
    const existingOrgSubscription = await ctx
      .table("subscriptions", "organizationId_status", (q) =>
        q
          .eq("organizationId", args.subscription.organizationId)
          .eq("status", "active")
      )
      .first();

    if (existingOrgSubscription) {
      throw new CRPCError({
        code: "CONFLICT",
        message: "Organization already has an active subscription",
      });
    }

    await ctx.table("subscriptions").insert(args.subscription);
    return null;
  });

// Update subscription (called from webhook)
export const updateSubscription = privateMutation
  .input(z.object({ subscription: subscriptionSchema }))
  .output(
    z.object({
      periodChanged: z.boolean(),
      subscriptionEnded: z.boolean(),
      updated: z.boolean(),
    })
  )
  .mutation(async ({ ctx, input: args }) => {
    const existing = await ctx
      .table("subscriptions")
      .get("subscriptionId", args.subscription.subscriptionId);

    if (!existing) {
      return { periodChanged: false, subscriptionEnded: false, updated: false };
    }

    const periodChanged =
      existing.currentPeriodEnd !== args.subscription.currentPeriodEnd;
    const subscriptionEnded = !!args.subscription.endedAt && !existing.endedAt;

    await existing.patch(args.subscription);

    return { periodChanged, subscriptionEnded, updated: true };
  });

// Get active subscription for user
export const getActiveSubscription = privateQuery
  .input(z.object({ userId: zid("user") }))
  .output(
    z
      .object({
        cancelAtPeriodEnd: z.boolean(),
        currentPeriodEnd: z.string().nullish(),
        subscriptionId: z.string(),
      })
      .nullable()
  )
  .query(async ({ ctx, input: args }) => {
    const subscription = await ctx
      .table("subscriptions")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!subscription) return null;

    return {
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
      subscriptionId: subscription.subscriptionId,
    };
  });

// Cancel subscription (user action)
export const cancelSubscription = authAction
  .output(z.object({ message: z.string(), success: z.boolean() }))
  .action(async ({ ctx }) => {
    const polar = getPolarClient();

    const subscription = await ctx.runQuery(
      internal.polarSubscription.getActiveSubscription,
      { userId: ctx.userId! }
    );

    if (!subscription) {
      throw new CRPCError({
        code: "PRECONDITION_FAILED",
        message: "No active subscription found",
      });
    }

    await polar.subscriptions.update({
      id: subscription.subscriptionId,
      subscriptionUpdate: { cancelAtPeriodEnd: true },
    });

    return { message: "Subscription cancelled successfully", success: true };
  });

// Resume subscription (user action)
export const resumeSubscription = authAction
  .output(z.object({ message: z.string(), success: z.boolean() }))
  .action(async ({ ctx }) => {
    const polar = getPolarClient();

    const subscription = await ctx.runQuery(
      internal.polarSubscription.getActiveSubscription,
      { userId: ctx.userId! }
    );

    if (!subscription) {
      throw new CRPCError({
        code: "PRECONDITION_FAILED",
        message: "No active subscription found",
      });
    }

    if (!subscription.cancelAtPeriodEnd) {
      throw new CRPCError({
        code: "PRECONDITION_FAILED",
        message: "Subscription is not set to cancel",
      });
    }

    await polar.subscriptions.update({
      id: subscription.subscriptionId,
      subscriptionUpdate: { cancelAtPeriodEnd: false },
    });

    return { message: "Subscription resumed successfully", success: true };
  });
```

## Step 6: Client Configuration

**Edit:** `src/lib/convex/auth-client.ts`

```typescript
import { createAuthClient } from "better-auth/react";
import { polarClient } from "@polar-sh/better-auth";

export const authClient = createAuthClient({
  plugins: [polarClient()],
});
```

## Client-Side Usage

### Subscription Checkout

```typescript
import { authClient } from "@/lib/convex/auth-client";

const handleSubscribe = async () => {
  const activeOrganizationId = user.activeOrganization?.id;

  if (!activeOrganizationId) {
    toast.error("Please select an organization");
    return;
  }

  try {
    if (currentUser.plan) {
      // User has plan - open portal to manage
      await authClient.customer.portal();
    } else {
      // No plan - initiate checkout
      await authClient.checkout({
        slug: "premium",
        referenceId: activeOrganizationId, // Links subscription to organization
      });
    }
  } catch (error) {
    console.error("Polar checkout error:", error);
    toast.error("Failed to open checkout");
  }
};
```

### Customer Portal

```typescript
// Open Polar customer portal to manage subscription
await authClient.customer.portal();
```

## Environment Variables

**Add to `convex/.env`:**

```bash
# Polar API Configuration
POLAR_SERVER="sandbox"                 # 'production' | 'sandbox'
POLAR_ACCESS_TOKEN="polar_at_..."      # API access token
POLAR_WEBHOOK_SECRET="whsec_..."       # Webhook signature secret

# Polar Product IDs (from Polar dashboard)
POLAR_PRODUCT_PREMIUM="uuid-here"      # Premium subscription product

# Site Configuration
SITE_URL="https://your-site.com"       # For redirects
```

## Available Webhook Events

The `webhooks` plugin supports all Polar webhook events:

**Checkout:**

- `onCheckoutCreated`, `onCheckoutUpdated`

**Orders:**

- `onOrderCreated`, `onOrderPaid`, `onOrderRefunded`
- `onRefundCreated`, `onRefundUpdated`

**Subscriptions:**

- `onSubscriptionCreated`, `onSubscriptionUpdated`
- `onSubscriptionActive`, `onSubscriptionCanceled`
- `onSubscriptionRevoked`, `onSubscriptionUncanceled`

**Customers:**

- `onCustomerCreated`, `onCustomerUpdated`
- `onCustomerDeleted`, `onCustomerStateChanged`

**Benefits:**

- `onBenefitCreated`, `onBenefitUpdated`
- `onBenefitGrantCreated`, `onBenefitGrantUpdated`, `onBenefitGrantRevoked`

**Products:**

- `onProductCreated`, `onProductUpdated`

**Catch-all:**

- `onPayload` - Handles any incoming webhook event

## Common Patterns

### Check Organization Subscription Status

```typescript
const subscription = await ctx
  .table("subscriptions", "organizationId_status", (q) =>
    q.eq("organizationId", organizationId).eq("status", "active")
  )
  .first();

const isActive = subscription?.status === "active";
```

### Check User Has Active Subscription

```typescript
const subscription = await ctx
  .table("subscriptions")
  .filter((q) => q.eq(q.field("userId"), userId))
  .filter((q) => q.eq(q.field("status"), "active"))
  .first();

const isPremium = !!subscription;
```

## Security

1. **Webhook Verification**: Always verify signatures via `POLAR_WEBHOOK_SECRET`
2. **Internal Mutations**: `privateMutation`/`privateAction` only callable from Convex
3. **Customer Isolation**: Users can only access their own data

## Common Issues

**Customer ID Not Set:**

```typescript
// Customer is created via scheduler after signup
// Check that user.onCreate trigger schedules internal.polarCustomer.createCustomer
```

**Subscription Not Found:**

```typescript
// Subscriptions are organization-based - check correct organizationId
// Ensure metadata.referenceId is passed during checkout
```

**Polyfills Required:**

```typescript
// MUST import at top of auth.ts and polar*.ts files
import "../lib/polar-polyfills";
```
