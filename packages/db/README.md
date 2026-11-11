# openproduct Database

`@openproduct/db` is openproduct's data layer. It contains the repository the
core worker uses for every read and write on the `openproduct` Postgres schema,
the migration ladder that defines that schema, and a self-contained migration
runner CLI that [`openproduct-db-migrate`](../../infra/db-migrate/README.md)
runs in CI. The generic pieces it needs from the platform (the SQL executor,
the UUID codec, content digests and the workspace-purge endpoint) are vendored,
so no `@saas/*` package is imported at runtime.

| | |
|---|---|
| **Component** | `openproduct-db` · `turbo-package` |
| **System** | openproduct (sourceplane/orun-cloud `docs/systems/openproduct.md`) |
| **Owner** | platform |
| **Environments** | dev only (`verify`); stage and prod are `skip` |

## Exports

| Entry | What |
|---|---|
| `@openproduct/db` (`src/index.ts`) | `createOpenproductRepository` (`src/repository.ts`), the subject registry used for erasure and export, and the record and input types |
| `@openproduct/db/executor` | The Hyperdrive → `postgres.js` SQL executor, with array and JSONB parameter handling |
| `@openproduct/db/ids` | Branded `Uuid` codec and public-ID helpers |
| `@openproduct/db/content` | `canonicalDocBody` / `docDigest`. The digest form is load-bearing, so do not change it |
| `@openproduct/db/purge` | The workspace purge registry and `purgeContext` (seam S7) |

Other contents:

- `src/manifest.ts` and `src/migrations/<id>/up.sql` are the ladder:
  `000_control_baseline` (the `_migrations.applied` tracking table) plus the
  `openproduct`-context migrations. Each entry is byte-identical (ID, path and
  checksum) to its twin in orun-cloud's `packages/db-migrations` manifest as of
  the repository cut; the twin-sync guard did not come along.
- `src/runner/` is the vendored migration runner. `cli.ts` is used as
  `openproduct-db-migrate <plan|apply> --env <stage|prod>`. `apply` reads the
  project from `SUPABASE_PROJECT_REF` and authenticates with
  `SUPABASE_ACCESS_TOKEN`, both resolved by orun from workspace secrets.

## Dependencies

- Runtime: `@openproduct/contracts` (workspace) and `postgres`.
- Dev: `@electric-sql/pglite` (an in-process Postgres for the pg suite).
- Depended on by [`openproduct-worker`](../../core/README.md) and
  [`openproduct-db-migrate`](../../infra/db-migrate/README.md), both
  `input: true`, so a change here schedules the migration job too.

## Develop

```sh
pnpm exec turbo run test --filter=@openproduct/db         # vitest
pnpm exec turbo run build --filter=@openproduct/db        # tsc -p tsconfig.build.json, copies migrations into dist/
pnpm exec turbo run typecheck --filter=@openproduct/db
pnpm --filter @openproduct/db baseline                    # scale baseline (OS0_BASELINE=1)
```

The suite includes:

- Unit tests for the executor, arrays and JSONB, and the subject registry.
- The pg suite in `src/pg/`. It applies the whole ladder to pglite once per run
  (`global-setup.ts`) and restores a fresh copy for each test.
- Scale tests in `src/scale/`.
- `migrations-lock.test.ts`, which checks every ladder entry hashes to its
  recorded checksum.
- `pg-driver-counts.test.ts`, which pins what the production postgres.js
  executor reports for write counts. The D1 trial's differential suite found
  it, and the trial itself retired at OPN1's no-go (`d1-slice-proof.md` in the
  epic).

### Adding a migration

1. Add `src/migrations/<id>/up.sql` and a manifest entry with its checksum.

The Postgres ladder stays: OPN1 ended in a no-go for D1, so OPN2 applies
this ladder to openproduct's own Supabase projects (openproduct-standalone
design §11).

## Deploy

`turbo-package` composition. The dev lane runs `verify` with
`preBuildCommand: pnpm exec turbo run test --filter=./`, then build and
typecheck. Stage and prod are `skip`. The migrations themselves ship through
[`openproduct-db-migrate`](../../infra/db-migrate/README.md) (openproduct's own
databases) and the platform's `db-migrations` (the live `openproduct` schema).

A change here does not schedule `openproduct-worker`. Redeploy the worker with
a `# ci:` marker in its `component.yaml` when a repository fix must ship.

## Related

- Schema design: `specs/epics/saas-openproduct/design.md` (in sourceplane/orun-cloud) §2
- `specs/epics/openproduct-independence/` (in sourceplane/orun-cloud) (OX5c, OX6a) · `CUTOVER-RUNBOOK.md` (sourceplane/orun-cloud `specs/epics/openproduct-independence/CUTOVER-RUNBOOK.md`)
- `specs/epics/openproduct-verification/` (in sourceplane/orun-cloud) (OV3, the fast pg suite)
