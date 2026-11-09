# openproduct Core Worker tests

`@openproduct/core-tests` is the Jest (ts-jest, ESM) suite for the
[openproduct Core Worker](../../core/README.md). It imports the worker's source
directly (`@openproduct-worker/*` → `core/src/*`) along with `@openproduct/db`
and `@openproduct/contracts`, and drives the router and handlers with injected
stub dependencies in place of the database. It also includes the structural
guards that keep openproduct isolated from the platform.

| | |
|---|---|
| **Component** | `openproduct-worker-tests` · `turbo-package` |
| **System** | [openproduct](../../../../docs/systems/openproduct.md) |
| **Owner** | platform |
| **Environments** | dev (`verify`, on pull requests) |

## What it covers

- **Security guards**
  - `bindings.test.ts` reads `core/wrangler.template.jsonc` and fails on any
    service binding. The allowed list is empty.
  - `import-boundary.test.ts` checks that no file outside the allowlist imports
    an openproduct symbol.
  - `saas-import-boundary.test.ts` checks that nothing under `apps/openproduct`
    imports `@saas/*`.
  - `public-projection.test.ts` checks the public projection.
- **Routing and plumbing:** `router.test.ts`, `catalog-api.test.ts`,
  `timing.test.ts`, and `request-scope.test.ts`, which checks that each
  request's database clients are disposed.
- **Handlers**, one file per area: appeals, auth, board, captures, catalogue,
  collections, defence sweep, demand, digest and digest mail, discussions and
  forum, endorsements, feed, follows, inbox, integrity sweep, launches,
  leaderboard, maintainer writes, maker, `me`, media, moderation, reports,
  roster, search, sessions, sidebar, signals, snapshots, sweep state, topics,
  transparency, and others.
- **Seam:** `seam-fixtures.test.ts` checks payloads against the shared fixtures
  in `apps/openproduct/seam-fixtures/`.
- **CI wiring:** `suite-scheduling.test.ts` asserts that the core, gateway and
  web components each run their test suite in `buildCommand`.
- **Operator script:** `scripts/purge-test-data.mjs` removes named test
  listings through the moderation door. It refuses to run once the catalogue
  has more than ten listings. `purge-test-data.test.ts` covers it.

## Run it

```sh
pnpm exec turbo run test --filter=@openproduct/core-tests
pnpm exec turbo run typecheck --filter=@openproduct/core-tests
```

## How CI runs it

- `openproduct-worker`'s `buildCommand` runs this suite before every build of
  the worker, in every lane, and a failure stops the deploy. The label
  `folded-into: openproduct-worker` records this.
- The component's own dev lane (`verify`, `preBuildCommand`) runs it when files
  in this directory change.
- It deliberately has no `dependsOn`. On a pull request an in-plan dependency
  made the job report success without running anything.

## Related

- Subject: [`openproduct-worker`](../../core/README.md)
- Design: [`specs/epics/saas-openproduct/design.md`](../../../../specs/epics/saas-openproduct/design.md) §3 (the binding allowlist)
- [`specs/epics/openproduct-verification/`](../../../../specs/epics/openproduct-verification/README.md)
