# openproduct-standalone — risks and open questions

Each entry is a letter, a title, and a state: **RISK** (open, with a
mitigation), **RESOLVED** (decided; says what and why), **ACCEPTED** (a cost
we carry knowingly), **SETTLED** (decided for now; revisit on a stated
cadence), **OPEN** (needs an answer before the milestone named).

## OPN-A — D1 is too slow for the sweep at scale (RESOLVED: no-go)

The catalogue and search phases rebuild set-wise every 10 minutes. On a
database that runs one query at a time, with writes persisted across
locations, their cost grows with the listing count. The factory measured
about 0.3 s per batched write statement from this machine's colo (trap 49).

**Mitigation:** OPN1 measures exactly these phases at the scale target, from
inside Cloudflare, against budgets set in advance (design §5.3). If D1 misses
by more than 2×, OPN2 ports to a new Supabase connection instead. Nothing
after OPN2 depends on the engine.

**Resolved (2026-11-11):** the probe met every write budget, and missed the
read budgets by 5–7× on the plain binding while meeting them through D1
sessions. The owner called no-go: OPN2 runs on Supabase (IMPLEMENTATION-STATUS,
design §11).

## OPN-B — D1's size limits on bulk writes (RETIRED with D1)

The limits are 100 bound parameters per statement, 2 MB per value and 100 KB
per statement. The search rebuild binds one JSON payload of every document,
and at 5,000 documents that payload can pass 2 MB.

**Mitigation:** one JSON parameter per statement, expanded with `json_each`
and chunked at about 1 MB.

The local proof confirmed that local workerd does **not** enforce two of the
service's limits: 32 arguments per SQL function, and 2 MB per value. A
34-argument `json_object` ran locally and would fail on D1. Two things guard
against that:
- A static remote-limits guard checks every statement the tests run (design §3.6).
- OPN1's remote probe sends a negative probe for each of these limits, to prove the guard matches the service.

If the 1.3 MB, 7-statement replace batch is refused remotely, the fallback
is already designed: several smaller batches, each atomic and each leaving
the index consistent.

## OPN-C — green tests, broken on D1 (RETIRED with D1)

The cirrus port shipped Postgres-only SQL (a data-modifying CTE, `now()`)
that tests on a Postgres-like engine never caught. Organization create then
failed on D1 (factory trap 16).

**Mitigation:** two parts.
- The D1 harness is workerd's own SQLite, never better-sqlite3 or PGlite.
- Every ported statement is covered by the differential suite until Postgres is deleted. The suite compares results, not just "did not throw".

## OPN-D — the 10 GB database cap (RETIRED with D1; see OPN-T for Supabase's)

D1 cannot grow a database past 10 GB. At the scale target the snapshot table
gains about 1.8 million rows a year and observations about 438,000. That is
far under the cap for years, but it is the only table that keeps growing.

**Settled:**
- Snapshots older than 400 days roll up to weekly rows.
- Observations older than 90 days drop. Only the latest per (metric, window) is ever read.

**Revisit** when the database passes 2 GB. The next step is a second D1
database for snapshots, or archiving to R2.

## OPN-E — the openproduct account's free-plan mint cap (RISK)

`limit.credential_mints_per_day` is 200 on every plan today, and an
openproduct account can never change plans. A merge that deploys a dozen
lanes in two environments costs about 50 mints. On busy days openproduct has
merged 47 times.

**Mitigation:** orun-cloud#1905 raises the cap to 5000 and must land before
OPN2. It has been open since 2026-10-15 and has conflicts.

## OPN-F — which Cloudflare account (RESOLVED)

**Decided (2026-11-09):** a dedicated account, connected to the openproduct account as the `openproduct` connection (`int_7fbdaafa…`). A token for it cannot touch the platform's Workers or the portfolio products. That matters now that the deploy pipeline runs from a public repository. The cost is that the `openproduct.live` zone moves at the prod switch (OPN-G).

The alternatives were:
- The factory's `nexo-7be` account: shared with the portfolio products, and the zone still moves.
- The platform's `oruncloud` account: the zone stays, but a leak in this pipeline would reach the platform.

**Follow-on:** the workspace inherits the other two Cloudflare connections too, so brokered secrets name the connection by id (design §4).

## OPN-G — the zone move causes an outage (ACCEPTED)

A Worker custom domain needs the zone in the Worker's own account. A proxied
CNAME into another account is refused (error 1014). So with option 1 or 2 of
OPN-F, `openproduct.live` leaves the old account and is added to the new one.
The site can be down from the removal until the nameservers agree, and how
long depends on the registrar.

**Accepted:** there are no active customers. Check the registrar before
OPN3. If it is Cloudflare Registrar, use its move-between-accounts flow.
Schedule a quiet hour.

## OPN-H — the two copies drift (RISK, mitigated)

From the cut until the switch, openproduct exists in orun-cloud (serving
prod) and here (being ported).

**Mitigation:**
- A code freeze on `apps/openproduct/` in orun-cloud from OPN1's cut SHA until the OPN3 switch. Security fixes land in both.
- The cut script's fixes are upstreamed to orun-cloud first, so the cut can be re-run from a newer SHA if the freeze breaks.

## OPN-I — the licence (RESOLVED)

**Decided (2026-11-09):** MIT, matching the portfolio products. `LICENSE`
landed in the repository's first commit, before any code. AGPL-3.0, which
would have required a hosted fork to publish its changes, was the
alternative.

Fonts are OFL 1.1 with their licence texts committed. Brand assets are not
in the tree.

## OPN-J — public CI (RESOLVED)

**Decided:**
- GitHub-hosted runners only, never `pull_request_target`.
- Fork PRs run an offline verify job, after a maintainer approves.
- Deploys only from `refs/heads/main` through the OIDC exchange, with approval.

**Why:** the monorepo's workflow targets self-hosted spot runners with an
instance profile. Copied onto a public repository, it would let a fork PR
choose them (re-check 2026-11-09).

## OPN-K — the seam keys (RESOLVED)

**Decided:** fresh `LISTING_SEAM_SECRET` and `OPENPRODUCT_AUTH_SEAM_SECRET`
values per environment, created in this workspace at OPN2 and set on the
platform side at each environment's switch.

**Why:** the old values live in the platform's AWS escrow, which this
deployment never reads. A move is the moment to rotate. The auth seam key
authorizes an account-lookup endpoint, so it is never reused.

## OPN-L — "Sign in with Orunbase" before the switch (ACCEPTED)

The `openproduct-live` OAuth client accepts only
`https://openproduct.live/auth/callback`. OAuth therefore cannot complete on
the new workers.dev hosts before the prod switch.

**Accepted:** stage and pre-switch prod are tested with password sign-in,
which goes over the auth seam. OAuth is verified as the last step of the prod
switch. A temporary second redirect URI was considered and rejected: it is a
platform-side change to undo later, for one test.

## OPN-M — existing listings do not carry over (ACCEPTED)

Fresh data means the current listings (the ten factory products among them)
are not copied.

**Accepted** by the owner (2026-11-09): there are no active customers. Owners
re-list through openproduct.live → Create or "Link a workspace". The
platform's public workspaces themselves are unaffected.

## OPN-N — read replication (RETIRED with D1)

Off at first. With it on, every read-after-write path needs the Sessions API
and a bookmark, or a maintainer can save and then see the old value.

**Revisit** after OPN4, with traffic numbers. Public reads are edge-cached,
so replication helps cache misses and signed-in reads only.

## OPN-O — a Postgres feature with no SQLite form (RETIRED with D1)

The inventory (design §3.3) found nothing without an equivalent:
- no interactive transactions in production code;
- no full-text search, because search deliberately uses term overlap;
- no advisory locks, no `LISTEN`/`NOTIFY`, no extensions.

The two triggers have SQLite forms.

**Mitigation:** OPN1 covers the hardest forms. Anything new found in OPN2 is
added to design §3.3 in the PR that meets it.

## OPN-P — openproduct reviews its own listing (ACCEPTED)

Publishing a listing takes a one-time admin review by openproduct's
operators, and here the listing is openproduct itself.

**Accepted:** the review checks a public repository, a pitch and a linked
workspace. All three are mechanical for this listing, and the review is
recorded like any other.

## OPN-Q — the workspace's creation door (RESOLVED)

**Answered (2026-11-09):** `POST /v1/organizations` with `accountId` set to
the openproduct account (`ws_SMS84Q22`) created `ws_VTNEQKAP` with
`visibility: public`. It inherited the `pullely` GitHub connection and the
account's shared provider connections. The openproduct.live → Create funnel
is the door for makers; the API is the same act, done by the account's owner.
The account already holds the portfolio's workspaces, which confirms it as
the home for products like this one.

## OPN-R — the first commit's author email (OPEN)

The repository's first commit (`7475226`) carries the personal address
`rahulvarghesepullely@gmail.com` as its author. Every later commit uses
`pullely@sourceplane.ai`, as the portfolio repositories do. Replacing that
commit means force-pushing `main`, which is the owner's call. The default is
to leave it.

## OPN-S — the Cloudflare account's plan (RESOLVED)

The `openproduct` Cloudflare account was on the Free plan. The probe
Worker's first deploy was refused ("CPU limits are not supported for the
Free plan", code `100328`). The Free plan cannot carry the product either:
- D1 allows 100,000 rows written a day, where one full probe load writes about 8 M;
- a Worker gets 10 ms of CPU and a 3 MB bundle, too little for the OpenNext website and the sweep;
- an invocation allows 50 queries.

**Decided (2026-11-11):** the owner upgraded the account to Workers Paid.
It is a standing prerequisite: design §8 names it beside the Orunbase
account's limits.

## OPN-T — which Supabase connection (RESOLVED)

The account shares one Supabase connection with every workspace: `arca-orun`
(`int_d9116c21…`, connected 2026-10-25). openproduct's two projects can go
there, or into a new connection for an `openproduct` Supabase organization,
as the Cloudflare side got its own (OPN-F).

The organization's plan matters too. Supabase's free plan holds two active
projects per organization, caps each database at 500 MB and pauses a project
after a week without activity. The monorepo's openproduct projects needed a
paid organization.

**Decided (2026-11-11):** a new `openproduct` Supabase connection
(`int_cc19cfd5…`), created by the owner the same day. `arca-orun` is not
used, so brokered Supabase secrets name the connection by id. OPN2's
database task checks that the organization's plan holds two projects that
never pause.

## OPN-U — stack-tectonic's migration job builds only lumen's package (RESOLVED upstream)

The `db-migrate` composition in stack-tectonic 0.21.0 runs
`turbo run build --filter=@saas/db` and closes its parameters, so it cannot
build `@openproduct/db`. orun-cloud's own copy of the composition grew a
`buildFilter` parameter for exactly this.

**Mitigation:** the same additive parameter in stack-tectonic (default
`@saas/db`, so lumen is unchanged), released as a new minor version. This
repository's pin then moves to it, in OPN2's database task. It is a change
in another repository, so it is its own pull request there.

**Resolved upstream (2026-11-11):** stack-tectonic 0.22.0
(sourceplane/stack-tectonic#23) adds `buildFilter`, default `@saas/db`. The
pin here moves to 0.22.0 in the Hyperdrive and migration task (OPN-7), the
one that adds `db-migrate`.
