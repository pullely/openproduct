# openproduct-redesign (OPR) — implementation status

As-built ≠ intent. This file records what actually shipped, and every place
the code departed from `design.md`.

| Milestone | State | PR |
|---|---|---|
| OPR0 — the spec | ✅ done (2026-11-14) | [#15](https://github.com/pullely/openproduct/pull/15) |
| OPR1 — the new look | ✅ done (2026-11-14) | [#16](https://github.com/pullely/openproduct/pull/16) |
| OPR2 — products post for themselves | | |
| OPR3 — threads, public and private | | |
| OPR4 — demos | waits on risks R1 | |

## Inputs

- The design canvas, 29 boards, as of 2026-11-14 (`boards/`, with
  `boards/canvas.json` as its index). One stage hostname in a sample post
  was replaced with `[stage-url]` before the copy.
- `main` at `2d8f5a7` (OPN3: openproduct.live served from here).

## OPR1 — as built (OPR-2)

Every page takes the redesign on today's data. No schema change, no new
gateway route.

- **Foundations.** Every existing token kept its name and took the
  redesign's value, in both ramps; new tokens `amber`, `idea`, `version`,
  `seat`, `sunken`, `well`. Hanken Grotesk, Lora and IBM Plex Mono are
  self-hosted (five Latin files, 98,664 bytes); Geist and Newsreader are
  gone. Cards are flat, controls are pills, the mark is the P with an o
  for a head. `tests/web/src/redesign-foundations.test.ts` pins all of it.
- **The shell.** One frosted header (Feed · Products · Help wanted, the
  search that widens into one card, the Activity bell, the profile
  control), four floating tabs on a phone, one footer on every page that
  carries the sections with no board. The command palette became the
  header search.
- **Pages to their boards:** Products, Help wanted, the product page's
  visitor view, a person, Search, Sign in, Your profile, Activity,
  Settings. Sections with no board, the forum and the studio took the
  tokens with no change of structure.
- **Addresses.** `/builds/roles` → `/help-wanted`; `/builds/newest` and
  `/builds/upvoted` → `/products/by/<order>`; `/leaderboard` →
  `/products/by/upvoted`; `/me/notifications` → `/activity`; `/me/saved`
  and `/me/applications` → sections of `/me`. `/` lists products (it
  becomes the feed in OPR2) and does not call itself a feed.
- **Guards.** About sixty suites in `tests/web` were rewritten to pin the
  new design, and six added; none was deleted or skipped. The 32 layout
  snapshots were re-recorded with Playwright's pinned Chromium.
- **Budgets.** The wire budget stays at 276 KB and 30 requests: Lora
  italic is declared but not preloaded, so a page fetches four font
  files (75,924 bytes measured). The fonts budget is four files and
  82,000 bytes. No per-route budget moved.

### Left for the data that OPR2 and OPR3 add

The boards show these and OPR1 leaves them out rather than fake them:
the stage (idea or shipping), milestones and the progress bar, the stage
filters on Products and Help wanted, template posts and reactions, the
product page's tabs and maker view, Talk, a person's products in search,
the stage word and logo in search rows, "Requested" on a seat (the
overlay counts requests but does not name the openings), the Following
and Drafts sections of Your profile, and the Mentions and Seats tabs of
Activity.

## Departures from the design

- **Sorted Products pages are paths, not a query.** Design §5 wrote
  `/products?sort=`. A page that reads its query string renders per
  request and is not cached, which breaks the rule design §4 keeps. The
  sorts are `/products/by/newest` and `/products/by/upvoted`.
- **Products pages with "Show more", not numbered pages.** The
  catalogue's cursor only moves forward. The sorts are the three orders
  the catalogue publishes (most active, newest, upvoted); the board's
  "Most open seats" and "A–Z" have no order behind them.
- **Sign in says what it does.** The board offers an email link. The
  site signs in with a password and emails a six-digit code on sign-up,
  so the page is labelled that way.
- **No "Delete account" on Settings.** The board has it; the site has
  never had the flow. A guard holds how one must look when it is built
  (red, behind a confirmation, never a link).
- **The product page keeps Upvote, Save and Share** as a second, smaller
  row of actions. They are not on the board, and the product page is the
  only place a product can be upvoted (risks R4).
- **Amber words on the amber tint use a deeper ink** (#85601D) than the
  board's #8A6420, which is 4.36:1 there.
- **The header search box is 268px wide**, not 260: the placeholder was
  cut at 260.
- **Text fields are white under a hairline**, where the Settings and
  Sign in boards use a sunken fill.
- **`/signin` shows the footer and the phone tab bar**; the board draws
  neither.
- **"Open a build" is a footer link.** The header on the boards has no
  place for it.
