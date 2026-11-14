# openproduct-redesign — design

## 1. What is wrong today, and the thesis

The site was built as a directory: a list of builds in four orders, a page
per build, a forum, a studio for makers. Three things make it read as empty.

1. **It counts instead of showing.** Upvotes, followers and replies are
   zero for most listings, and zero is what the page leads with.
2. **Real progress is prose.** Twenty-one listings are ideas and nine have
   shipped milestones; that difference, the milestones themselves and the
   link to try the product all live in the listing's free text.
3. **There are too many places.** Builds, open roles, topics, people,
   stack, pricing, collections, launches, digest, threads, studio, me.

The thesis: **the products post for themselves.** What a product has done
(shipped a feature, cut a version, recorded a demo, opened a seat, started
as an idea) becomes a post of a fixed shape. The feed is those posts. A
product's page is its record and, for its crew, its dashboard.

## 2. Rules the owner set (locked 2026-11-14)

Each is a decision from the design review. They hold in every milestone.

1. **Template-only posting.** openproduct is not a social platform. A post
   is one of five kinds: Feature shipped, New version, Demo, New idea, Help
   wanted. There is no free-form post. Each kind has a fixed list of
   blocks, in a fixed order; a maker adds or removes optional blocks and
   never reorders them (§6.2).
2. **The kind shows in the card's shape, not in a label.** Each kind has
   its own card (boards `Feed`, `Post`).
3. **Follow follows the product.** The Follow control on a post or a product
   row follows the product. A person is followed only from their own
   profile.
4. **No People directory.** People are found through search and through
   products. The navigation is Feed, Products, Help wanted.
5. **No separate dashboard.** The product page is where its crew edits it,
   posts for it and handles requests. A Manage / Visitor switch in the
   header shows the crew what visitors see. The studio's pages go away as
   their jobs move onto the product page (§5).
6. **Search opens in place.** Typing in the header search widens the box
   into one card that holds the results. A person found in search is one
   row; their products show only when the row is expanded.
7. **Threads are public or private.** A public thread is visible to
   everyone. A private thread is visible to its author and the product's
   crew, and to nobody else (§7).
8. **No red unless it is danger.** Red is for errors, limits passed and
   destructive actions. Help wanted is teal.
9. **No optional text.** No subtitle that explains a control, no
   description under a choice. Labels, values and actions.
10. **Nothing takes a row for state.** Small controls live in the header.
11. **Flat.** No drop shadows; cards are flat white on the page colour.

## 3. The look, as tokens

The boards are the reference; these are the values the code carries. They
replace the current OKLCH ramp in `web/tailwind.config.mjs` and
`web/src/styles/globals.css`.

| Token | Value | Use |
|---|---|---|
| page | `#F6F4EE` | page background, with a faint dot grid and a soft amber glow at the top |
| card | `#FFFFFF` | cards, radius 16, no border, no shadow |
| sunken | `#F0EEE6`, `#F7F5EF` | wells, inner rows, text fields |
| ink | `#141413` | headings, primary button background |
| text | `#2B2A27` | body |
| muted | `#6B6A66` | secondary text (4.5:1 on page and card) |
| hairline | `rgba(20,20,19,0.06)` | row dividers |
| amber | `#B8862F`, text `#8A6420`, tint `#F3E7CC` | shipped, links |
| lavender | `#5B3F86`, deep `#2A1F3D`, tints `#ECE6F3` `#F4F0F8` | ideas |
| slate | `#3A4A75`, tint `#E6E9F2` | versions, private threads |
| teal | `#2F6F73`, text `#1F5357`, tints `#DDEDEC` `#F0F7F6` | help wanted, seats |
| green | `#2F7A4E` | success, resolved |
| red | `#8E3B27`, `#B4533C` | danger only |

**Type.** Hanken Grotesk for text, Lora 400 for page titles and idea
quotes, IBM Plex Mono for small uppercase labels. Sizes: 11 labels, 13
secondary, 15 body, 18 card titles, 16 inputs, 40 page titles (28 on
phone); mono labels 10.5 with 0.12em tracking. Weights stop at 600.

**Controls.** Buttons and chips are pills. Buttons are 40px tall on
desktop, text fields 44px; on phone every target is at least 44px. The
primary button is ink on any page; a kind's own action takes the kind's
colour (teal "Take the seat").

**The logo** is a "P" whose head is an "o": an ink stem and an amber ring
(inline SVG in every board's header).

**Fonts are self-hosted.** The wire budget allows no third-party host
(`tests/web/src/wire-budget.decision.json`), so the three families ship as
subset `woff2` files in `web/src/fonts` beside the current ones, loaded
with `next/font/local`. Geist and Newsreader leave when the last page that
uses them is restyled.

**Dark theme.** The boards are light. The site has a theme switch today,
and removing it would take something away from people who use it. OPR1
keeps the switch and derives a dark ramp from the palette above (risks R3).

## 4. Two rules of the current site that the redesign keeps

1. **Public pages are the same bytes for every visitor** and cache at the
   edge (rule I6). Everything personal arrives after load, from a signed-in
   read: your follows, your reactions, the Manage switch, "Needs you",
   private threads. The maker view of a product page is therefore a client
   overlay on the public page, never a different server render.
2. **The budgets hold.** Per-route JS, document, CLS and LCP budgets
   (`tests/web-perf/src/budgets.mjs`) and the wire budget stay as the
   limits. A milestone that needs one moved records the amendment the way
   the budget's decision file asks.

## 5. The page map

| New place (board) | Address | Today | Milestone |
|---|---|---|---|
| Feed (`Feed`, `PhoneFeed`) | `/` | `/` lists builds | OPR1 restyles the list; OPR2 makes it the feed of posts |
| Products (`Products`, `PhoneProducts`) | `/products` | redirects to `/`; lists live at `/builds/[order]` | OPR1 |
| Help wanted (`Seats`, `PhoneSeats`) | `/help-wanted` | `/builds/roles` | OPR1 |
| Product, shipping (`Product`, `PhoneProduct`) | `/[slug]` | `/[slug]` | OPR1 visitor view; OPR2 tabs, posts and the maker view |
| Product, idea (`ProductIdea`, `PhoneProductIdea`) | `/[slug]` | `/[slug]` | OPR2 |
| A post (`Post`, `PhonePost`) | `/[slug]/posts/[id]` | none | OPR2 |
| Post builder (`Compose`, `PhoneCompose`) | `/[slug]/new` | none | OPR2 |
| Record a demo (`DemoFlow`, `PhoneDemo`) | `/[slug]/demo` | none | OPR4 |
| Search (`Search`, `PhoneSearch`) | `/search` | `/search` | OPR1 |
| A person (`Person`, `PhonePerson`) | `/people/[handle]`, `/@handle` | same | OPR1 |
| Your profile (`Me`, `PhoneMe`) | `/me` | `/me`, `/me/saved`, `/me/applications` | OPR1 |
| Activity (`Activity`, `PhoneActivity`) | `/activity` | `/me/notifications` | OPR1 |
| Settings (`Settings`, `PhoneSettings`) | `/me/settings` | part of `/me` | OPR1 |
| Sign in (`SignIn`, `PhoneSignIn`) | `/signin` | `/signin` | OPR1 |
| Post templates (`Templates`) | `/docs/posting` | none | OPR2 |

**Addresses that move redirect** (`/builds/roles` → `/help-wanted`,
`/builds/[order]` → `/products/by/[order]`, `/me/notifications` →
`/activity`). The sorts are paths, not a query string, so the pages stay
cacheable (§4).

**Sections with no board stay reachable and take the new shell and
tokens, and leave the navigation:** topics, stack, pricing, collections,
digest and its feeds, launches, docs, transparency, the people list, the
forum index. They are linked from the footer. Retiring any of them is a
separate decision, not part of this epic.

**The studio** (`/studio/…`) keeps working through OPR1. In OPR2 each of
its jobs moves onto the product page, and its addresses redirect there:
details and media → Edit details; people and role openings → the Crew tab;
launches → the New version post; discussions → Talk (OPR3). Moderation
pages (`/studio/reports`, `/studio/appeals`, `/studio/collections`) are
not a maker's dashboard; they stay, restyled.

## 6. Data model

What exists is reused; four things are new.

| Design concept | Stored as | New? |
|---|---|---|
| product | `profiles` | no |
| crew | `listing_maintainers`, `product_people` | no |
| seat, request to join | `role_openings`, `applications` | no |
| follow (product, person) | `follows` | no |
| activity | `notifications` and its read cursor | new notification kinds only |
| saved | `saved_products` | no |
| comment, reply on a post | `threads` + `posts` (a system thread per post, as listing comments are today) | no |
| stage, milestones | §6.1 | **yes** (OPR2) |
| template post, reaction | §6.2 | **yes** (OPR2) |
| thread visibility, kind, resolved | §7 | **yes** (OPR3) |
| demo | §8 | **yes** (OPR4) |

### 6.1 Stage and milestones (OPR2)

- `profiles.stage`: `idea` or `shipping`. Backfilled `idea`; a product
  becomes `shipping` when its first milestone is marked shipped.
- `product_milestones`: `profile_id`, `code` (free text, "AS3"), `title`,
  `summary`, `position`, `shipped_at` (null until shipped). The product
  page's progress bar and "3 of 4" are a count of these.
- `profiles.try_url`: the address of the running product, shown as "Try
  it". `live_url` holds this today for some listings and is the backfill.

### 6.2 Template posts and reactions (OPR2)

- `product_posts`: `id`, `profile_id`, `kind` (`feature`, `version`,
  `demo`, `idea`, `seat`), `author_contributor_id` (null when Orunbase
  posted it), `blocks` (JSON: an ordered list of `{block, value}`),
  `state` (`draft`, `published`, `removed`), `published_at`, and optional
  links to what the post is about: `milestone_id`, `role_opening_id`,
  `launch_id`, `demo_id`.
- The block catalogue is code in `packages/contracts`, one list per kind,
  each block with its type, limit and whether it is required. It is the
  single source for the builder, the validator and the card:

  | Kind | Required | Optional |
  |---|---|---|
  | Feature shipped | Feature, What it does, Try it | For, Milestone, Screenshot, Demo |
  | New version | Version, Added | Changed, Fixed, Security, Breaking change |
  | New idea | Problem, Who has it | Why now, More detail, Seats needed, Evidence |
  | Help wanted | Role, What you'd do | Time, In return, Skills |
  | Demo | (made by recording, OPR4) | Title, Note |

- **Posts that write themselves.** Marking a milestone shipped offers a
  Feature shipped post prefilled from it. Opening a seat offers a Help
  wanted post. Publishing a listing for the first time publishes its New
  idea post. A deploy to production adds a status strip to the version's
  post. Nothing is published without a crew member pressing Post, except
  the first idea post, which the act of publishing the listing is.
- `post_reactions`: `post_id`, `contributor_id`, `reaction` (`useful`,
  `would_use`, `impressive`, `curious`), one per person per post. Counts
  show only above zero. Today's `endorsements` (the product upvote) stay
  as they are and are shown as "I'd use this" on a product.
- **The feed** is `product_posts` in `published_at` order, public and the
  same for everyone; "Following" is a client filter over the signed-in
  overlay.

## 7. Threads, public and private (OPR3)

Talk on a product is its existing forum (`threads`, `posts`), with three
additions: `threads.visibility` (`public`, `private`; default `public`),
`threads.kind` (`question`, `issue`, `suggestion`) and `resolved_at` for
issues.

**The privacy rule.** A private thread and its posts are readable by
exactly two groups: the thread's author, and the confirmed crew of the
product at the time of the read. The rule is enforced in the repository
read, not in the page:

1. Every public read of threads (`/v1/public/…/threads`, a product's forum,
   a person's activity, search, the sitemap, feeds, the digest, the MCP
   surface, exports of other people's data) filters `visibility = 'public'`
   in SQL. Private threads are never written to `search_index`.
2. Private threads are served by one signed-in route that checks author or
   crew membership per request and answers 404, not 403, to anyone else,
   so the existence of a thread is not disclosed.
3. A private thread cannot be made public. If the answer is worth
   publishing, the crew asks the author to post it as a public thread.
4. A person who leaves a crew loses access at once; the check is at read
   time, not a stored grant.
5. Notifications about a private thread (to the crew when one starts, to
   the author when the crew replies) carry no body text in email.
6. Moderation keeps its access: a report on a private thread is visible
   to moderators through the existing reports path.

A test in `packages/db` holds rule 1 by listing every repository read
that returns threads or posts and asserting each either filters on
visibility or is the one signed-in route.

## 8. Demos (OPR4)

A demo is a recorded run of the real product: Orunbase's agent writes a
Playwright script from the product's shipped milestones, runs it against
the product's stage with seed data, and records it. Only a run in which
every step passed is kept. The maker reviews it and presses Post; nothing
is published automatically. Typed secrets are masked in the recording.

- `product_demos`: `profile_id`, `title`, `steps` (JSON: label, passed,
  timestamp), `recording_media_id`, `run_ref` (the Orunbase run),
  `environment` (`stage` or `production`), `state` (`recording`, `failed`,
  `ready`, `posted`, `discarded`).
- The recording arrives over the platform seam (`/seam/v1/*`), signed, the
  way join requests arrive today; it is stored in R2 beside product media.

How the recording is produced on the platform side is the open question
this milestone waits on (risks R1).

## 9. Tests and guards

`tests/web` has about a hundred suites, most of which read source files
and pin today's structure and copy, and `tests/web-perf` holds layout
snapshots for eight pages in two themes at two widths. A redesign changes
all of them on purpose. The rule for every milestone: **a guard is
rewritten to hold the new design, never deleted to get green.** A guard
that pinned an accident of the old layout is replaced by one that pins
the equivalent fact of the new one (target size, contrast, one `h1`, the
type ladder, the route census), and the snapshots are regenerated and
reviewed as part of the pull request.

## 10. Out of scope

- Retiring topics, stack, pricing, collections, digest or launches.
- Changing sign-in, the seam, the data plane or the deploy path.
- Payments, direct messages, free-form posts.
- A native app. The phone boards are the responsive layout of the site.

## 11. Alternatives rejected

- **A reskin only.** New colours on the current pages would be one pull
  request. It leaves the site empty for the same reason it is empty now:
  progress stays in prose and the lists still lead with zeros.
- **A general feed with free posts.** It fills faster and is how every
  other community site works. The owner rejected it: thirty products do
  not sustain a social feed, and free posts cannot be compared, filtered
  or trusted the way a template can.
- **Keeping the studio as the dashboard.** It is already built. It also
  means a maker edits in one place and looks in another, and the owner's
  rule is that the page is the dashboard.
- **Private threads as direct messages.** A message to one maker is lost
  when that maker leaves. A private thread belongs to the product, so
  whoever is on the crew can answer it.
- **A new app beside the old one, switched over at the end.** It avoids
  rewriting guards milestone by milestone. It also means nothing ships
  until everything does, and two front ends to keep working meanwhile.
