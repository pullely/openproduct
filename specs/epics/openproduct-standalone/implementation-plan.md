# openproduct-standalone — implementation plan

Milestones land in order. In this repository, each milestone is one or more tasks,
each one pull request on an `orun/OPN-<n>-<slug>` branch, with an `Orun-Task`
trailer and a manifest block. The parts that change `sourceplane/orun-cloud`
are pull requests there, under that repository's own task keys: another
repository is always its own pull request. A milestone is marked ✅ here when
its "done when" list is true, and recorded in `IMPLEMENTATION-STATUS.md`. The
epic, its milestones and its tasks are created in Orunbase; nothing in this
repository creates them.

**Before OPN0: the repository's first commit.** It was pushed to `main`
directly, because there was no base for a PR yet. It carries no code: only
`README.md`, `LICENSE` (MIT) and `.gitignore`. The repository was then linked
to the workspace (`orun cloud link`) as project `openproduct`, which also
allow-lists it for the OIDC exchange.

## OPN0 — the spec

Task **OPN-1**. This doc set and `tasks/OPN-1.TaskContract.yaml`, plus:
- `intent.yaml`, holding the workspace id, the pinned stack-tectonic OCI source and the trigger bindings, with no discovery roots yet;
- `.github/workflows/ci.yml`, the orun-action workflow on GitHub-hosted runners (design §2, §7).

The PR's review is the design's adoption.

**Done when**
- the five documents of this epic and the OPN-1 contract are on `main`
- CI runs on `main` on GitHub-hosted runners and its plan job passes with an empty plan
- `orun task show OPN-1` reads `done`

## OPN1 — the tree, with D1 proven on one slice

Three tasks, because each part had to be live before the next: **OPN-2** landed the tree, the slice and the probe, and its merge ran the probe on stage. **OPN-4** made the probe pace itself after D1 throttled its first run. **OPN-3** recorded the remote numbers and the go/no-go in the status file: **no-go** (2026-11-11).
- **The cut.** The product code arrives from orun-cloud at a named commit, made self-contained and verify-only (design §2).
- **The slice proof.** The catalogue and search slice runs on D1 behind the unchanged repository interface: `packages/db/src/d1/` (cirrus's executor), the slice's SQLite schema, the six methods, the D1 harness and the differential suite (design §5).
- **The probe.** `infra/cloudflare-d1-probe` for the throwaway `openproduct-probe-stage` database, and the stage-only `openproduct-d1-probe` Worker. These are the only components that apply anything, and only on stage.

**The cut SHA is orun-cloud `ffb71be69`.** Its `apps/openproduct/` is identical to the `b421bc672` cut. The fixes were made here rather than upstreamed (see IMPLEMENTATION-STATUS). The code freeze on `apps/openproduct/` in orun-cloud starts at that SHA (risk OPN-H).

**Done when**
- CI on `main` is green on GitHub-hosted runners: every package installs, typechecks, lints and tests, and only the stage probe deploys
- the catalogue rebuild, the catalogue page and the search index run on D1 behind the unchanged repository interface
- the differential suite runs every slice case on Postgres and local D1, and every result is equal
- the probe's remote-D1 timings at 5,000 listings are in `IMPLEMENTATION-STATUS.md`, marked met or missed against design §5.3
- the go/no-go for the full port is recorded in `IMPLEMENTATION-STATUS.md`

## OPN2 — live on its own URLs, on Supabase

OPN1 ended in a no-go for D1 (IMPLEMENTATION-STATUS, design §11). OPN2 brings
openproduct up on Supabase projects of its own, with the existing code taken
as it is. Its tasks are minted in Orunbase as each starts, one pull request
each, in this order, because each needs the one before it:

1. **The D1 slice and the probe retire.**
   - The probe database is destroyed through its own component, applied with the resource switched off, and the probe Worker is deleted.
   - Then `packages/db/src/d1/`, the D1 harness, differential and D1 scale suites, miniflare, `infra/d1-probe` and `infra/cloudflare-d1-probe` go.
   - Every Postgres suite still passes.
2. **The Supabase projects come up.**
   - `infra/supabase` arrives from orun-cloud `ffb71be69` as it is, with state on the platform and credentials as workspace secrets (design §11).
   - Its Management API token and org id are brokered from the `openproduct` Supabase connection.
   - A merge applies stage, then prod: two Supabase projects, each publishing `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL`.
   - The emptied D1 probe component leaves the tree.
3. **Hyperdrive and the migration ladder.**
   - `infra/hyperdrive` and `infra/db-migrate` arrive from the same commit, reading the secrets step 2 published. That is why they are a separate pull request: their plans need those keys to exist.
   - The runner reads `SUPABASE_PROJECT_REF`, and `@aws-sdk/client-secrets-manager` goes.
   - A merge applies stage, then prod: two Hyperdrive configs, and the 52-step ladder on both.
   - Needs: a stack-tectonic release whose `db-migrate` takes a build filter (OPN-U, released as 0.22.0).
4. **Going live.**
   - `core` renders its Hyperdrive id from `WIRING_OPENPRODUCT_HYPERDRIVE_<ENV>`.
   - Deploy profiles are switched on for stage and prod, and `openproduct-media` is discovered.
   - The operator-set secrets are created (design §4), with fresh seam keys **not yet** known to the platform.
   - `web` gets its build values back (IMPLEMENTATION-STATUS, departure 3).
   - `openproduct-domain` and `openproduct-api-domain` stay unapplied until OPN3.

The website's first real deploy happens in step 4. If the Worker fails at
startup with `ChunkLoadError … instrumentation`, the standalone trace is
incomplete: follow `nextjs-on-workers` §10 (copy the build's server
directory over the standalone one before OpenNext bundles it).

**Prerequisite:** orun-cloud#1905 (the mint cap, risk OPN-E) is merged.

**Done when**
- no D1 code, probe or probe resource remains, and every suite passes
- stage and prod each have their own Supabase project, Hyperdrive config and fully applied ladder, created by this repository's components, with nothing in AWS
- a merge to `main` converges stage and then prod through Orunbase with approval, and the workspace's runs show it
- on both environments the website and gateway answer on the new workers.dev hosts, `/health` is green and every sweep phase has run
- a visitor can browse the (empty) catalogue and sign up with a password on stage and on prod
- no secret is in GitHub Actions secrets or in a committed file

## OPN3 — openproduct.live served from here

Design §6, in order:
1. **orun-cloud PR (stage):** `LISTING_SEAM_URL` (stage) and `openproductWebBase` become configuration, set to the new stage hosts, and the stage seam keys rotate on both sides. Then the full listing flow is run on stage.
2. **orun-cloud PR (prod):** `LISTING_SEAM_URL` (prod) becomes `https://api.openproduct.live`, and the prod keys rotate on both sides.
3. **A task in this repository:** `OPENPRODUCT_CUSTOM_DOMAIN` is set for prod and the two domain components apply, after the `openproduct.live` zone moves to the new Cloudflare account (risk OPN-G).

The old prod `core` is not set read-only. The owner accepted losing its data (2026-11-14), so OPN4's teardown follows the switch with no read-only week.

**Done when**
- on stage, a listing is created, linked through the console, published, joined and purged end to end, with seam deliveries landing in the new gateway
- `openproduct.live` and `api.openproduct.live` are served by the new account's Workers, and "Sign in with Orunbase" completes
- the platform posts seam webhooks to `https://api.openproduct.live`, and both prod seam keys are rotated on both sides
- the old prod `core` receives no seam deliveries

## OPN4 — openproduct, listed on openproduct.live

**A task in this repository: the listing.** Create it from openproduct.live →
Create into this workspace's project, link `pullely/openproduct`, then pitch,
review and publish. The repo covenant then watches this repository. The same
PR updates the README's **Shipped as** and this epic's status.

**orun-cloud PR(s): the teardown.** The old deployment is destroyed through
its components' own destroy paths **before** `apps/openproduct/` is deleted.
Otherwise the old terraform state is orphaned with nothing left to destroy
it. That covers:
- the old workers, R2 buckets and Hyperdrive configs;
- the old `openproduct-stage` / `openproduct-prod` Supabase projects, in the monorepo's Supabase organization;
- the AWS Secrets Manager entries;
- the platform database's `openproduct` schema.

Then `apps/openproduct/` is deleted (OX6 runbook step 5), and the residue
guard enforces the inversion.

**Done when**
- openproduct.live lists openproduct, linked to `github.com/pullely/openproduct`
- the old account's openproduct workers, buckets and Hyperdrive configs are gone, and both old Supabase projects are deleted
- orun-cloud `main` has no `apps/openproduct/`, and its residue guard passes
- the epic reads completed in Orunbase, and the README's **Shipped as** is filled in

## Sequencing note

- **Boundaries.** OPN0 ends at review. OPN1 ends at your go/no-go on D1. OPN2 ends where the next step needs another repository and an outside change (the zone). OPN3 ends where the next step destroys things irreversibly, which only you approve. There is no read-only week first (your call, 2026-11-14).
- **The first milestone does not show the app running.** This is a move, not a new app: the first thing worth seeing is D1 serving the real catalogue and search slice on stage, with numbers. The app runs from here at the end of OPN2.
- **The local slice proof** can run ahead of OPN1 in a scratch copy of the cut (it did, 2026-11-09). OPN-2 then carries that work into the tree.
- **Prerequisites:** OPN2 needs orun-cloud#1905. OPN3 needs the two orun-cloud PRs and the registrar check (risk OPN-G).
- **Code freeze:** from OPN1's cut SHA until the OPN3 switch, `apps/openproduct/` in orun-cloud takes only security fixes, each landed in both repositories (risk OPN-H).
