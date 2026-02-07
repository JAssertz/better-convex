# Drizzle ORM Docs → Better-Convex ORM Docs Parity Matrix

This file tracks documentation parity work between Drizzle ORM docs and Better-Convex ORM docs.

**Sources:**
- `/tmp/cc-repos/drizzle-orm-docs/src/content/docs/_meta.json`
- `/tmp/cc-repos/drizzle-orm-docs/src/content/docs/get-started/_meta.json`
- `/tmp/cc-repos/drizzle-orm-docs/src/content/docs/column-types/_meta.json`
- `/tmp/cc-repos/drizzle-orm-docs/src/content/docs/extensions/_meta.json`
- All docs pages under `/tmp/cc-repos/drizzle-orm-docs/src/content/docs` (`.mdx`/`.md`)

## Status Legend

- **ADAPTED**: We have a Better-Convex page covering the Drizzle page (with Convex caveats).
- **PARTIALLY ADAPTED**: Only a subset is applicable/supported; missing pieces are documented as limitations.
- **N/A (SQL-only)**: SQL/driver/tooling features that don’t map to Convex.
- **NOT SUPPORTED YET**: Potentially applicable, but not implemented in Better-Convex yet.

## Default Classification Rules

- **Connect / DB drivers / migrations / seeding / extensions / SQL query builder / joins / prepared statements / placeholders / cache / transactions** → **N/A (SQL-only)**
- **Schema / Relations / Indexes & Constraints / RLS / RQBv2 / Insert / Update / Delete / Filters (operators)** → **ADAPTED** or **PARTIALLY ADAPTED**

## Matrix (All Drizzle docs pages)

| Drizzle doc slug | Status | Better-Convex destination | Notes |
|---|---|---|---|

| `arktype` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
| `batch-api` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `cache` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `column-types/cockroach` | N/A (SQL-only) | `www/content/docs/db/orm/column-types.mdx` | Better-Convex documents a Convex subset; SQL dialect-specific types are not applicable. |
| `column-types/mssql` | N/A (SQL-only) | `www/content/docs/db/orm/column-types.mdx` | Better-Convex documents a Convex subset; SQL dialect-specific types are not applicable. |
| `column-types/mysql` | N/A (SQL-only) | `www/content/docs/db/orm/column-types.mdx` | Better-Convex documents a Convex subset; SQL dialect-specific types are not applicable. |
| `column-types/pg` | PARTIALLY ADAPTED | `www/content/docs/db/orm/column-types.mdx` | Only Better-Convex builders are documented (text/integer/number/boolean/bigint/id/vector). |
| `column-types/singlestore` | N/A (SQL-only) | `www/content/docs/db/orm/column-types.mdx` | Better-Convex documents a Convex subset; SQL dialect-specific types are not applicable. |
| `column-types/sqlite` | N/A (SQL-only) | `www/content/docs/db/orm/column-types.mdx` | Better-Convex documents a Convex subset; SQL dialect-specific types are not applicable. |
| `connect-aws-data-api-mysql` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-aws-data-api-pg` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-bun-sql` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-bun-sqlite` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-cloudflare-d1` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-cloudflare-do` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-drizzle-proxy` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-effect-postgres` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-expo-sqlite` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-neon` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-nile` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-op-sqlite` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-overview` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-pglite` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-planetscale` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-planetscale-postgres` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-prisma-postgres` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-react-native-sqlite` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-sqlite-cloud` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-supabase` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-tidb` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-turso` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-turso-database` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-vercel-postgres` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `connect-xata` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `custom-types` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `data-querying` | PARTIALLY ADAPTED | `www/content/docs/db/orm/queries.mdx`<br/>`www/content/docs/db/orm/limitations.mdx` | Better-Convex only covers relational-style querying; SQL-like query builder is N/A. |
| `delete` | PARTIALLY ADAPTED | `www/content/docs/db/orm/delete.mdx`<br/>`www/content/docs/db/orm/mutations.mdx` | No SQL `WITH` clauses, limit, or orderBy on deletes; runtime enforcement (RLS/constraints). |
| `drizzle-config-file` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `drizzle-kit-check` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `drizzle-kit-export` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `drizzle-kit-generate` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `drizzle-kit-migrate` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `drizzle-kit-pull` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `drizzle-kit-push` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `drizzle-kit-studio` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `drizzle-kit-up` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `dynamic-query-building` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `eslint-plugin` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
| `extensions/mysql` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
| `extensions/pg` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
| `extensions/singlestore` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
| `extensions/sqlite` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
| `faq` | N/A (SQL-only) |  |  |
| `generated-columns` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `get-started` | N/A (SQL-only) |  |  |
| `get-started-cockroach` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started-gel` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started-mssql` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started-mysql` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started-postgresql` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started-singlestore` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started-sqlite` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/bun-sql-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/bun-sql-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/bun-sqlite-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/bun-sqlite-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/cockroach-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/cockroach-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/d1-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/d1-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/do-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/do-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/effect-postgresql-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/effect-postgresql-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/expo-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/expo-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/gel-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/gel-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/mssql-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/mssql-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/mysql-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/mysql-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/neon-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/neon-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/nile-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/nile-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/op-sqlite-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/op-sqlite-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/pglite-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/pglite-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/planetscale-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/planetscale-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/planetscale-postgres-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/planetscale-postgres-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/postgresql-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/postgresql-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/singlestore-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/singlestore-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/sqlite-cloud-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/sqlite-cloud-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/sqlite-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/sqlite-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/supabase-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/supabase-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/tidb-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/tidb-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/turso-database-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/turso-database-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/turso-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/turso-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/vercel-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/vercel-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/xata-existing` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `get-started/xata-new` | N/A (SQL-only) |  | Database driver setup is not applicable to Convex. |
| `goodies` | N/A (SQL-only) |  |  |
| `gotchas` | N/A (SQL-only) |  |  |
| `graphql` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
| `guides` | N/A (SQL-only) |  |  |
| `guides/conditional-filters-in-query` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/count-rows` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/cursor-based-pagination` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/d1-http-with-drizzle-kit` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/decrementing-a-value` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/empty-array-default-value` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/full-text-search-with-generated-columns` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/gel-ext-auth` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/include-or-exclude-columns` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/incrementing-a-value` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/limit-offset-pagination` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/mysql-local-setup` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/point-datatype-psql` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/postgis-geometry-point` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/postgresql-full-text-search` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/postgresql-local-setup` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/seeding-using-with-option` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/seeding-with-partially-exposed-schema` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/select-parent-rows-with-at-least-one-related-child-row` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/timestamp-default-value` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/toggling-a-boolean-field` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/unique-case-insensitive-email` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/update-many-with-different-value` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/upsert` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `guides/vector-similarity-search` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `indexes-constraints` | PARTIALLY ADAPTED | `www/content/docs/db/orm/indexes-constraints.mdx` | Constraints are runtime-enforced (ORM only); SQL-only constraints are N/A. |
| `insert` | PARTIALLY ADAPTED | `www/content/docs/db/orm/insert.mdx`<br/>`www/content/docs/db/orm/mutations.mdx` | SQL output sections omitted; Convex inserts return `void` unless `returning()` is used. |
| `joins` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `kit-custom-migrations` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `kit-migrations-for-teams` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `kit-overview` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `kit-seed-data` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `kit-web-mobile` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `latest-releases` | N/A (SQL-only) |  |  |
| `latest-releases/drizzle-kit-v0232` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0110` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0162` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0272` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0280` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0281` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0282` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0283` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0284` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0285` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0286` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0290` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0291` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0292` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0293` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0294` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0295` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0300` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0301` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v03010` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0302` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0303` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0304` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0305` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0306` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0307` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0308` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0309` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0310` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0311` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0312` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0313` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0314` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0320` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0321` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v0322` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `latest-releases/drizzle-orm-v1beta2` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `migrate/components` | N/A (SQL-only) |  |  |
| `migrate/migrate-from-prisma` | N/A (SQL-only) |  |  |
| `migrate/migrate-from-sequelize` | N/A (SQL-only) |  |  |
| `migrate/migrate-from-typeorm` | N/A (SQL-only) |  |  |
| `migrations` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `operators` | PARTIALLY ADAPTED | `www/content/docs/db/orm/operators.mdx` | Better-Convex supports RQBv2 object filters + mutation filter helpers; SQL-only operators (including `exists`/`notExists`) are N/A. |
| `overview` | N/A (SQL-only) |  | Product overview not mirrored in Better-Convex ORM docs. |
| `perf-queries` | N/A (SQL-only) |  | Drizzle performance guidance targets SQL engines and drivers. |
| `perf-serverless` | N/A (SQL-only) |  | Drizzle performance guidance targets SQL engines and drivers. |
| `prisma` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
| `query-utils` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `quick` | N/A (SQL-only) |  |  |
| `read-replicas` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `relations` | N/A (SQL-only) |  | Old Drizzle RQBv1 docs are not mirrored; Better-Convex targets v1 RC-style APIs. |
| `relations-schema-declaration` | PARTIALLY ADAPTED | `www/content/docs/db/orm/relations.mdx` | Soft relations + `defineRelations` mirrored; SQL FK declaration is different in Convex. |
| `relations-v1-v2` | N/A (SQL-only) |  |  |
| `relations-v2` | PARTIALLY ADAPTED | `www/content/docs/db/orm/relations.mdx` | Mirrors `defineRelations({ tables }, (r) => ...)` and `one/many` config; Convex uses `_id`. |
| `rls` | PARTIALLY ADAPTED | `www/content/docs/db/orm/rls.mdx` | RLS is enforced at runtime by the ORM (not in the database). |
| `rqb` | N/A (SQL-only) |  | Old Drizzle RQBv1 docs are not mirrored; Better-Convex targets v1 RC-style APIs. |
| `rqb-v2` | PARTIALLY ADAPTED | `www/content/docs/db/orm/queries.mdx`<br/>`www/content/docs/db/orm/limitations.mdx` | `extras`, `RAW`, SQL placeholders, prepared statements, and subquery operators (`exists`/`notExists`) are SQL-only and unsupported at runtime. |
| `schemas` | N/A (SQL-only) |  |  |
| `seed-functions` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `seed-limitations` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `seed-overview` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `seed-versioning` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `select` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `sequences` | N/A (SQL-only) |  |  |
| `set-operations` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `sql` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `sql-schema-declaration` | PARTIALLY ADAPTED | `www/content/docs/db/orm/schema.mdx`<br/>`www/content/docs/db/orm/column-types.mdx`<br/>`www/content/docs/db/orm/indexes-constraints.mdx` | SQL DDL + migration/tooling sections are omitted; Convex document model differs. |
| `transactions` | N/A (SQL-only) |  | SQL-only query builder features are not applicable to Convex. |
| `tutorials` | N/A (SQL-only) |  |  |
| `tutorials/drizzle-on-the-edge/drizzle-with-netlify-edge-functions-neon` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-on-the-edge/drizzle-with-netlify-edge-functions-supabase` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-on-the-edge/drizzle-with-supabase-edge-functions` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-on-the-edge/drizzle-with-vercel-edge-functions` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-with-db/drizzle-with-neon` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-with-db/drizzle-with-nile` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-with-db/drizzle-with-supabase` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-with-db/drizzle-with-turso` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-with-db/drizzle-with-vercel` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-with-db/drizzle-with-xata` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-with-frameworks/drizzle-nextjs-neon` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `tutorials/drizzle-with-frameworks/drizzle-with-encore` | N/A (SQL-only) |  | Most guides/tutorials are SQL driver/tooling focused. |
| `typebox` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
| `update` | PARTIALLY ADAPTED | `www/content/docs/db/orm/update.mdx`<br/>`www/content/docs/db/orm/mutations.mdx` | No SQL `UPDATE ... FROM`, limit, or orderBy on mutations; runtime enforcement (RLS/constraints). |
| `upgrade-21` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `upgrade-v1` | N/A (SQL-only) |  | SQL migrations/tooling are not applicable to Convex. |
| `valibot` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
| `views` | N/A (SQL-only) |  |  |
| `why-drizzle` | N/A (SQL-only) |  |  |
| `zod` | N/A (SQL-only) |  | Drizzle extensions are not applicable to Better-Convex. |
