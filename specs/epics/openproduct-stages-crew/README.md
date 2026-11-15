# openproduct-stages-crew

| | |
|---|---|
| Epic | `openproduct-stages-crew` (EP-5) |
| Status | Complete: SC0–SC3 landed (#23, #24, #25, #26) |
| Came from | Owner requests on 2026-11-15: change an idea's stage, show production, follow the Orunbase crew, roles for who maintains and posts |
| Design | `design.md`; boards in `boards/` (the canvas at version 99) |

Products move through four stages with the inputs each step needs and show
where they run; the crew is everyone with access to the linked Orunbase
project, synced automatically, with one role each.

| Milestone | Task | What lands |
|---|---|---|
| SC0 — the spec | SC-1 | This doc set, the boards, the contracts |
| SC1 — four stages and where it runs | SC-2 | Idea → Building → On stage → In production from Edit details, per-step inputs, Where it runs |
| SC2 — crew roles | SC-3 | Lead · Maintainer · Member on every write, the crew summary and the Edit crew popup, seats join as Members |
| SC3 — synced from Orunbase | SC-4 | The S14 seam edge received: crew and deploys follow the Orunbase project; the Orunbase card |

The platform half of S14 is built in sourceplane/orun-cloud (membership-worker
emits; state-worker signals deploys) under its own task (OCS-1,
sourceplane/orun-cloud#2405), and must be live before SC3 shows anything.
