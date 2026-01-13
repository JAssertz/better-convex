# Better Convex

A modern Next.js starter template featuring **Convex** backend with **Better Auth** integration, showcasing type-safe backend patterns and custom authentication helpers. Includes React Compiler for automatic optimizations.

## Key Features

- **🔐 Better Auth Integration**: Complete authentication with GitHub and Google OAuth, session management, and organization support
- **👥 Multi-Organization Support**: Personal and team organizations with role-based access (owner/member)
- **💳 Subscription Ready**: Polar payment integration with Premium subscriptions and monthly credits (coming soon)
- **📊 Full-Stack Type Safety**: End-to-end TypeScript with Convex Ents for relationships and custom function wrappers
- **⚡ Rate Limiting**: Built-in protection with tier-based limits (free/premium)
- **🎯 Starter Features**: Todo management, projects, tags, and comments with soft delete
- **🔍 Search & Pagination**: Full-text search indexes and efficient paginated queries
- **🚀 Developer Experience**: Pre-configured hooks, RSC helpers, auth guards, and skeleton loading

## Tech Stack

- **Framework**: Next.js 16 with App Router & React 19.2 (React Compiler enabled)
- **Backend**: Convex with Ents (entity relationships)
- **Authentication**: Better Auth with better-auth-convex package & organization plugin
- **Payments**: Polar integration (subscriptions & credits)
- **Styling**: Tailwind CSS v4 with CSS-first configuration
- **State**: Jotai-x for client state, React Query for server state
- **Forms**: React Hook Form + Zod validation
- **UI**: shadcn/ui components with Radix UI primitives
- **Code Quality**: Ultracite (Biome preset) for linting/formatting, Lefthook for git hooks

## Getting Started

### Prerequisites

- Node.js 18 or later
- Bun package manager
- GitHub and/or Google OAuth app credentials

### Setup Instructions

1. **Clone and install dependencies:**

```sh
git clone <your-repo-url>
cd better-convex
bun install
```

2. **Set up environment variables:**

Create `.env.local` for Next.js:

```sh
cp .env.example .env.local
```

Create `convex/.env` for Convex:

```sh
cp convex/.env.example convex/.env
```

- Create [GitHub OAuth App](https://github.com/settings/developers)
- Create [Google OAuth App](https://console.cloud.google.com/apis/credentials)
- Create [Resend API key](https://resend.com/)

Add credentials to `convex/.env`:

```env
# Required environment variables
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
RESEND_API_KEY=your_resend_api_key
```

4. **Start development servers:**

```sh
# This will start both Next.js and Convex
bun dev
```

5. **Initialize Convex environment (first time only):**

In a new terminal:

```sh
bun sync
```

6. **Open the app:**

Navigate to [http://localhost:3000](http://localhost:3000)

### Database Management

```sh
bun init         # Populate with sample data
bun reset        # Reset all tables
bun studio       # Open Convex dashboard
```

## Custom Convex Functions

Instead of using raw Convex `query`/`mutation`/`action`, this template provides custom wrappers with built-in auth, rate limiting, and type safety:

### Backend Functions (`convex/functions.ts`)

```typescript
// Public query - auth optional
export const example = createPublicQuery()({
  args: { id: zid("items") }, // Always use zid() for IDs
  returns: z.object({ name: z.string() }).nullable(),
  handler: async (ctx, args) => {
    return await ctx.table("items").get(args.id);
  },
});

// Protected mutation with rate limiting
export const createItem = createAuthMutation({
  rateLimit: "item/create", // Auto tier limits
  role: "admin", // Optional role check (lowercase)
})({
  args: { name: z.string().min(1).max(100) },
  returns: zid("items"),
  handler: async (ctx, args) => {
    // ctx.user is pre-loaded SessionUser with ent methods
    return await ctx.table("items").insert({
      name: args.name,
      userId: ctx.user._id,
    });
  },
});
```

Available function types:

- `createPublicQuery()` - No auth required
- `createAuthQuery()` - Requires authentication
- `createPublicMutation()` - Auth optional
- `createAuthMutation()` - Requires auth
- `createPublicPaginatedQuery()` - With pagination
- `createAuthPaginatedQuery()` - Auth + pagination
- `createInternalQuery/Mutation/Action()` - Convex-only

## Client-Side Helpers

### React Hooks (`src/lib/convex/hooks`)

```typescript
// Never use useQuery directly - use these wrappers
const { data, isPending } = usePublicQuery(api.items.list, {}); // ALWAYS pass {} for no args
const { data } = useAuthQuery(api.user.getProfile, {}); // Skips if not auth

// Mutations with toast integration
const updateSettings = useAuthMutation(api.user.updateSettings);
toast.promise(updateSettings.mutateAsync({ name: "New" }), {
  loading: "Updating...",
  success: "Updated!",
  error: (e) => e.data?.message ?? "Failed",
});

// Paginated queries
const { data, hasNextPage, fetchNextPage } = usePublicPaginatedQuery(
  api.messages.list,
  { author: "alice" },
  { initialNumItems: 10 }
);
```

### Server Components (`src/lib/convex/server.ts`)

```typescript
// Auth helpers for RSC
const token = await getSessionToken(); // Returns string | null
const user = await getSessionUser(); // Returns SessionUser & { token } | null
const isAuthenticated = await isAuth();

// Fetch with auth
const data = await fetchAuthQuery(api.user.getData, { id: userId });
const data = await fetchAuthQueryOrThrow(api.user.getData, { id: userId });
```

## Schema & Database

The template includes two schemas working together:

### Core Schema (Convex Ents)

```typescript
// convex/schema.ts - Application data with relationships
const schema = defineEntSchema({
  user: defineEnt({
    name: v.optional(v.string()),
    bio: v.optional(v.string()),
    personalOrganizationId: v.string(), // Every user has a personal org
  })
    .field("email", v.string(), { unique: true })
    .edges("subscriptions", { ref: "userId" }) // Polar subscriptions
    .edges("todos", { ref: true })
    .edges("ownedProjects", { to: "projects", ref: "ownerId" }),

  todos: defineEnt({
    title: v.string(),
    description: v.optional(v.string()),
  })
    .field("completed", v.boolean(), { index: true })
    .deletion("soft") // Soft delete support
    .edge("user")
    .edge("project", { optional: true })
    .edges("tags") // Many-to-many
    .searchIndex("search_title_description", {
      searchField: "title",
      filterFields: ["userId", "completed"],
    }),
});
```

### Better Auth Schema

```typescript
// convex/authSchema.ts - Auto-generated auth tables
// Generated via: cd convex && npx @better-auth/cli generate -y --output authSchema.ts
// Includes: user, session, account, organization, member, invitation
```

> [!IMPORTANT]
> Do not modify the default model name or the table name, as we are using the default singular table name in the `better-auth-convex` package.

## Key Patterns from `.claude/rules/convex.mdc`

### Authentication Context

In authenticated functions, `ctx.user` is a pre-loaded `SessionUser` with full entity methods:

```typescript
handler: async (ctx, args) => {
  // ❌ Don't refetch the user
  const user = await ctx.table("user").get(ctx.user._id);

  // ✅ Use pre-loaded user
  await ctx.user.patch({ credits: ctx.user.credits - 1 });
};
```

### Rate Limiting

Define limits in `convex/helpers/rateLimiter.ts`:

```typescript
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  'comment/create:free': { kind: 'fixed window', period: MINUTE, rate: 10 },
  'comment/create:premium': { kind: 'fixed window', period: MINUTE, rate: 30 },
});

// Auto-selects tier based on user plan (free/premium)
createAuthMutation({ rateLimit: 'comment/create' })({...});
```

### Validators

Two different validator systems are used:

- **Schema files (`convex/schema.ts`)**: Use `v.` validators ONLY
- **Function files (`convex/*.ts`)**: Use `z.` validators ONLY

```typescript
// Schema (v.) - in convex/schema.ts
.field('email', v.string(), { unique: true })

// Functions (z.) - in convex/*.ts
args: {
  email: z.string().email(),
  id: zid('user') // Always use zid() for IDs
}
```

## Development Commands

```bash
bun dev          # Start dev servers
bun typecheck    # Run TypeScript checks
bun lint         # Check code with Ultracite/Biome
bun lint:fix     # Fix linting and formatting issues
bun check        # Run all checks (lint, ESLint, TypeScript)
bun seed         # Seed database
bun reset        # Reset database
bun studio       # Open Convex dashboard
```

## Best Practices

1. **Never use raw `query`/`mutation`** - Always use custom wrappers
2. **Use `zid()` for IDs** in functions, `v.id()` in schemas
3. **Pass `{}` for no args** in queries, not `undefined`
4. **Use `ctx.table()`** instead of `ctx.db` (banned, except for streams first param)
5. **Leverage pre-loaded `ctx.user`** in auth contexts
6. **Use `.optional()`** not `.nullable()` for optional args
7. **Never create indexes for edge-generated fields**

## File Structure

```
convex/
├── functions.ts      # Custom function wrappers
├── schema.ts         # Database schema
├── auth.ts          # Better Auth setup
├── todos.ts         # Example CRUD operations
└── helpers/
    └── rateLimiter.ts

src/lib/convex/
├── hooks/           # React hooks
├── server.ts        # RSC helpers
├── auth-client.ts   # Client auth setup
└── components/      # Auth components
```

## Claude Agents & Cursor Rules

This template includes specialized AI agents and coding rules to enhance your development experience:

### Cursor Rules (`.claude/rules/`)

#### Core Convex Rules

- **convex.mdc** ⭐ - **CRITICAL**: Complete Convex patterns guide (MUST READ for backend work)
- **convex-client.mdc** - Client-side Convex integration patterns
- **convex-ents.mdc** - Entity relationships and edge patterns
- **convex-aggregate.mdc** - Efficient counting with O(log n) performance
- **convex-optimize.mdc** - Performance optimization patterns
- **convex-search.mdc** - Full-text search implementation
- **convex-streams.mdc** - Advanced filtering with consistent pagination
- **convex-trigger.mdc** - Database triggers and reactive patterns
- **convex-scheduling.mdc** - Cron jobs and scheduled functions
- **convex-http.mdc** - HTTP endpoints and webhooks
- **convex-examples.mdc** - Reference implementations

#### Frontend Rules

- **react.mdc** - React component patterns
- **nextjs.mdc** - Next.js routing and RSC patterns
- **jotai-x.mdc** - State management patterns
- **toast.mdc** - Notification patterns
- **ultracite.mdc** - Code quality standards and formatting rules

## Start from Scratch

To remove all starter code and keep only auth/user functionality:

### Backend Files to Delete (convex/)

```bash
# Function files
rm convex/todos.ts
rm convex/todoInternal.ts
rm convex/todoComments.ts
rm convex/projects.ts
rm convex/tags.ts
rm convex/seed.ts
```

## Authentication Implementation

### Admin Setup

Admin users are configured via environment variables and automatically assigned admin role on first login:

```env
# convex/.env
ADMIN="admin@example.com,another@example.com"
```

### Initialization (`convex/init.ts`)

Auto-runs on dev server startup (`--run init`):

- Creates admin users from `ADMIN` env variable
- Assigns `role: 'admin'` to pre-configured emails
- Runs seed data in development environment

### Seeding (`convex/seed.ts`)

Development data population:

- `seedUsers`: Creates Alice, Bob, Carol, Dave test users
- `generateSamples`: Creates sample projects with todos (auth-protected action)
- Preserves admin user and existing sessions during cleanup

### Reset (`convex/reset.ts`)

Database cleanup utilities (dev only)

### Frontend Files to Delete (src/)

```bash
# Page routes
rm -rf src/app/projects/
rm -rf src/app/tags/

# Components
rm -rf src/components/todos/
rm -rf src/components/projects/

# Breadcrumb navigation (optional - uses todo examples)
rm src/components/breadcrumb-nav.tsx
```

### Schema Updates (convex/schema.ts)

Remove these tables and their edges from the schema:

- `todos` table
- `projects` table
- `tags` table
- `todoComments` table
- `projectMembers` table (join table)
- `todoTags` table (join table)
- `commentReplies` table (join table)

Update the `users` table to remove edges:

```typescript
user: defineEnt({
  // Keep profile fields
  name: v.optional(v.string()),
  bio: v.optional(v.string()),
  image: v.optional(v.string()),
  role: v.optional(v.string()),
  deletedAt: v.optional(v.number()),
})
  .field("emailVerified", v.boolean(), { default: false })
  .field("email", v.string(), { unique: true });
// Remove all todo/project related edges
```

### Aggregates Updates (convex/aggregates.ts)

Keep only:

- `aggregateUsers`

Remove:

- `aggregateTodosByUser`
- `aggregateTodosByProject`
- `aggregateTodosByStatus`
- `aggregateTagUsage`
- `aggregateProjectMembers`
- `aggregateCommentsByTodo`

### Config Updates (convex/convex.config.ts)

Remove aggregate registrations:

```typescript
// Keep only:
app.use(aggregate, { name: "aggregateUsers" });

// Remove all todo/project/tag related aggregates
```

### Triggers Updates (convex/triggers.ts)

Remove all todo/project/tag related triggers if any exist.

### Home Page Update (src/app/page.tsx)

Replace with a simple authenticated landing page:

```tsx
export default async function HomePage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="mb-4 text-3xl font-bold">Welcome</h1>
      <p>Your authenticated app starts here.</p>
    </div>
  );
}
```

### Clean Generated Files

After making these changes:

```bash
# Regenerate Convex types
bun dev
```

This will give you a clean authentication-only starter with:

- ✅ Better Auth integration
- ✅ User management
- ✅ Rate limiting
- ❌ No todo/project/tag starter code

## Resources

- [Convex Documentation](https://docs.convex.dev)
- [Better Auth Convex Package](https://github.com/udecode/better-auth-convex) - Local installation without component boundaries
