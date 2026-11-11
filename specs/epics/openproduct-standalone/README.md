# Epic: openproduct-standalone (OPN)

**openproduct lists open builds, but is not one. It lives in the private
Orunbase monorepo, deploys with the platform's private plumbing (AWS roles,
Secrets Manager, self-hosted runners) and keeps its data in a Postgres it
inherited from its first day as a schema in the platform's database. This
epic rebuilds it as an openproduct: a public repository, a public workspace
in an openproduct account, Cloudflare only, deployed through Orunbase exactly
the way the products it lists are deployed. What makes this cheap is that
openproduct has no customers yet. Nothing is migrated. A parallel product
comes up on new URLs with fresh databases, and openproduct.live switches
over when the new deployment is green. D1 was proven on one slice first, and
OPN1 ended in a no-go for it (2026-11-11), so those databases are Supabase
projects of its own, built by the code it already has.**

Today a change to openproduct fans out the monorepo's CI. Its database is a
Supabase project plus Hyperdrive, and its repository cannot be read by the
people it asks to build in public. When this epic ships, openproduct deploys
from `pullely/openproduct` alone. It talks to the platform only over the
versioned HTTP seam it already uses, stores everything in its own Supabase projects, R2 and Durable
Objects, and holds no platform-privileged credential beyond the two seam keys.
It is also listed on openproduct.live, like everything else there.

The epic, its milestones and its tasks live in Orunbase, in workspace
`openproduct-live` (`ws_VTNEQKAP`). This directory is their design, and
`tasks/` holds their contracts.

## Status

| Field | Value |
|-------|-------|
| Status | In progress: OPN0 and OPN1 shipped (OPN1 ended in a no-go for D1); OPN2 (live on its own URLs, on Supabase) is next |
| Cluster | **OPN** (OPN0–OPN4) |
| Owner(s) | `core` (data and rules) · `packages/db` (the repository, executor and schema) · `gateway` · `web` · `infra/*` (Supabase, Hyperdrive, R2, domains) · `.github/workflows` + `intent.yaml` (the deploy path) |
| Builds on | `sourceplane/orun-cloud` at a named commit: `apps/openproduct/` (openproduct-independence OX0–OX7: the product boundary, the gateway, the HTTP seam, a cut-ready tree). It is **not** a baseline bootstrap. The D1 slice's executor came from the `cirrus` baseline; the Supabase wiring follows `lumen`'s. |
| Changes | Repository, workspace, Cloudflare account, database (new Supabase projects, same engine) and deploy path all change. The seam's wire format, the product's routes and its pages do not. |
| Decisions locked | (1) **Public from the first commit.** The repository is `pullely/openproduct`, a snapshot with no history; the workspace is public in the openproduct account from day one. (2) **Cloudflare for compute, Supabase for data.** Revised at OPN1's no-go (2026-11-11); it read "Cloudflare only: D1 replaces Supabase and Hyperdrive". R2 media and the rate-limit Durable Object stay. The account is the `openproduct` Cloudflare connection. (3) **Fresh data.** New Supabase projects, built by the existing migration ladder; nothing is copied. Existing listings are re-listed by their owners. (4) **Workspace-native deploys.** stack-tectonic pinned from GHCR, the orun-action CI on GitHub-hosted runners, every credential a workspace secret. No AWS, no self-hosted runners, nothing provider-shaped in GitHub. (5) **Prove, then port.** OPN1 ends in a go/no-go on one slice before OPN2 rewrites the rest. (6) **Differential tests.** The D1 slice was proven by the same cases on Postgres and on real D1, never on a Postgres-like engine alone. They retire with the slice in OPN2. (7) **Parallel run, then switch.** Stage switches before prod; until the prod switch, rollback means not switching. (8) **The seam does not change on the wire.** The fixtures carry over byte-identical; only URLs and keys change. (9) **MIT.** |
| Gate | **OPN1 ended in a go/no-go: no-go (2026-11-11).** OPN2 runs on Supabase, with the existing code taken as it is (design §11). OPN3–OPN4 are unchanged. OPN3 also waits on platform-side pull requests in `sourceplane/orun-cloud` (design §6). |
| Shipped as | |

## Read order

1. `design.md`: where it lives, the tree, the data plane (D1 as planned, then Supabase as decided, §11), the deploy path, the D1 proof, the seam and the switch, the public-repo posture, what is out of scope, and the alternatives rejected.
2. `implementation-plan.md`: OPN0–OPN4 and what "done" means for each.
3. `risks-and-open-questions.md`: what could go wrong, what is decided, and what is still open.
4. `IMPLEMENTATION-STATUS.md`: what actually shipped, kept separate from intent.

## Milestones at a glance

Each milestone ends at a boundary: a point you judge, an outside service, or
another repository.

| Milestone | What you will see | Ends at |
|---|---|---|
| OPN0 — the spec | this doc set, reviewed and merged | your review: the design is adopted |
| OPN1 — the tree, with D1 proven on one slice | the product code building green in this repository, and the catalogue and search running on real D1 on stage with timings | your go/no-go on D1 |
| OPN2 — live on its own URLs, on Supabase | stage and prod running from this repository on the new Cloudflare account and their own Supabase projects | another repository (orun-cloud) and the zone move |
| OPN3 — openproduct.live served from here | the live site, the API host and the platform's seam pointing at this deployment | your call to destroy the old deployment |
| OPN4 — openproduct, listed on openproduct.live | openproduct's own listing, linked to this repository; the old deployment destroyed | — |
