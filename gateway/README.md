# openproduct Gateway

openproduct's public API and only front door: the Cloudflare Worker
`openproduct-gateway` (package `@openproduct/gateway`). Every request to
openproduct comes through it, from the openproduct.live website, from API
clients, from MCP agents, and as signed seam deliveries from the Orunbase
platform. It applies CORS, rate limits and auth, then forwards to the
[openproduct Core Worker](../core/README.md) over its one service binding,
`CORE`. It also runs openproduct's only cron schedule, the sweep.

| | |
|---|---|
| **Component** | `openproduct-gateway` · `cloudflare-worker-turbo` |
| **System** | openproduct (sourceplane/orun-cloud `docs/systems/openproduct.md`) |
| **Owner** | platform |
| **Environments** | dev (verify on pull requests) · stage · prod (deploy on push to `main`) |
| **URL** | prod: <https://api.openproduct.live> (Worker Route owned by [`openproduct-api-domain`](../infra/api-domain/README.md)); also `openproduct-gateway-{stage,prod}.oruncloud.workers.dev` |

## What it does

- **Public reads.** Anonymous `GET`/`HEAD` routes resolve no subject. They are
  forwarded to core's public paths and cached for 60 seconds with Workers
  Caching (`"cache": { "enabled": true }`), tagged with `Cache-Tag` so writes
  and sweeps can purge what they changed. Core's failure bodies are never
  passed through.
- **Authenticated routes.** The bearer is turned into a subject (seam S2,
  `src/subject.ts`). An `ops_` token is openproduct's own session and is
  resolved against core. Any other token is the platform's and is resolved with
  `GET {PLATFORM_API_URL}/v1/identity/me`. Positive answers are cached in the
  isolate for up to 60 s. The subject is forwarded to core as `x-actor-*`
  headers, and core decides what it may do.
- **Auth plane.** Password sign-up, verification, sign-in and sign-out. Sign-in
  asks the platform which subject an email address belongs to
  (`/v1/seam/openproduct/subject-by-email`) and checks the password against
  core.
- **Seam receivers.** It verifies the platform's HMAC-signed S6/S7 webhooks with
  `LISTING_SEAM_SECRET`, then forwards them to core.
- **Media.** Upload (`POST .../profiles/{profile}/media`) keeps the bytes in this
  worker and writes them to the `MEDIA` R2 bucket. Serving `/v1/media/...` is one
  R2 read with an immutable cache header, and never touches core.
- **Agents and API docs.** `POST /mcp` is a stateless, anonymous MCP server over
  the public catalog. `/v1/openapi.json` is generated from the contracts.
- **Limits.** Rate limits use a `RateLimitBucket` Durable Object in this worker,
  and fall back to a per-isolate bucket if the object is unreachable.
  Per-subject write velocity limits (`src/velocity.ts`) can be overridden with
  `OPENPRODUCT_VELOCITY`. CORS allows exactly one origin, `SITE_ORIGIN`.
- **The sweep.** Two crons, both declared in every environment (the expressions
  come from `SWEEP_CRON` in the contracts):
  - `*/10 * * * *` runs **materialisation**: catalogue, search index,
    endorsement integrity, defence, launch boards, digest and snapshots, all
    through core.
  - `23 * * * *` runs **ingestion**: it observes linked GitHub repositories
    (S8, `src/github.ts`) and, when configured, takes listing screenshots
    (`src/capture.ts`), then records both through core.

## Interfaces

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Configured checks plus live sweep health and the running Worker version. Always 200; the body says `ok` or `degraded` |
| GET | `/v1/public/openproduct/**` | Public reads: projects, people, contributors, threads, topics, launches, feed, leaderboard, sidebar, digest, collections, transparency |
| GET | `/v1/products`, `/v1/products/{slug}`, `/v1/facets`, `/v1/search` | The documented catalog API and search |
| GET | `/v1/openapi.json` | OpenAPI document (cached 600 s) |
| GET | `/v1/media/{sha256}.{png,jpg,webp}`, `/v1/media/{sha256}/w{width}.webp` | Media bytes from R2 |
| POST | `/mcp` | MCP server, tools `list_products`, `get_product`, `list_facets` |
| POST | `/v1/openproduct/auth/{sign-up,verify,sign-in,sign-out}` | Password auth plane |
| various | `/v1/openproduct/me/**`, `/listings/{slug}/people`, `/reports/**`, `/threads/**`, `/comments`, `/posts/{id}/vote` | Signed-in contributor, roster, moderation and discussion routes |
| various | `/v1/organizations/{org}/openproduct/profiles/**` | Maker routes for a listing, including media upload and `POST .../repo-check` (the S8 repository read) |
| POST | `/seam/v1/{join-requests,workspace-events,workspace-purge}` | Signed platform webhooks (S6, S7) |

- **Cron triggers:** `*/10 * * * *` and `23 * * * *` (see above).
- **Durable Object:** `RateLimitBucket`, bound as `RATE_LIMIT`, SQLite-backed
  (migration tag `v1`).

## Dependencies

- **Service binding:** `CORE` → `openproduct-worker-{env}`. This is the only
  service binding, and [`tests/gateway`](../tests/gateway/README.md) fails the
  build if another one or a platform binding appears.
- **R2:** `MEDIA` → `openproduct-media-{stage,prod}`, made by
  [`openproduct-media`](../infra/media/README.md). Not bound in dev, where
  uploads answer 503 `storage_unavailable`.
- **Platform, over public HTTPS only:** api-edge (`PLATFORM_API_URL`) for
  `/v1/identity/me` and the subject-by-email seam call. The platform is never a
  binding.
- **Outbound:** the GitHub API for repository observation, and the Cloudflare
  screenshot endpoint when `SCREENSHOT_CAPTURE_URL` is set.
- **Build input:** [`openproduct-contracts`](../packages/contracts/README.md).
- **Depended on by:** [`openproduct-web`](../web/README.md) (all reads and
  writes), [`openproduct-api-domain`](../infra/api-domain/README.md) (the Route
  names this script) and [`openproduct-synthetic`](../infra/synthetic/README.md)
  (by public URL).

## Configuration

`wrangler.jsonc` is committed directly; there is no template, because the
gateway holds no wired resource IDs. The compatibility flag
`global_fetch_strictly_public` is required so that `fetch()` to a
`*.workers.dev` host such as api-edge reaches the Worker.

| Name | Kind | Notes |
|---|---|---|
| `CORE` | service binding | per env |
| `MEDIA` | R2 binding | stage, prod |
| `RATE_LIMIT` | Durable Object binding | every env |
| `CF_VERSION_METADATA` | version metadata binding | shown as `build` on `/health` |
| `ENVIRONMENT` | var | `dev` / `stage` / `prod` |
| `PLATFORM_API_URL` | var | `https://api-edge-{env}.oruncloud.workers.dev` |
| `SITE_ORIGIN` | var | prod `https://openproduct.live`; otherwise `openproduct-web-{env}.oruncloud.workers.dev` |
| `MEDIA_RESIZING` | var | `"false"` everywhere until Image Resizing is enabled on the zone |
| `PUBLIC_API_ORIGIN` | var, optional | Names the `servers` entry in the OpenAPI document; not set in `wrangler.jsonc` |
| `OPENPRODUCT_VELOCITY` | var, optional | JSON override for the write velocity rules |
| `DIGEST_DELIVERY_URL` | optional | Where digest deliveries are posted; unset means nothing is sent |
| `LISTING_SEAM_SECRET` | secret | Delivered by `secrets-live` from the `integrations/listing-seam/<env>` escrow doc (`secretsWorker: openproduct-gateway`) |
| `OPENPRODUCT_AUTH_SEAM_SECRET` | secret | Key for the subject-by-email seam call; unset means sign-in refuses |
| `GITHUB_TOKEN` | secret, optional | Raises the GitHub rate limit for ingestion |
| `SCREENSHOT_CAPTURE_URL`, `SCREENSHOT_CAPTURE_TOKEN` | secrets, optional | Both must be set for screenshot capture to run |

## Develop

```sh
pnpm exec turbo run build --filter=@openproduct/gateway        # wrangler deploy --dry-run --outdir dist
pnpm exec turbo run typecheck --filter=@openproduct/gateway
pnpm exec turbo run test --filter=@openproduct/gateway-tests   # the suite lives in tests/gateway
pnpm --filter @openproduct/gateway dev                         # wrangler dev
```

## Deploy

`cloudflare-worker-turbo` composition, with no wrangler template:

- **Pull request:** the dev lane runs `verify` (install, build, typecheck,
  `wrangler deploy --dry-run`).
- **Push to `main`:** stage and prod run `deploy`, which needs approval:
  `wrangler deploy --env <env>`, then `secrets-live`.
- The `buildCommand` runs [`@openproduct/gateway-tests`](../tests/gateway/README.md)
  first, so a red suite blocks the deploy. No migration step and no smoke
  command are configured.
- The `api.openproduct.live` Route is not declared in `wrangler.jsonc`.
  Terraform in [`openproduct-api-domain`](../infra/api-domain/README.md) owns
  it, so one hostname has one owner.

## Related

- Tests: [`tests/gateway`](../tests/gateway/README.md)
- Seam contract (S2, S6, S7, S8): `specs/components/19-openproduct-seam.md` (in sourceplane/orun-cloud)
- `specs/epics/openproduct-independence/` (in sourceplane/orun-cloud) (the gateway's origin) · `openproduct-performance` (sourceplane/orun-cloud `specs/epics/openproduct-performance/README.md`) (caching, the `api.` hostname) · `openproduct-worldclass` (sourceplane/orun-cloud `specs/epics/openproduct-worldclass/README.md`) (the sweep schedule, media, MCP)
- Public API docs page: <https://openproduct.live/docs/api>
