# openproduct-stages-crew — implementation plan

One task per milestone, one PR per task, in order. Each PR keeps the web
tests and every web-perf lane green; a changed snapshot or budget says why in
its decision file.

## SC1 — four stages and where it runs (SC-2)

- Migration: `profiles.stage` CHECK → `idea|building|stage|production`;
  `shipping` → `stage` with a try link, else `building`. New columns:
  `stage_note` (what people can try), `production_url`, `production_since`,
  `production_version`, `production_access`, `stage_changed_at`,
  `stage_changed_by`. The try link is the stage link.
- Contracts: `PRODUCT_STAGES`, labels, `validateStageChange` (per-step
  required inputs, design §1.3), the public projection's `whereItRuns`.
- Core: `PUT …/profiles/{id}/stage` (write auth; one step only; per-step
  validation; optional automatic post with the comment if the auto-post path
  allows it). Retire `syncStage`.
- Web: the Stage row in Edit details, the Change stage popup (desktop dialog,
  phone full screen), Where it runs under the header, stage badges
  everywhere `StageWord`/`StageMark` read the old two stages.

## SC2 — crew roles (SC-3)

- Migration: `listing_maintainers.role` → `lead|maintainer|member`
  (`owner` → `lead`); a `source` column (`creator|seat|orunbase`) and a
  `locked` flag for Orunbase admins (used in SC3).
- `authorize.ts`: one table, role → actions (design §2.3); every call site of
  `authorizeFor`, `crewOf`, `mayLaunch`, roster and talk moves to it.
- Core: `GET …/crew` (paged, search, role filter, counts), `PUT
  …/crew/{subject}` (Lead only; never a locked Lead). An approved
  `join_request.decided` adds a Member.
- Web: crew tab summary, the Edit crew popup.

## SC3 — synced from Orunbase (SC-4)

- Gateway: `/seam/v1/project-events`, verified like the other seam paths,
  forwarded to core.
- Core: apply `project.roster` (add, re-lock, remove, consent rows retired
  for the removed) and `project.deploy` (a `product_deploys` table per
  environment); fixtures in `seam-fixtures/`.
- Where it runs and the stage form read crew value ?? synced value; Use
  synced clears the crew value.
- Web: the Orunbase card in the right rail (crew only).
- The seam spec gains S14 (the platform repo's copy is updated by the
  orun-cloud task); the epic status reads complete.
