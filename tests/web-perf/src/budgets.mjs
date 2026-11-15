// XP4 — the performance budgets, enforced per PR.
//
// WHAT IS GUARDED, AND HOW HARD.
//
// The console's lane learned this the expensive way and wrote it down: timing
// assertions on a shared CI runner flake, and the deterministic assertions
// carry the regression-catching weight. So the numbers here come in two
// classes and are labelled as such in the output.
//
//  DETERMINISTIC (hard, no tolerance) — these fail on a real regression and
//  on nothing else, because none of them can be moved by a busy runner:
//    - JS BYTES per archetype. The one XP4 names, and the one that actually
//      decays: a stray `"use client"` or one static import of something large
//      moves it, and nothing else on the page looks different.
//    - DOCUMENT BYTES. These pages are one cacheable document (OPC-1) served
//      to everybody, so its weight is a cost every visitor pays exactly once
//      and a number nobody would otherwise look at.
//    - CLS. On a static document laid out from bytes that are already there,
//      layout shift is close to a property of the markup rather than of the
//      machine. Budgeted tight for that reason.
//    - SERVER READS per route, counted at the fixture. A page that reads the
//      directory twice costs every visitor the slower of two round trips, and
//      that shows up here rather than in a stopwatch.
//    - NO THIRD PARTY. Not a performance rule dressed up: a public page that
//      reaches another origin tells that origin who is reading (I3), and it
//      is measured here because this is the only lane with a browser in it.
//      openproduct's OWN gateway is not a third party (MD2 — the browser
//      fetches a listing's pictures from it); see FIRST_PARTY_ORIGINS.
//    - I6 AT RUNTIME, on every route the epic added. See below.
//
//  TIMING (median of RUNS, with a CI headroom band):
//    - LCP on the four archetypes.
//
// AND THE GUARD IN FRONT OF ALL OF IT: every route asserts what it RENDERED
// before anything is measured. A 404 and a failure panel are small, fast,
// script-free documents that clear every budget above — a lane without this
// check reports the healthiest possible numbers at exactly the moment the
// surface is broken. That is the OD5 finding, and this file is a place it
// could have reappeared.

import { chromium } from "playwright";

import { ABSENT, CARDS, MOVED, ROUTES, SAMPLE_POST, SAMPLE_SLUG } from "./fixture.mjs";

/**
 * A `Location` on this app, as a path.
 *
 * A `redirects()` entry answers a path. A route handler answers an absolute
 * URL built from `request.url`, and `next start` builds that from its own
 * idea of the host (`localhost`) whatever address the request came in on —
 * so the same destination reads `http://localhost:3187/me` here and
 * `https://openproduct.live/me` deployed. Both are this app. Anything on
 * another host or port is returned whole, and fails the comparison.
 */
function onThisApp(location, base) {
  try {
    const target = new URL(location, base);
    const app = new URL(base);
    const loopback = (host) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    const same = target.port === app.port && (target.hostname === app.hostname || (loopback(target.hostname) && loopback(app.hostname)));
    return same ? target.pathname + target.search : location;
  } catch {
    return location;
  }
}

/** CI headroom for the timing budgets only. The guarded quantity is the same;
 *  a shared runner just gets room. Deterministic budgets ignore this. */
const BAND = Number(process.env.XP4_BAND ?? 3);
const RUNS = Number(process.env.XP4_RUNS ?? 3);

/**
 * The budgets, per archetype route.
 *
 * Every number is the measured baseline plus headroom, and the headroom is
 * deliberately modest — a budget with 3× slack is a budget that notices
 * nothing.
 *
 * `js` and `doc` are bytes OVER THE WIRE (`encodedBodySize`), which for the
 * document means the GZIPPED bytes: the directory's 141KB of HTML is 11KB on
 * the wire, and a budget written against the string length would have sat
 * twelve times above the floor and caught nothing for years.
 *
 * `reads` is how many times the SERVER read the fixture while rendering the
 * route, counted at the gateway. `lcp` is the product target; BAND above is
 * what makes it survivable on a shared runner.
 */
/**
 * OL9 — THE FONT BUDGET, WHICH IS ESTATE-WIDE RATHER THAN PER ROUTE.
 *
 * OL1 named the gap: these budgets guard JS bytes and gzipped document bytes
 * and nothing else, so three self-hosted webfonts moved no number at all. A
 * fourth face, or one shipped unsubsetted, would pass every check this program
 * has.
 *
 * MEASURED, THEN SET. Every route in this lane fetches the SAME files, because
 * the design system is loaded by the layout and no page adds to it. That is
 * why one number covers the estate instead of a column per route: a route
 * that pulled another face would be a route that did something no page here
 * is supposed to do, and it fails on the same line as the rest.
 *
 * ─── 3 FILES / 82,000 → 5 FILES / 105,800, RECORDED 2026-11-14 (OPR1) ──────
 *
 * The redesign (openproduct-redesign OPR1, design.md §3) replaced Geist,
 * Newsreader and Geist Mono with three design families, five Latin-subset
 * files. Measured, as the bytes of the files `next/font/local` serves
 * (`web/src/fonts`):
 *
 *   before   geist 29,288 · newsreader-400 22,504 · geist-mono 23,108    74,900
 *   after    hanken-grotesk (variable 400–600)           34,664
 *            lora-400 21,188 · lora-400-italic 22,740    43,928
 *            ibm-plex-mono-400 10,016 · -500 10,056      20,072          98,664
 *
 * Five files rather than three because two of the families have no variable
 * build to fold a second cut into: Lora's italic (idea quotes) is a separate
 * file from its upright (page titles), and IBM Plex Mono's 500 (the small
 * uppercase labels) is a separate file from its 400. Each of the five is
 * named by a use in the design; there is no fourth family and no third weight
 * of any of them.
 *
 * ─── 5 FILES / 105,800 → 4 FILES / 82,000, MEASURED 2026-11-14 (OPR1) ──────
 *
 * The figure above was set by arithmetic, before this lane had run on the
 * redesign: the layout declared all five files in three `next/font` calls,
 * and `next/font` preloads every file a call names, so every route fetched
 * all five whether or not it set a word in Lora's italic. None of the walked
 * routes does. The italic is declared on its own now, with `preload: false`
 * (`web/src/app/layout.tsx`), so the browser takes it only on a page that
 * draws a quote in it. Measured by this lane, on every route it walks:
 *
 *   as first built   5 files   98,664 B   (arithmetic; never measured)
 *   now              4 files   75,924 B   hanken 34,664 · lora-400 21,188 ·
 *                                         plex-mono-400 10,016 · -500 10,056
 *
 * So the budget is what a page FETCHES, as it always was: four files, and
 * 82,000 bytes — the number this budget held before the redesign, which is
 * 75,924 plus 6,076 (8%). A fifth file on a walked route is now a failure,
 * which is exactly the regression to catch: the italic preloaded again.
 *
 * TWO NUMBERS, AND THE COUNT IS THE SHARPER ONE.
 *
 *   `files` catches a FIFTH FILE the moment it appears, whatever it weighs —
 *   including a weight added as a separate file, which is the easy accident:
 *   one more entry in a `src` array is one line of diff and a whole extra
 *   download.
 *
 *   `bytes` catches an UNSUBSETTED one, which keeps the count at four and
 *   multiplies the payload. A full Hanken Grotesk is several times its latin
 *   subset.
 *
 * Headroom is deliberately thin — 6,076 bytes, 8% — because the
 * measurement is deterministic. The same four files are fetched on every
 * route on every run; there is no busy-runner variance to absorb here, and a
 * loose budget on a stable number is a budget that admits a face. (The old
 * budget held the same ~7,100 bytes over its 74,900.)
 *
 * COUNTED AS FETCHED, NOT AS BUILT. `next/font` may emit more files than a
 * visitor takes; budgeting the build directory would guard a number nobody
 * experiences.
 */
/*
 * openproduct-ui-fixes UF2 (2026-11-15) — THE BAR'S FACE. The owner chose
 * Geist for the top bar, which is on every page, so every page fetches a
 * fifth file: geist-latin-wght.woff2, 29,288 bytes, the unmodified latin
 * subset the site shipped before OPR1. Five files, 105,212 bytes, and the
 * same 6,076 bytes of headroom.
 */
const FONTS = { bytes: 111_288, files: 5 };

/**
 * OPR-3 — THE FIFTH FILE, ON THE PAGES THAT DRAW IT, AND ONLY THERE.
 *
 * An idea is quoted in Lora's italic (boards `Feed`, `ProductIdea`: the
 * quote on a New idea post, the idea's page). OPR1 declared the italic with
 * `preload: false` so that the browser takes it only on a page that draws a
 * quote in it — and until OPR2 no walked route did. Now three do, and each
 * fetches the one file the design asks for:
 *
 *   /                    5 files   98,664 B   an idea post is in the feed
 *   /feed/{page two}     5 files   98,664 B   one is on its second page too
 *   /product-01          5 files   98,664 B   an idea's own page
 *   every other route    4 files   75,924 B   as before
 *
 * 98,664 is the four above plus the italic's 22,740 — measured by this lane,
 * and the same five files OPR1's arithmetic named.
 *
 * NOT A LIST OF ROUTES: a page may fetch the italic IF IT DRAWS ITALIC SERIF
 * TEXT, which the measurement reads off the page itself (`drawsSerifItalic`).
 * So a route that starts quoting an idea is allowed its file without an edit
 * here, and a route that fetches the italic WITHOUT drawing a word in it —
 * the italic preloaded again, which is the regression `FONTS.files` was
 * written to catch — still fails, on every route, as it did.
 *
 * The same thin headroom as above, to the byte: 127,952 + 6,076 (six files
 * since UF2 added Geist).
 */
const FONTS_WITH_ITALIC = { bytes: 134_028, files: 6 };

/**
 * OPP11 — THE JS BUDGETS CAME DOWN BY 1,107 BYTES, ON EVERY ROUTE.
 *
 * Two components moved behind `next/dynamic` boundaries that actually defer:
 * the sign-in card (`shell/auth-modal.tsx`) and the search field's dropdown
 * (`shell/palette-panel.tsx`, split out of `shell/palette.tsx` — the FIELD
 * cannot move, it is the header's visible combobox). Measured here, before
 * and after, with the chunk count unchanged in every case:
 *
 *   /             127,976 → 126,869      11 chunks → 11
 *   /product-00   131,381 → 130,274      12 chunks → 12
 *   /people       128,395 → 127,288      12 chunks → 12
 *   /people/ada   129,741 → 128,634      12 chunks → 12
 *   /submit       132,537 → 131,430      13 chunks → 13
 *
 * EACH BUDGET BELOW IS ITS OLD VALUE MINUS EXACTLY 1,107, which keeps every
 * route's existing headroom to the byte. The alternative — re-deriving
 * "measurement plus ~2.3%" — would have quietly loosened `/people/ada`, whose
 * slack was 259 bytes before this change and is 259 bytes after it. A budget
 * that is re-derived on every improvement is a budget that never gets tighter.
 *
 * AND THE FIRST ATTEMPT AT THIS WENT THE OTHER WAY, which is why the numbers
 * are written down rather than described. `next/dynamic` on the sign-in card
 * ALONE made every route BIGGER and pushed two of them over budget (the note
 * further down records it). The cause was not `next/dynamic`: `AuthModal` took
 * an `open` prop and returned null when false, so it was always mounted and
 * its chunk always loaded. A lazy component that is always mounted defers
 * nothing. Mounting it conditionally is the whole difference between −1,107
 * and +1,137 per route, and `tests/web/src/lazy-boundaries.test.ts` is what
 * keeps it conditional.
 */
/**
 * OPP13 — THE JS BUDGETS WENT UP ON EVERY ROUTE, AND THE BYTES ARE THE NEXT
 * CLICK.
 *
 * Measured here, on a full build, before and after:
 *
 *   /             126,869 → 134,498      11 chunks → 18
 *   /product-00   130,274 → 139,376      12 chunks → 20
 *   /people       127,288 → 134,498      12 chunks → 18
 *   /people/ada   128,634 → 136,608      12 chunks → 19
 *   /submit       131,430 → 138,244      13 chunks → 19
 *
 * WHAT THE CHUNKS ARE. Six to eight more per route, which is the count of
 * the shell's fixed destinations: OPP13 turned viewport prefetch ON for the
 * five sections in both bars and for the wordmark, and a prefetched route
 * brings its own page chunks with its payload. They load after hydration, in
 * idle time, and every one is content-hashed and `immutable` (OPP3a), so a
 * returning visitor fetches none of them twice. The rest — under 2KB — is
 * `AppLink` becoming a client component (`useRouter` for the intent
 * prefetch), the navigation store and the bar.
 *
 * WHY THE BUDGET TAKES IT rather than the prefetch coming off: those bytes are
 * what make a section switch instant on a phone, where there is no hover to
 * prefetch on. The lane cannot tell "fetched for this page" from "fetched for
 * the next one", so the number is re-baselined at the measurement plus ~2.3%,
 * the same headroom every row below already carries — and the table above is
 * the record that lets the next person subtract the prefetch back out.
 */
/**
 * OPP14 — THE JS BUDGETS WENT UP AGAIN, BY EXACTLY WHAT WAS MEASURED.
 *
 * The conversation went live: a comment or a reply is drawn the moment it is
 * posted (`ui/conversation-live.tsx`, `ui/live-posts.ts`), the account chip
 * publishes the visitor's name for it (`ui/visitor.ts`), and a vote acts
 * while the overlay is still pending (`ui/use-toggle.ts`, `deferMembership`
 * in `ui/overlay.ts`). Measured here, on a full build, before and after:
 *
 *   /             134,498 → 135,624      18 chunks → 18     +1,126
 *   /product-00   139,376 → 144,453      20 chunks → 21     +5,077
 *   /people       134,498 → 135,624      18 chunks → 18     +1,126
 *   /people/ada   136,608 → 138,127      19 chunks → 19     +1,519
 *   /submit       138,244 → 139,370      19 chunks → 19     +1,126
 *
 * WHAT THE BYTES ARE. The 1,126 every route pays is the shared chunk: the
 * visitor store, the deferred membership, the hint in the toggle hook.
 * `/people/ada` pays 393 more for its toggles. The listing pays 5,077, of
 * which 4,204 is ONE NEW CHUNK (`data-live-posts`): the island, the store,
 * and — the part that is not negotiable — the contract's `parseBody` and
 * `PostBody`, so that a post drawn before the server has seen it looks
 * exactly like the same post after the reload. The chunk was read to check
 * it carries nothing else (no tile, no toggle, no sidebar): it does not.
 *
 * WHY THE BUDGET TAKES IT rather than the island lazy-loading: the one
 * moment those bytes are needed is the press of Post, and a chunk fetched
 * at that press is a wait exactly where this milestone removed one.
 *
 * EACH BUDGET BELOW IS ITS OLD VALUE PLUS EXACTLY THE RISE ABOVE — the OPP11
 * rule, applied upward. Every route keeps the headroom it had to the byte;
 * re-deriving "measurement plus ~2.3%" would have loosened `/people/ada`
 * by a few hundred bytes for nothing.
 */
/**
 * OB3–CL5 — THE BUDGETS WENT UP, BY WHAT WAS MEASURED, AND THE LANE HAD NOT
 * RUN FOR ANY OF IT (sourceplane/orun-cloud#1882).
 *
 * No open-builds or calm milestone selected this lane (a website change did
 * not, until this change gave it `change.inputs`), so it went red on main
 * and stayed red. Measured here on full builds of OB2 (6574ae8, the last
 * state these budgets were set against) and of CL5 with this change's a11y
 * fixes, the way `measure()` does:
 *
 *                 OB2       now      rise
 *   /             136,056   141,387  +5,331
 *   /people       138,832   144,470  +5,638
 *   /people/ada   138,139   145,062  +6,923
 *   /submit       139,231   145,543  +6,312
 *   /product-00   23,114    24,111   +997     (the document, not JS)
 *
 * WHAT THE BYTES ARE, chunk by chunk:
 *
 *   THE BUILDS LIST GOES TO THE CLIENT (CL2). The front page's list that
 *   keeps going (`feed/more-builds.tsx`) draws the next page's tiles in the
 *   browser with the same `BuildTile`, so the tile, the vote box (3,699),
 *   the logo tile (1,546) and, through `ui/bits`, the empty-state copy in
 *   `ui/pending.ts` (873) are client code now. On `/` that replaces the
 *   2,430 the vote box was: +3,688.
 *
 *   THE FRONT PAGE'S ROUTE, PREFETCHED (OB4). The shell's "Open roles" is a
 *   live link since OB4 (/builds/roles, which draws the same list), so every
 *   page that does not draw the list itself prefetches it: 3,699 + 1,546 +
 *   the page chunk (153) = +5,398 on `/people`, `/people/ada` and `/submit`.
 *   `/people/ada` also loads the empty-state copy now (+873).
 *
 *   THE ERROR BOUNDARIES (OB8, shared by CL). A page from a previous build
 *   reloads into the current one instead of failing on a missing chunk:
 *   one shared chunk (2,005), `global-error` +458, and each boundary down to
 *   its route's own words (`app/error` −1,202, `people/error` −1,028,
 *   `[slug]/error` −1,016). Net +1,261 where only the root boundary loads,
 *   +233 under `people/`, +245 on a listing.
 *
 *   THE SHELL (OB4, CL1): +538 in its shared chunk — the live "Open roles",
 *   OB4's section routing and CL1's bar — and +44 in the layout. `not-found`
 *   no longer loads (−208). Two pages' own chunks went down: `/people` −367
 *   (CL4's tiles) and `/submit` −721 (OB6's repository field +283, −996
 *   when CL re-split the chunks around the client list, −8 CL5's words).
 *
 *   The listing's document grew by OB5's "how it is moving" header, OB7's
 *   badge chooser, OB8's error boundary and CL3's hero. Its JS rose 1,054
 *   and still fits its budget, so that number does not move.
 *
 * EACH BUDGET IS ITS OLD VALUE PLUS EXACTLY THE RISE (the OPP11 rule, applied
 * upward), so every route keeps the headroom it had — except `/people`, which
 * was already 116 B over at OB2, drift no pull request ran this lane for. A
 * budget with no headroom left has none to keep, so `/people` is re-baselined
 * at the measurement plus ~2.3%, the rule for exactly that case. The biggest
 * line, the prefetched list, is the one to subtract back out if the shell's
 * links stop prefetching the front page's route.
 */
/**
 * NEXT 16 — THE JS BUDGETS WENT UP BY THE FRAMEWORK, AND ONLY THE FRAMEWORK.
 *
 * Next.js 15 left its two-year support window and `@opennextjs/cloudflare`
 * refused to build it, so the app moved to `next@16.4.2` (sourceplane/orun-cloud,
 * after its #2020 did the console). Measured here, on full builds of the same commit,
 * before and after:
 *
 *   /             141,438 → 171,249     15 chunks → 15     +29,811
 *   /product-00   146,109 → 175,766     15 chunks → 15     +29,657
 *   /people       144,521 → 174,320     17 chunks → 17     +29,799
 *   /people/ada   145,123 → 174,897     17 chunks → 17     +29,774
 *   /submit       145,614 → 175,346     16 chunks → 16     +29,732
 *
 * WHAT THE BYTES ARE, chunk by chunk, the same on every route:
 *
 *   THE APP ROUTER  +21,003. 16's client router is the segment cache, the
 *   back/forward cache (a hidden `<Activity>` per visited segment) and view
 *   transitions; it is the only router 16 ships, so no option takes it out.
 *   The chunk was read for anything that should not ship: no dev overlay, no
 *   devtools, no HMR client beyond the stubs 15 also carried.
 *
 *   THE REACT NEXT VENDORS  +9,697. 19.2.0-canary-0bdb9206 → 19.3.0-canary-
 *   278794d7, the release whose `pingSuspendedRoot` fix let
 *   `patches/next@15.5.18.patch` be deleted (the refresh lane holds it).
 *
 *   THE APP'S OWN CHUNKS  −889 to −1,043. Nothing in `src/` changed; the same
 *   modules come out slightly smaller.
 *
 * EACH BUDGET BELOW IS ITS OLD VALUE PLUS EXACTLY THE RISE ABOVE — the OPP11
 * rule, applied upward — so every route keeps the headroom it had to the byte.
 * WC2-8's wire budget moved by the same cause, recorded beside `WIRE`.
 */
const BUDGETS = {
  // THREE reads: the board, the CATALOGUE and the SIDEBAR. The launches page
  // shows every product — there is no directory beside it any more — so the
  // directory read joined the feed's and the margin's, each a separate
  // document by design so a failed one cannot take the board down. They are
  // issued CONCURRENTLY, so the page still costs one round trip's latency;
  // this number counts reads, not waits, and 3 is what it should say.
  //
  // The document holds every one of the fixture's 24 products now, where
  // the week's eight used to be, and gzipped to 12.1KB when that was written:
  // rows compress well.
  //
  // ─── RE-BASELINED BY FR5, AND THE REASON IS THE LANE, NOT THE PAGE ──────
  //
  // 14,744 B. `14_000` was set at #1305, which is BEFORE the worldclass
  // epic's first implementation milestone — and this lane has not run once in
  // the twenty-one that merged since, because `orun plan --changed` never
  // selected it and nothing it owns had changed. That is OPP12's open D5
  // ("the scheduling question") with a number attached at last: twenty-one
  // milestones of drift, discovered in one run.
  //
  // WHAT GREW, measured by stripping each thing out of the served document
  // and re-gzipping rather than guessed:
  //
  //   the bottom bar (FR1)        260 B   2,104 raw — five cells on every page
  //   `title=` attributes         323 B   7,120 raw — VC3's explanations and
  //                                       the vote box's sentence, 24 times
  //   `aria-label=` attributes    163 B   1,357 raw
  //   `<link rel=canonical>`       13 B      59 raw — new to this corpus
  //   `.tap` + `data-keyrow`       19 B     660 raw — FR2 and FR4
  //
  // The rest is the RSC flight payload, 6,667 B of this document on its own:
  // it carries the rendered tree, so it grows with the tree, and there is no
  // leak in it to find. Every one of those is a milestone this epic shipped
  // deliberately, and none of them is close to **WC-5**'s 400KB.
  //
  // 15,100 was the measurement plus ~2.3% — the same headroom the JS budgets
  // below carry, and the same treatment: a rise that is expected is recorded
  // with its number and bounded here, never left to grow.
  //
  // ─── AND IT CAUGHT THE VERY NEXT MILESTONE, WHICH IS THE POINT ──────────
  //
  // VC1 put a fifth panel in the rail — five stack values, their counts, and a
  // link to the index — and this budget went red on the first run after it.
  // One milestone, not twenty-one: that is the difference between a lane that
  // is scheduled and a lane that is not, and it is worth recording beside the
  // note above that had to reconstruct twenty-one milestones of drift.
  //
  // 15,179 B. The panel's own markup is 2,117 raw and **175 B gzipped**,
  // measured by stripping it out of the served document; the rest of the 434 B
  // is the same subtree a second time in the RSC flight payload, which carries
  // the rendered tree and which the note above measures at 6,667 B of this
  // document. A rail is a navigation surface and 434 B is what one costs here.
  //
  // 15,600 is that measurement plus ~2.8%.
  //
  // RE-BASELINED WITH THE NUMBER NAMED, at MD2's merge with HB1–HB3: Today is
  // always a block, every block links its day's board, and the rail gained a
  // "Recently replied" panel — which the fixture now answers, so the lane
  // renders it for the first time. Measured at 16,700 B against 15,600;
  // 17,500 holds that with the headroom the old number had. None of it is
  // MD2's: the front page draws no picture until MD3.
  //
  // MD3 — `images` is WC-5's 400 KB, the budget MD-2 said would be a CI
  // assertion over a launch-day fixture: the fixture's board carries a hero
  // thumbnail on the listings that have one. The document grew by the
  // thumbnails' markup; measured and named in the MD3 entry.
  //
  // OPR-3 — `/` IS THE FEED OF POSTS, AND IT MAKES TWO READS: the feed's
  // first page and the directory's first page (the right column's "Worth
  // following" and "Open seats"), issued concurrently. `reads` says 2.
  //
  // RE-MEASURED AS THE FEED, WITH THE NUMBERS NAMED (2026-11-15). The limits
  // above were the product list's. On the first full build of the feed this
  // lane read 184,327 B of JS against 173,858 — and every other archetype
  // was over by the same ten kilobytes, which is what said the weight was not
  // the feed's own. Four things, each measured by this lane on a full build:
  //
  //   the contracts package declares `sideEffects: false`, so a page carries
  //   the modules it uses rather than every one the barrel re-exports; the
  //   maker view is fetched for a product's crew and the two personal
  //   columns for a session, and nobody else downloads either
  //                                                      184,327 → 173,314
  //   the post templates (the block catalogue and its validator) are a
  //   module of their own, so the shell's ids and labels do not drag them
  //   along; and the feed's cards are drawn on the server and handed to the
  //   client list as children — the card's code is fetched when Show more is
  //   pressed                                            173,314 → 167,982
  //   the list's own filter no longer imports the block catalogue, and the
  //   full card's footer (the reaction controls) is a module only the pages
  //   that draw full cards import                        167,982 → 166,205
  //   the six class strings every page's bundle draws with are a file of
  //   their own (`ui/design-core.ts`), so the layout, the error boundary and
  //   the feed's list stop carrying a copy of all of `ui/design.ts` each
  //                                                      166,205 → 164,296
  //
  // 164,296 B across 14 chunks, and a document of 16,542 B
  // (the cards are in the document now, where the list used to draw them
  // from its props: 14,761 B before the cards moved to the server). 168,100
  // and 17,100 are those plus the ~2.3% and ~2.8% this table carries —
  // BOTH LOWER than the product list's limits they replace (173,858 and
  // 17,500): the feed is the lighter page.
  "/": { js: 168_100, doc: 17_100, cls: 0.02, lcp: 2000, reads: 2, images: 400_000 },
  // THREE, AND IT HAS BEEN THREE SINCE CB1 — the number here was stale, and
  // it took a lane that failed on one run and passed on the next to notice.
  //
  // `[slug]/page.tsx` reads the listing, the catalog document (DS4's similar
  // products, ranked with the directory's own comparator rather than a second
  // ORDER BY) and the discussion (CB1). All three in one `Promise.all`, so
  // the page still costs ONE round trip of latency; as the note on `/` above
  // says, this number counts reads, not waits.
  //
  // WHY IT PASSED ANYWAY, until it didn't: at 2 it was only ever green when
  // one of the three was served from a cache. Same build, two consecutive
  // runs, `2 read(s)` then `3 read(s)` — with `/people/ada` dropping from 1
  // to 0 in the same log, which is the misattribution the loop below already
  // documents happening to a page that legitimately reads three times. A
  // budget that depends on a cache hit is a coin toss with a number on it.
  //
  // MD2 RE-BASELINED THE DOCUMENT HERE, WITH THE NUMBER NAMED. The listing
  // gained its pictures: four `<img>` elements, each carrying a `srcset` of
  // content-addressed URLs — 64 hex characters apiece, by design, three per
  // image — plus dimensions, `sizes` and alt text. Measured at 21,199 B on
  // the sample listing against a 21,000 B budget; 22,039 B once PP5's launch
  // history rendered beside it; 22,900 B once PP6's launch health did too
  // (the fixture gained the rows MD2 found it missing, so the lane renders
  // sections it never had before). 24,000 holds that with the headroom the
  // old number had over the old document — 23,000 left a hundred bytes, which
  // is a flake waiting for a longer tagline.
  //
  // SC-2 (openproduct-stages-crew, 2026-11-15) — RE-MEASURED, WITH THE
  // NUMBERS NAMED. The page gained Where it runs under its header (two rows,
  // each a tag, an address and a line) and the stage badge, and the crew's
  // Edit details is handed where the product is (`stageStartOf`: the stage,
  // the repository, the stage link and the strip's rows) — all in the
  // document. The JS is the four stages' words and their colours, which every
  // badge, mark and word reads; the colours and the badge are modules of
  // their own (`ui/stage-tone.ts`, `ui/stage-badge.tsx`) so the header
  // search's bundle on every page does not carry them, and the Change stage
  // popup and the Stage row are fetched for the crew only. Measured by this
  // lane in CI: Updates, About and Crew 177,734 B of JS (was 177,307 against
  // 177,314: seven bytes of room); documents Updates 25,256 B (was 24,626),
  // About 25,281 (24,561), Crew 22,050 (21,410), Talk 26,418 (25,744). The
  // new limits are those plus the room each had.
  //
  // SC-3 (openproduct-stages-crew, 2026-11-15) — RE-MEASURED, WITH THE
  // NUMBERS NAMED. Crew roles: the overlay's crew entry carries a role, the
  // maker view's gate asks it (a Member has no Manage switch and no maker
  // controls), and the Crew tab gains the roles card's gate. The card and
  // the Edit crew popup are chunks of their own, fetched for the crew only;
  // what a visitor's bundle gained is the gate and the two chunks' names in
  // the runtime's manifest. Measured by this lane in CI: Updates, About and
  // Crew 178,562 B of JS (was 177,734 against 177,800: 66 bytes of room).
  // The new limit is that plus the same 66. The documents did not move
  // past their limits (the Crew tab's heading gained " · N").
  [`/${SAMPLE_SLUG}`]: { js: 178_628, doc: 25_650, cls: 0.02, lcp: 2000, reads: 3, images: 400_000 },
  // OPR-3 — THE PRODUCT PAGE'S OTHER THREE TABS, each an address of its own
  // (design §5), budgeted the day they were added (2026-11-15).
  //
  // ONE PAGE, ONE BUNDLE: every tab is `product-page.tsx` drawn with a
  // different `tab`, so all four fetch the same 175,888 B of JS across
  // 17 chunks, and all four are held to the product page's own limit —
  // which did not move in OPR2. (The first full build read 192,932 B; the
  // maker view is fetched for the crew only now, and a visitor's bundle
  // carries its gates. `/` above lists the rest.)
  //
  // The documents differ, and each is its measurement plus ~2.6%:
  //   About   24,241 B   the pictures, the pitch, the milestones, the tiles
  //   Crew    21,099 B   the people and the open seats
  //   Talk    23,414 B   the conversation
  //
  // READS: the listing and the directory on every tab; Updates adds the
  // product's posts and Talk the discussion, so About and Crew read twice
  // and Talk three times — concurrently, as the note above says of Updates.
  [`/${SAMPLE_SLUG}/about`]: { js: 178_628, doc: 25_650, cls: 0.02, lcp: 2000, reads: 2, images: 400_000 },
  [`/${SAMPLE_SLUG}/crew`]: { js: 178_628, doc: 22_350, cls: 0.02, lcp: 2000, reads: 2, images: 400_000 },
  //
  // OPR-4 — TALK RE-MEASURED, AND ONLY TALK, WITH THE NUMBERS NAMED
  // (2026-11-15). Talk gained its composer (a field, the thread's kind, the
  // Public / Private switch), the All / Public / Private filter with the
  // signed-in read behind it, a card per thread, and the crew's Mark
  // resolved. On the first full build with it every tab AND the post's page
  // read 181,376 B against 177,314 — the tabs are one module and the post's
  // page shares their chunks, so all of them were carrying a tab they do not
  // draw. Three things, each measured by this lane on a full build:
  //
  //   a reader's private rows are a chunk of their own, fetched only once
  //   there is a private thread to draw            181,376 → 180,777 (all)
  //   Talk's client pieces (the list, the field's draft, a row's actions)
  //   are asked for through `talk/gates.tsx` with `next/dynamic`, so only a
  //   page that renders Talk fetches them           180,777 → 177,075 (the
  //   other tabs; the post's page 188,107 → 184,405); Talk itself 184,731
  //   across three chunks, each with its own copy of what the three share
  //   those three are one module, so one chunk      184,731 → 180,777 (Talk)
  //
  // So: Updates, About and Crew read 177,013 B across 20 chunks and the
  // post's page 184,343 B across 22 — each inside the limit it had, which
  // DID NOT MOVE. Talk reads 180,777 B across 21 chunks and a document of
  // 25,556 B (the form, the filter and a card per thread are in the document,
  // where a link list was). 184,900 and 26,250 are those plus the ~2.3% and
  // ~2.8% this table carries. The wire budget did not move.
  // SC-2 — Talk's document gained Where it runs too: 26,418 B (was 25,744),
  // so 26,250 → 26,900, the same room. Its JS did not move past its limit.
  [`/${SAMPLE_SLUG}/talk`]: { js: 184_900, doc: 26_900, cls: 0.02, lcp: 2000, reads: 3, images: 400_000 },
  // OPR-3 — A POST'S OWN PAGE (design §5: `/{slug}/posts/{id}`), budgeted the
  // day it was added. 183,214 B across 19 chunks: the full card with its
  // reaction controls, and the live thread under it (the comment field, the
  // optimistic list) — the two things no other page has together. A document
  // of 14,699 B. 187,500 and 15,200 are those plus ~2.3% and ~2.8%.
  //
  // FOUR READS, issued together once the post has said which product it is
  // for: the post, the product's document (the side card), the post's thread
  // and the product's other posts ("More from").
  [`/${SAMPLE_SLUG}/posts/${SAMPLE_POST}`]: { js: 187_500, doc: 15_200, cls: 0.02, lcp: 2000, reads: 4, images: 400_000 },
  // OPP1 RE-BASELINED THE JS HERE, AND ONLY HERE, WITH THE NUMBER NAMED.
  //
  // Converting the public surface to `next/link` pulls the App Router's
  // client-navigation chunk onto routes that previously shipped none. On the
  // other three archetypes it disappears into existing headroom — `/` reads
  // 121.0KB, the listing 122.3KB, `/people/ada` 122.4KB, all unchanged in
  // practice. This page was the tightest budget on the estate (127,000 against
  // a measured 121.4KB, under 5% of slack) and it went to 124.1KB: over by a
  // HUNDRED BYTES, which is the budget working exactly as the header describes
  // rather than a number to wave through.
  //
  // 130,000 is that measurement plus ~2.3% — the same modest headroom the
  // others carry, and the same treatment OL1 gave the webfont: a rise that is
  // expected is recorded with its number and bounded here, never left to grow.
  // `/people/ada` keeps 127,000 deliberately: it did not move, and giving two
  // different pages one budget because they share a prefix is how a budget
  // stops noticing.
  //
  // AND RE-BASELINED AGAIN BY FR5, at 130,638 B — over by 638. Same story as
  // `/` above: the number was set at #1305 and the lane has not run since, so
  // this is twenty-one milestones of shell growth arriving at once. What is in
  // it is the shell's own new client components — FR0's theme control and
  // FR4's keyboard layer render on every page — and they are the shell, not
  // this route: `/people/ada` measures 129,202 B against the same 130,000 and
  // stays where it is, because it did not go over and giving two pages one
  // budget because they share a prefix is how a budget stops noticing.
  //
  // 133,500 is the measurement plus ~2.2%.
  "/people": { js: 177_592, doc: 12_500, cls: 0.02, lcp: 2000, reads: 1 },
  // MP0 put the design's counter row and the three tabs on this page, and the
  // launched tab's rows with them. Still ONE read — the header, all three
  // counts and the tab's list arrive as one document — and the weight is
  // re-baselined at 13.3KB with the same modest headroom the others carry.
  //
  // AND THE JS FOLLOWS `/people` UP, FOR THE SAME REASON AND WITH THE SAME
  // ARITHMETIC. Splitting the sign-in card into a panel and a modal — one card
  // for the shell's overlay and for `/signin`, which is now where every act
  // that needs a session sends a signed-out visitor — grew the shell chunk this
  // page carries. It measured 127,002 B against 127,000: OVER BY TWO BYTES,
  // which is this budget doing precisely what the header describes and not a
  // number to wave through.
  //
  // TWO THINGS WERE TRIED BEFORE TOUCHING THE NUMBER, and one of them is worth
  // recording so nobody spends the afternoon on it again. `account-chip.tsx`
  // imports the modal statically, so the whole door — two tabs, three flows,
  // the code screen — sits in the shell chunk for a form that renders only
  // after a click, and `next/dynamic` looked like free weight back. It is not:
  // deferring it took `/people/ada` to 125.8KB (128,819 B) and `/people` to
  // 127.5KB, each with an extra chunk. The loadable runtime and the reshuffled
  // chunk graph cost more than the form they defer, at this size.
  //
  // So 130,000 — that measurement plus ~2.3%, the same headroom `/people`
  // carries above and the same treatment OL1 gave the webfont: a rise that is
  // expected is recorded with its number and bounded here, never left to grow.
  //
  // OPR-3 RE-BASELINED THE DOCUMENT AND THE READS HERE, WITH THE NUMBERS NAMED
  // (2026-11-15). The JS limit did not move (168,030 B measured).
  //
  //   THE DOCUMENT  15,000 → 17,500. A person's page draws the posts they
  //   pressed Post on (board `Person`) — three cards for the fixture's Ada —
  //   and a stage line under each product. Measured at 16,912 B against
  //   15,000; 17,500 is that plus ~2.9%.
  //
  //   THE READS  1 → 5. One was the person's document. The page now also
  //   reads their posts (one read, the per-author feed) and, for the stage
  //   line, each of their products' own public documents — three distinct
  //   products for the fixture's Ada, so five in all, issued together. This
  //   lane counted 4 on a run where one of the product documents was still
  //   in Next's data cache; 5 is what the code asks for, and a budget that
  //   depends on a cache hit is a coin toss (the note on `/product-00`).
  //   BOUNDED: at most twelve product documents (`PERSON_STAGE_READ_LIMIT`),
  //   each the same cached read a product page makes. Carrying the stage on
  //   the person document's own listings would bring this back to two, and
  //   is the change to make if this number ever needs to fall.
  "/people/ada": { js: 177_966, doc: 17_500, cls: 0.02, lcp: 2000, reads: 5 },
  // IN0 ADDED THIS ROUTE TO THE TABLE, because IN0 is what made the page worth
  // measuring: `/submit` was a three-field form, and it now renders the feed's
  // own row as a live preview — the row shell, the logo tile and the tile
  // colours, in a bundle that had none of them.
  //
  // MEASURED ON BOTH SIDES OF THE CHANGE, by this lane, on a full build:
  //
  //   before   126.8KB (129,792 B) across 12 chunks · document 5,609 B
  //   after    129.3KB (132,443 B) across 13 chunks · document 6,302 B
  //
  // +2,651 B of JS and one chunk, which is a good deal less than Next's own
  // route report implies (108KB -> 114KB of "first load JS"): most of what the
  // row needs was already in this page's shared chunks. The two numbers count
  // different things and both are quoted where they were measured.
  //
  // What is NOT in there is the vote and comment boxes.
  // `submit/preview-row.tsx` reaches `feed/row-shell.tsx` directly rather than
  // through `feed-row.tsx`, whose module scope imports them — worth 3KB by
  // Next's report, and worth more than that as a guarantee that a preview
  // cannot mount a control.
  //
  // ZERO READS, and that is the page: the form is static and the preview is
  // rendered from what somebody is typing. A read appearing here would mean
  // this page had started asking the server about a draft — which is the one
  // thing IN0's design is built to prevent.
  "/submit": { js: 178_590, doc: 8_000, cls: 0.02, lcp: 2000, reads: 0 },
};

/**
 * The COLD render's layout-shift allowance, and why it is a different number.
 *
 * A dynamic route on a cache MISS is streamed: `loading.tsx` paints first and
 * the content replaces it, so the page's height changes once. On the listing
 * archetype that moves the footer 647px and scores ~0.069, while the same URL
 * on a cache HIT — the cached document, which is what XP4's budgets are
 * measured on and what all but the first visitor of each revalidation window
 * receives — scores 0.0000.
 *
 * That gap is not a defect to fix here; it is the price of a rule XP3 stated
 * and reasoned about (`ui/skeleton.tsx`): a skeleton draws only what is
 * CERTAIN and stops where the route becomes data-dependent, because "drawing
 * three where there will be twenty is a smaller lie than drawing twenty where
 * there will be three". A listing's pitch has no knowable height, so no
 * skeleton can reserve it honestly.
 *
 * What this budget does is stop the price from quietly RISING. 0.10 is the
 * web-vitals "good" ceiling; today's cold listing sits at ~0.07 and every
 * other route at 0.00.
 */
const COLD_CLS = 0.1;

/**
 * The signed-in layout allowance (OPP9).
 *
 * Looser than the anonymous 0.02 because a signed-in page is BEING CHANGED
 * after paint — the overlay marking what is the visitor's is the mechanism
 * OPC-1 requires, not a defect. 0.05 is half the web-vitals "good" ceiling: a
 * ceiling on a cost that should trend to nothing, never a target to sit at.
 */
const SIGNED_IN_CLS = 0.05;

/** Registered before navigation, because layout-shift entries are not
 *  retroactive past the buffer and the interesting ones land late. */
const OBSERVE_CLS = () => {
  window.__signedInCls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) window.__signedInCls += entry.value;
    }
  }).observe({ type: "layout-shift", buffered: true });
};

/**
 * A session cookie the app genuinely accepts.
 *
 * `encodeSession` is base64url'd JSON and `decodeSession` validates the shape
 * and the expiry — nothing is signed — so this is a real signed-in session,
 * not a decoy the app quietly ignores. That distinction is the whole value of
 * the I6 check: a cookie the server discards would make "the two renders
 * match" true by construction and prove nothing.
 */
function sessionCookie(host, port) {
  const session = {
    subjectId: "sub_000000000000000000000001",
    displayName: "Ada Lovelace",
    accessToken: "tok_fixture",
    // Far future AND refreshable, so the cookie is valid whatever the clock
    // on the machine running this says.
    expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
    refreshToken: "ref_fixture",
  };
  const json = JSON.stringify(session);
  const b64 = Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { name: "op_session", value: b64, domain: host, path: "/", httpOnly: true, secure: false };
}

const failures = [];
const notes = [];
/** A line in the output that is not a verdict — something worth seeing beside
 *  the budgets without failing a build on it. */
function note(text) {
  notes.push(text);
}
function check(name, ok, detail) {
  console.log(`[budget] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * Load one route and return everything measurable about it in one pass.
 *
 * `warm` WAITS FOR THE ISR ENTRY TO ACTUALLY BE CACHED before measuring, and
 * getting that right took three attempts, each of which looked fixed:
 *
 *   warm every route up front   the entries carry `revalidate = 60` and this
 *                               lane runs for minutes, so the early ones went
 *                               stale mid-run and were re-rendered
 *   warm each route just before its own measurement — better, and still
 *                               racing: the warm request is what GENERATES
 *                               the page, and the browser's navigation can
 *                               arrive before the cache write lands
 *   wait for `x-nextjs-cache: HIT`, which is the server saying the thing this
 *                               budget is about — a cached document — exists
 *
 * It matters because a re-render STREAMS: `loading.tsx` paints, the content
 * replaces it, the footer moves 647px, and CLS reads 0.0688 instead of
 * 0.0000. The budget then passed or failed on how long the run had been
 * going — about one measurement in four — which is not a budget, it is a
 * coin. XP4 says these are measured on the cached document; this is what
 * makes "cached" a fact rather than a hope.
 *
 * Pass `warm: false` for the deliberate cold render (§3b), which measures
 * exactly the render this avoids everywhere else.
 */
async function warmUntilCached(context, base, path, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const res = await context.request.get(base + path);
    const state = res.headers()["x-nextjs-cache"];
    // No header at all: the route is not ISR-tracked (a route handler, a
    // fully client page). Nothing to wait for.
    if (!state || state === "HIT") return state ?? "(untracked)";
    await new Promise((r) => setTimeout(r, 250));
  }
  return "(never reported HIT)";
}

/**
 * MD2 — THE API IS NOT A THIRD PARTY. The "no third-party request" budget
 * exists because a public page that reaches another origin tells that origin
 * who is reading (I3). openproduct's own gateway is the origin the DOCUMENT
 * was read from — server-side until MD2, and now also by the browser, for the
 * bytes of a listing's pictures (`/v1/media/…`). A request there tells nobody
 * new anything. `runBudgets` records the gateway's origin here before any page
 * is measured; everything else that is not the site itself is still a
 * third party and still fails the budget.
 */
let FIRST_PARTY_ORIGINS = new Set();

async function measure(context, base, path, { warm = true } = {}) {
  if (warm) await warmUntilCached(context, base, path);
  const page = await context.newPage();
  const thirdParty = [];
  const origin = new URL(base).origin;
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.origin !== origin && !FIRST_PARTY_ORIGINS.has(url.origin) && url.protocol !== "data:") {
      thirdParty.push(req.url());
    }
  });

  // The observers must exist BEFORE navigation: LCP and layout-shift entries
  // are buffered, but only for observers that asked for them.
  await page.addInitScript(() => {
    window.__xp4 = { cls: 0, lcp: 0 };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__xp4.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__xp4.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  const response = await page.goto(base + path, { waitUntil: "load" });
  // Let hydration finish and any post-load shift land. A fixed wait, not a
  // network-idle heuristic: `networkidle` would end at a different moment on
  // a fast and a slow machine, which is exactly the variance a budget must
  // not have.
  await page.waitForTimeout(2500);

  const html = await response.text();
  const vitals = await page.evaluate(() => {
    const res = performance.getEntriesByType("resource");
    const nav = performance.getEntriesByType("navigation")[0];
    const js = res.filter((r) => r.name.includes("/_next/static/") && r.name.endsWith(".js"));
    const css = res.filter((r) => r.name.includes("/_next/static/") && r.name.endsWith(".css"));
    // OL9 — THE BYTES NOTHING WAS GUARDING. OL1 found that these budgets
    // watch JS and the gzipped document and nothing else, so three
    // self-hosted webfonts moved no number at all: a fourth face, or one
    // shipped unsubsetted, would pass every check this program has.
    //
    // MEASURED AS FETCHED, NOT AS BUILT. `next/font` emits one file per
    // unicode-range and the browser takes only the ranges it needs, so the
    // directory on disk is far larger than any visitor pays for. Counting the
    // build output would budget a number nobody experiences and would go red
    // the day a subset was added for a language nobody here reads.
    const fonts = res.filter((r) => /\.(woff2?|ttf|otf)(\?|$)/.test(r.name));
    // MD3 — THE PICTURES, measured as fetched. WC-5 budgets the home page's
    // assets at 400 KB; before MD3 there was not one image on the site, so
    // nothing watched this. A thumbnail per row is the design; a hero per row
    // would be the regression this number exists to catch.
    const images = res.filter((r) => r.initiatorType === "img" || /\/v1\/media\//.test(r.name));
    const size = (entries) =>
      entries.reduce((n, r) => n + (r.encodedBodySize || r.transferSize || 0), 0);
    // A script that is neither `defer` nor `async` nor a module blocks the
    // parser, which on a document this size is the difference between the
    // text arriving and the text waiting.
    // `noModule` excluded: Next emits a legacy polyfill bundle with that
    // attribute, and no browser that supports ES modules ever fetches or
    // executes it. Counting it would make this check permanently red against
    // a script that costs a modern reader nothing.
    const blocking = [...document.querySelectorAll("head script[src]")]
      .filter((s) => !s.defer && !s.async && s.type !== "module" && !s.noModule)
      .map((s) => s.getAttribute("src"));
    return {
      cls: window.__xp4?.cls ?? 0,
      lcp: Math.round(window.__xp4?.lcp ?? 0),
      jsBytes: size(js),
      jsCount: js.length,
      cssBytes: size(css),
      fontBytes: size(fonts),
      fontCount: fonts.length,
      // The FACES a page actually pulled, so a new one is visible as a name
      // rather than only as a number that moved.
      fontFiles: fonts.map((r) => r.name.split("/").pop()),
      // Whether the page draws a word in the serif's italic (an idea's
      // quote): the one case in which the fifth font file is the design
      // rather than a regression. Read off what is painted, not off a list.
      drawsSerifItalic: [...document.querySelectorAll("main *")].some((el) => {
        if (el.children.length > 0 && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)) return false;
        const cs = getComputedStyle(el);
        return cs.fontStyle === "italic" && /lora/i.test(cs.fontFamily) && (el.textContent ?? "").trim().length > 0;
      }),
      imageBytes: size(images),
      imageCount: images.length,
      docBytes: Math.round(nav?.encodedBodySize || 0),
      blocking,
      // XP2's fail-open overlay must not be on the critical path. Whether it
      // was requested at all is a property of the page; WHEN is the budget.
      overlayAfterLoad: res
        .filter((r) => r.name.includes("/me/overlay"))
        .every((r) => r.startTime >= (nav?.loadEventStart ?? 0)),
      overlayRequests: res.filter((r) => r.name.includes("/me/overlay")).length,
    };
  });

  await page.close();
  return { status: response.status(), html, thirdParty, ...vitals };
}

/**
 * Resolve once the fixture has seen no new request for `quietMs` (bounded by
 * `maxMs`, so a fixture that never goes quiet cannot hang the lane). Used to
 * separate one route's reads from the next route's baseline — see the note at
 * the warm loop.
 */
async function settle(gateway, quietMs = 1_000, maxMs = 10_000) {
  const started = Date.now();
  let seen = gateway.requests.length;
  let quietSince = started;
  while (Date.now() - started < maxMs) {
    await new Promise((r) => setTimeout(r, 50));
    if (gateway.requests.length !== seen) {
      seen = gateway.requests.length;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      return;
    }
  }
}

export async function runBudgets(base, gateway) {
  FIRST_PARTY_ORIGINS = new Set([new URL(gateway.url).origin]);
  console.log(`web-perf: base=${base} band=${BAND}× runs=${RUNS}`);

  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });
  const { hostname, port } = new URL(base);

  try {
    // ── 1. Every route rendered what it was supposed to ──────────────
    //
    // First, and separately, because everything below is only worth reading
    // if this passed. A failure panel clears every budget in this file.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    // WARM EVERY ROUTE FIRST, and this is the difference between a budget and
    // a coin toss. `revalidate` routes are ISR-cached: the FIRST request for a
    // URL renders and streams it, every later one inside the window serves the
    // finished document. So the same page measures differently depending on
    // whether this lane happened to be the first to ask — a page that streamed
    // scores a layout shift the cached one does not, and CLS would then depend
    // on run order rather than on the code. XP4 says these budgets are
    // measured ON THE CACHED DOCUMENT; this is what makes that true.
    // The read counts have to be taken HERE, on each route's FIRST render: a
    // warm document reads nothing at all, so counting reads during the
    // measured pass would report a flat zero for every route and pass
    // forever. (`measure` re-warms each route immediately before it looks at
    // it — see the note there — so this loop is about reads, not staleness.)
    const reads = new Map();
    for (const route of ROUTES) {
      // ATTRIBUTE EVERY READ TO THE ROUTE THAT MADE IT. A build-time static
      // page (`/`, `/people`) whose prerender is already older than its
      // `revalidate` when the lane first asks is served STALE and regenerated
      // in the background, and WHEN that regeneration's one read reaches the
      // fixture is a matter of timing. On a laptop it lands before the stale
      // response resolves and is charged to `/people` (1). On the CI runner it
      // landed after, and was charged to the NEXT route: `/people` read 0 and
      // `/people/ada` read 2 in the same log — the lane's one failure, for a
      // page that makes exactly one read. Same reads, different attribution.
      // So wait for the fixture to go quiet before taking a route's baseline:
      // a read that arrives after a document was served was never "while
      // rendering" it.
      await settle(gateway);
      const before = gateway.requests.length;
      const res = await context.request.get(base + route.path);
      reads.set(route.path, gateway.requests.length - before);

      // AND WHILE WE ARE HERE: is this page cacheable at all?
      //
      // Almost every route in this lane is a public, anonymous, actor-free
      // document (OPC-1) declaring a `revalidate`. A response that goes out
      // `no-store` means that declaration is not taking effect — a whole class
      // of regression invisible from the page itself, and the one this lane
      // actually caught: six dynamic segments were shipping `private,
      // no-cache, no-store, must-revalidate` because a dynamic route needs
      // `generateStaticParams` before Next will register it for ISR at all.
      // Cheap to check, expensive to miss.
      //
      // SR0 ADDED THE FIRST ROUTE THAT MUST *NOT* BE CACHED, and it is checked
      // rather than skipped. `/search?q=` reads `searchParams`, so it is
      // dynamic by construction — declaring a `revalidate` on it would be
      // accepted, ignored, and mean nothing, which is the very defect above
      // wearing the opposite mask.
      //
      // SO `cacheable: false` IS AN INVERSION, NOT AN OPT-OUT. A route that
      // claims it and turns out to BE cacheable fails just as loudly as one
      // that claims nothing and is not. An escape hatch here would have been
      // worse than no check at all, because the lane would still print a green
      // line for the route it had stopped looking at.
      const cc = res.headers()["cache-control"] ?? "";
      const wantsCache = route.cacheable !== false;
      check(
        wantsCache ? `cacheable: ${route.path}` : `deliberately uncacheable: ${route.path}`,
        wantsCache ? !/no-store/.test(cc) : /no-store/.test(cc),
        cc || "(no cache-control)",
      );
    }

    // ── 1b. A moved address answers with a STATUS, not a page ────────
    //
    // The one thing every other check in this program was blind to. SB0's
    // `/create` → `/submit` redirect passed the census, passed its own suite,
    // passed lint and typecheck, built clean — and deployed as `HTTP 200` with
    // an empty body, because a route module whose body is one
    // `permanentRedirect` gets PRERENDERED and what ships is an RSC payload
    // the client router follows.
    //
    // `maxRedirects: 0` is the whole point: following the redirect is what a
    // browser does and what hid this for a week. The assertion is the status
    // line and the `location` header, taken from the built server.
    for (const moved of MOVED) {
      const res = await context.request.get(base + moved.from, { maxRedirects: 0 });
      check(
        `moved: ${moved.from} → ${moved.to}`,
        res.status() === moved.status && onThisApp(res.headers()["location"] ?? "", base) === moved.to,
        `${res.status()} → ${res.headers()["location"] ?? "(no location)"}`,
      );
    }

    // ── 1c. …AND THE ONES THAT DO NOT EXIST (R11) ────────────────────
    //
    // A status line, asserted against the built server, for the archetype
    // every miss lands on. The body is checked too, because a 404 that
    // rendered a blank page or somebody else's error would satisfy the status
    // and fail the reader.
    //
    // The page's own heading is how its body is told from another's. CL5
    // (#1889) said "build" where it said "product", and this lane — which no
    // website change selected yet — kept the old words (sourceplane/orun-cloud#1882).
    // openproduct-redesign OPR1: the site says "product" again, and the 404
    // with it — one title and one way back.
    const NOT_FOUND_HEADING = "No product lives at this address";
    for (const absent of ABSENT) {
      const res = await context.request.get(base + absent.path, { maxRedirects: 0 });
      const body = res.status() === 404 ? await res.text() : "";
      check(
        `absent: ${absent.path} — ${absent.why}`,
        res.status() === 404 && body.includes(NOT_FOUND_HEADING),
        res.status() === 404
          ? body.includes(NOT_FOUND_HEADING)
            ? "404, and the product's own not-found page"
            : "404, but the body is not the not-found page"
          : `HTTP ${res.status()} — a soft 404 is indexable and cacheable`,
      );
    }

    const measured = new Map();
    for (const route of ROUTES) {
      let m = await measure(context, base, route.path);
      // A NON-ZERO CLS ON A CACHED DOCUMENT IS A CLAIM WORTH CHECKING TWICE.
      //
      // These pages lay out from bytes that are already in the response, so a
      // real shift is deterministic: it happens on every load or it is not a
      // property of the page. The one thing that produces an occasional one
      // is the ISR entry expiring in the gap between `warmUntilCached`
      // confirming a HIT and the browser's navigation arriving — a few
      // hundred milliseconds, and the re-render that follows streams.
      // So: measure again, and keep the lower. A real shift survives; an
      // expiry does not. This is not a retry-until-green — a shift that
      // reproduces is still reported, and the budget still fails on it.
      if (m.cls > 0) {
        const again = await measure(context, base, route.path);
        if (again.cls < m.cls) m = again;
      }
      m.reads = reads.get(route.path) ?? 0;
      measured.set(route.path, m);
      check(
        `rendered: ${route.path} (${route.name})`,
        m.status === 200 && m.html.includes(route.expect),
        m.status === 200
          ? m.html.includes(route.expect)
            ? `${(m.html.length / 1024).toFixed(0)}KB`
            : `200 but "${route.expect}" is absent — this is a failure panel or an empty state, not the surface`
          : `HTTP ${m.status}`,
      );
    }

    // ── 2. The four archetypes, against their budgets ────────────────
    for (const [path, budget] of Object.entries(BUDGETS)) {
      const m = measured.get(path);
      if (!m) {
        check(`budget: ${path}`, false, "route not measured — is it still in ROUTES?");
        continue;
      }
      // THE RAW COUNT IS PRINTED BESIDE THE ROUNDED ONE, and it earned its
      // place: `/people/ada` failed reading `124.0KB — 124.0KB`, a line that
      // cannot tell you whether you are two bytes over or thirty. A budget
      // whose failure message does not say how far over it is sends the reader
      // to guess, and the guess here was wrong by an order of magnitude.
      const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
      check(
        `${path}: JS ≤ ${kb(budget.js)}`,
        m.jsBytes <= budget.js,
        `${kb(m.jsBytes)} (${m.jsBytes} B) across ${m.jsCount} chunks`,
      );
      check(
        `${path}: document ≤ ${kb(budget.doc)}`,
        m.docBytes <= budget.doc,
        // BYTES BESIDE THE KB, like the JS check above it. Re-baselining this
        // budget meant standing a server up by hand to find out what "14.4KB"
        // was, because one decimal place of KB is a 50-byte window and a
        // budget is set in bytes.
        `${kb(m.docBytes)} (${m.docBytes} B)`,
      );
      check(`${path}: CLS ≤ ${budget.cls}`, m.cls <= budget.cls, m.cls.toFixed(4));
      if (budget.images !== undefined) {
        check(
          `${path}: images ≤ ${kb(budget.images)} (WC-5)`,
          m.imageBytes <= budget.images,
          `${kb(m.imageBytes)} across ${m.imageCount} picture(s)`,
        );
      }
      check(
        `${path}: server reads ≤ ${budget.reads} while rendering`,
        m.reads <= budget.reads,
        `${m.reads} read(s) — a document that reads one endpoint twice costs the slower of two round trips`,
      );
      check(
        `${path}: no third-party request — nothing but the site and its own API`,
        m.thirdParty.length === 0,
        m.thirdParty.join(", ") || "clean",
      );
      check(
        `${path}: nothing render-blocking in <head>`,
        m.blocking.length === 0,
        m.blocking.join(", ") || "clean",
      );
      check(
        `${path}: the overlay does not block first paint (XP2)`,
        m.overlayAfterLoad,
        m.overlayRequests === 0 ? "not requested" : `${m.overlayRequests} request(s), all after load`,
      );
    }

    // ── 3. LCP, median of RUNS ───────────────────────────────────────
    for (const path of Object.keys(BUDGETS)) {
      const budget = BUDGETS[path].lcp;
      const runs = [];
      for (let r = 0; r < RUNS; r++) {
        const m = await measure(context, base, path);
        runs.push(m.lcp);
      }
      check(
        `${path}: LCP median < ${budget * BAND}ms (target ${budget})`,
        median(runs) < budget * BAND,
        `median ${median(runs)}ms of [${runs.join(", ")}]`,
      );
    }
    // ── 3b. The COLD render, on a URL nothing has asked for yet ──────
    //
    // Everything above measures the cached document. This measures the other
    // half of the truth — what the first visitor of a revalidation window
    // gets — and it can only be measured once per URL, which is why it uses a
    // listing the rest of this lane never touches.
    {
      const cold = `/${CARDS[7].slug}`;
      const m = await measure(context, base, cold, { warm: false });
      check(
        `cold render ${cold}: rendered`,
        m.status === 200 && m.html.includes(CARDS[7].tagline),
        m.status === 200 ? "the listing, not a panel" : `HTTP ${m.status}`,
      );
      check(
        `cold render ${cold}: CLS ≤ ${COLD_CLS} (streamed, skeleton → content)`,
        m.cls <= COLD_CLS,
        `${m.cls.toFixed(4)} — the cached document scores 0.0000; this is the streamed one`,
      );
    }

    await context.close();

    // ── 4. I6, at runtime, on EVERY route the epic added ─────────────
    //
    // XP4's own done-when: I6 re-asserted on every route the epic added, not
    // just the four it started with. The web lane already asserts it from the
    // SOURCE ("no route module reads cookies") — a good rule, and a rule
    // about the code rather than about the bytes. This asserts the bytes: two
    // fetches of the same URL, one of them carrying a session the app really
    // accepts, must be identical. Personalisation that arrived through a
    // component nobody thought to scan would show up here and nowhere else.
    {
      const anon = await browser.newContext();
      const auth = await browser.newContext();
      await auth.addCookies([sessionCookie(hostname, port)]);
      for (const route of ROUTES) {
        const [a, b] = await Promise.all([
          anon.request.get(base + route.path).then((r) => r.text()),
          auth.request.get(base + route.path).then((r) => r.text()),
        ]);
        const same = a === b;
        check(
          `I6: ${route.path} is byte-identical signed-in and signed-out`,
          same,
          same ? `${(a.length / 1024).toFixed(0)}KB` : firstDifference(a, b),
        );
      }
      await anon.close();
      await auth.close();
    }

    // ── 4b. THE SIGNED-IN LAYOUT, WHICH §4 ABOVE CANNOT SEE ──────────
    //
    // I6 says the two renders are the same DOCUMENT, and §4 proves it. It says
    // nothing about what happens to that document AFTER the XP2 overlay lands
    // and marks it, and neither does the CLS budget in §2 — which measures the
    // anonymous page, where no overlay ever answers.
    //
    // Both were green while `/me` shifted 0.101 signed in, over the web-vitals
    // "good" ceiling, for the whole life of that page (openproduct-performance
    // OPP9). The gap was not a weak budget; it was an axis nobody measured.
    //
    // BUDGETED LOOSER THAN THE ANONYMOUS 0.02, and deliberately: this page IS
    // being changed after paint — that is the mechanism OPC-1 requires — so
    // some movement is the design working. 0.05 is half the "good" ceiling and
    // well under what a reader notices, and it is a CEILING on a cost that
    // should trend to nothing rather than a target to sit against.
    {
      const auth = await browser.newContext();
      await auth.addCookies([sessionCookie(hostname, port)]);
      const page = await auth.newPage();
      // MD2 — WARM FIRST, as §2 does, and re-measure once, as §2 does. This
      // number is "the overlay landing on an ALREADY-PAINTED page"; the
      // skeleton→content replacement of a cold streamed render is §3's number
      // (COLD_CLS) and must not leak in here. It did: by the time §4b runs on
      // a CI runner, the listing's ISR entry from §2's warm-up had aged out,
      // the signed-in goto got a cold render, and the shift measured 0.1016
      // against 0.05 — while eight local runs, fast enough to stay inside the
      // window, measured 0.0000. The panel of pictures MD2 added made the cold
      // shift bigger; it did not make the page shift after paint. Warming
      // restores what the budget claims to measure; the re-measure follows
      // §2's rule that a shift which reproduces is still reported.
      const signedInCls = async (path) => {
        await page.addInitScript(OBSERVE_CLS);
        await page.goto(base + path, { waitUntil: "load" });
        // Long enough for the overlay to answer and mark whatever it marks.
        await page.waitForTimeout(1200);
        return page.evaluate(() => window.__signedInCls ?? 0);
      };
      for (const path of Object.keys(BUDGETS)) {
        await warmUntilCached(auth, base, path);
        let cls = await signedInCls(path);
        if (cls > 0) cls = Math.min(cls, await signedInCls(path));
        check(
          `${path}: CLS signed-in ≤ ${SIGNED_IN_CLS}`,
          cls <= SIGNED_IN_CLS,
          `${cls.toFixed(4)} — the overlay landing on an already-painted page`,
        );
      }
      await page.close();
      await auth.close();
    }

    // ── 5. What the fixture was never asked for ──────────────────────
    //
    // Not a budget — a receipt. A read this lane does not mock answers 502,
    // ── OL9: the design system's own weight, across every route ─────────
    //
    // Checked on EVERY route rather than once, because the interesting failure
    // is a single page that pulls something the rest do not — a component that
    // asks for a face inline, or a route that renders a glyph outside the
    // latin subset and drags a second file down with it. One number, asserted
    // everywhere, catches both that and an estate-wide regression.
    for (const [path, m] of measured) {
      const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
      // A page that draws an idea's quote takes the italic; no other does.
      const fonts = m.drawsSerifItalic ? FONTS_WITH_ITALIC : FONTS;
      const why = m.drawsSerifItalic ? " (this page draws serif italic: an idea's quote)" : "";
      check(
        `${path}: font files ≤ ${fonts.files}${why}`,
        m.fontCount <= fonts.files,
        `${m.fontCount} file(s): ${m.fontFiles.join(", ")} — one file more: a fourth face, another weight, or the italic preloaded again`,
      );
      check(
        `${path}: font bytes ≤ ${kb(fonts.bytes)}${why}`,
        m.fontBytes <= fonts.bytes,
        `${kb(m.fontBytes)} — an unsubsetted face keeps the count and multiplies the payload`,
      );
    }

    // and 502 becomes `null`, and `null` renders as an empty state that the
    // §1 check may or may not happen to catch. Printing the unmatched paths
    // means the next person to add a surface sees why their route looks thin.
    if (gateway.unmatched.length > 0) {
      const paths = [...new Set(gateway.unmatched)];
      check(
        "every read the pages made was answered by the fixture",
        false,
        `unmocked: ${paths.join(", ")} — add them to fixture.mjs rather than lowering a budget`,
      );
    } else {
      check("every read the pages made was answered by the fixture", true, "clean");
    }
  } finally {
    await browser.close();
  }

  for (const n of notes) console.log(`[note] ${n}`);
  console.log(
    failures.length === 0
      ? "web-perf: ALL BUDGETS PASS"
      : `web-perf: ${failures.length} FAILED → ${failures.join(" | ")}`,
  );
  return failures.length === 0 ? 0 : 1;
}

/** Where two renders first disagree, with enough either side to recognise it.
 *  A diff of two 140KB documents is unreadable; the first divergence is the
 *  address. */
function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const at = Math.max(0, i - 60);
  return `differ at byte ${i}: …${JSON.stringify(a.slice(at, i + 60))} vs …${JSON.stringify(b.slice(at, i + 60))}`;
}
