// The corpus the budget and a11y lanes measure against (openproduct-commons XP4).
//
// WHY A MOCK GATEWAY AND NOT `page.route` INTERCEPTION, which is how the
// console's lane (`tests/web-console-perf`) does it: openproduct's public
// pages read from the SERVER. Every `fetchPublic*` runs inside a React server
// component during `next build`/`next start`, so it never touches the browser
// and Playwright's request router cannot see it. The only place to answer
// those reads is an HTTP server the app can actually reach.
//
// THE FIXTURE MUST PRODUCE PAGES, NOT PAYLOADS. `readPublic` swallows every
// failure into `null`, and `null` renders as a failure panel or a 404 — both
// of which are cheap, small, fast documents that would sail through a
// performance budget and an accessibility walk while proving nothing at all.
// That is the OD5 finding ("an empty room and a locked door look nothing alike
// to a visitor") pointed at a test lane: a lane that measures a failure panel
// reports success for a surface it never rendered. So `budgets.mjs` asserts
// what each route RENDERED before it measures it, and this file exists to make
// that assertion pass honestly.
//
// Shapes follow the contracts' pinned key sets (PUBLIC_PROFILE_CARD_KEYS,
// PUBLIC_CONTRIBUTOR_KEYS, …). Contents are deliberately dull and fixed: every
// number here is a constant, because a budget measured against a corpus that
// varies between runs is a budget that fails on Tuesdays.

import { createServer } from "node:http";
import { deflateSync } from "node:zlib";

/** Fixed instant. Nothing in this file may read the clock — a corpus that
 *  moves makes "did this regress" unanswerable. */
export const NOW = "2026-06-01T12:00:00.000Z";
const EARLIER = "2026-05-20T09:30:00.000Z";

// PV0 — the observed row's moment, RELATIVE TO NOW rather than fixed.
//
// Every other date here is a literal, and that is right for them: a launch
// day is the day it was. But `observedAt` is read against a 30-day horizon,
// so a literal would drift past it and the lane would silently stop walking
// the ordinary case — every listing permanently withdrawn, which is the one
// state the frame is least about. Two values, so the walk sees both.
const OBSERVED_FRESH = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const OBSERVED_STALE = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
const LAST_COMMIT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

/** How many listings the directory carries.
 *
 *  Chosen, not arbitrary: the directory ships its whole document once (it is
 *  static, filtered client-side), so the row count IS the document-weight
 *  budget's independent variable. 24 is enough that a regression in per-row
 *  markup shows up as bytes, and small enough that the corpus stays readable. */
export const LISTING_COUNT = 24;

const CATEGORIES = ["developer-tools", "productivity", "infrastructure", "design"];
const HOSTINGS = ["self-host", "cloud", "both"];
const LICENCES = ["MIT", "Apache-2.0", "AGPL-3.0", null];
const STACKS = [
  ["typescript", "react", "postgres"],
  ["go", "postgres"],
  ["rust", "sqlite"],
  ["python", "django", "postgres"],
];

const PRICINGS = ["free", "open-core", "paid", "self-host"];

const metric = (key, value) => ({ key, value, observedAt: EARLIER, state: "fresh" });

// ─── MD2 — the pictures ─────────────────────────────────────────────────────
//
// Four states, keyed off the slug so the walk and the budgets see each: the
// full panel (hero, two gallery images, a fresh capture), a hero alone, no
// media at all (no panel, no placeholder — the common case on day one), and
// a capture past its window, which is WITHDRAWN and draws nothing. The refs
// are content addresses the fixture gateway answers with generated PNG bytes
// of exactly the stated dimensions, so the browser lays out what the row
// said it would.
const MEDIA_REF = (letter) => `${letter.repeat(64)}.png`;
/** Every ref the gateway will be asked for, with the dimensions it must have. */
export const MEDIA_OBJECTS = {
  [MEDIA_REF("a")]: { width: 1200, height: 630 },
  [MEDIA_REF("b")]: { width: 800, height: 600 },
  [MEDIA_REF("c")]: { width: 1000, height: 625 },
  [MEDIA_REF("d")]: { width: 1280, height: 800 },
  // openproduct-studio OSD2 — a logo is square.
  [MEDIA_REF("e")]: { width: 256, height: 256 },
};
const authored = (kind, letter, position, alt) => ({
  value: { id: `med_${letter}${position}`, kind, ref: MEDIA_REF(letter), alt, position, ...MEDIA_OBJECTS[MEDIA_REF(letter)] },
  provenance: { class: "authored", by: "maintainer" },
});
const captured = (observedAt) => ({
  value: {
    id: "med_shot",
    kind: "screenshot",
    ref: MEDIA_REF("d"),
    alt: `An automated screenshot of the live address, captured on ${observedAt.slice(0, 10)}. Not a picture chosen by its makers.`,
    position: 0,
    ...MEDIA_OBJECTS[MEDIA_REF("d")],
  },
  provenance: { class: "observed", source: "declared_url", observedAt },
});
export function MEDIA_FOR(slug) {
  const n = Number(slug.slice(-2));
  if (n % 4 === 0) {
    return [
      authored("hero", "a", 0, "The dashboard, with a week of merges charted"),
      authored("gallery", "b", 0, "The settings page"),
      authored("gallery", "c", 1, "A pull request being reviewed"),
      captured(OBSERVED_FRESH),
    ];
  }
  if (n % 4 === 1) return [authored("hero", "a", 0, "The dashboard")];
  if (n % 4 === 2) return [];
  return [captured(OBSERVED_STALE)];
}

/** MD3 — the hero's asset for a row's tile, or null for the monogram. */
export function THUMBNAIL_FOR(slug) {
  const hero = MEDIA_FOR(slug).find((m) => m.value.kind === "hero");
  if (!hero) return null;
  const { ref, alt, width, height } = hero.value;
  return { ref, alt, width, height };
}

/** One directory card. Exactly PUBLIC_PROFILE_CARD_KEYS, nothing else. */
function card(i) {
  const stack = STACKS[i % STACKS.length];
  const openings = i % 3 === 0 ? 2 : 0;
  return {
    slug: `product-${String(i).padStart(2, "0")}`,
    // IN3 — ONE CARD BELOW THE FLOOR, so the walk covers a front page that
    // filters. `product-06` has no topic and is therefore not in the
    // catalogue at all — it is not ordered last, it is absent, which is the
    // distinction WC-D turns on and the one a screenshot can actually show.
    // Its own listing page still renders: the floor governs one list, not
    // whether a product exists.
    tagline: `A dull, deterministic product for measuring page weight (#${i}).`,
    stack,
    stackCanonical: stack,
    category: i === 6 ? null : CATEGORIES[i % CATEGORIES.length],
    hosting: HOSTINGS[i % HOSTINGS.length],
    // PP3 — the authored pricing facet; every fourth listing says nothing.
    pricing: i % 4 === 3 ? null : PRICINGS[i % PRICINGS.length],
    licence: LICENCES[i % LICENCES.length],
    roleOpeningCount: openings,
    openingCommitments: openings > 0 ? ["a-few-hours-a-week"] : ["none-open"],
    hasLiveUrl: i % 2 === 0,
    indexable: true,
    publishedAt: EARLIER,
    metrics: [metric("merges.7d", 3 + (i % 5)), metric("last_touched.all", 1)],
    // MD3 — the hero for the tile; the slug decides (see MEDIA_FOR).
    thumbnail: THUMBNAIL_FOR(`product-${String(i).padStart(2, "0")}`),
  };
}

export const CARDS = Array.from({ length: LISTING_COUNT }, (_, i) => card(i));
/** OS1 — the page after the first: twenty-four more, and the last page. The
 *  cursor is opaque to the website; this is the one the fixture issues. */
export const PAGE_TWO_CURSOR = "page-2";
export const CARDS_PAGE_TWO = Array.from({ length: LISTING_COUNT }, (_, i) => card(i + LISTING_COUNT));

/** The slug every route-level assertion uses. Index 0, so it has openings. */
export const SAMPLE_SLUG = CARDS[0].slug;
export const SAMPLE_HANDLE = "ada";
export const SAMPLE_THREAD = "thr_000000000000000000000001";
export const SAMPLE_COLLECTION = "worth-a-look";
export const SAMPLE_WEEK = "2026-w21";
export const SAMPLE_DAY = "2026-05-20";

const MAINTAINERS = [
  { subjectId: "sub_000000000000000000000001", displayName: "Ada Lovelace", roleLabel: "maintainer", handle: "ada" },
  // handle: null is the XP-5 case — plain text, never a dead link. Present in
  // the corpus so the a11y walk exercises both branches of that rule.
  { subjectId: "sub_000000000000000000000002", displayName: "Grace Hopper", roleLabel: "design lead", handle: null },
];

/**
 * PV4's three states, keyed off the slug so the walk covers all of them.
 *
 * The observed entry carries the moment of the read that found it (OPC-7);
 * the authored one carries none at all, because we know only that it happened
 * between two daily snapshots.
 */
function CHANGES_FOR(slug) {
  const n = Number(slug.slice(-2));
  if (n % 3 === 1) {
    return [
      {
        field: "licence",
        label: "The licence",
        provenance: { class: "observed", source: "declared_repo", observedAt: OBSERVED_FRESH },
        from: "MIT",
        to: "AGPL-3.0",
      },
      {
        field: "tagline",
        label: "The one-line description",
        provenance: { class: "authored", by: "maintainer" },
        from: "A thing that does the thing",
        to: "The fastest way to do the thing",
      },
      {
        field: "openRoles",
        label: "Open roles",
        provenance: { class: "authored", by: "maintainer" },
        from: "2",
        to: "3",
      },
    ];
  }
  if (n % 3 === 2) return [];
  return null;
}

/** One project page. Exactly PUBLIC_PROFILE_KEYS. */
function profile(slug) {
  const c = CARDS.find((x) => x.slug === slug) ?? CARDS[0];
  return {
    slug: c.slug,
    tagline: c.tagline,
    pitch: [
      "This is the pitch body. It is prose, it is a few paragraphs long, and it",
      "exists so the detail archetype has something of realistic weight to lay",
      "out and something for a screen reader to walk through.",
      "",
      "A second paragraph, for the same reason.",
    ].join("\n"),
    pitchDigest: `sha256:${"a".repeat(64)}`,
    // PV2 — an install line on most listings and none on every fourth, so the
    // walk sees the box AND its absence. A listing with no command renders no
    // section at all rather than an empty box (OPC-C).
    installLine: Number(c.slug.slice(-2)) % 4 === 3 ? null : `npx create-${c.slug}`,
    // PV3 — the mark on every fifth listing, so the walk sees BOTH states.
    // Most listings carry none, which is the design rather than the fixture
    // being thin: the mark needs a floor of upvotes, and absence covers "too
    // few to check" as well as "checked and did not clear".
    cleanVotes: Number(c.slug.slice(-2)) % 5 === 0,
    // PV4 — ALL THREE STATES, because the three render completely differently
    // and only one of them is the interesting one:
    //
    //   null   no earlier snapshot — NO SECTION AT ALL, which is most
    //          listings here and the state a walk would otherwise never see
    //   []     compared, nothing moved — the heading and one sentence
    //   [...]  the diff, with an OBSERVED row (dashed frame, a moment) beside
    //          an AUTHORED one (no moment, "changed by its maintainers")
    changes: CHANGES_FOR(c.slug),
    stack: c.stack,
    stackCanonical: c.stackCanonical,
    category: c.category,
    hosting: c.hosting,
    pricing: c.pricing,
    // PP5 — the launch history, READ from the board's rows. The listings on
    // the sample day's board carry their one launch; the rest carry none, so
    // the walk sees the section and its absence. PP5 landed without this and
    // the listing page threw on `.length` against the fixture — which this
    // lane, scheduled only by its own files, never ran to see (MD2 found it).
    launches: (() => {
      const at = BOARD.findIndex((b) => b.slug === c.slug);
      return at < 0
        ? []
        : [
            {
              day: SAMPLE_DAY,
              launchedAt: EARLIER,
              versionLabel: BOARD[at].versionLabel,
              rank: at + 1,
              of: BOARD.length,
              counted: BOARD[at].counted,
              commentCount: 3,
            },
          ];
    })(),
    repoUrl: "https://github.com/example/product",
    liveUrl: c.hasLiveUrl ? "https://example.com" : null,
    licence: c.licence,
    // PV0 — the observed row. One read, one moment, and `openIssues` at zero
    // on some listings so the walk sees the earned zero as well as a count.
    // `language` is absent on every third listing: a repository GitHub could
    // not classify renders a dash, which is what "read and it answered
    // nothing" looks like.
    // One listing carries a stale observation, so the walk sees a withdrawn
    // row beside the ordinary ones.
    observedAt: c.slug.endsWith("7") ? OBSERVED_STALE : OBSERVED_FRESH,
    language: c.slug.endsWith("3") ? null : "TypeScript",
    lastCommitAt: LAST_COMMIT,
    openIssues: c.roleOpeningCount > 0 ? 12 : 0,
    indexable: true,
    publishedAt: c.publishedAt,
    components: [
      { name: "api", kind: "service" },
      { name: "web", kind: "website" },
    ],
    maintainers: MAINTAINERS,
    // MD2 — see MEDIA_FOR.
    media: MEDIA_FOR(c.slug),
    roleOpenings:
      c.roleOpeningCount > 0
        ? [
            {
              id: "rol_000000000000000000000001",
              title: "Frontend contributor",
              description: "Help with the directory surface.",
              commitment: "a-few-hours-a-week",
              status: "open",
              joinLinkRef: "join_000000000000000000000001",
              // CB2/OPC-F: floored by core, never a raw number on the wire.
              demand: { floored: true, atLeast: 3 },
            },
          ]
        : [],
    metrics: c.metrics,
    // PP1 — the follower count the profile carries (a number, never a list).
    followers: 12,
    // PP5 — the launch history. Empty: none of these has launched, which is
    // the common case and the one the page's "Launches" section must skip.
    // (UV1's `launch` key is ABSENT for the same reason — a listing that has
    // never launched carries no placement.)
    launches: [],
  };
}

const LISTING_REFS = CARDS.slice(0, 3).map((c) => ({ slug: c.slug, tagline: c.tagline }));

/** Exactly PUBLIC_CONTRIBUTOR_KEYS. */
const CONTRIBUTOR = {
  handle: SAMPLE_HANDLE,
  displayName: "Ada Lovelace",
  bio: "Writes things down so other people can check them.",
  githubUrl: "https://github.com/example",
  siteUrl: "https://example.com",
  openToProject: true,
  publishedAt: EARLIER,
  maintains: LISTING_REFS,
  contributesTo: 2,
  // CG-5: null is "we cannot look", and the page must render that sentence
  // rather than a zero. Kept null in the corpus so the a11y walk sees it.
  reviews: null,
  // FL0 — counted, never listed.
  followers: 34,
  contributesToListings: LISTING_REFS.slice(0, 2),
};

/** Exactly PUBLIC_CONTRIBUTOR_CARD_KEYS. */
const CONTRIBUTOR_CARDS = Array.from({ length: 12 }, (_, i) => ({
  handle: i === 0 ? SAMPLE_HANDLE : `person-${String(i).padStart(2, "0")}`,
  displayName: i === 0 ? "Ada Lovelace" : `Person ${i}`,
  bio: i % 3 === 0 ? null : `One line about person ${i}, as they wrote it.`,
  openToProject: i % 2 === 0,
  maintains: [CARDS[i % CARDS.length].slug],
  contributesTo: i % 4,
  // PE3 — some have launched, so the filter shows a list and a shorter one.
  launched: i % 3 === 0,
}));

const THREAD = {
  id: SAMPLE_THREAD,
  tag: "question",
  title: "How do I run this locally?",
  authorHandle: SAMPLE_HANDLE,
  authorName: "Ada Lovelace",
  state: "open",
  createdAt: EARLIER,
  lastPostAt: EARLIER,
  postCount: 2,
};

/**
 * DQ0b — the listing's one comment thread, and the words in it.
 *
 * A SEPARATE FIXTURE FROM `THREAD` because it is a separate object on the
 * page: the titled discussion renders as a card linking away, and this renders
 * flat under the box. One post is REMOVED, so the walk sees the state that
 * keeps its place and says so (TS-3) rather than only the happy row.
 */
const LAUNCH_THREAD = {
  id: "thr_000000000000000000000002",
  tag: "launch",
  title: `Comments on ${SAMPLE_SLUG}`,
  authorHandle: SAMPLE_HANDLE,
  authorName: "Ada Lovelace",
  state: "open",
  createdAt: EARLIER,
  lastPostAt: EARLIER,
  postCount: 2,
};

const POSTS = [
  {
    id: "pst_000000000000000000000001",
    authorHandle: SAMPLE_HANDLE,
    authorIsMaintainer: true,
    authorName: "Ada Lovelace",
    // CB0's restricted render subset: a TYPED TREE, never markup. The page
    // renders nodes, so a string here would render as nothing at all.
    body: [
      {
        kind: "paragraph",
        children: [
          { kind: "text", value: "The README covers it, but the short version is " },
          { kind: "code", value: "pnpm dev" },
          { kind: "text", value: "." },
        ],
      },
      {
        kind: "list",
        ordered: false,
        children: [
          { kind: "listitem", children: [{ kind: "text", value: "Install the dependencies." }] },
          { kind: "listitem", children: [{ kind: "text", value: "Run the dev server." }] },
        ],
      },
    ],
    state: "visible",
    createdAt: EARLIER,
    editedAt: null,
    isAnswer: true,
    parentPostId: null,
    // DQ1 — the public count on a comment. Non-zero on one row and zero on
    // the rest, so the walk renders both the ordinary case and the honest
    // zero.
    votes: 4,
  },
  {
    id: "pst_000000000000000000000002",
    authorHandle: null,
    authorIsMaintainer: false,
    authorName: null,
    body: [{ kind: "paragraph", children: [{ kind: "text", value: "Thanks — that worked." }] }],
    state: "visible",
    createdAt: EARLIER,
    editedAt: null,
    isAnswer: false,
    parentPostId: null,
    // CV1 — this one ANSWERS the first, so the walk sees a nested reply
    // rather than a flat list that happens to be in the right order.
    parentPostId: "pst_000000000000000000000001",
    // The honest zero: something observes a vote, so this has been counted
    // and found empty rather than being a claim nobody could make.
    votes: 0,
  },
  {
    // And one that answers nothing, so the walk also sees a top-level post
    // with no replies under it — the case an over-eager nesting would break.
    id: "pst_000000000000000000000003",
    authorHandle: null,
    authorIsMaintainer: false,
    authorName: null,
    body: [
      {
        kind: "paragraph",
        children: [
          { kind: "text", value: "Separately: does it run on ARM? " },
          // CV3 — one handle somebody claimed, and one nobody did. The claimed
          // one is a link; the other is the text it was written as (OPC-5).
          { kind: "mention", handle: SAMPLE_HANDLE, claimed: true },
          { kind: "text", value: " — or " },
          { kind: "mention", handle: "nobody-here", claimed: false },
          { kind: "text", value: "?" },
        ],
      },
    ],
    state: "visible",
    createdAt: EARLIER,
    editedAt: null,
    isAnswer: false,
    parentPostId: null,
    votes: 0,
  },
];

/** DQ0b — what people said on the product page. Two comments, one of them
 *  REMOVED, so the walk sees the state that keeps its place and says so
 *  (TS-3) rather than only the happy row. */
const LAUNCH_POSTS = [
  {
    id: "pst_000000000000000000000011",
    authorHandle: SAMPLE_HANDLE,
    authorIsMaintainer: true,
    authorName: "Ada Lovelace",
    body: [
      {
        kind: "paragraph",
        children: [{ kind: "text", value: "Does this work behind a corporate proxy?" }],
      },
    ],
    state: "visible",
    createdAt: EARLIER,
    editedAt: null,
    isAnswer: false,
    parentPostId: null,
    votes: 2,
  },
  {
    id: "pst_000000000000000000000012",
    // A REMOVED comment carries no body and keeps its place.
    authorHandle: null,
    authorIsMaintainer: false,
    authorName: null,
    body: [],
    state: "removed",
    createdAt: EARLIER,
    editedAt: null,
    isAnswer: false,
    parentPostId: null,
    // A removed comment draws no control at all, so this is never rendered —
    // but the SHAPE has to be right or a missing key would show up in
    // production rather than here.
    votes: 0,
  },
];

const COLLECTION_CARDS = [
  {
    slug: SAMPLE_COLLECTION,
    title: "Worth a look",
    blurb: "Six things I keep coming back to.",
    curatorHandle: SAMPLE_HANDLE,
    publishedAt: EARLIER,
    count: 6,
  },
  {
    slug: "self-hostable",
    title: "Self-hostable",
    blurb: null,
    curatorHandle: SAMPLE_HANDLE,
    publishedAt: EARLIER,
    count: 4,
  },
];

const COLLECTION = {
  slug: SAMPLE_COLLECTION,
  title: "Worth a look",
  blurb: "Six things I keep coming back to.",
  curatorHandle: SAMPLE_HANDLE,
  publishedAt: EARLIER,
  // CollectionItem, not a bare card: the note is what a collection has that a
  // filtered list does not, and half the corpus omits it so both branches
  // render.
  items: CARDS.slice(0, 6).map((c, i) => ({
    card: c,
    note: i % 2 === 0 ? "Kept for the way it handles the empty case." : null,
  })),
};

const BOARD = CARDS.slice(0, 8).map((c, i) => ({
  launchId: `lch_${String(i).padStart(24, "0")}`,
  slug: c.slug,
  tagline: c.tagline,
  versionLabel: i % 2 === 0 ? "v1.0" : null,
  launchedAt: EARLIER,
  counted: 5 - (i % 5),
  ineligible: false,
}));

/**
 * OL2 — the feed, built FROM the board so the two never disagree.
 *
 * Today's group is the whole board; `earlier` gets one row on an older day so
 * the lane exercises the multi-day path. `#1 today` therefore falls on the
 * board's own rank 1, which is the property the front page and the archive
 * have to share (OL-2a).
 */
function feedEntry(entry, day, rank) {
  const card = CARDS.find((c) => c.slug === entry.slug) ?? CARDS[0];
  return {
    launchId: entry.launchId,
    slug: entry.slug,
    tagline: entry.tagline,
    versionLabel: entry.versionLabel ?? "v1.0",
    launchedAt: EARLIER,
    day,
    rank,
    counted: entry.counted,
    ineligible: 0,
    licence: card.licence ?? null,
    topics: card.category ? [card.category] : [],
    stack: (card.stackCanonical ?? card.stack ?? []).slice(0, 1),
    roleOpeningCount: card.roleOpeningCount ?? 0,
    commentCount: 3,
    // MD3 — the tile's picture; null keeps the monogram.
    thumbnail: card.thumbnail ?? null,
  };
}

const FEED_EARLIER_DAY = "2026-05-18";

const FEED = {
  today: SAMPLE_DAY,
  groups: [
    {
      id: "today",
      heading: "Today",
      day: SAMPLE_DAY,
      entries: BOARD.slice(0, 6).map((b, i) => feedEntry(b, SAMPLE_DAY, i + 1)),
    },
    {
      id: "earlier",
      heading: "Earlier this week",
      day: null,
      entries: BOARD.slice(6).map((b, i) => feedEntry(b, FEED_EARLIER_DAY, i + 1)),
    },
  ],
  windowDays: 7,
  formula: "launch.board-rank",
  meaning:
    "Launches from the past week, newest day first, each day in the order its upvotes put it in. A day runs from midnight to midnight UTC, and only upvotes from accounts that already existed when a launch went live move a position.",
  emptyNote:
    "Nothing has launched this week. Every published product is still in the directory.",
};

/** UV2 — the leaderboard, both ranges over the same corpus.
 *
 *  The lane serves ONE document for either range, because what it measures is
 *  the page's weight and its accessibility, not the window arithmetic — that is
 *  pinned in packages/contracts against a fixed clock, where it can be checked
 *  exactly. What the fixture must get right is the SHAPE, so a missing key
 *  shows up as a broken row here rather than in production. */
function leaderboardEntry(entry, index) {
  const card = CARDS.find((c) => c.slug === entry.slug) ?? CARDS[0];
  return {
    launchId: entry.launchId,
    slug: entry.slug,
    tagline: entry.tagline,
    day: index < 6 ? SAMPLE_DAY : FEED_EARLIER_DAY,
    rank: index + 1,
    dayRank: (index % 6) + 1,
    counted: entry.counted,
    commentCount: index % 3,
    // One row with nobody confirmed, one with an unlinked maker, one with an
    // overflow — the three states the column has to draw.
    makers:
      index === 0
        ? [
            { handle: SAMPLE_HANDLE, name: "Ada Lovelace" },
            { handle: null, name: "Bo Nilsson" },
          ]
        : index === 1
        ? []
        : [{ handle: SAMPLE_HANDLE, name: "Ada Lovelace" }],
    moreMakers: index === 0 ? 2 : 0,
  };
}

const LEADERBOARD = {
  range: "week",
  today: SAMPLE_DAY,
  from: FEED_EARLIER_DAY,
  to: SAMPLE_DAY,
  entries: BOARD.map((b, i) => leaderboardEntry(b, i)),
  formula: "launch.leaderboard",
  meaning:
    "Ordered by the upvotes each launch received on the day it launched, after the integrity discount. A launch the daily sweep has not counted yet is not listed.",
  subtitle: "Most upvoted launches, 18 May – 20 May",
  emptyNote:
    "No launch in this range has been counted yet. The daily sweep publishes each day's numbers shortly after the day closes.",
};

/** TP0 — the topic index and one topic, over the same corpus. Built from the
 *  fixture's own cards so a card count and the directory cannot disagree here
 *  either. */
const TOPIC_VALUES = [...new Set(CARDS.map((c) => c.category).filter(Boolean))];
export const SAMPLE_TOPIC = TOPIC_VALUES[0];
/** VC1 — the value every card in this corpus carries, so the page it names is
 *  never the empty one. `STACKS[0]` is the first card's, and `card(i)` cycles
 *  the four lists, so this one is on a quarter of them. */
const SAMPLE_STACK = STACKS[0][0];

function topicCard(value) {
  return {
    value,
    label: value.replace(/(^|-)([a-z])/g, (_, sep, ch) => (sep ? " " : "") + ch.toUpperCase()),
    description:
      "What kind of product this is. One per listing, picked by its maintainers.",
    products: CARDS.filter((c) => c.category === value).length,
    // FL0 — the count TP0 deliberately left out. Non-zero on the first topic
    // and zero on the rest, so the walk renders both the ordinary case and the
    // honest zero.
    followers: value === TOPIC_VALUES[0] ? 12 : 0,
  };
}

const TOPICS = {
  topics: TOPIC_VALUES.map(topicCard),
  meaning:
    "Every category a listed product has chosen, with how many products carry it. A category is picked by a product's own maintainers from a published vocabulary.",
  windowDays: 30,
};

/**
 * FL1 — the feed's sidebar, as its own document.
 *
 * Built FROM the corpus above so a panel and the page beside it cannot
 * disagree: the topics are the directory's own categories, the collection is
 * the collections index's first card, the openings belong to listings that
 * carry them, and the people are the contributors who set CG1's opt-in.
 *
 * ALL FOUR PANELS ARE POPULATED HERE, and that is not the milestone forgetting
 * its own done-when. A panel with nothing to say is ABSENT, and absence is
 * pinned where it can be checked exactly — `sidebarHasContent` in
 * packages/contracts, the conditional grid in tests/web. What this lane can
 * only get from a RENDERED page is markup weight and accessibility, and an
 * absent panel has neither to measure.
 *
 * What the corpus does carry is the FIELD-level absence, which is the same
 * rule one level down: one opening names no commitment and one person wrote no
 * bio, so the walk sees both branches of "absent rather than filled in".
 */
const SIDEBAR_OPENINGS = CARDS.filter((c) => c.roleOpeningCount > 0)
  .slice(0, 3)
  .map((c, i) => ({
    id: `rol_${String(i).padStart(24, "0")}`,
    title: i === 0 ? "Frontend contributor" : "Maintainer",
    slug: c.slug,
    // One with nothing said. A maintainer who did not name a commitment is not
    // one who said "any", and the row has to draw that.
    commitment: i === 1 ? null : "a-few-hours-a-week",
  }));

const SIDEBAR_PEOPLE = CONTRIBUTOR_CARDS.filter((c) => c.openToProject)
  .slice(0, 3)
  .map((c) => ({
    handle: c.handle,
    name: c.displayName,
    // THEIR words, already trimmed by core. `ada` wrote no bio, so the first
    // row is the headline-less one.
    headline: c.bio,
  }));

const SIDEBAR = {
  topics: TOPIC_VALUES.slice(0, 5).map((value, i) => ({
    value,
    label: topicCard(value).label,
    launches: 5 - i,
    followers: topicCard(value).followers,
  })),
  collection: {
    slug: COLLECTION_CARDS[0].slug,
    title: COLLECTION_CARDS[0].title,
    curator: COLLECTION_CARDS[0].curatorHandle,
    items: COLLECTION_CARDS[0].count,
    preview: [],
  },
  openings: SIDEBAR_OPENINGS,
  people: SIDEBAR_PEOPLE,
  // HB3 — "Recently replied": the newest visible reply per listing. Two rows,
  // so the panel renders and the walk sees a count of one and of many. HB3
  // landed without this and the front page's PRERENDER threw on
  // `replies.length` against this fixture — the build itself, not a page —
  // which this lane, scheduled only by its own files, never ran to see.
  replies: [
    { slug: CARDS[1].slug, title: `Comments on ${CARDS[1].slug}`, repliedAt: EARLIER, posts: 4 },
    { slug: CARDS[2].slug, title: `Comments on ${CARDS[2].slug}`, repliedAt: "2026-05-19T18:00:00.000Z", posts: 1 },
  ],
  windowDays: 30,
  formulas: {
    topics: "topic.recent-launches",
    collection: "collection.newest",
    openings: "openings.newest",
    people: "people.open-to-project",
    replies: "threads.recently-replied",
  },
};

/**
 * MP0 — a maker's page, header and one tab, as one document.
 *
 * ONE OF EACH TAB'S ROWS IS A DEGRADED CASE, on purpose: a launch on a day the
 * sweep has not counted (no ordinal), an upvote below TS1's trust floor (listed
 * and marked as not counting), and a listing whose comments span two threads
 * (no single conversation to link). The walk sees the branch each of those
 * takes rather than only the happy row.
 *
 * The counts are DELIBERATELY LARGER THAN THE LISTS on one tab, so the
 * truncation note renders — the page's own answer to "the counter and the list
 * disagree above the limit".
 */
function makerRows(tab) {
  if (tab === "history") {
    // PE1 — all four kinds, so the walk sees each verb and the two shapes of
    // detail (a version, a thread title, a role, nothing).
    return [
      { kind: "launched", at: "2026-05-20T09:00:00.000Z", slug: CARDS[0].slug, tagline: CARDS[0].tagline, detail: "v1.0", ref: null },
      { kind: "commented", at: "2026-05-19T09:00:00.000Z", slug: CARDS[0].slug, tagline: CARDS[0].tagline, detail: "How do I run this locally?", ref: SAMPLE_THREAD },
      { kind: "endorsed", at: "2026-05-18T09:00:00.000Z", slug: CARDS[1].slug, tagline: CARDS[1].tagline, detail: null, ref: null },
      { kind: "confirmed", at: "2026-05-17T09:00:00.000Z", slug: CARDS[2].slug, tagline: CARDS[2].tagline, detail: "Maintainer", ref: null },
    ];
  }
  if (tab === "upvoted") {
    return CARDS.slice(0, 5).map((c, i) => ({
      slug: c.slug,
      tagline: c.tagline,
      at: EARLIER,
      // One below the trust floor. The act is theirs either way.
      counting: i !== 1,
    }));
  }
  if (tab === "comments") {
    return CARDS.slice(0, 3).map((c, i) => ({
      slug: c.slug,
      tagline: c.tagline,
      comments: i + 1,
      lastAt: EARLIER,
      // Spread over two threads, so there is no single one to send a reader to.
      threadId: i === 0 ? SAMPLE_THREAD : null,
    }));
  }
  return BOARD.slice(0, 4).map((b, i) => ({
    launchId: b.launchId,
    slug: b.slug,
    tagline: b.tagline,
    versionLabel: b.versionLabel ?? "v1.0",
    launchedAt: EARLIER,
    day: i === 0 ? SAMPLE_DAY : FEED_EARLIER_DAY,
    // The last row's day has no board figures yet, so it has no ordinal.
    rank: i === 3 ? null : i + 1,
    counted: b.counted,
  }));
}

const MAKER_COUNTS = { launched: 4, upvotesGiven: 12, comments: 6 };

const DIGEST = {
  week: SAMPLE_WEEK,
  launches: BOARD.slice(0, 4).map((b) => ({ slug: b.slug, tagline: b.tagline, versionLabel: b.versionLabel })),
  // PV4 — the lead, and the reason the count below it moved down the page.
  // Observed first, then alphabetically: a licence moving is a fact about the
  // world and the rarest thing here, and alphabetical order alone would bury
  // it under a tagline edit.
  changed: [
    {
      slug: CARDS[1].slug,
      field: "licence",
      label: "The licence",
      provenance: { class: "observed", source: "declared_repo", observedAt: OBSERVED_FRESH },
      from: "MIT",
      to: "AGPL-3.0",
    },
    {
      slug: CARDS[0].slug,
      field: "tagline",
      label: "The one-line description",
      provenance: { class: "authored", by: "maintainer" },
      from: "A thing that does the thing",
      to: "The fastest way to do the thing",
    },
    {
      slug: CARDS[2].slug,
      field: "installLine",
      label: "The install command",
      provenance: { class: "authored", by: "maintainer" },
      from: "—",
      to: `npx create-${CARDS[2].slug}`,
    },
  ],
  endorsed: CARDS.slice(0, 4).map((c, i) => ({ slug: c.slug, tagline: c.tagline, total: 9 - i, recent: 3 })),
  note: null,
  observedAt: EARLIER,
};

// Exactly TRANSPARENCY_REPORT_KEYS. Every count is a LIST of
// `{ thing, count }` rows, not a record — TS5 shaped them that way so a
// category nobody has ever used is absent rather than present with a zero
// (OPC-C), and the page's own arithmetic reads the rows.
const TRANSPARENCY = {
  since: "2026-03-03T00:00:00.000Z",
  until: NOW,
  acts: [
    { act: "remove", count: 4 },
    { act: "delist", count: 1 },
    { act: "deindex", count: 2 },
    { act: "restore", count: 1 },
    { act: "appeal_upheld", count: 1 },
    { act: "appeal_refused", count: 2 },
  ],
  reports: [
    { state: "open", count: 2 },
    { state: "triaged", count: 3 },
    { state: "actioned", count: 5 },
    { state: "declined", count: 1 },
  ],
  appeals: [
    { state: "open", count: 1 },
    { state: "upheld", count: 1 },
    { state: "refused", count: 2 },
  ],
  appealsReversed: 1,
  discounts: [
    { reason: "ring", discounted: 2 },
    { reason: "burst", discounted: 1 },
  ],
  flags: [
    { kind: "filler", state: "open", count: 3 },
    { kind: "brigade", state: "resolved", count: 3 },
  ],
};

/** Every route this lane visits, and what it must find there.
 *
 *  `expect` is a phrase the RENDERED page must contain. It is the guard
 *  against measuring a failure panel: a budget that passes on a 404 is worse
 *  than no budget, because it reports a surface as healthy without ever
 *  having drawn it. Kept in this file rather than in the lanes so the corpus
 *  and the proof that it landed cannot drift apart. */
export const ROUTES = [
  // The archetypes come first: they are what XP4's budgets name. `/` is the
  // list of builds. `/products` was a redirect here until
  // openproduct-redesign OPR1 made Products a section with its own address;
  // it is a route below.
  { path: "/", name: "feed (launch board)", archetype: true, expect: SAMPLE_SLUG },
  { path: `/${SAMPLE_SLUG}`, name: "listing (tabbed detail)", archetype: true, expect: "Frontend contributor" },
  { path: "/people", name: "contributors (card grid)", archetype: true, expect: "Ada Lovelace" },
  { path: `/people/${SAMPLE_HANDLE}`, name: "profile", archetype: true, expect: "Ada Lovelace" },
  // MP0 — the other two tabs. The launched tab IS the profile archetype above,
  // so it is budgeted; these two are walked and asserted to have rendered.
  { path: `/people/${SAMPLE_HANDLE}/upvoted`, name: "maker · upvoted", expect: "Upvoted" },
  { path: `/people/${SAMPLE_HANDLE}/comments`, name: "maker · comments", expect: "Comments" },
  // PE1 — the fourth tab, and the page before a moment.
  { path: `/people/${SAMPLE_HANDLE}/history`, name: "maker · history", expect: "Confirmed a role on" },
  { path: `/people/${SAMPLE_HANDLE}/history/2026-05-01T09%3A00%3A00.000Z`, name: "maker · history (earlier)", expect: "Confirmed a role on" },
  // Everything the epic added afterwards. The walk covers all of them; the
  // budgets hold the four above and assert only "it rendered" on these.
  { path: "/topics", name: "topics index", expect: "Every category a listed product has chosen" },
  // VC1 — the stack half of the audit's missing filters. Both walked, because
  // the index and one value are two different documents: the index is a grid
  // of addresses, the value page is the directory filtered.
  { path: "/stack", name: "stack index", expect: "Built with" },
  // The value page's own sentence ("12 products, most active first") went
  // with d8b10168's "stop explaining" pass, which cut the lists' meaning and
  // order footnotes; the order is still `byMostActive` and still published
  // at /docs/formulas. What proves the surface rendered now is a row: the
  // first card carries SAMPLE_STACK, and neither the empty state nor a
  // failure panel names a product.
  { path: `/stack/${SAMPLE_STACK}`, name: "one stack", expect: CARDS[0].slug },
  { path: `/topics/${SAMPLE_TOPIC}`, name: "one topic", expect: topicCard(SAMPLE_TOPIC).label },
  // OB7 (#1875) — the leaderboard folded into the front page's orders: the
  // ranges are `MOVED` below, and the orders other than the default (`/`)
  // are pages of their own. `CARDS[0]` is on all three: it has open roles.
  { path: "/builds/upvoted", name: "builds · upvoted", expect: CARDS[0].slug },
  { path: "/builds/newest", name: "builds · newest", expect: CARDS[0].slug },
  // OPR1 — the header's other two sections. Help wanted is the Roles order
  // at its own address (`/builds/roles` is in `MOVED` below); Products draws
  // the list `/` draws until its page is rebuilt to its board.
  { path: "/help-wanted", name: "help wanted", expect: CARDS[0].slug },
  { path: "/products", name: "products", expect: SAMPLE_SLUG },
  // QE2 — every public address is walked. These had none of the three lanes
  // over them: HB2's year, PP3's pricing pages, FO1's forum and its two
  // variants, FO2's listing forum. A public route the axe pass does not
  // visit is a ramp nobody has read a contrast figure from.
  { path: "/pricing", name: "pricing index", expect: "Pricing" },
  { path: `/pricing/${PRICINGS[0]}`, name: "one pricing", expect: CARDS[0].slug },
  { path: "/threads", name: "forum index (latest)", expect: "Threads" },
  { path: "/threads/replied", name: "forum index (most replied)", expect: "Threads" },
  { path: `/threads/tag/${THREAD.tag}`, name: "forum index (one category)", expect: "How do I run this locally?" },
  { path: `/${SAMPLE_SLUG}/forum`, name: "listing forum", expect: "How do I run this locally?" },
  { path: `/launches/${SAMPLE_DAY}`, name: "launch board", expect: CARDS[0].slug },
  { path: "/collections", name: "collections index", expect: "Worth a look" },
  { path: `/collections/${SAMPLE_COLLECTION}`, name: "collection", expect: "Worth a look" },
  { path: "/digest", name: "digest archive", expect: SAMPLE_WEEK },
  { path: `/digest/${SAMPLE_WEEK}`, name: "digest week", expect: CARDS[0].slug },
  { path: `/threads/${SAMPLE_THREAD}`, name: "thread", expect: "How do I run this locally?" },
  { path: "/transparency", name: "transparency report", expect: "11" },
  { path: "/docs", name: "API docs", expect: "openproduct" },
  { path: "/docs/formulas", name: "published formulas", expect: "openproduct" },
  { path: "/docs/checks", name: "published checks", expect: "openproduct" },
  // CS0 — the API's changelog and policy: a static page from the contract.
  { path: "/docs/api", name: "API changelog", expect: "Additive forever" },
  // OO4 — the runbook: one page per degraded state, from the contract.
  { path: "/docs/runbook", name: "runbook", expect: "When a promise breaks" },
  // SB0 — the design's address. The old one, `/create`, is in `MOVED` below:
  // it has no bytes to budget and no headings to check, so it is not walked
  // like a page — but its STATUS is checked, because the first attempt at this
  // move shipped a route module that Next prerendered and production answered
  // `200` with an empty body.
  { path: "/submit", name: "list your product", expect: "openproduct" },
  // SR0 — the search results page. Walked WITH A QUERY, because the bare
  // address is a form and an explanation and the interesting page is the one
  // with three sections in it.
  //
  // `cacheable: false` is an INVERSION, not an opt-out: the lane asserts this
  // route DOES go out `no-store`, so a future change that made it cacheable
  // would fail here rather than pass quietly. A page reading `searchParams` is
  // dynamic by construction, and a `revalidate` on it would be accepted,
  // ignored and mean nothing — the same defect this lane already catches,
  // wearing the opposite mask.
  {
    path: `/search?q=${SAMPLE_SLUG}`,
    name: "search results",
    expect: SAMPLE_SLUG,
    cacheable: false,
  },
];

/**
 * Addresses that MOVED, and the status a reader must be given (SB0).
 *
 * These are not routes — there is no page, no markup and nothing to budget.
 * What matters about them is the one thing a page walk never looks at: the
 * status line. SB0 moved `/create` to `/submit` and its first attempt built
 * the redirect as a route module whose whole body was `permanentRedirect`.
 * Next prerendered it, so what deployed was an RSC payload the CLIENT router
 * follows: a browser still arrived at `/submit`, and `curl -I` against
 * production got `HTTP/2 200`, an empty document and `s-maxage=31536000`.
 *
 * Every test agreed with every other test and none of them agreed with the
 * deploy, because they all read source or hit a local server and NONE of them
 * had an opinion about a status code. This list is that opinion, asserted
 * against a real request to the built server.
 */
export const MOVED = [
  { from: "/create", to: "/submit", status: 308 },
  // The board index was one more address for the launches; it is a
  // `redirects()` entry to `/`, issued at the edge for the reason `/create`
  // is. (`/products` was the other; it is a page again since OPR1.)
  { from: "/launches", to: "/", status: 308 },
  // OB7 (#1875) — the leaderboard and every range of it are Upvoted now.
  { from: "/leaderboard", to: "/builds/upvoted", status: 308 },
  { from: "/leaderboard/month", to: "/builds/upvoted", status: 308 },
  // openproduct-redesign OPR1 — the two addresses the new chrome moved.
  { from: "/builds/roles", to: "/help-wanted", status: 308 },
  { from: "/me/notifications", to: "/activity", status: 308 },
];

/**
 * Addresses that DO NOT EXIST, and the status a reader must be given (R11).
 *
 * The same opinion as `MOVED` above, pointed at the other end of the range —
 * and it is here because SB0's lesson turned out to have a second instance
 * nobody had looked for. `MOVED` covers exactly one path. The archetype that
 * every miss lands on had no assertion at all, and every one of these
 * answered `200 OK` with the not-found page in the body: indexable by a
 * crawler, cacheable at the edge for 60s plus 240 of stale-while-revalidate,
 * and flatly contradicting TS3's *"unknown, unpublished and unreachable all
 * land here"*.
 *
 * THE CAUSE WAS A `loading.tsx`, which is why no amount of reading the source
 * would have found it. `notFound()` is called correctly in every one of these
 * routes; a Suspense boundary above it means the response is already
 * committed with a 200 by the time it runs, so the body swaps and the status
 * cannot. See `[slug]/page.tsx` for the rule that came out of it.
 *
 * `/zzz-no-such-route/zzz` IS THE CONTROL. It is not a route at all, so
 * Next's own router answers it and it was always 404 — which is what made the
 * other rows look normal. A list without it would pass on an app that had
 * lost the ability to 404 anything. (It was `/products/zzz` until OS1 made
 * `/products/{cursor}` a route; that address is now a real probe below — a
 * cursor the directory did not issue — and CI caught the page answering it
 * with a 200 and a panel before the row was moved.)
 */
export const ABSENT = [
  { path: "/zzz-no-such-product", why: "an unknown product slug" },
  { path: "/@zzz-nobody", why: "an unclaimed handle, through the XP1 rewrite" },
  { path: "/people/zzz-nobody", why: "the handle route the rewrite lands on" },
  { path: "/people/zzz-nobody/launched", why: "a tab under an unclaimed handle" },
  { path: "/threads/thr_000000000000000000000000", why: "a discussion that never was" },
  { path: "/digest/1999-w01", why: "a week the product did not exist" },
  { path: "/products/zzz-not-a-route", why: "OS1 — a cursor the directory did not issue: refused, and refused is 404" },
  { path: "/zzz-no-such-route/zzz", why: "THE CONTROL — no route at all, so Next's own router answers" },
];

/** The reads, keyed by the path the web app asks for. */
// ─── IN1 — the one listing the studio walk edits ────────────────────────────
//
// Mutable on purpose (see `answer`). The stack starts populated because the
// property under test is that it SURVIVES a save made on another step.
export const STUDIO_ORG = "acme";
export const STUDIO_PROFILE = "prf_000000000000000000000001";
/** The subject the signed-in lanes walk as. Not an identity anybody minted —
 *  a fixture value the fixture gateway answers for. */
export const WALK_SUBJECT = "sub_000000000000000000000001";

/**
 * The `op_session` cookie the signed-in lanes carry (IN1's approach, proved by
 * `studio.mjs`): the cookie is not the authority — the gateway is — and the
 * fixture gateway answers the bearer inside it. One helper, so the studio walk
 * and OV4's authenticated walk sign in the same way.
 */
export function sessionCookie(base) {
  const value = Buffer.from(
    JSON.stringify({
      subjectId: WALK_SUBJECT,
      accessToken: "tok_walk",
      displayName: "Ada Lovelace",
      expiresAt: Date.now() + 60 * 60 * 1000,
      kind: "openproduct",
    }),
    "utf8",
  ).toString("base64url");
  const url = new URL(base);
  return ["127.0.0.1", "localhost", url.hostname].map((domain) => ({
    name: "op_session",
    value,
    domain,
    path: "/",
    httpOnly: true,
    secure: false,
  }));
}

/**
 * OV4 — EVERY AUTHENTICATED ROUTE, walked signed in. The gap the worldclass
 * epic carried from FR3 ("the studio's authenticated routes are still not
 * walked") and closed only for IN1's five steps. `expect` is a string the
 * real page renders and its "could not be loaded" panel does not, so a read
 * the fixture stopped answering fails the walk rather than passing an axe
 * run over a failure panel.
 */
export const AUTHED_ROUTES = [
  { path: "/me", name: "me · profile", expect: "Download your data" },
  { path: "/me/saved", name: "me · saved", expect: "Saved products" },
  { path: "/me/applications", name: "me · applications", expect: "Your applications" },
  // OPR1 — the inbox's address is `/activity` (the old one is in `MOVED`).
  { path: "/activity", name: "activity", expect: "Mark all as read" },
  { path: "/studio", name: "studio · listings", expect: "Your listings" },
  { path: "/studio/collections", name: "studio · collections", expect: "Collections" },
  { path: "/studio/reports", name: "studio · reports", expect: "Reports" },
  { path: "/studio/appeals", name: "studio · appeals", expect: "Appeals" },
  { path: "/studio/link", name: "studio · link a project", expect: "Link a project" },
  { path: `/studio/${STUDIO_ORG}/${STUDIO_PROFILE}`, name: "studio · listing overview", expect: "Listing steps" },
  // 3d54dc12 folded the page's "Something worse than off-topic?" panel into
  // the editor's Discussions card, so the card's own heading is what proves
  // the surface drew (a failure panel has none).
  { path: `/studio/${STUDIO_ORG}/${STUDIO_PROFILE}/discussions`, name: "studio · discussions", expect: 'id="discussions-heading"' },
  { path: `/studio/${STUDIO_ORG}/${STUDIO_PROFILE}/details`, name: "studio · details", expect: "Listing steps" },
  { path: `/studio/${STUDIO_ORG}/${STUDIO_PROFILE}/media`, name: "studio · media", expect: "Listing steps" },
  { path: `/studio/${STUDIO_ORG}/${STUDIO_PROFILE}/topics`, name: "studio · topics", expect: "Listing steps" },
  { path: `/studio/${STUDIO_ORG}/${STUDIO_PROFILE}/people`, name: "studio · people", expect: "Listing steps" },
  { path: `/studio/${STUDIO_ORG}/${STUDIO_PROFILE}/launches`, name: "studio · schedule", expect: "Listing steps" },
];
const KNOWN_STACK = ["typescript", "cloudflare", "postgres", "react"];
export const MAINTAINER_PROFILE = {
  id: STUDIO_PROFILE,
  projectId: "prj_000000000000000000000001",
  slug: "kettleworks",
  visibility: "draft",
  tagline: null,
  pitch: "A kettle that knows when to stop.",
  pitchDigest: null,
  stack: [],
  stackCanonical: [],
  category: "developer-tools",
  hosting: "self-hosted",
  repoUrl: "https://github.com/acme/kettleworks",
  liveUrl: null,
  repoVisibility: null,
  repoLicence: null,
  repoCheckedAt: null,
  // IN2 — nothing observed until the walk presses Check.
  repoName: null,
  repoDescription: null,
  repoTopics: null,
  reviewedAt: null,
  publishedAt: null,
  components: null,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-20T09:00:00.000Z",
  maintainers: [
    { subjectId: "sub_000000000000000000000001", displayName: "Ada Lovelace", roleLabel: "maintainer", handle: "ada" },
  ],
  roleOpenings: [{ id: "rop_1", title: "Rust reviewer", status: "open" }],
  workspaceLinkedAt: "2026-05-01T00:00:00.000Z",
};

/** MD2 — the maintainer's rows. Mutable like MAINTAINER_PROFILE: the studio
 *  walk uploads one and expects to see it, then removes it. */
export const STUDIO_MEDIA = [];

function answer(pathname, search, req = { method: "GET", body: undefined }) {
  const P = "/v1/public/openproduct";

  // LI3/LI4 — `/docs/checks` reads the gateway's own liveness document for the
  // sweep block and the ingestion budget. Answered here because the budgets
  // lane requires every read a page makes to be answered by this fixture,
  // and a page rendering "could not be asked" is a page the lane never saw.
  // Seven phases, all healthy, at the fixture's fixed instant; the outward
  // phase unauthenticated, which is what every environment reports today.
  if (pathname === "/health") {
    const phases = ["catalogue", "searchIndex", "integrity", "defence", "board", "digest", "snapshots"];
    const staleAfter = { catalogue: 1800, searchIndex: 1800, integrity: 10800, defence: 64800, board: 1800, digest: 1800, snapshots: 259200 };
    return {
      status: "ok",
      // OO3 — which build is answering; the page shows it under the heading.
      build: { version: "f1x7u2e0-0000-4000-8000-00000000f1x7", deployedAt: NOW, tag: null },
      checks: {
        sweep: {
          reachable: true,
          healthy: true,
          phases: phases.map((phase) => ({
            phase,
            lastRunAt: NOW,
            ageSeconds: 60,
            staleAfterSeconds: staleAfter[phase],
            healthy: true,
            reason: null,
            error: null,
            errorAt: null,
          })),
        },
        ingestion: { authenticated: false, maxSourcesPerRun: 25, unauthenticatedReadsPerHour: 60 },
        // MD4 — captures are off in the corpus, and the page says so.
        screenshots: { configured: false, maxPerRun: 5, refreshAfterDays: 7, withdrawnAfterDays: 30 },
      },
    };
  }

  // THE OVERLAY (XP2), answered because the SIGNED-IN passes ask for it.
  //
  // This fixture is the public plane and nothing else, which is right for a
  // lane that measures public documents. But two checks here drive a browser
  // carrying a session the app really accepts — the I6 byte-identity pass and
  // OPP9's signed-in CLS budget — and a signed-in page fetches its overlay.
  //
  // Left unmocked it answered 502, the overlay never landed, and the signed-in
  // CLS budget measured a page nothing had personalised: 0.0000 on every
  // route, passing while `/me` was really shifting 0.101. A budget that
  // cannot fail is worse than no budget, and §5's "every read was answered"
  // receipt is what said so.
  //
  // The visitor OWNS things here on purpose. An overlay that marked nothing
  // would move nothing, which is the same vacuous pass wearing a mock.
  // ─── IN1 — the studio's own endpoints, with state ────────────────────────
  //
  // The one MUTABLE thing in this fixture, and it earns that: the steps'
  // whole claim is that a save touches its own fields and leaves the rest
  // alone, and a stateless mock cannot tell a walk whether the stack it set
  // on one page survived a save on another. A PATCH here applies exactly the
  // keys it was sent, which is what the real API does and what the route
  // must not over-send.
  const profileRoot = `/v1/organizations/${STUDIO_ORG}/openproduct/profiles`;
  if (pathname === `${profileRoot}/${STUDIO_PROFILE}`) {
    if (req.method === "PATCH" && req.body && typeof req.body === "object") {
      for (const [key, value] of Object.entries(req.body)) {
        MAINTAINER_PROFILE[key] = value;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, "stack")) {
        MAINTAINER_PROFILE.stackCanonical = MAINTAINER_PROFILE.stack.filter((t) =>
          KNOWN_STACK.includes(t),
        );
      }
    }
    return { profile: MAINTAINER_PROFILE, capabilities: { canReview: false } };
  }
  if (pathname === `${profileRoot}/${STUDIO_PROFILE}/threads`) {
    return { threads: [], slug: MAINTAINER_PROFILE.slug };
  }
  if (pathname === `${profileRoot}/${STUDIO_PROFILE}/repo-check`) {
    MAINTAINER_PROFILE.repoVisibility = "public";
    MAINTAINER_PROFILE.repoLicence = "MIT";
    MAINTAINER_PROFILE.repoCheckedAt = "2026-05-20T09:00:00.000Z";
    // IN2 — what the repository says about itself. Written into the OBSERVED
    // columns and never into `tagline` or `stack`, which is the distinction
    // the walk is there to see.
    MAINTAINER_PROFILE.repoName = "kettleworks";
    MAINTAINER_PROFILE.repoDescription = "Boils water, carefully";
    MAINTAINER_PROFILE.repoTopics = ["rust", "wasm"];
    return { profile: MAINTAINER_PROFILE, blockers: [] };
  }
  if (pathname === `${profileRoot}/${STUDIO_PROFILE}/maintainers`) {
    if (req.method !== "GET" && Array.isArray(req.body?.maintainers)) {
      MAINTAINER_PROFILE.maintainers = req.body.maintainers.map((m) => ({
        subjectId: m.subjectId,
        displayName: m.subjectId,
        roleLabel: m.roleLabel ?? null,
        handle: null,
      }));
    }
    return { profile: MAINTAINER_PROFILE };
  }
  // MD2 — the media step's three calls. The upload's body is bytes, which
  // the JSON parse above turns into `undefined`; the fields are in the query,
  // as they are at the real gateway, and the row is invented from them — the
  // fixture stands in for the gateway AND core here, so it answers the ROW.
  if (pathname === `${profileRoot}/${STUDIO_PROFILE}/media`) {
    if (req.method === "POST") {
      const q = new URLSearchParams(search);
      const kind = q.get("kind");
      const alt = q.get("alt") ?? "";
      const position = Number(q.get("position") ?? "0");
      // openproduct-studio OSD4 — a logo or a hero REPLACES the one in its
      // slot, as core's upsert does, rather than refusing a second.
      if (kind === "logo" || kind === "hero") {
        const at = STUDIO_MEDIA.findIndex((m) => m.value.kind === kind);
        if (at >= 0) STUDIO_MEDIA.splice(at, 1);
      }
      const letter = kind === "logo" ? "e" : "a";
      const row = {
        value: { id: `med_${Date.now()}_${STUDIO_MEDIA.length + 1}`, kind, ref: MEDIA_REF(letter), alt, position, ...MEDIA_OBJECTS[MEDIA_REF(letter)] },
        provenance: { class: "authored", by: "maintainer" },
      };
      STUDIO_MEDIA.push(row);
      return { media: row };
    }
    // openproduct-studio OSD6 — the gallery in the maker's order.
    if (req.method === "PUT") {
      const ids = Array.isArray(req.body?.gallery) ? req.body.gallery : [];
      for (const m of STUDIO_MEDIA) {
        if (m.value.kind === "gallery" && ids.includes(m.value.id)) m.value.position = ids.indexOf(m.value.id);
      }
      return { media: STUDIO_MEDIA.filter((m) => m.value.kind === "gallery").sort((a, b) => a.value.position - b.value.position) };
    }
    return { media: STUDIO_MEDIA };
  }
  if (pathname.startsWith(`${profileRoot}/${STUDIO_PROFILE}/media/`)) {
    const id = pathname.slice(`${profileRoot}/${STUDIO_PROFILE}/media/`.length);
    const at = STUDIO_MEDIA.findIndex((m) => m.value.id === id);
    if (at < 0) return null;
    // openproduct-studio OSD6 — the words under a picture, changed in place.
    if (req.method === "PATCH") {
      STUDIO_MEDIA[at].value.alt = String(req.body?.alt ?? STUDIO_MEDIA[at].value.alt);
      return { media: STUDIO_MEDIA[at] };
    }
    if (req.method === "DELETE") STUDIO_MEDIA.splice(at, 1);
    return { removed: true };
  }
  if (pathname.startsWith(`${profileRoot}/${STUDIO_PROFILE}/openings`)) {
    return { profile: MAINTAINER_PROFILE };
  }
  // The fifth step. It reads its whole world in one call — the list AND the
  // eligibility — so that the form and the rule it is held to cannot skew.
  if (pathname === `${profileRoot}/${STUDIO_PROFILE}/launches`) {
    return {
      launches: [],
      slug: MAINTAINER_PROFILE.slug,
      eligibility: {
        isPublished: MAINTAINER_PROFILE.visibility === "public",
        hasScheduled: false,
        lastLaunchedAt: null,
        consumedVersions: [],
      },
      policy: { cooldownDays: 14, maxLeadDays: 30, minLeadMinutes: 15 },
    };
  }
  if (pathname === "/v1/openproduct/me/listings") {
    return { listings: [{ id: STUDIO_PROFILE, orgId: STUDIO_ORG, slug: MAINTAINER_PROFILE.slug }] };
  }
  // OV4 — THE SIGNED-IN HALF, answered so the authenticated walk renders the
  // real pages rather than their "could not be loaded" panels. Every read a
  // `/me/**` or `/studio/**` page makes on load is here, in the shape the
  // website's client types expect; the queues answer empty, which is the
  // state a moderator sees on a quiet day and a real state of those pages.
  if (pathname === "/v1/openproduct/me") {
    return {
      contributor: {
        subjectId: WALK_SUBJECT,
        displayName: "Ada Lovelace",
        bio: "Builds things in the open.",
        handle: SAMPLE_HANDLE,
        profilePublic: true,
        openToProject: true,
        githubUrl: null,
        siteUrl: null,
        publishedAt: EARLIER,
        hasStanding: true,
        createdAt: EARLIER,
        updatedAt: EARLIER,
      },
      subjectId: WALK_SUBJECT,
    };
  }
  if (pathname === "/v1/openproduct/me/digest") {
    return { subscription: { standing: "subscribed", since: EARLIER } };
  }
  if (pathname === "/v1/openproduct/me/applications") {
    return {
      applications: [
        {
          id: "app_000000000000000000000001",
          profileId: STUDIO_PROFILE,
          roleOpeningId: "ro_000000000000000000000001",
          requestRef: "jrq_walk",
          status: "pending",
          createdAt: EARLIER,
          productSlug: SAMPLE_SLUG,
          productTagline: CARDS[0].tagline,
        },
      ],
    };
  }
  if (pathname === "/v1/openproduct/me/saved") {
    return { products: CARDS.slice(0, 3) };
  }
  if (pathname === "/v1/openproduct/me/notifications") {
    return {
      items: [
        { id: "ntf_000000000000000000000001", kind: "post.reply", actor: "grace", targetKind: "post", targetRef: SAMPLE_SLUG, figure: null, createdAt: EARLIER, unread: true },
        { id: "ntf_000000000000000000000002", kind: "rank.first", actor: null, targetKind: "listing", targetRef: SAMPLE_SLUG, figure: 1, createdAt: EARLIER, unread: false },
      ],
      unread: 1,
    };
  }
  if (pathname === "/v1/openproduct/me/collections") {
    return { eligible: true, curatorHandle: SAMPLE_HANDLE, collections: [] };
  }
  if (pathname === "/v1/openproduct/me/appeals") {
    return { acts: [] };
  }
  if (pathname === "/v1/openproduct/reports/queue") {
    return { reports: [] };
  }
  if (pathname === "/v1/openproduct/reports/flags") {
    return { flags: [] };
  }
  if (pathname === "/v1/openproduct/reports/appeals") {
    return { appeals: [] };
  }
  if (pathname.startsWith("/v1/openproduct/me/overlay")) {
    return {
      overlay: {
        saved: CARDS.slice(0, 6).map((c) => c.slug),
        endorsed: CARDS.slice(0, 4).map((c) => c.slug),
        savedCount: 6,
        requests: 1,
        listings: 2,
        handle: SAMPLE_HANDLE,
        profilePublic: true,
        follows: ["topic:developer-tools"],
        postVotes: [],
        unread: 3,
      },
    };
  }
  // SR0 — the search page's one read. Three sections, and the fixture answers
  // all three so the lane walks a page with content in every one rather than
  // a page of empty states.
  if (pathname === "/v1/search") {
    const q = (new URLSearchParams(search).get("q") ?? "").trim().toLowerCase();
    if (q.length === 0) return { query: "", results: [], makers: [], topics: [] };
    return {
      query: q,
      results: CARDS.filter((c) => `${c.slug} ${c.tagline ?? ""}`.toLowerCase().includes(q))
        .slice(0, 20)
        .map((c) => ({
          kind: "product",
          entityId: c.slug,
          title: c.slug,
          summary: c.tagline,
          matched: "name-prefix",
        })),
      makers: SAMPLE_HANDLE.includes(q) || q.includes("ada")
        ? [{ handle: SAMPLE_HANDLE, displayName: "Ada Lovelace", matched: "handle" }]
        : [],
      topics: q.length >= 3 && SAMPLE_TOPIC.includes(q)
        ? [
            {
              value: SAMPLE_TOPIC,
              label: SAMPLE_TOPIC,
              href: `/topics/${SAMPLE_TOPIC}`,
              directoryHref: `/products?category=${SAMPLE_TOPIC}`,
            },
          ]
        : [],
    };
  }
  if (pathname === `${P}/projects`) {
    // OS1 — the directory is PAGED. The first page is the corpus's twenty-four
    // cards and a `next`; the page after it is twenty-four more, and the last.
    // A cursor the fixture did not issue is refused, as the directory refuses
    // it. `total` is the real count, never the page's length.
    const query = search instanceof URLSearchParams ? search : new URLSearchParams(search ?? "");
    const cursor = query.get("cursor");
    if (cursor === null) {
      return {
        projects: CARDS,
        next: PAGE_TWO_CURSOR,
        total: LISTING_COUNT * 2,
        // OS5 — the catalogue's moment, which the heading's line renders.
        computedAt: NOW,
        freshness: { today: 1, week: 4, month: 11, total: LISTING_COUNT * 2 },
        freshnessThreshold: 3,
      };
    }
    if (cursor === PAGE_TWO_CURSOR) {
      return {
        projects: CARDS_PAGE_TWO,
        next: null,
        total: LISTING_COUNT * 2,
        computedAt: NOW,
        freshness: { today: 1, week: 4, month: 11, total: LISTING_COUNT * 2 },
        freshnessThreshold: 3,
      };
    }
    return { __status: 422, error: { code: "validation_failed", message: "Not a position this directory issued" } };
  }
  if (pathname.startsWith(`${P}/projects/`)) {
    const rest = pathname.slice(`${P}/projects/`.length);
    const [slug, sub] = rest.split("/");
    if (sub === "threads") {
      const tag = new URLSearchParams(search).get("tag");
      const threads = tag && tag !== THREAD.tag ? [] : [THREAD];
      // DQ0b — the product page's own comment section travels with its
      // discussions. A FILTERED read carries none, because `?tag=question` is
      // a request for one kind of discussion and the comment box is not one
      // of the kinds — which is what the walk sees on the tag-filtered route.
      return { threads, launch: tag ? null : { thread: LAUNCH_THREAD, posts: LAUNCH_POSTS } };
    }
    if (!CARDS.some((c) => c.slug === decodeURIComponent(slug))) return null;
    const decoded = decodeURIComponent(slug);
    const placedAt = BOARD.findIndex((b) => b.slug === decoded);
    return {
      profile: {
        ...profile(decoded),
        // UV1 — the placement, for the listings that are on the sample day's
        // board. ABSENT for the rest, which is the common case and the one
        // the a11y walk should also see.
        ...(placedAt >= 0
          ? {
              launch: {
                day: SAMPLE_DAY,
                rank: placedAt + 1,
                of: BOARD.length,
                counted: BOARD[placedAt].counted,
                ineligible: 0,
                versionLabel: BOARD[placedAt].versionLabel,
              },
            }
          : {}),
      },
    };
  }
  // FO1 — the forum index, read by `/threads` and its order and tag variants.
  // The build PRERENDERS those routes, so this read arrives during
  // `next build`, not from a walked page; unanswered it failed the "every
  // read answered" check after FO1 landed without it. One titled thread on
  // the sample listing, in either order; a tag it does not carry is an
  // empty forum, which is what the category chips have to render.
  if (pathname === `${P}/threads`) {
    const q = new URLSearchParams(search);
    const order = q.get("order") === "replied" ? "replied" : "latest";
    const tag = q.get("tag") || null;
    const threads = tag && tag !== THREAD.tag ? [] : [{ ...THREAD, slug: SAMPLE_SLUG }];
    return { order, tag, threads, formula: order === "latest" ? "threads.latest" : "threads.most-replied" };
  }
  if (pathname === `${P}/threads/${SAMPLE_THREAD}`) return { thread: THREAD, posts: POSTS };
  // A THREAD ID THE FIXTURE DOES NOT HOLD, answered the way the maker tab
  // above answers an unknown handle: `null`, which is what the real API says
  // and what the page turns into a 404. Added with `ABSENT` — until a probe
  // asked for a discussion that never existed, this shape fell through to
  // "unmocked" and the coverage check went red for a route behaving correctly.
  if (new RegExp(`^${P}/threads/[^/]+$`).test(pathname)) return null;
  if (pathname === `${P}/people`) {
    return { people: CONTRIBUTOR_CARDS.map((c) => ({ handle: c.handle, publishedAt: EARLIER })) };
  }
  const makerTab = new RegExp(`^${P}/people/([^/]+)/tab/(launched|upvoted|comments|history)$`).exec(
    pathname,
  );
  if (makerTab) {
    if (makerTab[1] !== SAMPLE_HANDLE) return null;
    return {
      contributor: CONTRIBUTOR,
      tab: makerTab[2],
      counts: MAKER_COUNTS,
      rows: makerRows(makerTab[2]),
      // PE1 — a first page with an earlier one behind it, so the walk sees
      // the "Earlier" link; the cursor page itself answers the same rows.
      nextCursor: makerTab[2] === "history" ? "2026-05-01T09:00:00.000Z" : null,
      // PE2 — the marks' inputs: all three earned, so the walk sees each.
      marks: { firstLaunchDay: SAMPLE_DAY, cleanVoteListings: 1, maintains: 3 },
      observedAt: NOW,
    };
  }
  if (pathname === `${P}/people/${SAMPLE_HANDLE}`) return { contributor: CONTRIBUTOR };
  if (pathname.startsWith(`${P}/people/`)) return null;
  if (pathname === `${P}/contributors`) return { contributors: CONTRIBUTOR_CARDS };
  if (pathname === `${P}/collections`) return { collections: COLLECTION_CARDS };
  if (pathname === `${P}/collections/${SAMPLE_COLLECTION}`) return { collection: COLLECTION };
  if (pathname.startsWith(`${P}/collections/`)) return null;
  if (pathname === `${P}/digest`) return { weeks: [SAMPLE_WEEK, "2026-w20"] };
  if (pathname === `${P}/digest/${SAMPLE_WEEK}`) return { digest: DIGEST };
  if (pathname.startsWith(`${P}/digest/`)) return null;
  if (pathname === `${P}/transparency`) {
    return { transparency: TRANSPARENCY, windowDays: 90 };
  }
  if (pathname === `${P}/feed`) return FEED;
  if (pathname === `${P}/launches`) return { days: [{ day: SAMPLE_DAY, launches: BOARD.length }] };
  if (pathname === `${P}/sidebar`) return SIDEBAR;
  if (pathname === `${P}/topics`) return TOPICS;
  if (pathname.startsWith(`${P}/topics/`)) {
    const value = decodeURIComponent(pathname.slice(`${P}/topics/`.length));
    if (!TOPIC_VALUES.includes(value)) return null;
    // The topic page shows what LAUNCHED in this topic, so the entries are the
    // feed's own rows filtered — the same shape, which is the point: a fixture
    // that invented a second row shape would let a broken row pass the walk.
    const entries = FEED.groups
      .flatMap((g) => g.entries)
      .filter((e) => e.topics.includes(value));
    return {
      ...topicCard(value),
      today: SAMPLE_DAY,
      from: FEED_EARLIER_DAY,
      entries,
      followers: topicCard(value).followers,
      windowDays: 30,
      meaning: `${topicCard(value).products} products in this topic. Below: what launched in the last 30 days, in the order each day's board put it in.`,
      emptyNote:
        "Nothing in this topic has launched in the last thirty days. Everything in it is still in the directory.",
    };
  }
  if (pathname === `${P}/leaderboard`) {
    const range = new URLSearchParams(search).get("range") ?? "week";
    // The range is echoed so the page's switch renders the right pill as
    // current — a fixture that always said "week" would let a broken switch
    // pass the walk.
    // HB2 — three ranges now; the year joined the week and the month.
    if (range !== "week" && range !== "month" && range !== "year") return null;
    return {
      ...LEADERBOARD,
      range,
      subtitle:
        range === "month"
          ? "Most upvoted launches in May 2026"
          : range === "year"
            ? "Most upvoted launches in 2026"
            : LEADERBOARD.subtitle,
    };
  }
  if (pathname.startsWith(`${P}/launches/`)) {
    // ANY well-formed day answers with the SAME board, and that is deliberate.
    // `/launches` is today's board and computes `today` from the server clock
    // (LC3 chose that over a redirect, so the archive and the front of it are
    // one layout) — so a fixture that answered one hard-coded day would render
    // a failure panel on every day but that one, and the lane would have been
    // measuring the panel from the day after it was written.
    const day = decodeURIComponent(pathname.slice(`${P}/launches/`.length));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    return { day, open: day !== SAMPLE_DAY, observedAt: EARLIER, board: BOARD };
  }
  return undefined;
}

/**
 * Boot the mock gateway.
 *
 * Returns `{ url, requests, close }`. `requests` is every path asked for, in
 * order — the read-count budget reads it, and a route that suddenly asks for
 * the directory twice shows up there rather than in a stopwatch.
 *
 * An unrecognised path answers **502, not 404 and not `{}`**. A `{}` would be
 * a payload of the wrong shape rather than an empty one, which is exactly the
 * mistake the console's lane made and had to fix (its five endpoints falling
 * through to `{}` took three surfaces to their error boundary while the lane
 * happily measured them). 502 makes an unmocked read a loud failure at the
 * `expect` assertion instead of a quiet empty page.
 */
// ─── MD2 — a PNG of any size, from nothing ──────────────────────────────────
//
// A valid image the browser will decode and lay out: signature, IHDR, one
// IDAT holding the deflated scanlines (a flat colour — the content is not
// the point, the dimensions are), IEND. CRC32 by the table, as the spec asks.
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(bytes) {
  let c = -1;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}
const PNG_CACHE = new Map();
export function pngBytes(width, height) {
  const key = `${width}x${height}`;
  if (PNG_CACHE.has(key)) return PNG_CACHE.get(key);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = 0x3a;
    row[2 + x * 3] = 0x5f;
    row[3 + x * 3] = 0x9e;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  PNG_CACHE.set(key, png);
  return png;
}

/** The bytes for a media address, `null` for an unknown one, `undefined`
 *  when the path is not a media address at all. */
function mediaBytesFor(pathname) {
  const original = /^\/v1\/media\/([0-9a-f]{64}\.(?:png|jpg|webp))$/.exec(pathname);
  const derivative = /^\/v1\/media\/([0-9a-f]{64})\/w(\d+)\.webp$/.exec(pathname);
  if (!original && !derivative) return undefined;
  const ref = original ? original[1] : `${derivative[1]}.png`;
  const dims = MEDIA_OBJECTS[ref];
  if (!dims) return null;
  return pngBytes(dims.width, dims.height);
}

export async function startGateway(port = 0) {
  const requests = [];
  const unmatched = [];
  // openproduct-studio OSD8 — a round trip in front of every read, on request.
  // The fixture answers in microseconds and production across an ocean; the
  // studio's timing lane sets this (POST /__fixture/latency?ms=45) for its run
  // and sets it back to 0. Off by default, so no other lane is affected.
  let latency = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/__fixture/latency") {
      latency = Math.max(0, Number(url.searchParams.get("ms") ?? 0) || 0);
      res.writeHead(204);
      res.end();
      return;
    }
    if (latency > 0 && !req.__delayed) {
      req.__delayed = true;
      setTimeout(() => server.emit("request", req, res), latency);
      return;
    }
    requests.push(url.pathname + url.search);
    // MD2 — THE BYTES. `/v1/media/<ref>` and `/v1/media/<hash>/w<W>.webp` are
    // answered with a generated PNG of the dimensions the row declared; a
    // derivative address gets the ORIGINAL'S bytes, which is exactly what the
    // real gateway does where Image Resizing is off (every environment
    // today), so the page under test lays out what production will.
    const media = mediaBytesFor(url.pathname);
    if (media !== undefined) {
      if (media === null) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "not_found" } }));
        return;
      }
      res.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(media.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      });
      res.end(media);
      return;
    }

    // IN1 — THE FIXTURE LEARNED THE METHOD AND THE BODY, for exactly one
    // reason: the studio's steps are the first surface here whose correctness
    // is about a WRITE. Asserting that the Details step does not clear the
    // stack needs a gateway that actually applies a PATCH and answers with
    // what it now holds; a read-only mock can only ever confirm that a form
    // posted, which is the half that was never in doubt.
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let parsed = undefined;
      if (raw.length > 0) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = undefined;
        }
      }
      respond(answer(url.pathname, url.search, { method: req.method ?? "GET", body: parsed }));
    });

    function respond(data) {
      // A refusal the studio walk asks for (a second hero), carried as a
      // status the JSON envelope path otherwise has no way to say.
      if (data && typeof data === "object" && typeof data.__status === "number") {
        res.writeHead(data.__status, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: data.error }));
        return;
      }
      if (data === undefined) {
        unmatched.push(url.pathname);
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "not_mocked", path: url.pathname } }));
        return;
      }
      if (data === null) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "not_found" } }));
        return;
      }
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
      });
      res.end(JSON.stringify({ data }));
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const actual = server.address().port;
  return {
    url: `http://127.0.0.1:${actual}`,
    requests,
    unmatched,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
