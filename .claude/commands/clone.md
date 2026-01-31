Anytime when planning, use dig skill https://github.com/drizzle-team/drizzle-orm.git and https://github.com/get-convex/convex-ents.git and any relevant github repos to clone the code and analyze the code, especially about TypeScript patterns and generics. Assume your TS skills are limited and those repositories have better quality TS code. We don't want to reinvent the wheel, but we want the closest API to Drizzle. Convex Ents is an example of success mapping Convex db to an ORM, so you can look at how they type when needed.

Developers familiar with Drizzle/Prisma face a steep learning curve when adopting Convex because they must learn convex-ents' different API. By providing familiar Drizzle-style ergonomics, we eliminate this barrier while maintaining Better Convex's philosophy of TypeScript-first, type-safe development.

**Key insight**: Similar to how cRPC brought tRPC ergonomics to Convex, Drizzle-Convex will bring Drizzle ORM ergonomics to Convex.
