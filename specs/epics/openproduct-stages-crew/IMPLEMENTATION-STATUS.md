# openproduct-stages-crew — implementation status

| Milestone | Task | State | PR |
|---|---|---|---|
| SC0 — the spec | SC-1 | Done | #23 |
| SC1 — four stages and where it runs | SC-2 | Done | #24 |
| SC2 — crew roles | SC-3 | In review | this PR |
| SC3 — synced from Orunbase | SC-4 | Not started | |

## From SC2

What landed:

- Migration 2290: `listing_maintainers.role` holds `lead`, `maintainer` or
  `member`; every OX4 `owner` became `lead` (the old check dropped before
  the backfill, the three-role one added after it). Two new columns:
  `source` (`creator` · `seat` · `orunbase`, NOT NULL, default `creator`)
  and `locked` (NOT NULL, default false; a check allows it on a Lead only).
  Every row that existed is `creator`: until now the only ways onto a crew
  were creating the listing and an operator's hand-added row, both the
  listing's own side — no seat added anybody and nothing synced. Neither
  column holds a subject id, so the subject registry is unchanged.
- `authorize.ts` is one decision table: `read` (any role, or an operator),
  `write` (Lead, Maintainer — details, stage, posts, milestones, seats,
  media, launches, publish/unpublish, the link grant, the published roster,
  discussion moderation, resolving an issue), `read_crew` (any role),
  `manage_crew` (Lead), `read_private` (any role), `review` (the operator).
  Deny by default. Every call site moved onto it — `authorizeFor` (so
  `crewOf`, media and the profile routes), `mayLaunch`, the roster's actor
  roles, Talk's private list, notices and resolve, discussion moderation —
  and the 404s that hid a listing still hide it (a Member's write is the
  same 404 a stranger gets). OX4's separate `publish` action is folded into
  `write`: they always had the same answer.
- Core: `GET …/profiles/{id}/crew?q=&role=&cursor=` (30 a page, Leads then
  Maintainers then Members by name; the search runs over the crew's own
  names — `contributors.display_name`, else the public roster's
  `published_maintainers.display_name` — and handles; counts per role of
  the whole crew), `PUT …/crew/{subjectId}` `{role}` and `PUT …/crew`
  `{changes}` (≤100; Lead only). The repository's one statement refuses a
  locked row and the change that would leave no Lead, with every Lead row
  locked `FOR UPDATE` so two Leads stepping down at once cannot both win.
  Each change is audited as `openproduct.crew.role_changed` with the two
  roles and no subject id. The overlay's crew entries carry the role.
- Seats: an approved `join_request.decided` whose application the seam
  recorded (so through a listed door of this listing) adds the person as a
  Member, `source` seat, `ON CONFLICT DO NOTHING` — idempotent and never a
  demotion — beside the existing activity row. Denied, withdrawn and
  expired touch no crew.
- Gateway: the crew routes forward like the other crew routes; a save is
  one listing write; nothing is purged (no public document carries a role).
- Web: `GET`/`POST /{slug}/manage/crew`. The Crew tab's public card is
  "On the crew · N" (the consent roster, as before); after load the crew
  gets the roles card — the avatar stack, "N on the crew", "x leads · y
  maintainers · z members", the leads, and Edit crew for a Lead. The Edit
  crew popup: a dialog (focus trapped and returned; Escape, ✕, Cancel,
  scrim), search, All / Leads / Maintainers / Members with the whole crew's
  counts, 30 at a time with "Show more · n left", a role picker per row, a
  lock and "Lead" for a locked row, the changed rows highlighted, "Save n
  changes", core's refusals beside their rows; full screen on a phone, where
  a row opens a chooser of the three roles with what each can do. A Member
  has no Manage switch and no maker controls; a Member reads the private
  threads.

Budgets, said plainly: the product page's JS limit moves 177,800 →
178,628 (CI measured 178,562 for Updates, About and Crew: the role on the
overlay's crew entry, the gate that reads it and the roles card's gate; the
card and the popup are chunks fetched for the crew only), the measurement
plus the 66 bytes of room it had, recorded in `tests/web-perf/src/budgets.mjs`.
The first build put the home 100 bytes over the 306 KB wire budget; reading
the role inline in `ui/overlay.ts` (in every page's bundle) instead of
importing the contracts' helper brought it back under, so the wire budget
did not move. No snapshot moved.

Departures from the design, said plainly:

- **The roles are the crew's, not the public page's.** The board draws the
  counts, the leads and the avatar stack on the crew tab; here they are the
  crew's own card, read after load, and visitors see the consent roster as
  before ("On the crew · N"). Who holds which role includes people who have
  not agreed to be shown (design §2.6), so the cached page cannot carry it.
  The card is last in the column, under the seats, so nothing moves when it
  arrives.
- **One save is one request** (`PUT …/crew` with every change), beside the
  one-person `PUT …/crew/{subjectId}`. Batched PUTs would spend the
  gateway's listing-write bound (20 a minute) on a Lead sorting a big crew;
  each change is still its own guarded statement and audit entry, promotions
  to Lead first so a Lead can hand over in one save.
- **A Member may reply in a private thread** as well as read it: the
  privacy rule ("the author or the crew") governs both, as before. Resolving
  an issue is a write.
- **The operator does not read the crew list or the private threads**:
  `read_crew` and `read_private` are the crew's. The operator still reads
  the listing to review it.
- The audit entry names the two roles and not the person (a subject id in
  a payload is one the registry could not erase).

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

Budgets, said plainly: the wire budget is amended 305 → 306 KB (the home
measured 312,537 B, 217 over, with the stage colours and badge already split
out of the shared bundle; recorded in `tests/web/src/wire-budget.decision.json`).
The product page's JS limit moves 177,314 → 177,800 (measured 177,734; it had
seven bytes of room) and its documents gain Where it runs (Updates 25,256 B,
About 25,281, Crew 22,050, Talk 26,418), each limit moved by the same room it
had, with the numbers beside them in `tests/web-perf/src/budgets.mjs`. The
listing's phone snapshot moved 12px (the stage badge's pill), taken from CI.

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
