# openproduct media bucket

Terraform for openproduct's own Cloudflare R2 bucket, one per environment, which
holds the bytes behind listing media (hero, gallery and captured screenshots).
Postgres keeps only the index rows (`openproduct.product_media`). The
[gateway](../../gateway/README.md) binds the bucket as `MEDIA` and both writes
uploads to it and serves them from it.

| | |
|---|---|
| **Component** | `openproduct-media` · `terraform` |
| **System** | openproduct (sourceplane/orun-cloud `docs/systems/openproduct.md`) |
| **Owner** | platform |
| **Environments** | stage · prod — `plan-only` on pull requests, `apply` on push to `main`. There is no dev bucket, because the gateway's dev environment binds none |

## What it provisions

| Resource | What |
|---|---|
| `cloudflare_r2_bucket.media` | `openproduct-media-<env>`, location hint `ENAM` by default (`r2_location_hint`, fixed at creation) |

Outputs: `openproduct_media_bucket_name`. Nothing is published: the gateway binds the bucket by its committed name.

### Object layout

Objects are content-addressed and immutable:

```
media/{sha256}.{png|jpg|webp}        the original, as uploaded
media/{sha256}/w{400|800|1600}.webp  derivatives generated at upload
```

Two makers who upload the same file share one object, so deleting a row never
deletes an object.

## Dependencies

- **Consumer:** [`openproduct-gateway`](../../gateway/README.md) declares a
  `dependsOn` edge to this component. Its `wrangler.jsonc` binds `MEDIA` by
  bucket name (`openproduct-media-stage`, `openproduct-media-prod`), because R2
  binds by name. A deploy that binds a bucket that does not exist fails. The
  gateway's binding allowlist test names this bucket as the one data resource
  the gateway may hold.

## Prerequisites

- R2 must be enabled on the Cloudflare account. It has been since 2026-06-15.
- Image Resizing, which the derivatives use, is a zone feature this component
  does not manage. Enable it in the dashboard for the zone that serves the
  gateway, then set the gateway's `MEDIA_RESIZING` var to `"true"`. Until then
  the original is served at every width.

## Deploy

`terraform` composition, stack `openproduct-media`, Terraform 1.15.3, providers
`cloudflare ~> 4.52`. State is on the platform (http backend). The token is
`CLOUDFLARE_R2_TOKEN`, brokered from the `openproduct` Cloudflare connection
(`r2-data`), on stage and prod.

## Related

- [`openproduct-gateway`](../../gateway/README.md) (`src/media.ts`, `src/capture.ts`)
- `specs/epics/openproduct-worldclass/` (in sourceplane/orun-cloud) (MD1, listing media)
