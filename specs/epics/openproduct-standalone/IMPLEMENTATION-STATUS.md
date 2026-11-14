# openproduct-standalone (OPN) — implementation status

As-built ≠ intent. This file records what actually shipped, and every place
the code departed from `design.md`.

| Milestone | State | PR |
|---|---|---|
| OPN0 — the spec | ✅ done | [#1](https://github.com/pullely/openproduct/pull/1) |
| OPN1 — the tree, with D1 proven on one slice | ✅ done: **no-go for D1**, the owner's call (2026-11-11) | [#2](https://github.com/pullely/openproduct/pull/2), [#3](https://github.com/pullely/openproduct/pull/3), [#4](https://github.com/pullely/openproduct/pull/4) |
| OPN2 — live on its own URLs, on Supabase | ✅ done (2026-11-11). Password sign-up moves to OPN3 (see OPN-8) | [#5](https://github.com/pullely/openproduct/pull/5), [#6](https://github.com/pullely/openproduct/pull/6), [#7](https://github.com/pullely/openproduct/pull/7), [#8](https://github.com/pullely/openproduct/pull/8), [#9](https://github.com/pullely/openproduct/pull/9) |
| OPN3 — openproduct.live served from here | ◐ in progress: stage switched (OPN-9, 2026-11-14); the prod switch (OPN-10) is next | [#11](https://github.com/pullely/openproduct/pull/11) · [orun-cloud#2400](https://github.com/sourceplane/orun-cloud/pull/2400) (the stage pointers) · [#12](https://github.com/pullely/openproduct/pull/12) (OPN-11) |
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
| Tasks | OPN-1 `tsk_N14BB1XD` (OPN0, done: merged as `1fc8305`, PR #1) · OPN-2 `tsk_85D0P8WW` (OPN1, done: PR #2) · OPN-4 `tsk_DEKB9MPX` (OPN1, done: PR #3) · OPN-3 `tsk_DQTEWGM3` (OPN1, done: PR #4) · OPN-5 `tsk_KSEVSQNN` (OPN2, done: merged as `b8d55d3`, PR #5) · OPN-6 `tsk_8417K5E5` (OPN2, done: merged as `2b7b101`, PR #6) · OPN-7 `tsk_WFT2NPB0` (OPN2, done: merged as `0aeb50a`, PR #7) · OPN-8 `tsk_GXBYVA6W` (OPN2, done: merged as `5070529`, PR #8, and `8e9f80e`, PR #9) · OPN-9 `tsk_WG40EGHV` (OPN3, done: PR #11 and its status PR, with three departures, see OPN-9) · OPN-11 `tsk_V7EXYNMV` (OPN3, done: merged as `24507f7`, PR #12) |
| Project environments | `dev`, `stage`, `prod`, created through `POST …/projects/{prj}/environments` on 2026-11-09. A baseline bootstrap creates them; this repository never had one, and secret authoring refused until they existed |
| Stage secrets | `CLOUDFLARE_API_TOKEN` (`workers-deploy`), `CLOUDFLARE_ACCOUNT_ID` (`account-id`), `CLOUDFLARE_D1_TOKEN` (`d1-edit`), `CLOUDFLARE_WORKERS_SUBDOMAIN` (`workers-subdomain`): all brokered from connection `int_7fbdaafa…`. `PROBE_TOKEN`: static, random, set from stdin. None has a prod counterpart yet |
| Supabase connection | **`openproduct`** (`int_cc19cfd5…`), created by the owner on 2026-11-11 for this product and inherited from the account (OPN-T). The account's older `arca-orun` (`int_d9116c21…`) is not used, so every brokered Supabase secret names `openproduct` explicitly. It is a different Supabase organisation and cannot see this product's projects. On 2026-11-14 the `openproduct` connection dropped out of the workspace's list, for a reason not found, and the brokered keys read orphaned. The owner re-added the organisation from the console's Connections page, and it came back under the same id, so the keys recovered without being re-created |

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

### Remote half: done (2026-11-11)

Two runs on stage, both on Workers Paid, each from the merge that changed
the probe. The probe database's primary is in APAC (`HKG`), with read
replication on. Timings are wall-clock inside the probe Worker around each
D1 call, beside the SQL time D1 reports.

**Run 1** (PR #2's merge, re-run after the upgrade) stopped early. The schema
applied, and applied again with no change. Then D1 refused step 10 of the
18-step corpus load: "D1 DB is overloaded. Too many resources consumed within
a 10 second window". The 50 MB result and the long LIKE pattern were refused.
A 2.1 MB value bound into a `SELECT` was accepted, but that probe tested the
wrong thing, because the 2 MB limit is on stored values. The 34-argument
probe hit the same overload, so it said nothing. OPN-4 (PR #3) made the probe
wait out overloads, pace its heavy writes and store the 2 MB value.

**Run 2** (PR #3's merge, run `43001100946`) reached every phase. It took
15 minutes, 473 s of it waiting out 17 overloads.

| Operation (5,000 listings) | Budget (design §5.3) | Plain binding: the primary, `HKG` | Through a session: a replica | SQL p50 | Reading |
|---|---|---|---|---|---|
| `rebuildCatalogue`, cold | ≤ 30 s; each statement ≤ 10 s | p50 1,407 ms, p95 1,422 ms (7 of 10 runs); slowest statement 888 ms | — | 917 ms | met |
| `rebuildCatalogue`, quiet tick | ≤ 3 s | p50 1,103 ms, p95 1,138 ms (5 of 10 runs) | — | 864 ms | met |
| `replaceSearchIndex`, 5,000 documents, cold | ≤ 30 s | p50 849 ms, p95 1,808 ms | — | 135 ms | met |
| `replaceSearchIndex`, no change | ≤ 5 s | p50 1,852 ms, p95 1,930 ms | — | 212 ms | met |
| `listCataloguePage`, first page | p50 ≤ 50 ms, p95 ≤ 150 ms | p50 362 ms, p95 576 ms | p50 15 ms, p95 39 ms | 1.7 ms | missed by more than 2× on the primary; met through a session |
| `listCataloguePage`, deep page | same | p50 353 ms, p95 504 ms | p50 13 ms, p95 34 ms | 1.5 ms | same |
| `searchCandidates`, common term | same | p50 244 ms, p95 257 ms | p50 12 ms, p95 21 ms | 1.6 ms | same |
| `searchCandidates`, rare term | same | p50 230 ms, p95 246 ms | p50 10 ms, p95 68 ms | 0.2 ms | same |
| `searchCandidates`, multi-term | same | p50 243 ms, p95 258 ms | p50 11 ms, p95 15 ms | 0.7 ms | same |

The session column is the `first-unconstrained` session; `first-primary` and
a writer's bookmark gave the same numbers. The incomplete write rows stopped
on an overload, not on a slow run.

What the remote half had to show:
- **Every remote result equals local: yes.** `/export` matched local D1's snapshot: 5,000 catalogue cards and 5,000 search documents.
- **The replace batch is accepted: yes.** Ten cold 5,000-document replaces out of ten.
- **Remote D1 refuses the negative probes: two of four.**
  - Refused: the 56 MB result ("D1 query result exceeded the maximum response size limit of 50 MB") and the 60-byte LIKE pattern ("LIKE or GLOB pattern too complex").
  - **Accepted:** a 34-argument `json_object` (all 17 keys came back) and a 2.1 MB stored row (`length(v)` was 2,100,000). Cloudflare still documents both limits. The static guard is stricter than the service, which is the safe direction.

Also measured:
- **Sessions.** After a write, 50 reads under each of `first-unconstrained`, `first-primary` and the writer's bookmark: none stale. A replica in `ENAM` served 49 of 50.
- **The overloads** are D1's per-instance rate limit on CPU and memory over 10 seconds (Cloudflare, "Debug D1"). Each read replica is limited on its own. The probe tripped it by sending ten cold rebuilds in one request. D1 stopped that request after seven, about 6.4 s of SQL inside 10 s, and each retry repeated the whole chunk into the same wall. A quiet tick costs about 0.86 s of SQL, because it scans every listing.
- **Not measured on its own:** the rebuild's single-writer pause. A cold rebuild held the writer for about 0.9 s of SQL.

## The go/no-go (OPN-3, 2026-11-11): no-go, OPN2 runs on Supabase

**The rule** (design §5.3, set before anything was measured): go if every
budget is met and the differential suite is fully equal; no-go if any budget
is missed by more than 2×.

**The reading.**
- Every write budget was met, by 2.6× or more, and every remote result equals local.
- Every read budget measured on the plain binding was missed by 5–7×, so the probe's report reads "no-go by §5.3".
- The read misses are distance, not D1: 0.2–1.7 ms of SQL inside 230–360 ms of round trip, from a Worker near the North American runner to the primary in APAC. The same reads through a session met every read budget.

**The recommendation** was go, on two conditions: every public read through a
D1 session, and the sweep kept under the 10-second resource window.

**The decision (the owner, 2026-11-11): no-go.** OPN2 runs on Supabase. The
code the new repository needs is taken as it is. The Postgres repository and
its migration ladder are already in the tree, and the Supabase, Hyperdrive
and migration components come from orun-cloud (design §11).

**What follows.**
- OPN2 becomes "live on its own URLs, on Supabase" (implementation plan).
- The D1 slice and the probe retire in OPN2: `packages/db/src/d1/` with its harness and suites, miniflare, `infra/d1-probe` and `infra/cloudflare-d1-probe`. The probe's database and Worker are destroyed first.
- **The probe stands down now.** This record drops its deploy rule, so a merge no longer deploys it or runs its smoke, and `main` goes green. Run 2 was its last run.

## OPN1 — as built

Three tasks: OPN-2 (the tree, the slice and the probe, PR #2), OPN-4 (the
probe paces itself, PR #3) and OPN-3 (the remote numbers and the go/no-go,
PR #4).

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
16. **OPN1 is two tasks, not one.** The remote numbers exist only after this branch's merge deploys the probe. So OPN-2's contract ends at "the probe runs and prints its report", and **OPN-3** records the numbers and the go/no-go in this file. That follows the milestone rule for a part that must be live before the next. A third task, OPN-4, joined when run 1 showed the probe had to pace itself, so the plan no longer names later task keys: each is whatever Orunbase mints next.

The orun catalog (`autopushCatalog: true`) indexes all 13 `component.yaml` files, the three undiscovered infra components included, though plans see 10.

### What CI taught on its first runs (PR #2 and its merge)

Three failures surfaced only in GitHub Actions; none showed locally:

1. **`orun run` needs `--isolation none` here.** By default orun stages each job in a private copy under `.orun/runs/…/work` and links `node_modules` back to the checkout. Next's `outputFileTracingRoot` then sees every package as outside the root and drops it from the standalone output ("27 traced files were not included"). OpenNext reaches for the real `node_modules` and fails to bundle `sharp`'s native `.node` files. One runner runs one job, so there is nothing to isolate. orun-cloud's pipeline passes the same flag for the same reason.
2. **`repo-root.test.ts` walks the tree** whenever git is not rooted exactly at it, or lists nothing. Inside an ignored directory git answers with zero files, and the guard's own sanity checks failed on that.
3. **The `workers-subdomain` brokered fact fails a whole job** while the Cloudflare account has no workers.dev subdomain (`fact_unavailable`), even as an optional reference. The probe no longer references it. Its smoke asks Cloudflare for the subdomain with the deploy profile's own credentials.

The 34 browser checks that failed on macOS (snapshot widths, one axe `target-size`) **pass on Linux Chromium**. They were environmental, as recorded above.

### The Cloudflare account needs Workers Paid

The first deploy of the probe Worker was refused: "CPU limits are not supported for the Free plan" (code `100328`). The terraform apply of the probe database had already succeeded.

The owner upgraded the `openproduct` Cloudflare account to Workers Paid on 2026-11-11, and the failed job was re-run in place. It is a prerequisite for the product, not only for the probe. The Free plan's limits do not fit:
- 100,000 D1 rows written a day, where one full probe load writes about 8 M;
- 10 ms of CPU and a 3 MB bundle per Worker, where the OpenNext website and the sweep need more;
- 50 queries per invocation.

Design §8 lists the Orunbase account's limits; this is the Cloudflare side of the same question.

## OPN2 — as built

### OPN-5: the D1 trial retires

- **Deleted:** `packages/db/src/d1/` (executor, slice repository, schema, harness, engine, remote-limits, differential and D1 scale suites), the package's `./d1` exports and `test:d1` scripts, the miniflare devDependency, and `infra/d1-probe` (the probe Worker's component). `intent.yaml` no longer discovers `infra/d1-probe/`.
- **Kept:** `pg-driver-counts.test.ts`, moved to `packages/db/src/`. It tests Postgres, not D1. It pins that the production postgres.js executor reports 0 for writes without `RETURNING`, which matters more now that Postgres stays.
- **`infra/cloudflare-d1-probe` declares no database.** The database is in state and no longer in config, so the merge's stage `terraform.apply` destroys `openproduct-probe-stage`. A `terraform_data` provisioner, run at apply only, deletes the probe Worker `openproduct-d1-probe-stage` through the Cloudflare API with the workers-deploy token, because no component manages that script and stack-tectonic's Worker composition has no delete path. `secretOutputs` is gone, along with the adoption lookup.
- **Lockfile:** drops the `infra/d1-probe` importer and miniflare. The website's wrangler (4.151.3, unchanged) no longer resolves the optional `@cloudflare/workers-types` peer that only the probe brought.
- **Plans:** a pull request plans `cloudflare-d1-probe · stage` as `terraform.plan-only`, so the destroy shows and nothing happens. The merge applies it. Every other job is verify.
- **Local checks:** typecheck and lint pass, 22 of 22. `@openproduct/db` alone: 23 files pass, 1 skipped; 571 tests pass, 1 skipped. `terraform validate` passes. `orun validate` passes, and `orun task check OPN-5` reports 3 changed components, all inside the contract.
- **Applied (main run 43023059866, 2026-11-11):** `cloudflare-d1-probe · stage` destroyed `openproduct-probe-stage`, and the provisioner deleted `openproduct-d1-probe-stage` (HTTP 200). Every other job passed.
- **Left for the next task:**
  - deleting `infra/cloudflare-d1-probe` itself, after this apply (done in OPN-6);
  - the stale stage secrets `WIRING_CLOUDFLARE_D1_PROBE`, `PROBE_TOKEN`, `CLOUDFLARE_D1_TOKEN` and the unused `CLOUDFLARE_WORKERS_SUBDOMAIN` (still open: revoking them is the owner's call);
  - `tests/web/src/opennext-config.test.ts`'s TODO, whose region cross-check returns against `infra/supabase`'s region instead of `infra/cloudflare-d1`'s (done in OPN-6).

### OPN-6: the Supabase projects come up

The database step of the plan is split in two pull requests. This one brings
up the Supabase projects. The next brings Hyperdrive and the migration
ladder, whose pull-request plans then read the secrets this merge publishes
instead of failing on keys that do not exist yet.

- **`infra/supabase`** (`openproduct-supabase`, terraform, stage and prod) is orun-cloud `ffb71be69`'s `apps/openproduct/infra/supabase`, with only the changes design §11 names, made the way lumen's supabase stack makes them:
  - the `s3` backend becomes `backend "http" {}`, so state is on the platform;
  - the AWS provider, the Secrets Manager secret and its version, `secret_arn`, `awsRegion` and the `bootstrap` dependency are gone;
  - the credentials leave as `secretOutputs`: `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL` (a new sensitive `connection_uri` output, as lumen has);
  - the org id is no longer committed: it arrives as `TF_VAR_supabaseOrgId` from `SUPABASE_ORG_ID`, brokered from the `openproduct` Supabase connection (`int_cc19cfd5…`, `org-id`). `SUPABASE_ACCESS_TOKEN` is brokered from the same connection (`management-access`). Both are on the stage and prod rungs;
  - the project name `openproduct-{env}`, the region `ap-southeast-1`, the password and `random ~> 3.0` are unchanged.
- **Departure: the provider pin.** The monorepo pins `supabase ~> 1.0`; this pins `~> 1.5.1`, as lumen does. From 1.6.0 the provider reads `/billing/addons` on every project read, and Supabase refuses billing endpoints to OAuth tokens, which is what the connection brokers. The monorepo ran with a personal access token.
- **Not taken from lumen:** its `adopt.tf`. It imports a project that exists outside state, which was lumen's move off S3. This organization is new and holds no `openproduct-*` project.
- **`infra/cloudflare-d1-probe` is deleted**, and `intent.yaml` discovers `infra/supabase/` in its place. Its platform state, which holds only the provisioner's `terraform_data`, stays behind harmlessly.
- **`tests/web/src/opennext-config.test.ts`** reads `infra/supabase/component.yaml` again and asserts `supabaseRegion: ap-southeast-1`, as it did in the monorepo.
- **Plans:** a pull request plans `openproduct-supabase · stage` and `· prod` as `terraform.plan-only`. The merge applies stage, then prod (prod's job depends on stage's).
- **Applied (main run 43033427753, 2026-11-11):** `openproduct-stage` (`itccpiqtwkqtwrdnubgo`) and `openproduct-prod` (`hxmcxvosifxzqsxqsveg`) were created in `ap-southeast-1`, about 10 s each. Each apply published `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL` to its environment.

### OPN-7: Hyperdrive and the migration ladder

- **`infra/hyperdrive`** (`openproduct-hyperdrive`, terraform, stage and prod) is orun-cloud `ffb71be69`'s, with the changes design §11 names, made as lumen's `cloudflare-hyperdrive` makes them:
  - `backend "http" {}`; the AWS provider, the Secrets Manager read of the Supabase payload and the Secrets Manager wiring secret are gone;
  - the origin derives from `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` (`TF_VAR_supabase_*`), the same derivation the old payload carried (`db.<ref>.supabase.co:5432`, user and database `postgres`);
  - the wiring document `{hyperdrive_id, hyperdrive_name}` leaves as the `wiring` output, published as `WIRING_OPENPRODUCT_HYPERDRIVE`;
  - the provider reads `CLOUDFLARE_API_TOKEN` from the environment: `CLOUDFLARE_HYPERDRIVE_TOKEN`, brokered from the `openproduct` Cloudflare connection (`hyperdrive-edit`) on stage and prod. Prod also gained `CLOUDFLARE_ACCOUNT_ID` (`account-id`);
  - unchanged: the resource, its name `<prefix>openproduct-<env>`, `cloudflare ~> 4.30` and caching on.
- **`infra/db-migrate`** (`openproduct-db-migrate`, stage and prod) is the monorepo's, without `awsRegion`, `awsAccountId` and `secretName` (stack-tectonic's schema closes its parameters, and nothing reads them now). `buildFilter: "@openproduct/db"` stays. It reads `SUPABASE_ACCESS_TOKEN` (brokered) and `SUPABASE_PROJECT_REF` (published).
- **Departure: no `migrations.lock`.** Design §11 lists it with db-migrate. In the monorepo it mirrored the manifest so that a new migration changed a file in the component's directory. Here `openproduct-db` is an `input: true` edge instead, which schedules the component on any `packages/db` change. Apply is idempotent, and the lock's generator and lock-sync test retired at the cut (departure 5).
- **The runner** reads its project from `SUPABASE_PROJECT_REF` (`runner/secrets.ts`, `loadProjectRef`, with a new test) and lost `@aws-sdk/client-secrets-manager`. The lockfile drops only that package. The other AWS packages in it belong to OpenNext.
- **The pin** moves to stack-tectonic 0.22.0, whose only change is db-migrate's `buildFilter` (OPN-U).
- **Plans:** a pull request plans `openproduct-hyperdrive` as `terraform.plan-only` and `openproduct-db-migrate` as `db-migrate.plan` (offline), stage then prod. The merge applies both. Hyperdrive and the ladder do not depend on each other.
- **Local checks:** `@openproduct/db` typecheck and lint pass; 24 files and 574 tests pass, 1 skipped. The build reports `Packages in scope: @openproduct/db`. The built CLI's `plan` lists the ladder offline, and `apply` without `SUPABASE_PROJECT_REF` fails naming it. `terraform validate` passes, and so does `orun validate`.
- **Applied (main run 43036235549, 2026-11-11):** Hyperdrive `stg-openproduct-stage` (`78460d8c…`) and `prod-openproduct-prod` (`d2cc9163…`), each publishing `WIRING_OPENPRODUCT_HYPERDRIVE`. The ladder applied in full on both databases: `applied=52 skipped=0`, in 2 min 39 s on stage and 3 min 25 s on prod.

### OPN-8: openproduct goes live on its own URLs

- **Deploys on.** `openproduct-worker`, `openproduct-gateway`, `openproduct-web` and `openproduct-synthetic` verify stage and prod on pull requests and deploy them on the merge to main and on a dispatch from Orunbase. dev stays verify-only. Without a `skip` profile, pull requests still plan the stage and prod verify lanes (departure 2 stands).
- **core binds this repository's Hyperdrive.** `wiringComponents: "openproduct-hyperdrive"`. The template's tokens are `@@wiring(openproduct-hyperdrive/<env>:hyperdrive_id)@@`, the fixture's keys match, and each stage and prod subscription resolves both environments' `WIRING_OPENPRODUCT_HYPERDRIVE`, because the template carries both sections. `PLATFORM_DB` keeps its name. core now orders after `openproduct-hyperdrive` and `openproduct-db-migrate`.
- **Runtime secrets** use `optionalSecretEnv` plus `runtimeSecrets`, lumen's pattern. The composition's `secrets-live` pushes the stored ones after deploy and skips the rest by name:
  - core: `LISTING_SEAM_SECRET`, `OPENPRODUCT_OPERATORS`;
  - gateway: `LISTING_SEAM_SECRET`, `OPENPRODUCT_AUTH_SEAM_SECRET`, `SCREENSHOT_CAPTURE_URL`, `SCREENSHOT_CAPTURE_TOKEN`. `SCREENSHOT_CAPTURE_URL` was missing from design §4.
- **`GITHUB_TOKEN` is deliberately left out** of the gateway's lists. `secrets-live` reads each name from the job's environment, and CI's `orun run` step exports the workflow's own short-lived `GITHUB_TOKEN`, so an unseeded key would push that token into the Worker. It joins both lists in the change that stores the owner's token.
- **The gateway** orders after core (enforced now, so a fresh estate's `CORE` binding has a target) and after `openproduct-media` (restored). `skipResourceProvisioning: true`: wrangler must not read the `MEDIA` bucket with a token that has no R2 permission.
- **The website** sets `workersDevSubdomain: openproduct`. It gets `NEXT_PUBLIC_CONSOLE_ORIGIN` per environment through each subscription's `env`, which orun merges into the build's environment (departure 3: the composition has no `buildEnv`). It orders after the gateway, whose workers.dev host it reads.
  - `NEXT_PUBLIC_SITE_ORIGIN` and `NEXT_PUBLIC_OPENPRODUCT_API_URL` stay unset until OPN3, because `openproduct.live` and `api.openproduct.live` still serve the monorepo's deploy.
  - `src/lib/platform.ts` splits the platform's `oruncloud` subdomain, still right for api-edge, from the product's `openproduct` subdomain. Unchanged, the gateway fallback would have named the old account's gateway.
- **`infra/media`** is discovered:
  - its state is on the platform;
  - the AWS provider and the Secrets Manager wiring manifest, which had no reader, are gone;
  - `CLOUDFLARE_R2_TOKEN` is brokered (`r2-data`);
  - the bucket `openproduct-media-<env>` is unchanged, with `ENAM` as the monorepo had it.
- **Hosts.** Every self-reference names `openproduct-{web,gateway}-<env>.openproduct.workers.dev`:
  - the gateway's `SITE_ORIGIN`, its only CORS origin, in dev, stage and prod;
  - the synthetic monitor's `API_ORIGIN` and `SITE_ORIGIN`, in all three. Its prod values return to the canonical names at OPN3, and `config.test.ts` pins the interim ones.
- **Secrets this needs before its merge:**
  - `CLOUDFLARE_API_TOKEN` on prod (`workers-deploy`);
  - `CLOUDFLARE_R2_TOKEN` on stage and prod (`r2-data`);
  - fresh `LISTING_SEAM_SECRET` and `OPENPRODUCT_AUTH_SEAM_SECRET` per environment (OPN-K).
- **Left for the owner:** `OPENPRODUCT_OPERATORS`, `GITHUB_TOKEN` and the screenshot-capture pair. Each is optional per request.
- **The secrets were stored on 2026-11-11 (#8). The first deploy (run 43110234860) met two account settings that the monorepo's account never needed:**
  - **core's placement.** `{ "mode": "smart", "hint": "apac" }` is refused ("placement hint not allowed", 10023). It is now `{ "region": "aws:ap-southeast-1" }`, the documented Placement Hints form, naming the Supabase projects' region.
  - **R2 was not enabled** on the openproduct account ("Please enable R2 through the Cloudflare Dashboard", 10042), so `openproduct-media` could not create its buckets. The gateway and the website wait on it. The owner enabled it on 2026-11-12.
  - **The follow-up (#9)** also touches the media, gateway and website `component.yaml` files. `orun plan --changed` schedules only components whose files change, so its merge redeploys all four in order.
  - What did deploy: `openproduct-synthetic` on stage and prod.
- **Live (2026-11-11, #9's merge, run 43113656168, all green).** The run deployed, in order:
  - `openproduct-media` (both buckets), then core with the new placement, then the gateway, then the website, stage before prod;
  - the seam keys: core's `LISTING_SEAM_SECRET`, and the gateway's `LISTING_SEAM_SECRET` and `OPENPRODUCT_AUTH_SEAM_SECRET`. The screenshot pair was skipped by name.
- **Checked from outside, on both environments:**
  - `openproduct-web-<env>.openproduct.workers.dev` renders the empty catalogue ("No builds are listed yet") with no console errors, and `/docs/api` answers 200;
  - `openproduct-gateway-<env>.openproduct.workers.dev/health` is `ok` (`core`, `platform`, `seam` configured), and all seven sweep phases ran at 23:00 UTC and are healthy. The 22:50 tick, 7 minutes after the triggers were registered, did not run;
  - `/v1/products` reads Postgres in ~25–40 ms for three queries (`Server-Timing` `dbspan`), so the placement holds core next to the database.
- **The synthetic monitor:** `search-freshness`, `count-freshness` and `cache-hit` all hold on stage. `cache-hit` needs six front-page samples before it judges, so until it has them it keeps the `unreachable` recorded before the website existed. Prod reached six at 23:15.
- **Approval did not gate the merge.** `intent.yaml` sets `requireApproval: "true"` on stage and prod, yet the push-to-main run went from stage to prod without a pause. OPN2's "converges … with approval" is therefore met only in the sense that the merged PR is the approval. Whether a push should wait on an Orunbase approval is a platform question, left open for the owner (risk OPN-V).
- **No secret is in GitHub Actions** (`gh secret list` is empty) or in a committed file.
- **Departure from OPN2's "done when": password sign-up.** The gateway's password sign-in asks the platform's identity-worker for the account, over the auth seam, and the platform holds one `OPENPRODUCT_AUTH_SEAM_SECRET`: the monorepo deploy's. Until the platform holds this repository's key, the new site's password sign-in is refused. Giving the platform the new key cuts the old deploy off, which is the switch, so it moves to OPN3 with the listing seam. Browsing, `/health` and the sweeps do not need it.
  - **Corrected at OPN3:** the platform held **no** auth seam key. `POST /v1/seam/openproduct/subject-by-email` on api-edge answered 503 *Resolver not configured* on stage and on prod (2026-11-14): identity-worker never had `OPENPRODUCT_AUTH_SEAM_SECRET`, and the escrow had no document for it. So the old deploy's password sign-in never reached the platform either, and setting the key cuts nothing off. OPN-9 seeds it for stage and prod.

## OPN3 — as built

### OPN-9: stage joins the platform's seam (done 2026-11-14, three departures)

Design §6, steps 1 and 2. Two pull requests, because the platform's half is in another repository:

- **orun-cloud (the platform, [#2400](https://github.com/sourceplane/orun-cloud/pull/2400)):**
  - membership-worker's stage `LISTING_SEAM_URL` becomes `https://openproduct-gateway-stage.openproduct.workers.dev`. Prod keeps the monorepo deploy's host until OPN-10;
  - the console's `openproductWebBase` becomes a per-environment table: stage (and dev, which has no openproduct deployment) hands off to `https://openproduct-web-stage.openproduct.workers.dev`, and prod stays `https://openproduct.live`;
  - the platform's copies of both seam keys come from Orunbase, not the AWS escrow: identity-worker reads `OPENPRODUCT_AUTH_SEAM_SECRET` and membership-worker `LISTING_SEAM_SECRET` from orun-cloud's workspace (`ws_537EHJPC`, project `orun-cloud`) through `optionalSecretEnv` and `runtimeSecrets`. orun-cloud's local stack gained the Orunbase push stack-tectonic publishes. The owner's call (2026-11-14): every openproduct secret lives in Orunbase, with no AWS dependency. The escrow's `listing-seam` document keeps only the monorepo deployment's two consumers, which retire at OPN4.
- **This repository (#11):** core's and the gateway's component notes record the shared-key arrangement, which also puts both in the merge's plan, so they redeploy and `secrets-live` delivers the rotated keys.

**The keys.** Each is generated once and written to both workspaces in the same step, never printed and never copied from an existing key:

| Key | orun-cloud's workspace (`ws_537EHJPC`) | This workspace |
|---|---|---|
| `LISTING_SEAM_SECRET` | `stage` | `stage` (rotated) |
| `OPENPRODUCT_AUTH_SEAM_SECRET` | `stage`, `prod` | `stage`, `prod` (rotated) |

Prod's `LISTING_SEAM_SECRET` is not seeded on the platform's side: membership-worker prod keeps the value it has, which the monorepo deploy shares, because the platform's prod webhooks still go there. It moves at OPN-10.

**Order, as run.** The keys were seeded in both workspaces first. An unseeded key would not break a deploy (it is skipped by name), but the switch would send stage's webhooks to a gateway holding a different key. Then #11's merge (run 43576326314: core and the gateway redeploy and `secrets-live` delivers the rotated keys), then orun-cloud#2400's (main run 43576713067: membership-worker, identity-worker and the console). This side took the new keys before the platform switched, so stage's webhooks never met a stale key.

**Checked after both merges:**
- the auth seam on api-edge (`POST /v1/seam/openproduct/subject-by-email`, unsigned) answers 401 on stage and on prod, where it answered 503 *Resolver not configured* before: identity-worker holds `OPENPRODUCT_AUTH_SEAM_SECRET` in both;
- the `secrets-live` logs on both sides show the keys pushed by name;
- membership-worker stage's `LISTING_SEAM_URL` names `https://openproduct-gateway-stage.openproduct.workers.dev`, and prod's is unchanged.

**The flow on stage (2026-11-14),** driven in the owner's browser, the owner entering the password and the emailed code:
- **Password sign-up and sign-in** on `openproduct-web-stage.openproduct.workers.dev`, with the email of the owner's stage Orunbase account. The gateway's sign-in reaches identity-worker over the auth seam, so this exercises the new stage `OPENPRODUCT_AUTH_SEAM_SECRET`.
- **Created and linked through the console.** "Open a build" handed the draft to the console's founder landing on `stage.orunbase.com`, which created the openproduct account, a public workspace (`org_e216d5f0…`) and its project, minted the link grant and handed back to the studio. Core accepted the grant, and the listing (`opp_c6f81951…`, `/testopenproduct`) was created. The grant is signed with the stage `LISTING_SEAM_SECRET`, so this proves both sides hold the same new key.
- **Published.** The first attempt was refused with `blockers=pitch_missing`, as designed; a two-line pitch was added, and the listing published. The public page serves.

**Departures from the contract's "done when":**
1. **Not joined.** A join request has to come from a second stage account: the owner cannot ask to join their own workspace. The owner skipped it (2026-11-14). So S6, the first edge on which the platform itself posts to this gateway, has not carried a live delivery on stage. The fixtures pin its wire format on both sides.
2. **Not purged.** S7 fires when a deleted workspace is erased, which is `WORKSPACE_ERASURE_DAYS` (30) after the delete, so it cannot run within a task. The test workspace is left in place; when the owner deletes it, the purge reaches this gateway 30 days later and takes the listing down.
3. **Prod sign-up not run.** Signing up on prod creates a real account, which is the owner's call. The prod auth seam answers 401 unsigned, so its key is set. The prod smoke test at OPN-10 signs in anyway.

The contract's first line still says the keys go to the platform's escrow. Since the owner's call they go to orun-cloud's Orunbase workspace instead (above).

**A first attempt wrote to AWS.** Before the owner's call, a run created `integrations/openproduct-auth-seam/{stage,prod}` and rotated `integrations/listing-seam/stage` in the escrow, and its writes to this workspace failed: `orun secrets set` creates a key, and these already existed, which the platform answered with a bare 503 instead of a conflict. `orun secrets rotate` is the verb for an existing key. The owner undid it on 2026-11-14: the two new documents were deleted (seven-day recovery window), and `listing-seam/stage` is back on its previous version.

### OPN-11: a quiet search index is not a stale one

- **The symptom.** Both gateways' `/health` read `degraded` from 2026-11-11: the `searchIndex` sweep phase looked stale. Core skips the rebuild while the index is clean, and `/health` read `built_at`, which moves only on a rebuild. With an empty catalogue it stayed at 2026-11-11 23:00 UTC.
- **The fix (#12).** Migration 2260 adds `search_index_state.checked_at`, stamped when a sweep finds nothing to rebuild, and the phase's last run is read as `GREATEST(built_at, checked_at)`.
- **Live.** Merged as `24507f7` (main run 43589062851, green). Both gateways read `ok` from the 11:20 UTC sweep on 2026-11-14.
- **Its first CI run was held up by the Supabase connection, not the code** (see "Supabase connection" under Estate). `openproduct-db-migrate` resolves the brokered `SUPABASE_ACCESS_TOKEN`, so it failed on every pull request touching `packages/db` until the owner re-added the connection.

### Left for OPN-10, the prod switch

- the `openproduct.live` zone moves to the new Cloudflare account (risk OPN-G), which is the owner's step;
- `OPENPRODUCT_CUSTOM_DOMAIN` is set for prod and the domain components apply. The website's `NEXT_PUBLIC_SITE_ORIGIN` and `NEXT_PUBLIC_OPENPRODUCT_API_URL`, the gateway's `SITE_ORIGIN` and the synthetic monitor's prod names return to the canonical hosts;
- in orun-cloud, membership-worker prod's `LISTING_SEAM_URL` becomes `https://api.openproduct.live`, and a fresh prod `LISTING_SEAM_SECRET` is written once to both workspaces;
- the smoke test, including a password sign-up and "Sign in with Orunbase" on prod;
- then OPN4's teardown, once the owner approves, with no read-only step and no read-only week (the owner's call, 2026-11-14; design §6).

## Departures from the design

(One subsection per departure: what the design said, what was built, why.)
OPN1's are listed under "OPN1 — as built" above. The largest is the engine itself: the design is D1, and OPN2 runs on Supabase (the go/no-go above, design §11).
