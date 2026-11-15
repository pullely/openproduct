# openproduct-stages-crew

| | |
|---|---|
| Epic | `openproduct-stages-crew` (EP-5) |
| Status | In progress: SC0 lands with this PR |
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
| SC3 — synced from Orunbase | SC-4 | The S13 seam edge received: crew and deploys follow the Orunbase project; the Orunbase card |

The platform half of S13 is built in sourceplane/orun-cloud (membership-worker
emits; state-worker signals deploys) under its own task, and must be live
before SC3 shows anything.
