# openproduct API domain

Terraform that puts the openproduct gateway on its canonical hostname,
`api.openproduct.live`. It creates a proxied placeholder DNS record and a Worker
Route on the `openproduct.live` zone that sends `api.openproduct.live/*` to the
`openproduct-gateway-{env}` Worker. It acts only where `OPENPRODUCT_CUSTOM_DOMAIN`
is set, which today is prod. In every other environment it plans to nothing.

| | |
|---|---|
| **Component** | `openproduct-api-domain` · `terraform` |
| **System** | openproduct (sourceplane/orun-cloud `docs/systems/openproduct.md`) |
| **Owner** | platform |
| **Environments** | stage (plans to nothing) · prod — plan on pull requests, apply on push to `main` |
| **URL** | <https://api.openproduct.live> (prod) |

## What it provisions

All resources have `count = 0` when `OPENPRODUCT_CUSTOM_DOMAIN` is empty.

| Resource | What |
|---|---|
| `data.cloudflare_zone.openproduct` | Looks up the `openproduct.live` zone. It only reads the zone; [`openproduct-domain`](../domain/README.md) owns it |
| `cloudflare_record.openproduct_api` | `AAAA api → 100::`, proxied. This is the discard prefix, so the origin is never contacted; the record only exists so the Route can match |
| `cloudflare_worker_route.openproduct_api` | Pattern `api.<apex>/*` → script `openproduct-gateway-<env>` |

Output: `openproduct_api_hostname`, which is the hostname or an empty string.

## Inputs

| Variable | Source |
|---|---|
| `OPENPRODUCT_CUSTOM_DOMAIN` | `intent.yaml` `parameterDefaults.terraform` (prod: `openproduct.live`; unset elsewhere). Deliberately not declared in `component.yaml`, because a default there would shadow the per-environment value |
| `apiSubdomain` | default `api` |
| `gatewayNamePrefix` | `openproduct-gateway` (component parameter) |
| `cloudflare_api_token`, `cloudflare_account_id` | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in the CI environment |

## Why it is its own component

The `api.` record and Route used to live in `openproduct-domain`, which depends
on `openproduct-web`. A prod website build that bakes in `api.openproduct.live`
then ran before the hostname existed, and openproduct.live failed for about 50
minutes on 2026-09-09. The fix was to split the hostname out:

```
openproduct-api-domain -> openproduct-gateway   (the Route names the gateway script)
openproduct-web        -> openproduct-api-domain
openproduct-domain     -> openproduct-web
```

Keep this chain acyclic:

- Do not add a dependency on `openproduct-domain` here. That would bring the
  cycle back through `openproduct-web`.
- On an estate where the zone does not exist yet, the zone data source fails
  and the apply fails. That is a transient failure, and the next run clears it
  once the zone exists.
- [`tests/web/src/deploy-ordering.test.ts`](../../tests/web/README.md) asserts
  both halves of the chain.
- The Route is not declared in the gateway's `wrangler.jsonc`, so the hostname
  has a single owner.

## Deploy

`terraform` composition, stack `openproduct-api-domain`, Terraform 1.15.3,
providers `cloudflare ~> 4.52` and `aws ~> 5.0`. State is in the orun-managed
S3 backend (`workspace_key_prefix = "env"`, lockfile enabled).

- **Pull request:** `plan-only` in stage and prod.
- **Push to `main`:** `apply` in stage and prod.

## Related

- Gateway: [`openproduct-gateway`](../../gateway/README.md) · apex: [`openproduct-domain`](../domain/README.md)
- `specs/epics/openproduct-performance/` (in sourceplane/orun-cloud) (OPP3, the 2026-09-09 outage)
