# openproduct Synthetic Monitor

A small Cloudflare Worker (`openproduct-synthetic`, package
`@openproduct/synthetic`) that checks openproduct from outside, the way a
visitor would. Every five minutes it walks the gateway and the website by
public URL as an anonymous visitor, then judges the three SLOs the contracts
publish. It remembers the last result in its own Durable Object and logs when
an SLO flips between holding and breached. It deliberately has no binding to
anything it watches, so a failure in the product cannot also break the
watcher.

| | |
|---|---|
| **Component** | `openproduct-synthetic` · `cloudflare-worker-turbo` |
| **System** | openproduct (sourceplane/orun-cloud `docs/systems/openproduct.md`) |
| **Owner** | platform |
| **Environments** | dev (verify on pull requests) · stage · prod (deploy on push to `main`) |

## What it does

Each cycle (`runCycle` in `src/index.ts`):

1. **Walks** the product (`src/walk.ts`). Each fetch has a 10 s timeout and
   sends the user agent `openproduct-synthetic/1`. The steps are:
   - the gateway's `/health`
   - the site's `/`, once with `no-cache` and once plain, to sample
     `cf-cache-status`
   - `/v1/products?limit=1`, to pick a seeded listing
   - `/v1/search?q=<slug>`
   - the listing page on the site
2. **Judges** the three SLOs from `@openproduct/contracts` (`src/slo.ts`):
   search freshness, count freshness and the front-page cache hit ratio. It also
   checks whether a new deploy (the gateway's `build` version) was verified
   within its grace period.
3. **Records** the verdicts in the `SyntheticState` Durable Object.
4. **Reports** flips as structured log lines (`slo_breached`, `slo_recovered`,
   `deploy_noticed`, `deploy_verified`, `deploy_unverified`,
   `synthetic_cycle`), which the saved Workers Logs queries look for. It sends
   an alert only when an alert channel is configured.

## Interfaces

| Kind | Detail |
|---|---|
| Cron trigger | `*/5 * * * *` in every environment (the contract's `SYNTHETIC_CRON`) |
| HTTP | `GET /` returns the last recorded state as JSON (`cache-control: no-store`); anything else is 404 or 405 |
| Durable Object | `SyntheticState`, bound as `SYNTHETIC_STATE`, SQLite-backed (migration tag `v1`) |

## Dependencies

There are no `dependsOn` edges and no service bindings, on purpose. It reaches
the product only over public HTTPS:

| Env | `API_ORIGIN` (gateway) | `SITE_ORIGIN` (website) |
|---|---|---|
| dev | `https://openproduct-gateway-dev.oruncloud.workers.dev` | `https://openproduct-web-dev.oruncloud.workers.dev` |
| stage | `https://openproduct-gateway-stage.oruncloud.workers.dev` | `https://openproduct-web-stage.oruncloud.workers.dev` |
| prod | `https://api.openproduct.live` | `https://openproduct.live` |

Build input: `@openproduct/contracts` (SLOs, cron, runbook, log vocabulary).

## Configuration

| Name | Kind | Notes |
|---|---|---|
| `ENVIRONMENT`, `API_ORIGIN`, `SITE_ORIGIN` | vars | in `wrangler.jsonc` |
| `SYNTHETIC_STATE` | Durable Object binding | the only resource it holds |
| `ALERT_DELIVERY_URL`, `ALERT_SEAM_SECRET`, `OPERATOR_SUBJECT_ID` | not set | All three are needed before an alert is sent. While they are unset, a flip is a log line and `alert_undeliverable` reports `no_channel` |
| `MAINTENANCE_UNTIL` | var, set in the dashboard | An ISO timestamp. Until then, flips are recorded and logged but not sent |

The compatibility flag `global_fetch_strictly_public` is needed to fetch
`*.workers.dev` hosts on the account's own zone. There is no `secretsWorker`
parameter, because no secret is delivered yet.

## Develop

```sh
pnpm exec turbo run test --filter=@openproduct/synthetic       # vitest: alert, config, cycle, slo, state, walk
pnpm exec turbo run build --filter=@openproduct/synthetic      # wrangler deploy --dry-run --outdir dist
pnpm exec turbo run typecheck --filter=@openproduct/synthetic
```

The tests sit next to the source in `src/*.test.ts`. `config.test.ts` asserts
that the only binding is the Durable Object, that every environment uses public
HTTPS origins, and that every environment declares the contract's cron.

## Deploy

`cloudflare-worker-turbo` composition with a committed `wrangler.jsonc` and no
template:

- **Pull request:** `verify` in dev.
- **Push to `main`:** `deploy` in stage and prod, which needs approval.
- The `buildCommand` runs the package's own tests before the build. No smoke
  command is configured.

## Related

- What it reads: [`openproduct-gateway`](../../gateway/README.md) `/health` · [`openproduct-web`](../../web/README.md)
- SLOs and runbook: [`openproduct-contracts`](../../packages/contracts/README.md) (`src/slo.ts`, `src/synthetic.ts`, `src/runbook.ts`). The runbook is published at `/docs/runbook` on the site
- `specs/epics/openproduct-operations/` (in sourceplane/orun-cloud) (OO0–OO3)
