# openproduct Website tests

`@openproduct/web-tests` is the Jest (ts-jest, ESM) suite for the
[openproduct Website](../../web/README.md). It imports the site's source
(`@/` and `@openproduct-web/*` → `web/src/*`) and `@openproduct/contracts`. It
tests the server-side helpers, route handlers and page modules without a
browser. Browser-driven checks are in [`tests/web-perf`](../web-perf/README.md).

| | |
|---|---|
| **Component** | `openproduct-web-tests` · `turbo-package` |
| **System** | openproduct (sourceplane/orun-cloud `docs/systems/openproduct.md`) |
| **Owner** | platform |
| **Environments** | dev (`verify`, on pull requests) |

## What it covers

About a hundred files under `src/`, grouped roughly as:

- **Routing and structure:** `routes`, `route-census`,
  `page-route-collision`, `navigation`, `not-found-status`,
  `sitemap-coverage`, `section-nav`.
- **Deploy and caching:**
  - `deploy-ordering` asserts the `openproduct-api-domain` →
    `openproduct-gateway` and `openproduct-web` → `openproduct-api-domain`
    edges.
  - `opennext-config` and `incremental-cache` cover `open-next.config.ts` and
    the Cache API incremental cache.
  - `stale-deploy` covers a page from the previous build after a deploy.
- **Auth and session:** `auth`, `auth-modal`, `authed-gate`,
  `cookie-is-not-authority`, `identity-cache`, `session-hint`.
- **Data clients:** `public-api` (no credential on public reads), `me-api`,
  `studio-api`.
- **Pages and features:** builds, listings, people and maker pages, threads and
  comments, topics, launches, leaderboard, digest feed, collections, pricing
  and stack pages, search, the studio, badges, OG cards, structured data.
- **UI conventions:** the "calm" design rules (`calm-*`), dark ramp, icons,
  tap target size (with `tools/target-size.mjs`), keyboard layer, mobile shell,
  and the gates that check the web-perf lanes are wired (`axe-gate`,
  `snapshots-gate`, `targets-gate`, `wire-budget`).
- **CI wiring:** `suite-scheduling` asserts that each source component runs its
  suite in `buildCommand`.

## Run it

```sh
pnpm exec turbo run test --filter=@openproduct/web-tests
pnpm exec turbo run typecheck --filter=@openproduct/web-tests
```

## How CI runs it

- `openproduct-web`'s `buildCommand` runs this suite before `next build`, and a
  failure stops the deploy (`folded-into: openproduct-web`).
- Its own dev lane runs it when files here change.
- It has no `dependsOn`, for the same reason as the
  [core suite](../core/README.md).

## Related

- Subject: [`openproduct-web`](../../web/README.md) · browser lanes: [`openproduct-web-perf`](../web-perf/README.md)
- `specs/epics/openproduct-performance/` (in sourceplane/orun-cloud) (the deploy-ordering incident)
