# openproduct-redesign (OPR) — implementation status

As-built ≠ intent. This file records what actually shipped, and every place
the code departed from `design.md`.

| Milestone | State | PR |
|---|---|---|
| OPR0 — the spec | ✅ done (2026-11-14) | [#15](https://github.com/pullely/openproduct/pull/15) |
| OPR1 — the new look | ✅ done (2026-11-14) | [#16](https://github.com/pullely/openproduct/pull/16) |
| OPR2 — products post for themselves | ✅ done (2026-11-15) | [#17](https://github.com/pullely/openproduct/pull/17) |
| OPR3 — threads, public and private | ✅ done (2026-11-15) | [#18](https://github.com/pullely/openproduct/pull/18) |
| OPR4 — demos | moved to the epic `openproduct-demos` (2026-11-15), not built | |

**The epic closed at OPR3 on 2026-11-15**, by the owner's decision (risks
R1's default). Orunbase has nothing that records a demo, so OPR4 had
nothing to build on; it is now `specs/epics/openproduct-demos/`. The
close-out is task OPR-6.

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

### Left at OPR1 for the data that OPR2 and OPR3 add

The boards show these and OPR1 leaves them out rather than fake them:
the stage (idea or shipping), milestones and the progress bar, the stage
filters on Products and Help wanted, template posts and reactions, the
product page's tabs and maker view, Talk, a person's products in search,
the stage word and logo in search rows, "Requested" on a seat (the
overlay counts requests but does not name the openings), the Following
and Drafts sections of Your profile, and the Mentions and Seats tabs of
Activity.

## OPR2 — as built (OPR-3)

A product has a stage, milestones and template posts; the feed is the home
page; the product page is where its crew runs it.

- **Data.** Three additive migrations: `2265` (`profiles.stage`,
  `profiles.try_url`, `product_milestones`), `2270` (`product_posts`,
  `product_post_reactions`, the thread tag `post`) and `2275` (an index
  for a person's posts). Ids are `ppo_…` and `pms_…`.
- **Templates.** `packages/contracts/src/product-posts.ts` holds the five
  kinds with their blocks in fixed order and their limits. The validator,
  the builder and `/docs/posting` all read that one catalogue. A post with
  a block out of order, an unknown block or free-form content is refused.
- **Routes.** Public and cached: the feed, one post, a product's posts, a
  person's posts. Signed in: reactions, following, and the overlay's
  `reactions`, `crew` and `requestedOpenings`. Crew, under the product:
  posts (draft, save, publish), milestones (add, edit, reorder, ship),
  needs-you, and the pitch and "Try it" address. The API changelog is at
  1.4.0 (`card.milestoneCounts`, `card.crewCount`).
- **The feed** is `/`: posts newest first in their card shapes, "Show
  more" at `/feed/<cursor>`, the signed-in columns from the overlay.
- **The post page** is `/<slug>/posts/<id>`: the post, reactions, Share
  and its comment thread.
- **The product page.** A shipping product has Updates, About, Crew and
  Talk at their own cached addresses (`/<slug>`, `/about`, `/crew`,
  `/talk`); an idea is one lavender page. The same cached bytes go to
  everyone: the Manage/Visitor switch and every maker control arrive
  through the overlay for the crew only, and sit in the header.
- **The maker view:** edit the pitch and "Try it" address in place, Needs
  you, milestones, seats added and edited on the Crew tab, New post, and
  one "More settings" entry to the studio's steps.
- **The builder** is `/<slug>/new`: the card is the editor, with counters
  against the limits and Post off until the required blocks are filled.
  It works as a plain form without JavaScript.
- **Lists.** Stage views at `/products/stage/<shipping|ideas>` and
  `/help-wanted/stage/<…>`; milestone bars and "needs a first builder" on
  cards; "Requested" on a seat; a person's products with their stage in
  an expanded search row; Posts on a person's page; Following and Drafts
  on Your profile.
- **Addresses.** `/studio` → `/me`. A published product's
  `/studio/<org>/<profile>` → its page; its overview lives on at
  `/studio/<org>/<profile>/settings`.
- **Budgets.** The wire budget did not move (276 KB, 30 requests). `/`
  went down (JS 168,100, document 17,100). New budgets for the tab routes
  and the post page. `/people/<handle>` went up (document 17,500, reads
  5) for the Posts section and the stage lines. A page that draws the
  serif italic quote may fetch a fifth font file (104,740 bytes).
- **Guards.** 40 layout snapshots (`home` became `feed`; `post` and
  `idea` are new). No test was deleted or skipped.

### Left for OPR3

Private threads, a thread's kind and "resolved", the Talk tab's
public/private filter, and the Mentions and Seats tabs of Activity.

## OPR3 — as built (OPR-4)

Talk on a product: a thread has a kind and is public or private.

- **Data.** Migration `2280`: `threads.visibility` (default `public`),
  `threads.kind` (null for older threads and for comment threads),
  `threads.resolved_at` (issues only). The database itself refuses to
  make a private thread public, to move a private thread to another
  product, and to move a post between threads.
- **The privacy rule** is two SQL predicates in the repository. Every
  public read of threads or posts carries the public one; three signed-in
  reads carry the other (the author, or a maintainer of the product at
  the time of the read). Replying and voting are guarded the same way.
  `packages/db/src/pg/thread-privacy.test.ts` lists every statement that
  touches threads, posts, votes or mutes and fails when one is added
  unclassified; it runs every public read against a seeded private
  thread.
- **Routes.** `POST /threads` takes `kind` and `visibility`; private
  list, read and reply under `/threads/private`; resolve and reopen for
  the crew. Anyone not allowed gets one 404, signed in or not; private
  answers are never cached.
- **Nothing private is in a public page, the feed, the sitemap, search,
  the digest, the MCP tools or another person's export.** The export of a
  person's own rows names a thread's title only if it is public or they
  can read it now.
- **Notifications.** A new private thread reaches the crew's Needs you
  and Activity; a crew reply reaches the author; an author reply reaches
  the crew. A row holds who and where, never a title or text. No mentions
  and no upvote notices come out of a private thread.
- **Web.** Talk on the shipping page's tab and on the idea page: one
  composer with the kind and the Public/Private switch, the All / Public
  / Private filter, kind and Resolved on rows, Mark resolved for the
  crew. The cached page draws public threads only; private rows arrive
  after load for a signed-in reader. A private thread's page is the same
  shell for everyone and shows not-found to anyone not allowed.
- **Addresses.** `/studio/<org>/<profile>/discussions` → the product's
  Talk; lock, unlock and answer stay on the Settings card.
- **Budgets.** `/product-00/talk` went up (JS 184,900, document 26,250).
  Nothing else moved.
- **Also fixed:** the inbox's kind check never allowed `launch.listing`,
  so those rows had been refused since PP1; `2280` allows it.

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

### From OPR2

- **The studio's steps stay.** The product page does not yet upload
  media, pick topics, manage the roster or publish a draft, so those
  steps keep working behind "More settings". Design §5 had the studio
  redirect entirely.
- **A draft's studio address forwards too**, to its `/settings`: one
  address cannot be both a redirect and a page. The forward is a 307,
  because where it lands depends on the listing's state.
- **A product is not renamed from "Edit details".** The name is the
  address; a rename would move the page.
- **The pitch limit is 200 characters**, not the board's 120: pitches
  that long already exist.
- **Seat requests are reviewed on Orunbase.** Needs you has no Accept or
  Decline; "Review on Orunbase" opens the workspace, not the request
  itself, because the console has no address for one request.
- **A product's first idea post is a draft** its maker publishes; the
  site does not post on a product's behalf.
- **Feed cards have React and Comment, no Share.** Share is on the post
  page.
- **The feed's focus effect scales the centred card and does not dim the
  others:** dimmed muted text falls under 4.5:1.
- **The feed's right column has a Following card** after Worth
  following; the board has only the latter.
- **A person's page keeps its Products list** under the new Posts
  section.
- **The sitemap lists the feed's first page of posts**, not every post.
- **Known edges.** The catalogue is materialised, so a card not yet
  rebuilt answers `crewCount: null` and draws no crew count. A crew
  member's first visit to a product page shifts once when the maker
  controls arrive. The seat list can be up to 60 seconds stale after a
  write.

### From OPR3

- **Crew, for a private thread, is the product's maintainers**, the same
  list every crew route checks. A confirmed person on the roster who is
  not a maintainer cannot read private threads. Design §7 said
  "confirmed crew".
- **"Leaves the crew" has two real paths only** (design §7.4): the
  person deletes their account, or the product is deleted. The site has
  no way to remove a maintainer and gets no event when someone leaves a
  workspace on Orunbase, so such a person keeps access until their
  maintainer row is removed by hand. This is how every crew route has
  worked since OX4; it needs an owner decision (a "remove maintainer"
  act, or an event from Orunbase).
- **Moderators cannot read a private thread** (design §7.6): the private
  view has no report control.
- **An author who deletes their account** leaves the private thread
  readable by the crew, with the author anonymised.
- **A private thread needs only a signed-in person**; a public thread
  still needs a public profile.
- **Replies open on the thread's own address**, not inline in the list.
- **A thread starts with a title only** (160 characters).
- **Private threads sit above public ones under All**, not mixed by
  time.
- **The third kind reads "Suggestion"**; the phone boards say "Idea".
  Issues are filed under the forum's Question tag.
- **The quiet Post button uses body ink**: the board's grey is under
  4.5:1.
- **Activity keeps All / Comments / Launches.** No notice is a mention
  or a seat request, so the Mentions and Seats tabs are left out.
- **Known edges.** A reader with private threads sees the list shift
  once when they arrive. A resolved public issue shows on the cached
  Talk page within a minute.
