# openproduct Contracts

`@openproduct/contracts` is the source-only TypeScript package that defines what
every openproduct app agrees on. It holds the public projection types and
their pinned key sets, request and response shapes, the catalog API and its
OpenAPI document, the MCP tool list, seam constants, sweep schedules, SLOs, the
runbook and the formulas used for ranking and trust. It has no runtime
dependencies. The core worker, the gateway, the website, the synthetic monitor
and the db package all import it.

| | |
|---|---|
| **Component** | `openproduct-contracts` · `turbo-package` |
| **System** | openproduct (sourceplane/orun-cloud `docs/systems/openproduct.md`) |
| **Owner** | platform |
| **Environments** | dev only (`verify`); stage and prod are `skip`, because a package deploys nowhere |

## Exports

From `package.json` `exports`:

| Entry | What |
|---|---|
| `@openproduct/contracts` (`src/index.ts`) | Everything below, re-exported from about 80 modules |
| `@openproduct/contracts/errors` | The wire error envelope and `ERROR_CODES`, vendored byte-for-byte from the platform contracts |
| `@openproduct/contracts/timing` | The `Server-Timing` phase timer, also vendored |

Main areas of `src/`:

- **Public projection.** `PublicProfileCard`, `PublicProfile` and their
  `PUBLIC_*_KEYS` allowlists (also for threads, posts, collections, launches,
  flags, and others). The shapes are written out by hand rather than derived
  from internal types, and tests pin the exact key sets. A new public field
  therefore needs a deliberate edit here.
- **APIs.** `catalog-api.ts`, `openapi.ts`, `api-changelog.ts`, `pagination.ts`,
  `rate-limits.ts`, `velocity.ts`, and `agent.ts` (the MCP server name and its
  tools).
- **Auth and seam.** `credentials.ts`, `sessions.ts` (the `ops_` token
  prefix), and seam path constants such as `SEAM_SUBJECT_BY_EMAIL_PATH`.
- **Operations.** `sweep-schedule.ts` (`SWEEP_CRON`: materialisation
  `*/10 * * * *`, ingestion `23 * * * *`), `sweep-health.ts` (phases and
  staleness), `slo.ts` (the three SLOs), `synthetic.ts` (`SYNTHETIC_CRON`),
  `runbook.ts` and `log-vocabulary.ts`.
- **Product rules.** Ranking, trust, endorsements, integrity, defence,
  launches, the board, the digest, moderation, appeals, discussions, topics,
  stacks, pricing, media and capture, snapshots, badges and structured data.

## Dependencies

None at runtime. The only dev dependencies are `@saas/tsconfig` and
`@saas/eslint-config`. Consumers include it with `input: true` (core through
`openproduct-db`, plus the gateway and the website), so a change here rescopes
those components in `--changed` plans.

## Develop

```sh
pnpm exec turbo run test --filter=@openproduct/contracts       # vitest, src/*.test.ts
pnpm exec turbo run build --filter=@openproduct/contracts      # tsc --noEmit
pnpm exec turbo run typecheck --filter=@openproduct/contracts
```

## Deploy

`turbo-package` composition. The dev lane runs the `verify` profile with
`preBuildCommand` (tests), then build and typecheck, on pull requests. It is
skipped on `main`, which does not re-verify what the PR verified. Stage and prod
are `skip`. There is nothing to deploy.

## Related

- Consumers: [core](../../core/README.md) · [gateway](../../gateway/README.md) · [web](../../web/README.md) · [synthetic](../../infra/synthetic/README.md) · [db](../db/README.md)
- Projection contract: `specs/epics/saas-openproduct/design.md` (in sourceplane/orun-cloud) §4
- Seam contract: `specs/components/19-openproduct-seam.md` (in sourceplane/orun-cloud)
