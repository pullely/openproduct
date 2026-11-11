# openproduct Supabase projects

Terraform for openproduct's own Postgres: one Supabase project per environment
(`openproduct-stage`, `openproduct-prod`) in the `openproduct` Supabase
organization. The generated credentials leave as job outputs and land in the
environment's workspace secrets. It is the orun-cloud `openproduct-supabase`
stack (`ffb71be69`), with state moved to the platform and AWS removed
(openproduct-standalone design §11).

| | |
|---|---|
| **Component** | `openproduct-supabase` · `terraform` |
| **Owner** | platform |
| **Environments** | stage · prod — `plan-only` on pull requests, `apply` on push to `main` |

## What it provisions

| Resource | What |
|---|---|
| `random_password.db_password` | 32-character database password |
| `supabase_project.this` | Project `openproduct-<env>` in the organization `SUPABASE_ORG_ID` names, region `supabaseRegion` (`ap-southeast-1`) |

Outputs: `project_ref`, `project_name`, `project_url`, and the sensitive
`database_password` and `connection_uri`.

## Inputs

| Name | Source |
|---|---|
| `supabaseRegion` | Component parameter, passed as `TF_VAR_supabaseRegion` |
| `supabaseOrgId` | `TF_VAR_supabaseOrgId` from the `SUPABASE_ORG_ID` secret, brokered from the `openproduct` Supabase connection (`org-id`). Required, with no default |
| Supabase auth | `SUPABASE_ACCESS_TOKEN`, brokered from the same connection (`management-access`): a Management API token minted per run |

Both secrets are brokered on each environment's rung and name the connection
by id (`int_cc19cfd5…`), because the workspace also inherits the `arca-orun`
Supabase connection.

## Outputs to secrets

After each apply, the terraform composition publishes three outputs to that
environment's secrets (`secretOutputs` in `component.yaml`):

| Secret | Output |
|---|---|
| `SUPABASE_PROJECT_REF` | `project_ref` |
| `SUPABASE_DB_PASSWORD` | `database_password` |
| `SUPABASE_DB_URL` | `connection_uri` |

## Consumers

- `openproduct-hyperdrive` reads `SUPABASE_PROJECT_REF` and
  `SUPABASE_DB_PASSWORD` to build its Hyperdrive origin.
- `openproduct-db-migrate` reads `SUPABASE_PROJECT_REF` to apply the migration
  ladder through the Management API.

Both arrive in the task after this one, so their pull-request plans read
secrets that already exist.

## Deploy and runbook notes

`terraform` composition, stack `openproduct-supabase`, Terraform 1.15.3,
providers `supabase ~> 1.5.1` and `random ~> 3.0`. State is on the platform
(http backend).

- The provider stays below 1.6. From 1.6.0 it reads Supabase's billing
  endpoints on every project read, and those refuse OAuth tokens, which is
  what the connection brokers.
- A Supabase plan limit (two active projects on the free plan) fails the
  project create. The apply then fails loudly, and re-applying converges once
  the organization can hold the project.
- The database password is config-driven. Replacing `random_password`
  resets the database password, and the same apply publishes the new one;
  Hyperdrive and the Workers pick it up on their next apply and deploy.
- CI plans with `--changed`, so to re-run this stack when nothing in this
  directory changed, add a `# ci:` marker line to `component.yaml`.
