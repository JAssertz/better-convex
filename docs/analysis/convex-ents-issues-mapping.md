# Convex‑Ents Issues → Better‑Convex ORM Mapping

This mapping covers the open Convex‑Ents issues referenced in the successor analysis. It tracks relevance, how Better‑Convex addresses (or intentionally does not address) the issue, and any limitations.

| Issue | Relevant? | Status / Resolution in Better‑Convex | Better‑Convex Equivalent / Limitation |
|---|---|---|---|
| #51 Uniqueness not enforced when writing concurrently | **Yes** | **Documented limitation** | Runtime uniqueness checks are best‑effort within a mutation; concurrent mutations can race. Mitigation: use `onConflictDoNothing()` / `onConflictDoUpdate()` + retries, or serialize writes per key. |
| #42 1:1 edges can be written twice | **Yes** | **Documented limitation** | 1:1 requires a unique constraint on the FK column (`.unique()` / `uniqueIndex()`), but concurrency races can still happen. Same mitigation as #51. |
| #12 Support many:many edges with data | **Yes** | **Supported via join tables** | Model many:many with a join table that includes payload fields; relations can load through the join table. No special API required. |
| #19 Add compound unique fields | **Yes** | **Supported** | Use `unique()` or `uniqueIndex()` with multiple columns. |
| #11 Allow one‑way edge definitions | **Yes** | **Supported** | You can define relations only on the side you need; provide explicit `from`/`to` and `alias` when ambiguous. Inverse side is optional. |
| #2 insertMany doesn’t have a fluent API | **No** | **Not applicable** | Better‑Convex uses Drizzle‑style `insert().values([...])` with `returning()`. No separate `insertMany`. |
| #50 Easier replace argument type | **No** | **Not applicable** | Better‑Convex doesn’t expose Ent‑style `replace/patch` methods. Use `UpdateSet`/`InsertValue`/`InferInsertModel` types. |
| #26 unawaited patch never executes | **No** | **Not applicable** | Better‑Convex doesn’t use lazy ent promises; standard async rules apply. |
| #8 edge() / edgeX() don’t allow writing | **No** | **Not applicable** | Better‑Convex doesn’t expose ent‑object edge methods; use `with` relations + mutation builders. |
| #16 Suggest `ref` when multiple 1:many edges | **No** | **Not applicable** | Relations are explicit (`from`/`to` + `alias`) and must be disambiguated up front. |
| #14 Prettify .d.ts or show source | **No** | **Not applicable** | Better‑Convex ships TS source; editor navigation isn’t blocked by unformatted `.d.ts`. |
| #18 Allow owning files in storage + cascading deletes | **Ignored** | **Out of scope** | Explicitly excluded by request. |

