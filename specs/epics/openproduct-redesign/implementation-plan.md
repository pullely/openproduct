# openproduct-redesign — implementation plan

Milestones land in order, one in flight at a time. Each milestone is one
task and one pull request on an `orun/OPR-<n>-<slug>` branch, with an
`Orun-Task` trailer and a manifest block. A milestone is marked ✅ here
when its "done when" list is true, and recorded in
`IMPLEMENTATION-STATUS.md`. The epic, its milestones and its tasks are
created in Orunbase; nothing in this repository creates them.

Every milestone is deployed to stage and then production by the merge, the
way the repository already deploys. Going live is not a milestone.

The boards in `boards/` are the reference for every surface named below.
"Matches the board" means: the same structure, copy, order, colours, type
sizes and control sizes as the board, at 1440px for a desktop board and
390px for a phone board, with the page fluid between them.

## OPR0 — the spec ✅

Task **OPR-1**. This doc set, the boards, and the five task contracts.

**Done when**
- the five documents, `boards/` and the OPR-1 to OPR-5 contracts are on `main`
- the epic, its five milestones and its five tasks exist in the workspace, each task with its contract attached

## OPR1 — the new look ✅

Task **OPR-2**. Every page that exists today takes the new design on
today's data. No schema change, no new API route.

- Tokens, fonts and the logo (design §3): the palette, the type ladder,
  the three self-hosted families, the dark ramp, pills and flat cards.
- The shell: one header on every page (logo, Feed · Products · Help
  wanted, the search box that opens into a results card, the Activity
  bell, the profile icon), the footer that carries the sections with no
  board, and on phone the four-tab bar.
- Pages, each to its desktop and phone board: Products, Help wanted,
  Search, a person, Your profile, Activity, Settings, Sign in, and the
  product page's visitor view with its header block, crew, "Built with"
  and "In the open" on today's fields.
- `/` keeps listing products for this milestone, in the new product
  card; it becomes the feed of posts in OPR2.
- Sections with no board (design §5) take the shell and tokens. The
  studio keeps working, restyled with the tokens only.
- Redirects for the addresses that move.
- Guards rewritten for the new design (design §9); snapshots regenerated.

**Done when**
- every page reachable from the header, the footer or the phone tab bar renders in the new palette and type on stage, with no page left in the old look
- Products, Help wanted, Search, a person, Your profile, Activity, Settings and Sign in match their desktop and phone boards
- typing in the header search opens the results card in place; a person row shows their products only after it is expanded
- the fonts load from the site's own origin, and the wire and per-route budgets pass or carry a recorded amendment
- `/builds/roles`, `/builds/newest` and `/me/notifications` redirect to their new addresses

## OPR2 — products post for themselves

Task **OPR-3**. The new stored things of design §6.1 and §6.2, and the
surfaces that read and write them.

- Migrations: `profiles.stage`, `profiles.try_url`, `product_milestones`,
  `product_posts`, `post_reactions`; the backfill of stage and try_url.
- The block catalogue in `packages/contracts`; core's validation of a
  post against it; gateway routes for posts, reactions and milestones.
- The feed at `/` (board `Feed`): one card shape per kind, Follow follows
  the product, reactions, comments on a post, the left profile panel and
  the right column for a signed-in visitor.
- The product page in full: the shipping page with its Updates, About and
  Crew tabs (board `Product`), and the idea page (board `ProductIdea`).
- The maker view as a client overlay (design §4): the Manage / Visitor
  switch in the header, Edit details in place, New post, the crew-only
  "Needs you" block with seat requests, and Edit on each section.
- The post builder (`Compose`, `PhoneCompose`) and the single post page
  (`Post`, `PhonePost`).
- Posts that write themselves (design §6.2), each offered to the crew
  and published only when Post is pressed.
- The studio's listing pages redirect to the product page (design §5).
- `/docs/posting` from board `Templates`.

**Done when**
- a crew member publishes each of the four authored kinds from the builder, and Post stays disabled until every required block is filled and within its limit
- `/` shows published posts newest first, each in its kind's card, and a visitor with no account sees the same page as anyone else
- a product with no shipped milestone renders as the idea page, and one with a shipped milestone as the shipping page with its count of milestones
- a crew member edits the name and pitch in place and sees "Needs you"; a visitor to the same address sees neither, and the public HTML is identical for both
- `/studio/[org]/[profile]` redirects to the product's page

## OPR3 — threads, public and private

Task **OPR-4**. Design §7.

- Migration: `threads.visibility`, `threads.kind`, `threads.resolved_at`.
- The repository's public reads filter on visibility; one signed-in
  route serves private threads to their author and the crew; the test
  that lists every thread read (design §7).
- The Talk tab on the shipping page and the Talk section on the idea
  page, desktop and phone: start a thread with its kind and the Public /
  Private switch, the All / Public / Private filter, replies, the Crew
  tag, Mark resolved for issues.
- Notifications: a private thread reaches the crew in "Needs you" and
  Activity; a crew reply reaches the author in Activity.
- The studio's discussions page redirects to Talk.

**Done when**
- a signed-in visitor starts a private thread on a product and sees it; a second signed-in visitor who is not on the crew gets 404 for its address and does not see it in any list
- a crew member sees that thread under Private, replies, and the author gets an Activity row for the reply
- a private thread's title and text appear in no public page, feed, sitemap, search result or export of another person's data
- a crew member marks an issue resolved and the thread shows Resolved to everyone

## OPR4 — demos

Task **OPR-5**. Design §8. Starts once risks R1 is answered.

- Migration: `product_demos`; R2 storage of a recording; the signed seam
  route that receives a finished run.
- Record a demo (boards `DemoFlow`, `PhoneDemo`): pick flows, watch the
  run, review, post or discard.
- The Demo post card with its step player, in the feed, on the product
  page and on the post page; "Demo ready to review" in "Needs you".

**Done when**
- a crew member starts a recording for a product from its page, and a run in which a step fails keeps nothing
- a finished recording is visible only to the crew until one of them presses Post
- the posted demo plays in the feed with its steps, and names the environment it ran against

## Sequencing note

OPR1 comes first because it changes no data: it can be judged by eye and
it gives every later milestone its components. OPR2 comes before OPR3
because Talk sits on the product page OPR2 builds. OPR4 is last because it
is the only milestone that depends on something outside this repository.

A milestone is one pull request. The one allowed split is a migration the
running code has to survive first: if OPR2's or OPR3's migration cannot
ship in the same deploy as the code that reads it, the migration lands as
its own task (`OPR-6` onward) ahead of the milestone's task, and the
status file says so.
