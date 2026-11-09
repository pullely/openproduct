# openproduct Website performance tests

`@openproduct/web-perf` runs the browser checks for openproduct.live. It builds
the real website, serves it with `next start` against a mock gateway that
returns a fixed corpus (`src/fixture.mjs`), and drives it with Playwright
Chromium. The lanes then check performance budgets, accessibility, tap targets
and visual snapshots. The scripts are plain ESM, with no TypeScript and no
build step.

| | |
|---|---|
| **Component** | `openproduct-web-perf` · `turbo-package` |
| **System** | [openproduct](../../../../docs/systems/openproduct.md) |
| **Owner** | platform |
| **Environments** | dev (`verify`, on pull requests) |

## What it covers

`node src/run.mjs` (the `test` script) runs every lane below against one build
and one server, and the exit code is the verdict:

| Lane | Module | Checks |
|---|---|---|
| `budgets` | `budgets.mjs` | JS bytes, document weight, reads and fonts per route. It first asserts each route rendered real content |
| `wire` | `wire.mjs` | Bytes, requests and hosts on the wire at both viewports |
| `a11y` | `a11y.mjs` | Accessibility walk |
| `axe` | `axe.mjs` | axe-core pass, light and dark, phone and desktop |
| `targets` | `targets.mjs` | 44 px tap-target floor at phone width |
| `chrome` | `chrome.mjs` | The account control is right on the first frame |
| `badge` | `badge.mjs` | The embeddable badge under load |
| `studio`, `studio-timing` | `studio.mjs`, `studio-timing.mjs` | The maker studio walk and its timing |
| `refresh` | `refresh.mjs` | Repeated `router.refresh()` / `replace()` calls each land |
| `authed` | `authed.mjs` | Every route under `/me/**` and `/studio/**`, signed in |
| `snapshots` | `snapshots.mjs` | Geometry and colour snapshots in `snapshots/*.json` (home, listing, forum, maker, topic, day and others; phone and desktop; light and dark) |

`walk` (a two-width route report) and `pixel` run only when named.
`src/probe.mjs` is a separate cold-render probe that reports and does not gate
(`pnpm --filter @openproduct/web-perf probe`).

## Run it

```sh
pnpm exec turbo run test --filter=@openproduct/web-perf --only   # all gating lanes
pnpm --filter @openproduct/web-perf budgets                      # one lane: budgets, wire, a11y, axe, targets, snapshots, walk, refresh, ...
pnpm --filter @openproduct/web-perf snapshots:update             # re-record snapshots (XP4_UPDATE_SNAPSHOTS=1)
```

Useful environment variables, which `turbo.json` passes through:

- `XP4_CHROMIUM` points at an existing browser binary. Otherwise the runner
  uses Playwright's own browser and installs Chromium if it is missing.
- `XP4_PORT` sets the server port (default 3187).
- Also `XP4_SKIP_BUILD`, `XP4_BAND`, `XP4_RUNS`, `XP4_UPDATE_SNAPSHOTS`,
  `PLAYWRIGHT_BROWSERS_PATH`, and the proxy variables.

## How CI runs it

- The dev lane runs `verify`. The lanes run in `preBuildCommand`
  (`pnpm exec turbo run test --filter=./ --only`); build and typecheck are
  echoes.
- `change.inputs: apps/openproduct/web/**` selects this component when the
  website's own files change, as well as its own. A change to a package the
  website bundles, such as `openproduct-contracts`, does not select it.
- There is no `dependsOn` and no workspace dependency on `@openproduct/web`,
  on purpose. `serve.mjs` builds the site itself, and an in-plan edge would let
  the job report success without running.
- `lane: isolated`: it runs on its own runner, for the Next.js build cache and
  browsers.

## Related

- Subject: [`openproduct-web`](../../web/README.md) · unit-level suite: [`openproduct-web-tests`](../web/README.md)
- [`specs/epics/openproduct-commons/`](../../../../specs/epics/openproduct-commons/README.md) (XP4) · [`specs/epics/openproduct-worldclass-v2/`](../../../../specs/epics/openproduct-worldclass-v2/README.md) (QE, the budgets in CI)
