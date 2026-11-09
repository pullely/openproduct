# openproduct Website

The openproduct.live website, package `@openproduct/web`. It is a Next.js 16
App Router app built with OpenNext for Cloudflare and deployed as the Worker
`openproduct-web-{env}` with static assets. It is both the public directory
(builds, people, threads, topics, launches, the digest) and the signed-in
surfaces: `/me` for contributors and `/studio` for makers who manage their
listings. It has no database or service binding. Every read and write goes to
the [openproduct Gateway](../gateway/README.md) over HTTPS.

| | |
|---|---|
| **Component** | `openproduct-web` · `cloudflare-workers-assets-turbo` |
| **System** | [openproduct](../../../docs/systems/openproduct.md) |
| **Owner** | platform |
| **Environments** | dev (verify on pull requests) · stage · prod (deploy on push to `main`) |
| **URL** | prod: <https://openproduct.live> (Custom Domain owned by [`openproduct-domain`](../infra/domain/README.md)) · stage: <https://openproduct-web-stage.oruncloud.workers.dev> |

## What it does

- Renders the public pages from the gateway's anonymous `/v1/public/...` and
  catalog routes. That client is `src/app/public-api.ts`, which builds its own
  `fetch` with no credential path. Public documents are byte-identical whether
  or not the visitor is signed in, so they are safe to share-cache.
  Personalisation (`/me/overlay`) loads after paint in a separate request.
- Caches public documents at two levels:
  - Workers Caching (`"cache": { "enabled": true }` in `wrangler.jsonc`)
    honours the pages' `s-maxage=60, stale-while-revalidate=240`.
  - On a miss, `open-next.config.ts` serves the document from the Workers Cache
    API and re-renders stale documents in the background through `worker.ts`.
  - `/me/*` sends `no-store` and bypasses both.
- Signs people in two ways. "Sign in with Orunbase" is an OAuth flow against
  the platform with the `identity` scope (`/auth/start`, `/auth/callback`). The
  password route (`/auth/password`) talks to the gateway server-side, so the
  browser never posts credentials cross-origin. `/auth/session` answers "who
  am I" for the chrome and refreshes the session cookie.
- Hosts the maker studio (`/studio`): link a workspace, edit details, media,
  people, topics, launches and discussions, and the operator queues (reports,
  appeals, collections). Form posts go to route handlers that call the gateway.
- Hands off to the Orunbase console for cross-product steps. These are seam URL
  edges (S5, S10, S12), built from `NEXT_PUBLIC_CONSOLE_ORIGIN`.
- Publishes the product's own docs pages (`/docs`, `/docs/api`, `/docs/checks`,
  `/docs/formulas`, `/docs/runbook`), a sitemap, digest feeds
  (`/digest/feed.json`, `/digest/feed.xml`), embeddable badges
  (`/badge/{slug}`) and OG images.

## Interfaces

Pages (App Router, `src/app/**/page.tsx`):

| Area | Paths |
|---|---|
| Directory | `/`, `/products/[cursor]`, `/builds/[order]`, `/search`, `/stack`, `/pricing`, `/topics`, `/launches/[day]`, `/collections`, `/transparency` |
| Listings | `/[slug]`, `/[slug]/forum`, `/[slug]/workspace` |
| People | `/people`, `/people/[handle]` and its tabs (`/@handle` is rewritten to `/people/handle` in `next.config.mjs`) |
| Discussion | `/threads`, `/threads/[id]`, `/threads/new`, `/threads/tag/[tag]` |
| Digest | `/digest`, `/digest/[week]` |
| Signed in | `/signin`, `/submit`, `/me`, `/me/saved`, `/me/notifications`, `/me/applications` |
| Studio | `/studio`, `/studio/link`, `/studio/[org]/[profile]/{details,media,people,topics,launches,discussions}`, `/studio/{reports,appeals,collections}` |
| Docs | `/docs`, `/docs/api`, `/docs/checks`, `/docs/formulas`, `/docs/runbook` |

Route handlers (`route.ts`) include `/auth/{start,callback,password,session,signout}`,
`/me/*` actions (endorse, save, follow, export, overlay and others), `/comment`,
`/report`, `/api/search`, `/api/builds/[cursor]`, `/badge/...`,
`/sitemap.xml` and `/icon.svg`.

## Dependencies

- **openproduct Gateway** at `NEXT_PUBLIC_OPENPRODUCT_API_URL`. That is
  `https://api.openproduct.live` in prod. Elsewhere `openproductApiBase()` falls
  back to `https://openproduct-gateway-{env}.oruncloud.workers.dev`.
- **Orunbase platform** (api-edge) for OAuth endpoint discovery, defaulting to
  `https://api-edge-{env}.oruncloud.workers.dev`, and the **Orunbase console**
  for hand-offs.
- **Build input:** [`openproduct-contracts`](../packages/contracts/README.md)
  (`input: true`, transpiled by Next).
- **Ordering:** depends on [`openproduct-api-domain`](../infra/api-domain/README.md),
  so `api.openproduct.live` exists before a prod build bakes it in.
  [`openproduct-domain`](../infra/domain/README.md) depends on this component,
  because the Custom Domain needs the Worker. This chain is acyclic, and
  `tests/web/src/deploy-ordering.test.ts` asserts it.

## Configuration

Build-time variables (`buildEnv` in `component.yaml`; values are public URLs):

| Name | dev | stage | prod |
|---|---|---|---|
| `NEXT_PUBLIC_CONSOLE_ORIGIN` | console dev workers.dev host | `https://stage.orunbase.com` | `https://app.orunbase.com` |
| `NEXT_PUBLIC_SITE_ORIGIN` | — | — | `https://openproduct.live` (canonical links, sitemap) |
| `NEXT_PUBLIC_OPENPRODUCT_API_URL` | — (fallback) | — (fallback) | `https://api.openproduct.live` |
| `NEXT_PUBLIC_DEPLOY_ENV` | set by the composition (`environmentBuildVar`) | | |

The code also reads `NEXT_PUBLIC_PLATFORM_API_URL` (optional override of the
platform base) and `NEXT_PUBLIC_OPENPRODUCT_ACCENT`. The only Worker binding is
`ASSETS` (`.open-next/assets`). There are no runtime secrets.

## Develop

```sh
pnpm --filter @openproduct/web dev                                 # next dev --webpack on port 3002
pnpm exec turbo run build --filter=@openproduct/web                # next build --webpack + opennextjs-cloudflare build
pnpm exec turbo run typecheck --filter=@openproduct/web
pnpm exec turbo run test --filter=@openproduct/web-tests           # Jest suite in tests/web
pnpm --filter @openproduct/web-perf test                           # browser lanes in tests/web-perf
```

The turbo `build` task is never cached (`turbo.json`). The OpenNext bundle is
not relocatable between runs.

## Deploy

`cloudflare-workers-assets-turbo` composition. It runs on its own runner
(`lane: isolated`) because the Next.js build cache and browsers are per runner.

- **Pull request:** the dev lane runs `verify` (install, build, verify the
  `.open-next` output, dry-run deploy).
- **Push to `main`:** stage and prod run `deploy`, which needs approval. The
  composition deploys `.open-next/worker.js` plus `.open-next/assets` under the
  per-environment name `openproduct-web-{env}` on the `oruncloud` workers.dev
  subdomain.
- The `buildCommand` runs [`@openproduct/web-tests`](../tests/web/README.md)
  before `next build`.
- **Smoke:** polls `${DEPLOYED_URL}/` for up to about 120 s until the page
  contains `openproduct`.
- The `openproduct.live` apex is attached afterwards by
  [`openproduct-domain`](../infra/domain/README.md), in prod only.

## Related

- Tests: [`tests/web`](../tests/web/README.md) · [`tests/web-perf`](../tests/web-perf/README.md)
- Webfonts: [`src/fonts/README.md`](src/fonts/README.md)
- Seam URL edges: [`specs/components/19-openproduct-seam.md`](../../../specs/components/19-openproduct-seam.md)
- [`specs/epics/openproduct-independence/`](../../../specs/epics/openproduct-independence/README.md) (the standalone site) · [`openproduct-performance`](../../../specs/epics/openproduct-performance/README.md) (caching, the 2026-09-09 hostname outage) · [`openproduct-studio`](../../../specs/epics/openproduct-studio/README.md)
