# openproduct-stages-crew — implementation status

| Milestone | Task | State | PR |
|---|---|---|---|
| SC0 — the spec | SC-1 | Done | #23 |
| SC1 — four stages and where it runs | SC-2 | In review | this PR |
| SC2 — crew roles | SC-3 | Not started | |
| SC3 — synced from Orunbase | SC-4 | Not started | |

## From SC1

What landed:

- Migration 2285: `profiles.stage` holds `idea`, `building`, `stage` or
  `production`; every `shipping` row became `stage` when it had a try link
  and `building` when it did not. New nullable columns, each bounded by a
  check: `stage_note` (what people can try, ≤280), `production_url`,
  `production_since` (a date), `production_version` (≤40),
  `production_access` (everyone · waitlist · invite), `stage_changed_at`,
  `stage_changed_by` (a subject id, classified as a record in the subject
  registry). The try link is the stage link.
- `syncStage` is retired: milestone writes no longer touch the stage, and
  their answers say the stage as it stands.
- Contracts: the four stages with their words (`PRODUCT_STAGE_LABELS`,
  `PRODUCT_STAGE_MARKS`: IDEA, BUILDING, ON STAGE, IN PRODUCTION) and a pure
  `validateStageChange(current, input, now)` — design §1.3 exactly: one step
  only, each step's required inputs, the comment and `post`. The public
  projection gains `whereItRuns` (`{stage, production}`, each row with
  `setBy`/`at`), named through the public roster only; `setBy` leaves room for
  SC3's `{kind: "orun"}` and the effective value crew ?? synced (§3.3). The
  catalog API carries it too (1.5.0), and its `stage` is now `authored`.
- Core: `PUT …/profiles/{id}/stage`, beside the milestone routes, through the
  crew's write door. The write is guarded by the stage it leaves (a product
  that moved meanwhile answers 409). → Building writes the repository to
  `repo_url` and appends the first milestone unless one of that title is
  held. Every change is audited (`openproduct.profile.stage_changed`, with the
  reason, the comment and `post`). The gateway purges the product page and the
  feed on it.
- Web: the Stage row inside Edit details (badge, "Next: …", Change stage);
  the Change stage popup — a modal dialog over a scrim, full screen on a phone
  with the stages stacked and the footer pinned; the four stages in a 2×2
  grid, only the next and the previous pickable; each step's fields with `*`;
  "n of m required"; Move locked until the contract says the request is
  whole; core's refusals under their fields; Escape, ✕, Cancel and the scrim
  close it; focus is trapped and returned. Where it runs under the header of
  every product page, idea or not. Every stage word, mark and badge reads the
  four stages in their colours (lavender, amber, slate, green); the products
  directory and Help wanted filter by each of them. "Try it" is the stage
  link; in production the button is "Open it", to the production link.

Departures from the design, said plainly:

- **No post to the feed, so no comment box and no "Post it to the feed".**
  The products-post-for-themselves path (OPR2) writes one of five fixed post
  kinds, and none of them is a stage change; a sixth kind would be a new
  template, which this task does not invent. The API still takes `post` and
  `comment` (validated, kept in the audit entry) and answers `posted: false`,
  and the popup shows neither control rather than a box that promises a post
  nothing writes. A stage-change post kind is a follow-up for the owner.
- **The products directory's and Help wanted's filters list all four
  stages** (Everything · Ideas · Building · On stage · In production), each at
  its own address (`/products/stage/on-stage`, …). OPR-3's
  `/products/stage/shipping` and `/help-wanted/stage/shipping` are no longer
  pages (404), and the directory's count line says "N built" for the three
  stages past an idea.
- **Edit details keeps the stage link field**, relabelled from "Try it
  address" to "Stage link", so a crew can correct it without moving the
  stage back and forth. The board's Edit details does not draw it.
- **"Who set it" is the last stage change.** One pair of columns records the
  last move, so the STAGE row names who put it on stage only while it is on
  stage; in production the PRODUCTION row carries it. A product backfilled
  from `shipping` names nobody until it next moves.
- The phone popup is the same component at the phone breakpoint, not a
  separate sheet; the board's "Synced from Orunbase" lines and Use synced wait
  for SC3.
