# openproduct Core Worker

The core of openproduct: the Cloudflare Worker (`openproduct-worker`, package
`@openproduct/core`) that owns openproduct's data and business rules. It serves
the anonymous public reads behind openproduct.live, the signed-in contributor
and maker writes, openproduct's own password sessions, and the internal
endpoints the scheduled sweep drives. It has no public hostname: the only
caller is the [openproduct Gateway](../gateway/README.md), over its `CORE`
service binding.

| | |
|---|---|
| **Component** | `openproduct-worker` · `cloudflare-worker-turbo` |
| **System** | openproduct (sourceplane/orun-cloud `docs/systems/openproduct.md`) |
| **Owner** | platform |
| **Environments** | dev (verify on pull requests) · stage · prod (deploy on push to `main`) |

## What it does

- Serves the public projection — listings, the catalogue, search, people,
  threads, topics, launch boards, the feed, the leaderboard, the digest,
  collections and the transparency ledger. Public handlers resolve no actor and
  read only rows with `visibility = 'public'`.
- Handles maker writes on a listing (create, edit, publish, review, maintainers,
  media rows, role openings, launches, threads) under listing-local
  authorization (`src/authorize.ts`): the `listing_maintainers` table plus an
  operator allowlist (`OPENPRODUCT_OPERATORS`) for first-publish review.
- Handles the signed-in contributor surface (`/me`): profile and handle, saved
  products, follows, endorsements, collections, notifications, digest
  preferences, appeals, roster answers and data export.
- Runs openproduct's own auth plane: password sign-up and verification, and
  issuing, resolving and revoking `ops_` sessions.
- Verifies the platform's workspace link grant (seam S4, `src/seam.ts`) and
  records the seam events the gateway forwards (S6 join requests and workspace
  events, S7 workspace purge).
- Does the inward half of the sweep when the gateway calls it: rebuilds the
  catalogue and search index, takes snapshots, runs the integrity and defence
  sweeps, ranks launch boards, fires due launches, queues the digest and records
  signal and screenshot observations.
- Holds no service binding at all. That empty list is a security control: the
  platform's private planes are unreachable from this isolate, and CI fails if a
  binding is added (see `wrangler.template.jsonc` and
  [`tests/core`](../tests/core/README.md)).

## Interfaces

HTTP only, reached through the gateway's `CORE` binding. Every path below is
internal; the gateway maps its public `/v1/...` routes onto them. The signed-in
families read the actor from the `x-actor-subject-id` / `x-actor-subject-type`
headers the gateway sets after resolving the bearer.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Deployment facts: whether the database and seam secret are configured |
| GET | `/internal/public/openproduct/**` | Public reads (projects, `catalog/products`, `catalog/facets`, search, people, contributors, threads, topics, launches, feed, leaderboard, sidebar, digest, collections, transparency) |
| GET, PUT, POST, PATCH, DELETE | `/internal/openproduct/orgs/{org}/profiles/**` | Maker writes on a listing (publish, review, maintainers, link-grant, media, role-openings, launches, threads, repo-observation) |
| various | `/internal/openproduct/me/**` | The signed-in contributor's own data |
| various | `/internal/openproduct/listings/{slug}/people[/{subject}]` | A listing's roster |
| various | `/internal/openproduct/reports/**` | Reports, moderation acts, triage, flags and appeals |
| POST, PUT, DELETE | `/internal/openproduct/threads/**`, `/comments`, `/posts/{id}/vote` | Discussion writes |
| POST | `/internal/openproduct/auth/{sign-up,verify}` | Password sign-up and email verification |
| POST | `/internal/openproduct/auth/sessions[/resolve,/revoke]` | Issue, resolve and revoke openproduct sessions |
| GET | `/internal/openproduct/credentials/{id}` | The credential read the gateway's sign-in uses |
| POST | `/internal/openproduct/seam/{join-request,workspace-event}` | S6 seam events (signature already checked by the gateway) |
| POST | `/v1/internal/openproduct/workspace-purge` | S7 workspace purge; refuses unless `WORKSPACE_PURGE_ENABLED` is `"true"` |
| GET, POST | `/internal/openproduct/{signals,media/captures,sweep,search,catalogue,snapshots,endorsements,defence,digest,launches}/...` | Sweep endpoints driven by the gateway's cron |

Responses carry a `Server-Timing` header when there are timing phases to
report, and each request logs one structured JSON line (Workers Logs are
enabled).

No Queues, Cron Triggers, Durable Objects or Workflows: the gateway owns the
schedule.

## Dependencies

- **Database:** a Hyperdrive binding, `PLATFORM_DB`, wired at deploy time from
  `WIRING_OPENPRODUCT_HYPERDRIVE_<ENV>`, which
  [`openproduct-hyperdrive`](../infra/hyperdrive/README.md) publishes. It is
  openproduct's own Supabase project per environment
  ([`openproduct-supabase`](../infra/supabase/README.md)), migrated by
  [`openproduct-db-migrate`](../infra/db-migrate/README.md); the worker reads
  only its `openproduct` schema. On a merge, core deploys after both.
- **Build inputs:** [`openproduct-db`](../packages/db/README.md) (`input: true`)
  and, through it, [`openproduct-contracts`](../packages/contracts/README.md).
  Nothing under `apps/openproduct` imports a `@saas/*` package.
- **Called by:** [`openproduct-gateway`](../gateway/README.md) only.

## Configuration

From `wrangler.template.jsonc` and `src/env.ts`:

| Name | Kind | Notes |
|---|---|---|
| `PLATFORM_DB` | Hyperdrive binding | stage and prod only; the ID is resolved at deploy time from `@@wiring(openproduct-hyperdrive/<env>:hyperdrive_id)@@` |
| `ENVIRONMENT` | var | `dev` / `stage` / `prod` (`local` by default) |
| `LISTING_SEAM_SECRET` | secret | Shared seam HMAC key; the workspace secret of that name, pushed by the deploy's `secrets-live` step |
| `OPENPRODUCT_OPERATORS` | var/secret, not templated | Comma-separated operator subject IDs; unset means nobody can review |
| `OPENPRODUCT_LAUNCH_POLICY` | var, optional | Launch policy JSON, for example the cooldown in days |
| `OPENPRODUCT_FRESHNESS_THRESHOLD` | var, optional | How many listings make a window worth naming |
| `WORKSPACE_PURGE_ENABLED` | var | Must be `"true"` for the purge route to delete anything; set per environment in `intent.yaml` (`environments.<env>.env`), rendered into the template's vars; off unless exactly `"true"` |
| `READ_ONLY` | var, not templated | `"true"` makes every non-GET/HEAD request answer 503 (cutover freeze) |

Placement is `smart` with an `apac` hint, so the worker runs near the database.
`workers_dev` is off in stage and prod.

## Develop

```sh
pnpm exec turbo run build --filter=@openproduct/core       # wrangler deploy --dry-run --outdir dist
pnpm exec turbo run typecheck --filter=@openproduct/core
pnpm exec turbo run test --filter=@openproduct/core-tests  # the suite lives in tests/core
pnpm --filter @openproduct/core wire:fixture               # render wrangler.jsonc from wiring.fixture.json
```

`wrangler.jsonc` is generated and never committed. Render it with
`wire:fixture` before running `wrangler dev`.

## Deploy

`cloudflare-worker-turbo` composition:

- **Pull request:** the dev lane runs `verify`. That is install, render
  `wrangler.jsonc` from `wiring.fixture.json`, build, typecheck and
  `wrangler deploy --dry-run`. Stage and prod are skipped on PRs.
- **Push to `main`:** stage and prod run `deploy`, which needs approval. The
  `wire-live` step re-renders the template with real Hyperdrive IDs from AWS
  Secrets Manager, then `wrangler deploy --env <env>`, then `secrets-live`
  (`secretsWorker: openproduct-worker`).
- The `buildCommand` runs the [`@openproduct/core-tests`](../tests/core/README.md)
  suite before the build. A red suite blocks the deploy. No migration step and
  no smoke command are configured.
- A change under `packages/db` does not schedule this component. To ship a fix
  in a bundled package, add a `# ci:` marker line to `component.yaml`.

## Related

- Tests: [`tests/core`](../tests/core/README.md)
- Seam contract: `specs/components/19-openproduct-seam.md` (in sourceplane/orun-cloud)
- Binding allowlist design: `specs/epics/saas-openproduct/design.md` (in sourceplane/orun-cloud) §3
- Extraction and cutover: `specs/epics/openproduct-independence/` (in sourceplane/orun-cloud)
