# openproduct apex domain

Terraform that serves the openproduct website on its apex, `openproduct.live`.
It finds the zone, or creates it in `managed` mode, and attaches the apex to the
`openproduct-web-{env}` Worker as a Workers Custom Domain. Like
[`openproduct-api-domain`](../api-domain/README.md), it does anything only where
`OPENPRODUCT_CUSTOM_DOMAIN` is set, which today is prod.

| | |
|---|---|
| **Component** | `openproduct-domain` · `terraform` |
| **System** | openproduct (sourceplane/orun-cloud `docs/systems/openproduct.md`) |
| **Owner** | platform |
| **Environments** | stage (plans to nothing) · prod — plan on pull requests, apply on push to `main` |
| **URL** | <https://openproduct.live> (prod) |

## What it provisions

All resources have `count = 0` when `OPENPRODUCT_CUSTOM_DOMAIN` is empty.

| Resource | What |
|---|---|
| `data.cloudflare_zone.openproduct_existing` | Adopts an existing zone (`openproductZoneMode = "existing"`, the default; the zone was added to the Cloudflare account by hand) |
| `cloudflare_zone.openproduct_managed` | Creates the zone on the free plan when `openproductZoneMode = "managed"` |
| `cloudflare_workers_domain.openproduct` | Custom Domain `openproduct.live` → service `openproduct-web-<env>`, environment `production` |

Output: `openproduct_domain`, which is the apex or an empty string.

The `api.openproduct.live` record and Route moved out of this module into
[`openproduct-api-domain`](../api-domain/README.md). A comment in `main.tf`
records why.

## Inputs

| Variable | Source |
|---|---|
| `OPENPRODUCT_CUSTOM_DOMAIN` | `intent.yaml` `parameterDefaults.terraform` (prod: `openproduct.live`; unset elsewhere). Not declared in `component.yaml` on purpose. Setting it back to `""` and converging detaches the domain |
| `openproductZoneMode` | `existing` (default) or `managed` |
| `workerNamePrefix` | `openproduct-web` (component parameter) |
| `cloudflare_api_token`, `cloudflare_account_id` | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in the CI environment |

## Dependencies

- [`openproduct-web`](../../web/README.md): the Custom Domain attaches to the
  Worker by name, so the Worker must exist first.
- `cloudflare-domain` (`infra/terraform/cloudflare-domain` (in sourceplane/orun-cloud)):
  this orders the cutover that moved the apex off the console Worker, so that
  two components never claim the hostname at once. The `component.yaml` notes
  say this edge can be dropped once that cutover has converged.

## Deploy

`terraform` composition, stack `openproduct-domain`, Terraform 1.15.3,
providers `cloudflare ~> 4.52` and `aws ~> 5.0`. State is in the orun-managed
S3 backend (`workspace_key_prefix = "env"`, lockfile enabled).

- **Pull request:** `plan-only` in stage and prod.
- **Push to `main`:** `apply` in stage and prod.

The Cloudflare provider is pinned to v4, which names the resource
`cloudflare_workers_domain`. Moving to v5 needs a rename to
`cloudflare_workers_custom_domain` and a state move.

## Related

- [`openproduct-api-domain`](../api-domain/README.md) · [`openproduct-web`](../../web/README.md)
- `specs/epics/openproduct-independence/` (in sourceplane/orun-cloud) (OX2, the standalone site on its own apex)
