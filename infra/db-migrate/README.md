# openproduct database migrations

Applies openproduct's migration ladder to its own Postgres databases: the
stage and prod Supabase projects that
[`openproduct-supabase`](../supabase/README.md) creates. The migrations, the
manifest and the runner CLI live in [`openproduct-db`](../../packages/db/README.md).
This component is the CI job that builds that package and runs the CLI. It is
the orun-cloud `openproduct-db-migrate` component (`ffb71be69`), with the AWS
read replaced by a workspace secret (openproduct-standalone design §11).

| | |
|---|---|
| **Component** | `openproduct-db-migrate` · `db-migrate` |
| **Owner** | platform |
| **Environments** | stage · prod — `plan` on pull requests, `apply` on push to `main` (and on a dispatch from Orunbase) |

## What it does

- Builds `@openproduct/db` (`buildFilter: "@openproduct/db"`, read by
  stack-tectonic 0.22.0 and later). The built `dist/runner/cli.js` is
  self-contained, with the platform runner vendored in.
- **plan:** runs offline. It verifies the manifest checksums against the SQL
  files and lists the ladder, without connecting to a database.
- **apply:** reads the project from `SUPABASE_PROJECT_REF`, takes an advisory
  lock and applies each pending migration in a transaction through the
  Supabase Management API, recording it in `_migrations.applied`.

## Inputs

| Name | Value / source |
|---|---|
| `path` | `packages/db/src/migrations` |
| `buildFilter` | `@openproduct/db` |
| `SUPABASE_ACCESS_TOKEN` | Brokered from the `openproduct` Supabase connection (`management-access`). Required for `apply` |
| `SUPABASE_PROJECT_REF` | Published by `openproduct-supabase` after its apply. Required for `apply` |

If a migration run reports `Packages in scope: @saas/db`, the `buildFilter`
parameter is not reaching the composition. The first sign is a
`MODULE_NOT_FOUND` from the apply step.

## Change detection

`openproduct-db` is an input edge, so any change under `packages/db` (a new
migration among them) schedules this component in a `--changed` plan. Apply
is idempotent: it skips every migration already recorded, and refuses one
whose checksum changed. To run it when nothing changed, add a `# ci:` marker
line to `component.yaml`, or dispatch it from Orunbase.

## Dependencies

- [`openproduct-db`](../../packages/db/README.md): the ladder and the runner.
- [`openproduct-supabase`](../supabase/README.md): the databases and the
  `SUPABASE_PROJECT_REF` secret.

## Related

- [`openproduct-db`](../../packages/db/README.md) · [`openproduct-supabase`](../supabase/README.md) · [`openproduct-hyperdrive`](../hyperdrive/README.md)
