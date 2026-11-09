# openproduct-standalone (OPN) — implementation status

As-built ≠ intent. This file records what actually shipped, and every place
the code departed from `design.md`.

| Milestone | State | PR |
|---|---|---|
| OPN0 — the spec | | |
| OPN1 — the tree, with D1 proven on one slice | | |
| OPN2 — live on its own URLs, all on D1 | | |
| OPN3 — openproduct.live served from here | | |
| OPN4 — openproduct, listed on openproduct.live | | |

## Inputs

- Source: `sourceplane/orun-cloud` `origin/main` `b421bc672` (2026-11-09). The cut is re-taken at OPN-2, and that commit is the one recorded here: `ffb71be69`, whose `apps/openproduct/` is byte-identical to `b421bc672`'s (see "OPN1 — as built (so far)").
- The cut script and the public-exposure audit were re-checked on 2026-11-09. Findings are in design §2 and §7.

## Estate (as created)

| Thing | Value |
|---|---|
| Account | openproduct account `ws_SMS84Q22` (account kind `openproduct`) |
| Workspace | `ws_VTNEQKAP`, `openproduct`, slug `openproduct-live`, public (2026-11-09) |
| Project and repo link | `openproduct` ← `github.com/pullely/openproduct`, allow-listed for the OIDC exchange |
| GitHub | `pullely/openproduct`, public. First commit `7475226` (README, LICENSE, .gitignore) |
| Cloudflare connection | `openproduct` (`int_7fbdaafa…`), inherited from the account |
| Epic in Orunbase | `openproduct-standalone`, EP-1 (`epc_0TXVHJ8Z`) |
| Milestones | OPN0 `mls_VEMWNC1J` · OPN1 `mls_GPBDDEE7` · OPN2 `mls_GQ855EQV` · OPN3 `mls_QJP277KN` · OPN4 `mls_GFTKS4Q0` |
| Tasks | OPN-1 `tsk_N14BB1XD` (OPN0, done: merged as `1fc8305`, PR #1) · OPN-2 `tsk_85D0P8WW` (OPN1, contract attached) |
| Project environments | `dev`, `stage`, `prod`, created through `POST …/projects/{prj}/environments` on 2026-11-09. A baseline bootstrap creates them; this repository never had one, and secret authoring refused until they existed |
| Stage secrets | `CLOUDFLARE_API_TOKEN` (`workers-deploy`), `CLOUDFLARE_ACCOUNT_ID` (`account-id`), `CLOUDFLARE_D1_TOKEN` (`d1-edit`), `CLOUDFLARE_WORKERS_SUBDOMAIN` (`workers-subdomain`): all brokered from connection `int_7fbdaafa…`. `PROBE_TOKEN`: static, random, set from stdin. None has a prod counterpart yet |

## D1 slice proof

### Local half: done ahead of OPN1 (2026-11-09) — GO, with conditions

This ran in a scratch copy of the cut (orun-cloud `b421bc672`), outside this
repository. OPN-2 carries it into the tree.
- **Engine.** Local D1 is real workerd SQLite (miniflare `5.20261104.0-beta`).
- **Scope.** All six slice methods run on D1 behind the unchanged repository interface. The Postgres implementation and its tests are untouched.
- **Differential suite.** 41 cases (19 catalogue, 22 search), with Postgres as the oracle: **0 mismatches.** Results are compared field by field, including order, cursors, census windows, `RETURNING` counts and ISO timestamps, and the tables each method writes are compared row by row. The cases:
  - every existing test case for the slice, ported;
  - the empty or never-computed catalogue, a cursor past the end, a null-activity cursor, the four ways a listing stops being listed, and a quiet tick that writes nothing;
  - emoji, CJK and accented slugs, ordered by bytes;
  - a 5,000-document replace in two chunks, plus a forced 40-chunk run.
- **Test counts.** The db package, run alone: 649 passed, 12 opt-in skipped (the 569 existing tests plus 80 new D1 tests). The 80 D1 tests were re-run and confirmed on 2026-11-09.
- **Query plans.** EXPLAIN on D1 shows one full scan, the rebuild's read of `profiles`, which is by design. Postgres made 6 sequential scans on the same statements. D1's search is index-driven, where Postgres scanned `search_index` sequentially.

| Operation (5,000 listings) | PGlite | Local D1 |
|---|---|---|
| Catalogue rebuild, cold | 486–638 ms | 483–658 ms |
| Catalogue rebuild, quiet tick | 381–415 ms | 372–471 ms |
| Catalogue page, first or deep | 2.3 ms | 8–9 ms wall, 1–1.5 ms SQL |
| `replaceSearchIndex`, 5,000 documents, cold | 91–101 ms | 178–188 ms (7 statements, 1 batch) |
| `searchCandidates` | 0.6–2.4 ms | 3–6 ms wall, ≤ 1 ms SQL |

Local timings are not remote timings. With the factory's ~0.3 s per remote
write statement, the estimate is about 1.2–1.5 s per rebuild tick and about
2.2 s per 5,000-document replace. Both are inside design §5.3.

The incompatibilities found are now rules in design §3.3 and §3.4:
- the 32-argument function limit;
- the 50-byte pattern limit;
- REAL-bound numbers;
- `NULLS` refused in indexes;
- join order not kept;
- NUL handling;
- the missing or blocked functions.

Two of these limits (32 arguments, 2 MB per value) are not enforced by local
workerd. That is why the static remote-limits guard exists.

### Remote half: open, OPN1

The probe on stage (design §5.2) is still to run. It must show three things:
- every remote result equals local;
- the 1.3 MB, 7-statement replace batch is accepted;
- remote D1 refuses the three negative probes.

It also records the rebuild's single-writer pause. The formal go/no-go is
written here after that run.

## OPN1 — as built (so far)

Task OPN-2, branch `orun/OPN-2-the-tree`. The D1 probe is integrated. Still
to come: its remote run (which happens on this branch's merge), the remote
timings, the go/no-go, and a green CI on `main`.

### The D1 probe

- **`infra/cloudflare-d1-probe`** (terraform, stage only): one D1 database, `openproduct-probe-stage`, location hint `apac`, with read replication on so session reads can be measured. State is on the platform (`backend "http"`). It publishes `WIRING_CLOUDFLARE_D1_PROBE`. A variable check refuses any environment but stage. It uses cloudflare provider `~> 5.28` (cirrus is on 4.30), because `primary_location_hint` and `read_replication` exist only in v5.
- **`infra/d1-probe`** (Worker `openproduct-d1-probe`, stage only):
  - Its routes are `/schema`, `/reset`, `/load`, `/bench`, `/negative` and `/export`. Every one requires `PROBE_TOKEN`, compared in constant time, and anything else is a bare 404.
  - Its smoke (`scripts/probe-run.mjs`) runs after the stage deploy: it loads the full corpus, benches 50 runs per operation, sends the negative probes, diffs `/export` against `expected/full.json` (generated from local D1), and prints one JSON report into the run log.
  - Local result: 12 Worker tests pass on real workerd, and an opt-in full-size run (5,000 listings × 365 days) equals its snapshot.
- **Plan on a merge to `main`:** `cloudflare-d1-probe.stage.terraform` (apply), then `openproduct-d1-probe.stage` (deploy and smoke). Those are the only two non-verify jobs out of 20.
- **Departure from design §5.2 ("run on demand by dispatch"):** the probe runs on the merge that changes it. `openproduct-db` is an ordering edge, not an input, so later `packages/db` changes don't re-run it; bumping `infra/d1-probe/RUN` does. A full run writes about 8 M D1 rows and takes about 10 minutes, so it must not repeat on every merge.
- **Not covered:**
  - Replication on versus off is approximated inside one database: plain-binding reads, which go to the primary, are compared against session reads.
  - The recovery after a refused cold replace is untested, because local D1 cannot be made to refuse it.
  - The probe needs the account on Workers Paid (`limits.cpu_ms`, 1,000 queries per invocation).

### The cut

- **Source:** `sourceplane/orun-cloud` `ffb71be69`. `git diff b421bc672 ffb71be69 -- apps/openproduct` is empty, so the tree is the one `tooling/fork/openproduct-cut.mjs` cut at `b421bc672` (the scratch repository's first commit), plus the local D1 slice proof's commits on top (`packages/db/src/d1/**`, its harness, differential and scale suites, the `miniflare` devDependency). The proof's write-up is [`d1-slice-proof.md`](./d1-slice-proof.md).
- **Carried:** `core/`, `gateway/`, `web/`, `packages/{contracts,db}`, `tests/{core,gateway,web,web-perf}`, `seam-fixtures/`, `infra/{synthetic,media,api-domain,domain}`, `tooling/{eslint,tsconfig,wire}`, and the root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`.
- **Not carried:** the vendored `stack-tectonic/` (intent pins `oci://ghcr.io/sourceplane/stack-tectonic:0.21.0`), `infra/{supabase,hyperdrive,db-migrate}`, the cut's `intent.yaml`, `.github/` and `.gitignore`.
- **Lockfile:** orun-cloud's `pnpm-lock.yaml` at `ffb71be69`, its `apps/openproduct/*` importers re-keyed to this root (their `link:` paths recomputed, root `tooling/{eslint,tsconfig}` kept), then `pnpm install --lockfile-only`. No importer moved: wrangler 4.100.0 and 4.151.3, turbo 2.9.18, pglite 0.5.3, playwright 1.61.1, workers-types 4.20260612.1, next 16.4.2. The one addition is the slice's miniflare `5.20261104.0-beta` (workerd 1.20261104.1).

### What CI sees

- **Discovery:** `core/`, `gateway/`, `web/`, `packages/`, `tests/`, `infra/synthetic/`, plus the two probe roots: 12 components. `infra/{media,api-domain,domain}` stay undiscovered (terraform that needs Cloudflare credentials even to plan); their files stay because `deploy-ordering.test.ts` reads them.
- **Every lane is verify.** `orun plan` (orun dev build): full plan 18 jobs; `github-push-main` 18; a pull request over this branch's diff 18; `github-dispatch` 8 (stage and prod of the four Workers); `local-development` 10. Every job is `cloudflare-worker-turbo.verify`, `cloudflare-workers-assets-turbo.verify` or `turbo-package.verify`. No deploy, apply or plan-only profile is reachable.
- **`.github/workflows/ci.yml`:** `plan` and `run` skip a fork's pull request; `offline-verify` (fork pull requests only, `contents: read`, no OIDC, no secrets) installs, typechecks, lints, tests (the db package alone), builds the website and runs the browser lanes; `gitleaks` (pinned 8.30.1, sha256 checked) scans each pull request's and push's commits and the checked-out tree.

### Validation on this branch (local, macOS, node v26.13.0)

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | pass |
| `pnpm exec turbo run typecheck lint` | 22 of 22 tasks pass; 24 of 24 with the probe integrated |
| `@openproduct/db` tests, alone | 28 files pass, 3 opt-in skipped; 648 tests pass, 12 skipped (the proof's 649, less the retired lock-sync test) |
| every other suite, in parallel | contracts 1213, synthetic 38, core-tests 881 (54 suites), gateway-tests 341 (18), web-tests 1481 (100): all pass |
| `@openproduct/web-perf` browser lanes | run under macOS Google Chrome through the suite's `XP4_CHROMIUM` (no Playwright browser here, and none downloaded): 649 checks pass (budget 238, wire 24, targets 35, a11y 95, axe 143, chrome 7, badge 7, studio 36, studio-timing 9, refresh 2, authed 53); **34 fail, all environmental**: 32 snapshot geometries (every width 1270 recorded against 1280 measured at a 1280 viewport, the recording browser's 10 px scrollbar against macOS overlay scrollbars, plus font-width deltas) and 2 axe `target-size` (a 23.5 px target on the desktop thread page). No web code changed beyond comments. **Not yet run on Linux Chromium**, which is what CI uses |
| `pnpm exec turbo run build --filter=@openproduct/web` | pass, OpenNext included. With the old `outputFileTracingRoot` (`../../..`) the same build fails: ENOENT on `.next/standalone/web/.next/server/pages-manifest.json` |
| `tests/core/src/repo-root.test.ts` | 5 of 5 pass; with a planted reach of each kind it fails 4 of 5 and names all eleven plants |
| `orun validate` | pass |
| `orun pr check OPN-2 --base origin/main` | pass; one warning, the PR body's manifest block (written when the PR opens) |
| `orun task check OPN-2 --base origin/main` | pass: 15 changed components, all inside the contract (departure 12) |
| `gitleaks detect --source . --no-git`, and over the history | no leaks found, both |
| `actionlint .github/workflows/ci.yml` | clean |

### Departures from design §2, and why

1. **No `secretEnv` or `secretOutputs` yet.** §2 says every component gains them. In OPN1 every lane is verify and renders from `wiring.fixture.json`; the wiring and runtime secrets they would name do not exist until OPN2 applies `cloudflare-d1` and the operator sets the seam keys, and a verify lane resolving a missing secret would fail closed. `core` still binds `PLATFORM_DB` (Hyperdrive) from its fixture. OPN2 adds `secretEnv` (`WIRING_CLOUDFLARE_D1_<ENV>`, the runtime keys) and `runtimeSecrets` with the deploy rules.
2. **No `skip` profile, so the verify-only shape is coarser.** stack-tectonic 0.21.0 defines no `skip`. Packages and test suites, which skipped stage and prod, subscribe `dev` only. The four Workers verify in dev, stage and prod on every trigger, so a pull request plans stage and prod verify lanes and `main` re-verifies dev (the monorepo's CIS17 and "a PR does not plan stage or prod" rules are gone). OPN2's deploy rules decide what comes back.
3. **`web` has no `buildEnv`.** 0.21.0's `cloudflare-workers-assets-turbo` has no `buildEnv` and closes its parameters, so orun refused the component. The verify build needs none: `src/lib/platform.ts` degrades on each value. The deploys' values (`NEXT_PUBLIC_CONSOLE_ORIGIN` per env, prod's `NEXT_PUBLIC_SITE_ORIGIN` and `NEXT_PUBLIC_OPENPRODUCT_API_URL`) are kept in a comment in `web/component.yaml`. **OPN2 must restore them** by whatever the pinned stack then offers, before the first website deploy.
4. **Two `dependsOn` edges are gone for now:** `openproduct-gateway → openproduct-media` and `openproduct-web → openproduct-api-domain`. Both targets are undiscovered, and orun drops such an edge with a warning. Design §4's ordering (`api-domain → gateway`, `web → api-domain`, `domain → web`) returns when they are discovered; `deploy-ordering.test.ts` fails if the API URL comes back without its edge. Three build-input edges (`gateway`/`web → contracts`, `worker → db`) stay, and orun warns that it drops them in the stage and prod lanes, where the packages are not subscribed.
5. **Three reaches §2 did not list**, found by surveying every `../` chain: `tests/web/src/opennext-config.test.ts` read `infra/supabase/component.yaml` (the `apac` placement hint is still asserted; the region cross-check returns with `infra/cloudflare-d1`); `packages/db`'s migrations-lock test and `gen-migrations-lock.mjs` read and wrote `infra/db-migrate/migrations.lock` (the lock-sync half and the generator retire now rather than in OPN2, because the Postgres db-migrate component never came along; ladder integrity stays); `tests/web-perf/src/pixel.mjs` (report-only, run only when named) read the launch artboard from the monorepo's specs (it now reads `OPENPRODUCT_LAUNCH_ARTBOARD`).
6. **README links.** Forty markdown links in the READMEs pointed into the monorepo's `docs/` and `specs/`. orun-cloud is private, so they became prose naming the orun-cloud path.
7. **The cut's `orun-cloud` → `openproduct` rewrite did more than §2 lists.** Besides the issue links and `feed.test.ts` (now `initialsOf("open-product")` is `"OP"`, keeping the two-word case), it pointed the runbook's `DEPLOY_LAG` at a repository that never existed (`sourceplane/openproduct`; now `pullely/openproduct`) and turned `budgets.mjs`'s "(orun-cloud, after #2020…)" into "(openproduct, …)". It skipped `.css`, so `globals.css`'s link was never broken; it now reads `sourceplane/orun-cloud#1882` like the others.
8. **The fixture token was renamed, not ignored.** `tests/core/src/sessions.test.ts`'s token is `ops_test_fixture_session_token_not_a_real_one`, in the very commit that brought the tree, so no commit carries a token-shaped string and there is no `.gitleaksignore`.
9. **A flaky suite was fixed.** `tests/gateway/src/ratelimit.test.ts` drained the anon bucket (a token every half second) through the router on the wall clock, and under the parallel suite run three cases saw a refilled token. They freeze `Date.now`, as `timing.test.ts` does.
10. **Retirements had already happened.** The cut script had removed `migrations-twin-sync.test.ts`, `import-boundary.test.ts` and the `@saas/db-migrations` devDependency; OPN-2 confirmed and dropped `packages/db`'s `db-migrations` edge. The undiscovered infra components lost `AWS_EC2_METADATA_DISABLED`, and `openproduct-domain` its platform-only `cloudflare-domain` edge; their `plan-only`/`apply` subscriptions are untouched and inert while undiscovered.
11. **`offline-verify` takes node from `engines` (`>=20`)**, so a fork's run uses the newest release that satisfies it, while the components' lanes pin `nodeVersion: "22"`. Every local run here was on node 26.
12. **`orun task check` compares components, not paths.** The offline check matches `affects` entries by exact string against the changed components' refs (`default/openproduct/openproduct-worker`). The platform's compliance check leaves this rule to the CLI. So the OPN-2 contract lists the 15 component refs beside its path globs, and was re-attached (`68f606f6`). The check now reports "15 changed component(s), all inside the contract". Contracts from here on name both.
13. **`tests/web-perf/src/studio.mjs` now honours `XP4_CHROMIUM`,** as every sibling lane already did; without it the studio lane crashed the suite on any machine without Playwright's own browser. CI installs that browser, so CI behaviour is unchanged.
14. **Not run locally:** the Workers' own builds (`wrangler deploy --dry-run --outdir dist`) and their verify lanes' `deploy-dry-run` step, which only CI runs here.
15. **The cut script's fixes were not upstreamed to orun-cloud.** The plan called for one orun-cloud PR first, so the cut could be re-taken from a newer SHA. Two things made it not worth it. orun-cloud's `apps/openproduct/` has not changed since `b421bc672`, and the code freeze holds from `ffb71be69`. And the monorepo copy is deleted at OPN4. If the freeze breaks, the change is ported here by hand.
16. **OPN1 is two tasks, not one.** The remote numbers exist only after this branch's merge deploys the probe. So OPN-2's contract ends at "the probe runs and prints its report", and **OPN-3** records the numbers and the go/no-go in this file. That follows the milestone rule for a part that must be live before the next. Later milestones' tasks shift by one: OPN2 is OPN-4, OPN3 is OPN-5, OPN4 is OPN-6.

The orun catalog (`autopushCatalog: true`) indexes all 13 `component.yaml` files, the three undiscovered infra components included, though plans see 10.

## Departures from the design

(One subsection per departure: what the design said, what was built, why.)
OPN1's are listed under "OPN1 — as built (so far)" above until the milestone closes.
