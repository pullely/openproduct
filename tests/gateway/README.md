# openproduct Gateway tests

`@openproduct/gateway-tests` is the Jest (ts-jest, ESM) suite for the
[openproduct Gateway](../../gateway/README.md). It imports the gateway's source
directly (`@openproduct-gateway/*` → `gateway/src/*`) and `@openproduct/contracts`,
and exercises the router, auth, seam and sweep with stubbed `CORE`, R2 and
`fetch`.

| | |
|---|---|
| **Component** | `openproduct-gateway-tests` · `turbo-package` |
| **System** | [openproduct](../../../../docs/systems/openproduct.md) |
| **Owner** | platform |
| **Environments** | dev (`verify`, on pull requests) |

## What it covers

| File | Guards |
|---|---|
| `bindings.test.ts` | `gateway/wrangler.jsonc`: exactly one service binding (`CORE`), `MEDIA` as the only data resource, the `RateLimitBucket` Durable Object, and both `SWEEP_CRON` expressions plus Workers Caching declared in every environment |
| `router.test.ts` | Public, authenticated and seam route dispatch, and that every mapped path is dispatched |
| `auth.test.ts`, `sign-in.test.ts`, `one-subject.test.ts`, `seam-resolver-live.test.ts` | Token-to-subject resolution, the password auth plane, the subject-by-email seam call |
| `seam.test.ts` | Seam webhook signature verification |
| `ratelimit.test.ts`, `velocity.test.ts` | Rate-limit buckets and per-subject write velocity |
| `media.test.ts`, `capture.test.ts` | Media upload and serving, screenshot capture |
| `github.test.ts` | The S8 repository read |
| `mcp.test.ts` | The MCP server |
| `sweep.test.ts`, `tags.test.ts`, `timing.test.ts`, `log-vocabulary.test.ts` | Sweep behaviour, cache-tag purges, `Server-Timing`, log line vocabulary |
| `suite-scheduling.test.ts` | Each source component runs its suite in `buildCommand` |

## Run it

```sh
pnpm exec turbo run test --filter=@openproduct/gateway-tests
pnpm exec turbo run typecheck --filter=@openproduct/gateway-tests
```

## How CI runs it

- `openproduct-gateway`'s `buildCommand` runs this suite before the gateway
  builds, and a failure stops the deploy (`folded-into: openproduct-gateway`).
- Its own dev lane runs it when files here change.
- It has no `dependsOn`, for the same reason as the
  [core suite](../core/README.md).

## Related

- Subject: [`openproduct-gateway`](../../gateway/README.md)
- Seam contract: [`specs/components/19-openproduct-seam.md`](../../../../specs/components/19-openproduct-seam.md)
