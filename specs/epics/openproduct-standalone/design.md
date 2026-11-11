# openproduct-standalone — design

## 1. Where it lives

| Thing | Value | Notes |
|---|---|---|
| Repository | `github.com/pullely/openproduct`, **public** | A snapshot of `sourceplane/orun-cloud` `apps/openproduct/` at a named commit. No history: the history carries personal emails and session URLs in commit metadata, and only reaches back to the OX1 consolidation anyway. The first commit message names the source SHA. |
| GitHub connection | the existing `User/pullely` connection | An openproduct-account workspace inherits exactly one GitHub connection from its account, and the platform sees a repository's pushes and PRs only through the App installation on the account that **owns** it. That is why the owner is `pullely`. |
| Workspace | `ws_VTNEQKAP`, named `openproduct`, slug `openproduct-live`, **public**, in the openproduct account `ws_SMS84Q22`; project `openproduct` | Created 2026-11-09 through `POST /v1/organizations` with `accountId` set to the openproduct account; visibility was derived as public. The slug `openproduct` is reserved by the platform. Public from day one: a workspace can never change accounts, a private one can never become public, and terraform state is keyed per (workspace, project), so "private first, move later" would mean building it twice. Public means eligible to list, never readable: runs, logs, secrets and members stay private. |
| Work tracker | Orunbase (no tracker connected) | The epic, its milestones and its tasks are created in Orunbase. This directory is their design and the contracts are under `tasks/`; the repository never creates, moves or closes work. |
| Cloudflare | the account connection **`openproduct`** (`int_7fbdaafa…`), shared to the workspace by the account | Created 2026-11-09 for this product (OPN-F). The workspace also inherits two other Cloudflare connections from the account (`Nexo@sourceplane.ai's Account`, `Rahulvarghesepullely@gmail.com's Account`), so every brokered Cloudflare secret names the `openproduct` connection explicitly (§4). Every Cloudflare resource is new, so nothing is adopted or imported. |
| Database | Cloudflare D1, one per environment | §3. No Supabase, no Hyperdrive. |
| Environments | `dev` (verify only, on pull requests), `stage`, `prod` | As today. stage and prod converge on push to `main`, with approval. |
| Hosts before the switch | `openproduct-web-{env}.<subdomain>.workers.dev`, `openproduct-gateway-{env}.<subdomain>.workers.dev` | Worker names are unchanged. Names are per Cloudflare account, so they do not collide with the old deployment. |
| Hosts after the switch | `openproduct.live`, `api.openproduct.live` (prod); stage stays on workers.dev | §6 |

## 2. The tree (OPN1)

The repository root is today's `apps/openproduct/`, with its geometry
preserved: `core/`, `gateway/`, `web/`, `packages/{contracts,db}`, `infra/*`,
`tests/*`, `seam-fixtures/`. `tooling/{eslint,tsconfig,wire}` come along as
dev tooling. The cut is assembled by `tooling/fork/openproduct-cut.mjs` in
orun-cloud. That script was proven in August 2026 and re-checked on
2026-11-09, when it had drifted. OPN1 makes these changes, each verified by
CI, not by the script's say-so.

**Brought along, rewritten:**
- `intent.yaml` is written from the monorepo's own intent, not a frozen template:
  - its triggers include `github-dispatch`;
  - `execution.state` is `backendUrl: https://api.orunbase.com` with the new `workspace: ws_…`, `requireOrg: true` and `autopushCatalog: true`;
  - its compositions source is `oci://ghcr.io/sourceplane/stack-tectonic:<pinned>`. The vendored `stack-tectonic/` copy does not come along.
- `.github/workflows/ci.yml` is the cirrus orun-action workflow: GitHub-hosted `ubuntu-latest`, GitHub OIDC exchanged with the workspace, every provider credential brokered per run, and nothing provider-shaped stored in GitHub. A second job, `offline-verify`, runs on fork pull requests, which get no OIDC token: install, typecheck, lint, test and build with fixtures, without remote state. The monorepo's `ci.yml` never comes along. It targets the self-hosted `nimbus` runners and calls tooling the cut does not carry.
- Every `component.yaml`:
  - drops `awsAccountId`, `awsRegion`, the Secrets Manager paths and `secretsWorker`;
  - gains `secretEnv: secret://<ws>/openproduct/{{ .environment }}/<KEY>` and `secretOutputs` (cirrus's pattern);
  - drops the three platform-only `dependsOn` edges (`db-migrations`, `bootstrap`, `cloudflare-domain`);
  - subscribes **verify-only** in every environment until OPN2.
- `.gitignore` is product-specific and ignores the rendered `core/wrangler.jsonc`. The monorepo's lists about 25 platform worker paths and misses that one.
- `pnpm-lock.yaml` is the monorepo's lockfile, pruned with `pnpm install --lockfile-only`, never a fresh resolve. A fresh resolve silently moved wrangler, turbo, pglite, playwright and workers-types.
- `pnpm-workspace.yaml` includes `infra/*`. Without it the synthetic monitor falls out of the workspace.

**Fixed in place (they reach outside the product today):**
- `web/next.config.mjs` `outputFileTracingRoot` becomes `..`. Today it is three levels up, and OpenNext fails.
- The five tests rooted at the monorepo are rooted at the product: three `suite-scheduling.test.ts`, `hyperdrive-eligibility.test.ts` and `subject-provenance.test.ts`.
- `tests/web/src/wire-budget.test.ts` stops reading `specs/epics/openproduct-worldclass-v2/README.md`. The numbers move into the product.
- `tests/web/src/feed.test.ts` stops depending on the literal `orun-cloud`, and the cut no longer rewrites `orun-cloud#NNNN` issue links.
- The six unused `@saas/*` path mappings in `tests/core/tsconfig.json` are deleted.
- The synthetic monitor's `Headers.entries` typecheck failure, which is also red on orun-cloud main, is fixed.
- The committed merge-conflict markers in `web/src/app/threads/new/actions/route.ts` are removed.

**Retired:**
- `packages/db/src/migrations-twin-sync.test.ts` and the `@saas/db-migrations` devDependency.
- `tests/core/src/import-boundary.test.ts`. Its meaning moved to the platform's residue guard.
- `infra/supabase` and `infra/hyperdrive`. They never deploy from this repository.

**Added:**
- `tests/core/src/repo-root.test.ts`: no file under the repository reaches above its root (relative paths, `__dirname` walks, tsconfig mappings). Every regression since August came in this way.
- `SECURITY.md` (how to report a seam or auth issue), and `"license": "MIT"` in every `package.json`. `LICENSE` (MIT) and the root `README.md` arrived with the repository's first commit.
- gitleaks in CI. `.gitleaksignore` lists the one fixture token (`tests/core/src/sessions.test.ts`), or the token is renamed `ops_test_…`.

## 3. The data plane on D1

### 3.1 Topology

- **One database per environment:** `openproduct-stage` and `openproduct-prod`. Each is provisioned by a `cloudflare-d1` terraform component (cirrus's), whose state lives on the platform (stack-tectonic SB1 HTTP backend). Its `secretOutputs` publishes `WIRING_CLOUDFLARE_D1` per environment, and `core`'s wrangler template renders the binding from it.
- **`core` is the only Worker that binds the database** (`DB`), exactly as it was the only one to bind `PLATFORM_DB`. The binding allowlist test changes `PLATFORM_DB: Hyperdrive` to `DB: D1Database` and stays strict.
- **Location hint:** `apac`, next to the platform database the gateway already calls on authenticated requests. Revisit when read replication is turned on (OPN-N).
- **Read replication is off.** Turning it on means the Sessions API and bookmarks on every read-after-write path. That is later, deliberate work, not part of the port.

### 3.2 The executor

`packages/db/src/d1/` is cirrus's D1 executor (`pullely/ackstack`, `packages/db/src/d1/`). It implements the **same** `SqlExecutor` interface openproduct's Postgres executor does, so `createRepository(executor)` does not change shape.
- **Placeholders stay `$1`, `$2`, ….** A literal-aware scanner translates them to positional `?`, so a number can repeat or appear out of order.
- **`rowCount` is `rows.length`.** A write whose count matters uses `RETURNING` (factory trap 22).
- **Statements that must land together go in one `db.batch()`,** which D1 runs atomically. Interactive transactions do not exist on D1, and **no production call site uses one today.** `TransactionalSqlExecutor.transaction` stays the interface's escape hatch and is refused on D1.

### 3.3 Translation rules

These apply to every statement in `repository.ts` (about 340), and OPN1 proves them on the slice first. The counts are from origin/main b421bc672.

| Postgres | D1 / SQLite | Uses today |
|---|---|---:|
| `timestamptz`, `now()`, `INTERVAL '7 days'` | `TEXT` in one fixed ISO-8601 UTC format (`YYYY-MM-DDTHH:MM:SS.sssZ`), so text order is time order. Interval bounds are computed in JS and bound as instants; `now()` is never used in SQL (factory trap 16). | 217 |
| `jsonb`, `to_jsonb`, `jsonb_agg`, `jsonb_build_object`, `->>` | `TEXT` holding JSON; `json_object`, `json_group_array` over an ordered subquery, `->>` | 103 |
| `::jsonb`, `::int`, `::text`, `::timestamptz` casts | removed, or `CAST(… AS …)` where the affinity matters | 148 |
| `text[]` columns, `= ANY($1)`, `<> ALL($1)`, `unnest`, `array_agg`, `cardinality` | `TEXT` holding a JSON array; `IN / NOT IN (SELECT value FROM json_each($1))`; `json_group_array`; `json_array_length` | 45 |
| `terms && $1::text[]` with a GIN index (search) | a `search_index_terms(kind, entity_id, term)` table with an index on `term`, joined to `search_index` | 1 |
| `jsonb_to_recordset($1)` bulk upserts | `json_each($1)` with `->>` per field, one bound JSON value per statement, chunked (§3.4) | several |
| `LEFT JOIN LATERAL (… LIMIT 1)` | a correlated scalar subquery, or `ROW_NUMBER() OVER (PARTITION BY …)` in a derived table | 10 |
| `DISTINCT ON (…)` | `ROW_NUMBER() OVER (PARTITION BY … ORDER BY …) = 1` | 11 |
| `IS DISTINCT FROM` on rows | `IS NOT` per column, joined with `OR` | several |
| `count(*) FILTER (WHERE …)` | the same; SQLite supports aggregate `FILTER` | 10 |
| `ORDER BY … NULLS LAST` | the same; SQLite has supported it since 3.30 | several |
| `COLLATE "C"` | SQLite's default `BINARY` collation (byte order); OPN1 verifies equivalence | several |
| `ON CONFLICT … DO UPDATE … WHERE`, `RETURNING` | the same; SQLite supports both | 68 / 87 |
| data-modifying CTE (`WITH x AS (INSERT …)`) | separate statements in one `db.batch()`. These are rewritten first: they are exactly factory trap 16 | 4 |
| `to_char(…)`, `AT TIME ZONE` | `strftime` in UTC, each with its own differential case, because day boundaries are where they break | 15 / 11 |
| `ILIKE` | `lower(x) LIKE lower(?)`, with the pattern kept within D1's 50-byte limit. `lower()` folds ASCII only, so slugs and handles are constrained to ASCII, or folded in JS | 5 |
| `gen_random_uuid()` | the id is minted in JS | 2 |
| `json_build_object` with more than 32 arguments | `json_insert` over a smaller object, because D1 allows at most 32 arguments per function | slice: 1 |
| a bound JS number used in arithmetic or text | `CAST(? AS INTEGER)`: D1 binds every JS number as REAL, which leaks into text as `1.0` | several |
| `CREATE INDEX … DESC NULLS LAST` | `… DESC`: SQLite sorts NULL lowest, so the order is the same, and it refuses `NULLS` in an index | several |
| an order that relied on the join | an explicit outer `ORDER BY`: SQLite does not keep join output order | slice: 1 |
| `now()`, `REGEXP`, `LEAST`, `GREATEST` | an instant bound from JS; JS for patterns; multi-argument `MIN` / `MAX`. `sqlite_version()`, `if()` and `unistr()` are blocked on D1 | 29 `now()` |
| `CREATE FUNCTION … plpgsql` + `CREATE TRIGGER` | `CREATE TRIGGER … BEGIN SELECT RAISE(ABORT, '…') … END` | 2 triggers |
| `openproduct.try_jsonb()` repair function | `json_valid()` in SQL, or repair in JS at read | 1 |
| schema prefix `openproduct.` | dropped; the database is the boundary | all |
| `BOOLEAN` | `INTEGER` 0/1 with a `CHECK` | several |

Three more differences:
- **NUL characters.** Postgres refuses a NUL in text, but SQLite stores it and then cuts strings off at it (factory trap 50). The D1 repository refuses NUL in JS, and no key is built with `\u0000` as a separator.
- **Time precision.** D1 keeps milliseconds, not microseconds. The fixed timestamp format is enforced by a `strftime(…) IS col` CHECK on every timestamp column, not by a LIKE pattern, because of the 50-byte limit.
- **Counts on production Postgres.** The OPN1 proof found that the old deployment's postgres.js executor reports 0 for every write count without `RETURNING`. PGlite hides this. Nothing in control flow depends on it, but it shows the counts are only right on D1 when they come from `RETURNING`.

### 3.4 Limits, and how the code stays under them

| D1 limit | How openproduct stays under it |
|---|---|
| 100 bound parameters per statement | Bulk writes bind **one** JSON value and expand it with `json_each`. No statement is built with a parameter per row. |
| 32 arguments per SQL function (**local workerd does not enforce it**) | Wide JSON objects are built with `json_insert`. A static guard (`remote-limits.ts`) checks every statement the tests run. |
| 50 bytes per LIKE or GLOB pattern | Format checks use `strftime` round-trips. User-supplied search patterns are cut to the limit. |
| 2 MB per string, BLOB or row (**local workerd does not enforce it**) | Bulk JSON payloads are chunked at about 1 MB (the 5,000-document search replace is two chunks, of 900 KB and 424 KB). The static guard checks every bound value. |
| 100 KB per SQL statement | Generated SQL never inlines data. |
| 1,000 queries per invocation (a `batch()` counts as one) | Sweep phases batch their writes. The ingestion phase already caps sources per run. |
| 30 s per query | Each sweep phase is a handful of set-based statements. The weekly digest's snapshot-pair read (6.5 s on Postgres at a year of snapshots) is the slowest read known today and gets its own OPN2 check. |
| 50 MB per query result (enforced since 2026-11-04) | Every list read is paged. Nothing selects `*` from a growing table. |
| 10 GB per database, not raisable | At the scale target (5,000 listings, 1.8 million snapshot rows and 438,000 observations a year) the database stays well under it for years. Snapshot and observation retention is decision OPN-D. |
| One query at a time per database | Writes are light (maintainer edits, votes, posts, two crons). Public reads are cached at the edge and in the gateway. Sweep phases run in sequence, as they do today. |

### 3.5 Schema and migrations

There is no data to keep, so the 52-step Postgres ladder is **not** ported
step by step. OPN2 writes `packages/db/src/migrations/0001_baseline/up.sql`:
- the whole schema as of the cut, in SQLite;
- the seed rows the ladder carries (the 26 reserved handles from CG0, and the singleton state rows).

The stack-tectonic `db-migrate` composition applies it to D1, as cirrus does,
with the change-detection lock rule carried over. The Postgres runner,
`migrations.lock` and the twin-sync guard retire with Postgres.

### 3.6 Tests

- **The D1 harness** runs local D1 through workerd (`miniflare` / wrangler's `getPlatformProxy()` from vitest). That is real SQLite in the same runtime D1 uses, **never** better-sqlite3 or PGlite standing in for D1. The cirrus port shipped SQL that passed on a Postgres-like engine and failed on D1 (factory trap 16). That must not happen twice.
- **The differential suite (OPN1 and OPN2):** the same fixture is seeded into PGlite and local D1, the same methods are called with the same inputs, and every result is deep-equal, including order, cursors, census windows and report counts. It is the safety net for the port, and it is deleted along with Postgres at the end of OPN2.
- **The remote-limits guard** runs after every D1 test. It refuses any statement that breaks a limit local workerd lets through but remote D1 enforces: 32 function arguments, 2 MB per value, 100 bound parameters, 100 KB per statement and 50-byte patterns. OPN1's remote probe confirms that the service refuses each one, so the guard matches reality.
- **The scale suite** (`packages/db/src/scale`: 5,000 listings, a year of ingestion and snapshots) moves to D1. `index-coverage` asserts `EXPLAIN QUERY PLAN` uses an index wherever the Postgres plan did.

## 4. The deploy path

| Component | Today (orun-cloud) | After OPN2 |
|---|---|---|
| `openproduct-web` | Next.js on Workers (OpenNext), account `oruncloud` | unchanged code; new account; `workersDevSubdomain` from the new account |
| `openproduct-gateway` | Worker; `CORE` service binding, R2 `MEDIA`, `RateLimitBucket` DO, two crons | unchanged |
| `openproduct-worker` (core) | Worker; Hyperdrive `PLATFORM_DB` | Worker; D1 `DB` |
| `openproduct-synthetic` | Worker; `SyntheticState` DO; walks the product every 5 minutes | unchanged |
| `openproduct-contracts`, `openproduct-db` | turbo packages | unchanged role; `openproduct-db` gains `src/d1` and loses Postgres |
| `openproduct-supabase`, `openproduct-hyperdrive` | terraform, AWS Secrets Manager | **deleted** |
| `openproduct-db-migrate` | Postgres runner over Supabase | stack-tectonic `db-migrate` over D1 |
| `cloudflare-d1` | none | **new**: terraform, one D1 per env, publishes `WIRING_CLOUDFLARE_D1` |
| `openproduct-media` | terraform, R2 per env | unchanged; new account |
| `openproduct-api-domain`, `openproduct-domain` | terraform; prod only (`OPENPRODUCT_CUSTOM_DOMAIN`) | unchanged code; applied only at the prod switch (§6) |
| test components ×4 | turbo packages | unchanged |

Deploy ordering is unchanged and still asserted by
`tests/web/src/deploy-ordering.test.ts`, with `core → cloudflare-d1` added:
`api-domain → gateway`, `web → api-domain`, `domain → web`.

### Secrets (workspace secrets, per environment)

- **Brokered from the `openproduct` Cloudflare connection:** `CLOUDFLARE_API_TOKEN` (per component, as cirrus scopes them) and `CLOUDFLARE_ACCOUNT_ID`. Each is authored against connection `int_7fbdaafa…` by id, never by provider alone, because the workspace inherits three Cloudflare connections.
- **Wiring published by terraform:** `WIRING_CLOUDFLARE_D1`, plus the media bucket's wiring.
- **Set by an operator:**
  - `LISTING_SEAM_SECRET` and `OPENPRODUCT_AUTH_SEAM_SECRET`: fresh values, matched on the platform side at the switch;
  - `GITHUB_TOKEN`: the gateway's repository reads (OX-D);
  - `SCREENSHOT_CAPTURE_TOKEN`;
  - `OPENPRODUCT_OPERATORS`.

None of these is stored in GitHub, and none appears in a committed file.

## 5. The D1 proof (OPN1)

### 5.1 The slice

The catalogue and search slice of the 10-minute sweep and its public reads. It exercises most of the hard translation rules in §3.3:

| Method | Path | Postgres features it uses |
|---|---|---|
| `rebuildCatalogue` | sweep, catalogue phase | `LEFT JOIN LATERAL`, `DISTINCT ON`, `jsonb_agg(to_jsonb(…) ORDER BY …)`, `ON CONFLICT … DO UPDATE … WHERE (…) IS DISTINCT FROM (…)`, `count(*) FILTER`, `INTERVAL` |
| `listCataloguePage` | `/` and `/v1/products` (cache miss) | `LEFT JOIN LATERAL … ON TRUE`, keyset over `NULLS LAST`, `COLLATE "C"`, `::timestamptz` / `::bigint` |
| `replaceSearchIndex` | sweep, search phase | `<> ALL($2::text[])`, `jsonb_to_recordset`, `text[]` |
| `searchCandidates` | `/search` | `terms && $1::text[]` over GIN |
| `getSearchIndexState`, `markSearchIndexDirty` | `/health`, every listing write | singleton state, `COALESCE` |

### 5.2 How it is proven

1. **Local D1, differential.** The slice's schema, a D1 implementation of the six methods behind the unchanged interface, and every existing test case for them run against PGlite and local D1 with equal results. Also tested: the edge cases of an empty never-computed catalogue, a cursor past the end, a null activity cursor, a quiet tick that writes nothing, unlisting, empty and absent search terms, and a 5,000-document rebuild that crosses the chunking threshold.
2. **Remote D1, timed.** `openproduct-d1-probe` is a stage-only Worker bound to a throwaway `openproduct-probe` D1 database, never the stage database. It:
   - seeds the slice's tables at the scale target (5,000 listings, the corpus's metrics, upvotes and media shape);
   - times each method 20 times from inside Cloudflare;
   - posts its report to the run log.

   It also sends negative probes that local D1 accepts and remote D1 must refuse (a 34-argument `json_object`, a 2.1 MB bound value, a result over 50 MB). Then it diffs the remote results against local D1's for the same corpus, and they must be equal.

   It stays as a stage-only component, run on demand by dispatch, and OPN2 re-runs it over the whole data layer. Its database is emptied after each run. Laptop-to-D1 timings are not used: they measure the network to this machine, not the product.

### 5.3 Budgets (measured on remote D1, from the probe)

| Operation | Budget | Why |
|---|---|---|
| `rebuildCatalogue`, cold (every card written) | ≤ 30 s, and every statement ≤ 10 s | one sweep phase; D1 caps a query at 30 s |
| `rebuildCatalogue`, quiet tick | ≤ 3 s | runs every 10 minutes and must cost almost nothing |
| `replaceSearchIndex`, 5,000 documents, cold | ≤ 30 s | rebuilt behind a floor; same cap |
| `replaceSearchIndex`, no change | ≤ 5 s | |
| `listCataloguePage`, first and deep page | p50 ≤ 50 ms, p95 ≤ 150 ms | only cache misses reach it |
| `searchCandidates` (common, rare, multi-term) | p50 ≤ 50 ms, p95 ≤ 150 ms | `/search` is not edge-cached per query |

**Go:** every budget is met and the differential suite is fully equal. **No-go:** any budget is missed by more than 2×, or a result differs in a way the rules in §3.3 cannot fix. Then OPN2 ports to a new Supabase connection instead (risk OPN-A). A miss inside 2× is a go, with the slow statement named and fixed in OPN2.

## 6. The seam and the switch (OPN3)

The seam's wire format does not change: S1–S12, the HMAC schemes and the
fixtures carry over byte-identical. What points at openproduct today, and
where each pointer changes:

| Pointer | Lives in | Today | At the stage switch | At the prod switch |
|---|---|---|---|---|
| `LISTING_SEAM_URL`: where membership-worker posts S6/S7 webhooks | orun-cloud `apps/membership-worker/wrangler.template.jsonc` | `openproduct-gateway-{env}.oruncloud.workers.dev` | new stage gateway host | `https://api.openproduct.live`, stable from then on |
| `openproductWebBase()`: the console's hand-off for listing links | orun-cloud `apps/web-console-next/src/lib/listing-link.ts` | prod `openproduct.live`; stage/dev `openproduct-web-{env}.oruncloud.workers.dev` (hardcoded) | becomes configuration, set to the new stage host | unchanged (`openproduct.live`) |
| OAuth client `openproduct-live` redirect | orun-cloud `packages/contracts/src/identity/auth.ts` | `https://openproduct.live/auth/callback` only | unchanged; stage tests use password sign-in | unchanged |
| `LISTING_SEAM_SECRET`, `OPENPRODUCT_AUTH_SEAM_SECRET` | orun-cloud secrets-sync escrow and this workspace | shared with the old deployment | stage values rotated on both sides | prod values rotated on both sides |
| `openproduct.live` zone, apex domain and `api.` route | Cloudflare, old account (`oruncloud`) | the old web and gateway Workers | — | the zone moves to the new account (OPN-F, OPN-G), and `openproduct-domain` / `openproduct-api-domain` apply here |

The platform-side changes are pull requests in `sourceplane/orun-cloud`,
under that repository's own task keys. This epic records them as OPN3
prerequisites and does not own their files.

**Order:**
1. Switch stage.
2. Run the listing, link-grant, join-request and purge flows end to end on stage.
3. Set the old prod `core` to `READ_ONLY=true`.
4. Move the zone, apply the domain components, re-point `LISTING_SEAM_URL` and rotate the prod keys.
5. Smoke-test.
6. The old deployment stays read-only for one week, then OPN4 destroys it.

**Rollback:** before step 4, revert the stage pointers. After step 4, move the
zone back and re-point the seam. The old prod is read-only but intact until
OPN4.

## 7. The public repository

- **Runners:** GitHub-hosted only. The repository is never added to the `nimbus` runner allowlist or any self-hosted runner group.
- **Workflow triggers:** `pull_request` and `push`, never `pull_request_target`. Fork PRs get no OIDC token and no secrets. They run `offline-verify` only, and run only after a maintainer approves (Settings → Actions → "Require approval for all outside collaborators").
- **Deploy lanes:** only `github-push-main` (and `github-dispatch` on `main`) triggers deploy and apply profiles, and stage and prod require approval. The repository link's CI settings (`oidcEnabled`, `allowedRefPattern`, `allowedEnvironments`) apply to the whole link, not per environment. They stay open to same-repository branches, because pull-request verify lanes resolve their wiring through the same exchange. Only collaborators can push branches here, and fork PRs never get a token.
- **Repository settings:** branch protection on `main`, secret scanning with push protection, and Dependabot alerts.
- **Seam code:** publishing the verification code (constant-time HMAC compares, tolerance windows, a uniform refusal) is safe. Publishing the platform's endpoint names is safe. The keys never are.

## 8. The openproduct account's limits

The workspace sits in an openproduct account, which is free and cannot change
plans (OPA2). Its limits bind this product:
- **`limit.credential_mints_per_day` is 200 today.** A merge that deploys a dozen lanes in two environments costs about 50. **orun-cloud#1905 (raising it to 5000) must land before OPN2** (risk OPN-E).
- **`limit.brokered_secrets` is 30.** §4 lists fewer than that per workspace.
- **`limit.repo_links` is 3.** One is used.

The Cloudflare side has a plan requirement of its own: the `openproduct` Cloudflare account must be on **Workers Paid** (risk OPN-S). The Free plan refuses Worker CPU limits outright, caps D1 at 100,000 rows written a day, and caps a Worker at 10 ms of CPU and a 3 MB bundle.

## 9. Out of scope

- **Feature work of any kind.** Product behaviour is identical before and after; the tests are the proof.
- **Copying any data** from the old deployment (decision 3).
- **Changing the seam's wire format, JR's model or workspace visibility.** Those are platform property.
- **Read replication and the Sessions API** (OPN-N).
- **A custom stage domain.**
- **Git history** (decision 1).
- **The platform-side changes themselves** (§6). They land in orun-cloud.

## 10. Alternatives rejected

| Alternative | Why it lost |
|---|---|
| **Cut as-is**: `openproduct-cut.mjs` onto a public repo, still on Supabase + Hyperdrive, AWS Secrets Manager and the monorepo's CI. This was the parked OX6 plan. | It ships the platform's private plumbing into a public repository, including a workflow that targets self-hosted runners. It needs the OX-E data move and a terraform-state migration (the state key embeds the repo name). And it still isn't an openproduct: nothing would deploy the way the products it lists deploy. |
| **A private workspace in a standard account first, moved to an openproduct workspace later** | Nothing can move it. A workspace never changes accounts, a private one never becomes public, and its terraform state and secrets are keyed to it. "Later" means building the deployment a second time, on a live product. |
| **Stay in the monorepo** (OX6's deferred "independence in place") | The repository can't be public, every change fans out the platform's CI, and openproduct can't list itself. |
| **Switch first on a new Supabase connection, port to D1 afterwards** | By then there would be data to migrate, and there is none now. The D1 port is cheapest exactly now, while the old deployment keeps serving openproduct.live. It stays the fallback if OPN1 says no-go (§5.3). |
| **Port to D1 in place inside orun-cloud, then cut** | It changes the engine under the live product and the platform's CI at the same time, and the cut would still need everything in §2. The parallel product is the cheaper way to make both changes safely. |
