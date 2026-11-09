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

- Source: `sourceplane/orun-cloud` `origin/main` `b421bc672` (2026-11-09). The cut is re-taken at OPN-2, and that commit is the one recorded here.
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
| Tasks | OPN-1 `tsk_N14BB1XD` (OPN0, contract attached) |

## D1 slice proof

(OPN1. Local differential results, remote probe numbers against design
§5.3, and the go/no-go.)

## Departures from the design

(One subsection per departure: what the design said, what was built, why.)
