# openproduct Hyperdrive

Terraform for openproduct's own Cloudflare Hyperdrive config, one per
environment, in front of openproduct's own Supabase database. It is the
orun-cloud `openproduct-hyperdrive` stack (`ffb71be69`), with state moved to
the platform and AWS removed (openproduct-standalone design §11). The origin
comes from the secrets `openproduct-supabase` publishes, and the result is
published as a wiring secret that core's wrangler template resolves at deploy
time.

| | |
|---|---|
| **Component** | `openproduct-hyperdrive` · `terraform` |
| **Owner** | platform |
| **Environments** | stage · prod — `plan-only` on pull requests, `apply` on push to `main` |

> **Not yet consumed.** core's template still names the fixture's
> `@@wiring(cloudflare-hyperdrive/<env>:hyperdrive_id)@@`, and core only
> verifies. Going live (OPN2's last task) switches those tokens to
> `openproduct-hyperdrive/<env>` and reads `WIRING_OPENPRODUCT_HYPERDRIVE_<ENV>`.

## What it provisions

| Resource | What |
|---|---|
| `cloudflare_hyperdrive_config.postgres` | Hyperdrive `<namespacePrefix>openproduct-<env>` (`stg-openproduct-stage`, `prod-openproduct-prod`), origin `postgres://postgres@db.<ref>.supabase.co:5432/postgres`, caching enabled |

Outputs: `wiring` (published), `hyperdrive_id`, `hyperdrive_name`,
`hyperdrive_connection_string`, and the sensitive `database_host`.

## Inputs

| Name | Source |
|---|---|
| `CLOUDFLARE_API_TOKEN` | `CLOUDFLARE_HYPERDRIVE_TOKEN`, brokered from the `openproduct` Cloudflare connection (`hyperdrive-edit`). The workers-deploy token cannot touch Hyperdrive |
| `cloudflare_account_id` | `CLOUDFLARE_ACCOUNT_ID` (`account-id`) |
| `supabase_project_ref`, `supabase_db_password` | `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, published by `openproduct-supabase`. Required, with no default |

## Outputs to secrets

| Secret | Output |
|---|---|
| `WIRING_OPENPRODUCT_HYPERDRIVE` | `wiring`: `{"hyperdrive_id": …, "hyperdrive_name": …}` |

## Deploy

`terraform` composition, stack `openproduct-hyperdrive`, Terraform 1.15.3,
provider `cloudflare ~> 4.30`. State is on the platform (http backend).

- Depends on [`openproduct-supabase`](../supabase/README.md), so in a run that
  holds both it applies after it.
- `dependsOn` does not pull this component into a `--changed` plan. When its
  origin changes but its own files do not (a new database password, say), add
  a `# ci:` marker line to `component.yaml` to schedule it.

## Related

- [`openproduct-supabase`](../supabase/README.md) · [`openproduct-db-migrate`](../db-migrate/README.md) · [`openproduct-worker`](../../core/README.md)
