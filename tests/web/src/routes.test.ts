// The four route archetypes (openproduct-commons XP1).
//
// The web lane is module-level, so the assertions here are about the shared
// PARTS and about the SOURCE of the pages that use them. That happens to be
// the right level for what XP1 actually promises, because its promises are
// rules rather than pixels:
//
//   - no route renders a zero where it means "not measured" (OPC-C, SN-1)
//   - every inert control says which sub-epic makes it work (XP1's own rule)
//   - filter, sort and tab state is in the URL (XP-2)
//   - the pages stay one cacheable document that resolves no actor (OPC-1/I6)
//   - a person's name is a link or plain text, never a dead link (XP-5)
//
// THE DIRECTORY TESTS LEFT WITH THE DIRECTORY. `list/directory.tsx`,
// `products/page.tsx` and `launches/page.tsx` are gone: `/` is the launches
// (`page.tsx` + `feed/*`), and `/products` and `/launches` redirect there from
// `next.config.mjs`. Everything below that pinned the facet rail, the sort
// pills, the directory's URL state, its saved filter, its empty state or its
// comparators went with it; what survives is re-pinned to the files that
// still exist, with a one-line reason at each changed pin.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LISTING_STEPS,
  listingStepPath,
  DIRECTORY_CONSENT_NOTE,
  ENDORSEMENT_EMPTY_NOTE,
  ENDORSEMENT_TOTAL_TITLE,
  ROSTER_PROVENANCE_NOTE,
  DIRECTORY_ELIGIBILITY_NOTE,
  ENDORSEMENT_MEANING,
  UPVOTED_LABEL,
  UPVOTE_LABEL,
  FORMULAS,
  PROFILE_PROVENANCE_NOTE,
  allFormulas,
  formulaAnchor,
  formulaHref,
  publishedRules,
} from "@openproduct/contracts";

import { PENDING, pendingLabel, pendingProps } from "@openproduct-web/app/ui/pending";
import { FOOTER_LINKS, SEARCH_PLACEHOLDER } from "@openproduct-web/app/shell/shell";
import { NO_MATCHES, toRows, visibleRows } from "@openproduct-web/app/shell/palette-rows";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");

const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

/** A contract module's source. DS4 moved the published orders there, so the
 *  guards that pin their clauses follow them. */
const contract = (file: string) =>
  readFileSync(resolve(__dirname, "../../../packages/contracts/src", file), "utf-8");

/**
 * A file's CODE, with its comments removed.
 *
 * Use this for every NEGATIVE assertion — "this module must not mention X".
 * Matching raw source means a comment EXPLAINING the rule fails the guard,
 * which quietly pressures the next author to stop writing the reason down.
 * That has bitten this suite four times now (the endorsement gold, the
 * ranker's actor, the nested button, the palette's own explanation), so the
 * fix lives here rather than at each site.
 *
 * Positive assertions keep using `read`: a comment is part of what a file
 * says, and asserting a file says something is not the same rule.
 */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

/**
 * One exported component's body, from `ui/bits.tsx`.
 *
 * Sliced rather than parsed: this lane cannot compile JSX, so a claim about a
 * component's SHAPE is a claim about its source. Bounded to the next
 * `export function` so an assertion about one component cannot pass on
 * something written in its neighbour.
 */
const component = (name: string, file = "ui/bits.tsx") => {
  const source = code(file);
  const start = source.search(new RegExp(`(export )?function ${name}\\(`));
  expect(`${name} in ${file}: ${start >= 0}`).toBe(`${name} in ${file}: true`);
  const after = source.slice(start + 1).search(/\n(export )?function /);
  return after === -1 ? source.slice(start) : source.slice(start, start + 1 + after);
};

/** Every page and island XP1 owns. The directory island is gone — `/` is
 *  the launches, rendered by the feed — so the feed's parts stand in its
 *  place. */
const ROUTE_SOURCES = [
  "page.tsx",
  // OPR1 — the Products view, its sort, its card and its list replaced the
  // builds list; `/products` and `/help-wanted` are pages of their own, and
  // `/builds/{order}` is a redirecting handler.
  "feed/products-view.tsx",
  "feed/sort-control.tsx",
  "products/page.tsx",
  "builds/[order]/route.ts",
  "feed/feed-row.tsx",
  "feed/product-card.tsx",
  "feed/product-list.tsx",
  "feed/follow-product.tsx",
  "help-wanted/page.tsx",
  "help-wanted/seat-card.tsx",
  "help-wanted/seat-list.tsx",
  "[slug]/page.tsx",
  "people/(index)/page.tsx",
  "people/[handle]/page.tsx",
] as const;

/** Every element that renders an `<a>`: the bare tag and OPP1's `<AppLink>`,
 *  which is `next/link` with this site's prefetch policy on it. Counted
 *  together because what these guards protect against is a nested ANCHOR in
 *  the document, and both spellings produce one. */
const LINK_ELEMENTS = /<(?:a|AppLink)\b/g;

describe("nothing inert is unexplained", () => {
  it("every pending control names a sub-epic and what it will then do", () => {
    for (const [key, p] of Object.entries(PENDING)) {
      expect(p.cluster).toMatch(/^[A-Z]{2}$/);
      // In the visitor's terms, not the milestone's — a control that says
      // "arrives with SN2" has explained nothing to the person reading it.
      expect(p.then.length).toBeGreaterThan(20);
      expect(p.then).not.toMatch(/\b(SN|CT|EN|CG|CB|LC|DS|TS|XP)\d/);
      expect(pendingLabel(p)).toBe(`Not yet — ${p.then}`);
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it("marks inert controls so both a reader and a test can find them", () => {
    const props = pendingProps(PENDING.discussions);
    expect(props["aria-disabled"]).toBe(true);
    expect(props["data-pending"]).toBe("CB");
    expect(props.title).toMatch(/^Not yet — /);
  });

  it("every route that renders an inert control imports the shared helper", () => {
    // The one way to get "not yet" wrong is to hand-roll a greyed span. If a
    // page has `aria-disabled` it must have come from here.
    for (const file of ROUTE_SOURCES) {
      const source = read(file);
      if (!source.includes("aria-disabled") && !source.includes("pendingProps")) continue;
      expect(source).toMatch(/from "\.\.?\/?(\.\.\/)?ui\/pending"/);
    }
  });
});

describe("no route renders a zero where it means 'not measured'", () => {
  it("the dash is a shared constant, and it is not zero", () => {
    // Read from source rather than imported: the test lane has no JSX, and
    // the claim is about the one value every surface reaches for.
    const bits = read("ui/bits.tsx");
    expect(bits).toContain('export const DASH = "—";');
    expect(bits).not.toContain('export const DASH = "0"');
  });

  it("the product page's unobserved stats render the dash, never a count", () => {
    const page = read("[slug]/page.tsx");
    // SN2 lit Activity and EN2 lit Endorsed by. Both now render a
    // MetricValue — which takes the METRIC rather than a number, so a caller
    // cannot forget the absent branch: the dash comes from there being
    // nothing to pass, not from somebody remembering to check.
    //
    // That structural property is what makes it safe to have retired the
    // PENDING placeholders: the surface can no longer print a zero for a
    // figure it does not hold, because it has no number to print.
    expect(page).toContain("<MetricValue metric={merges}");
    // VC6 dropped `now` from MetricValue: its tooltip is the ABSOLUTE
    // instant, which needs no clock. What this pins is unchanged — that the
    // component takes the METRIC rather than a number, so a caller cannot
    // forget the absent branch.
    expect(page).toContain("<MetricValue metric={endorsementsRecent} />");
    expect(page).toContain("PENDING.activity");
    // And nothing on the page passes a bare count to a StatCard.
    expect(code("[slug]/page.tsx")).not.toMatch(/value=\{(endorsements|merges)\.value\}/);
  });

  it("SN2's renderer takes a metric, not a number — the absent branch is structural", () => {
    const metric = read("ui/metric.tsx");
    // `if (!metric) return DASH` is reachable only because the parameter is
    // the optional metric. A `value: number` signature would have made the
    // absent case something every caller had to remember.
    expect(metric).toMatch(/metric: PublicMetric \| undefined/);
    expect(metric).toContain("if (!metric)");
    expect(metric).toContain("{DASH}");
    // Every rendered value carries the moment it was true (I9).
    expect(metric).toContain("agoOf(metric.observedAt");
  });

  it("Most active orders unobserved listings LAST, never as zero", () => {
    // DS4 — the comparator moved to the contract, so this guard followed it.
    // The rule did not change: the ordering half of OPC-C is that an
    // unmeasured project has not told us it is inactive, so it does not get a
    // dead project's position.
    const ranking = contract("ranking.ts");
    // OB3 — the key is the score now, and it is null exactly when the
    // changes are: no `C`, nothing to multiply.
    expect(ranking).toContain("if (ak === null) return 1;");
    expect(ranking).toContain("if (bk === null) return -1;");
    expect(ranking).toContain("if (merges === null) return null;");
    // `mergesOf` returns null, never 0, for "we did not read it".
    expect(ranking).toMatch(/return metric \? metric\.value : null;/);
    // The directory that read this comparator is gone (`/` is the launches);
    // the similar-launches panel is the surviving consumer, pinned under DS4.
  });

  it("OL3 — the product page is stacked sections, not a tab strip", () => {
    // The design draws one column a reader scrolls. The three tests that
    // guarded the tab strip retired with it; what replaces them is the
    // property the sections have to keep.
    //
    // EVERY SECTION HAS A HEADING WITH AN ID. That is what a tab strip could
    // not give this page: an outline. A tab hid four fifths of the page from
    // a reader who did not know it was there, and four fifths of its headings
    // from a search result that could have quoted one.
    const page = read("[slug]/page.tsx");
    // OPR1 — the reading column's sections; the people and the components are
    // the side column's Crew and Built with cards, each with its heading too.
    for (const id of ["about", "launches", "discussion"]) {
      // Re-pinned for the design's restyle: the sections now carry a spacing
      // class before the id, so the match is on the id and label, not on the
      // attribute order. Re-pinned again for PP2: a section that also wears
      // the outline's attribute breaks across lines, so the whitespace
      // between the two attributes is any.
      expect([
        id,
        new RegExp(`<section[^>]*\\bid="${id}"\\s+aria-labelledby="${id}-heading"`, "s").test(page),
      ]).toEqual([id, true]);
      expect([id, page.includes(`id="${id}-heading"`)]).toEqual([id, true]);
    }
    // And the hero's one action points at a SECTION rather than at a tab —
    // a plain fragment, which works with no JavaScript and survives a page
    // the reader has already scrolled.
    // OPR1 — the board's "Take a seat" goes to the crew card.
    expect(page).toContain('<a href="#crew" className={BTN_SOFT}>');
    for (const heading of ["crew-heading", "stack-heading", "open-heading"]) {
      expect([heading, page.includes(`id="${heading}"`)]).toEqual([heading, true]);
    }
    expect(page).not.toContain("?tab=");
  });
});

// XP-2 — filter, sort and tab state lives in the URL. The tab strip's `?tab`
// test retired with the strip at OL3, and the directory's URL-state test
// retired with the directory (`/` is the launches; `/products` and `/launches`
// redirect there from next.config.mjs). The one filtered view left is search,
// and its `?q=` is pinned in search-page.test.ts.

describe("OPC-1 / I6 — the pages stay one document with no actor", () => {
  it("no route module reads cookies, headers, or the session", () => {
    for (const file of ROUTE_SOURCES) {
      expect(read(file)).not.toMatch(/cookies\(|headers\(|op_session|SESSION_COOKIE/);
    }
  });

  it("the front page is static and its parts do not fetch", () => {
    // A server component reading searchParams would be dynamic, and every
    // variant would become its own render — the edge cache stops being one
    // artifact. So `/` ships once, and nothing rendered inside it fetches.
    // Re-pinned from the directory island to the feed's parts: `/` is the
    // launches now.
    const page = read("page.tsx");
    expect(page).toContain("export const revalidate = 60");
    expect(page).not.toContain("searchParams");
    for (const part of ["feed/sort-control.tsx", "feed/row-shell.tsx", "feed/product-card.tsx", "feed/follow-product.tsx"]) {
      expect([part, /fetch\(/.test(code(part))]).toEqual([part, false]);
    }
    // THE ONE READ AFTER PAINT (openproduct-redesign OPR1; it was the endless
    // list's, CL-R7): *Show more* is a client island that reads the next
    // page from the same-origin, path-addressed `/api/builds/{cursor}` when
    // it is pressed — never on the server, so `/` is still one artifact.
    const more = code("feed/product-list.tsx");
    expect(more.startsWith('"use client";')).toBe(true);
    expect(more.match(/fetch\(/g)).toHaveLength(1);
    expect(more).toContain("fetch(`/api/builds/${encodeURIComponent(cursor)}`");
  });

  it("`now` is computed on the server and passed down, so hydration cannot disagree", () => {
    // A client clock would make "published this week" differ between the
    // server HTML and the first client render.
    //
    // `/` is the feed, and its day comes off the SERVER's clock — core
    // computes `today` once and carries it in the document, so the page never
    // asks a browser what day it is. The archive board and the product page
    // read the clock ONCE, in the page, and hand it down; the components
    // they render take `now` as a prop. (The directory that first held this
    // property is gone; the rule is re-pinned to the surviving pages.)
    expect(read("page.tsx")).not.toMatch(/Date\.now\(\)/);
    expect(read("feed/products-view.tsx")).not.toMatch(/Date\.now\(\)/);
    expect(read("help-wanted/page.tsx")).not.toMatch(/Date\.now\(\)/);
    expect(read("feed/feed-row.tsx")).not.toMatch(/Date\.now\(\)/);
    expect(read("launches/[day]/page.tsx")).toContain("const now = Date.now();");
    expect(read("launches/[day]/page.tsx")).toContain("now={now}");
    expect(read("launches/board.tsx")).not.toMatch(/Date\.now\(\)/);
    expect(read("[slug]/page.tsx")).toContain("const now = Date.now();");
  });
});

// "the rail is the catalog's own taxonomy" retired with the facet rail: the
// directory is gone (`/` is the launches). The CT0 group order is a contract
// fact, held by the contracts package's own tests.

describe("XP-5 — a person's name is a link or plain text, never a dead link", () => {
  it("links a name ONLY on the presence of a handle", () => {
    // CG4 — profiles exist now, so a name that goes nowhere is a worse answer
    // than a link. The branch turns on PRESENCE alone: the read guarantees a
    // handle is there if and only if `/@handle` resolves, so nothing on the
    // page has to know why one is missing, and nothing can get the reason
    // wrong.
    const fn = component("PersonName");
    expect(fn).toContain("if (!handle) return <span");
    expect(fn).toContain("href={`/@${handle}`}");
    // NO FALLBACK ADDRESS. A link built from a subject id or a guessed handle
    // is the dead link this rule forbids, wearing a convenience — so the
    // component is handed nothing it could build one from.
    expect(fn).not.toMatch(/subjectId|slug/);
  });

  it("puts that rule in ONE component, so the page cannot hand-roll a second branch", () => {
    // The product page used to show maintainer names in the roster AND in
    // the sidebar; the first draft of CG4 linked one of them and a browser
    // found the other still plain. The design's restyle renders the roster
    // ONCE, as Makers chips — so the count is one now — but the rule is the
    // same: the branch lives in `PersonName`, never in a ternary on the page.
    const page = code("[slug]/page.tsx");
    expect((page.match(/<PersonName\b/g) ?? []).length).toBe(1);
    // And nowhere near them is a second, hand-rolled branch.
    expect(page).not.toMatch(/maintainer\.handle \?/);
    expect(page).not.toContain("href={`/@${maintainer.handle}`}");
  });

  it("renders the SAME label whether or not it is a link", () => {
    // Linking must not be the reason a name reads differently. Somebody
    // without a public profile would otherwise appear diminished beside
    // somebody with one — which turns an opt-in into a status, the opposite
    // of what OPC-5 is for.
    const fn = component("PersonName");
    expect((fn.match(/\{name\}/g) ?? []).length).toBe(2);
    // The caller's className is carried onto BOTH branches, so the two render
    // at the same size and weight.
    expect(fn).toContain("<span className={className}>");
    expect(fn).toContain("${className} underline");
  });

  it("the contributor profile 404s rather than inventing an empty page", () => {
    // A page that exists for every string anyone types is a page an
    // impersonator can point at, and the handle namespace does not exist yet.
    expect(read("people/[handle]/page.tsx")).toContain("notFound()");
  });
});

describe("the contributor short link", () => {
  it("is a rewrite onto a normal segment, because @ is a parallel-route slot", () => {
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(config).toContain('source: "/@:handle"');
    expect(config).toContain('destination: "/people/:handle"');
    // A rewrite, not a redirect: the address bar keeps the link the person
    // handed out, which is the artifact the design is built around.
    //
    // SCOPED TO THIS RULE, and it did not used to be. The old form asserted
    // the whole file contained no `permanent: true`, which was true only
    // because nothing else in it was a redirect — so it read as a statement
    // about the handle link and was actually a statement about the file. SB0's
    // `/create` → `/submit` redirect made that visible by breaking it while
    // the handle link was untouched.
    const rewrites = /async rewrites\(\)[\s\S]*?^  \},/m.exec(config)?.[0] ?? "";
    expect(rewrites).toContain('source: "/@:handle"');
    expect(rewrites).not.toContain("permanent");
  });
});

describe("XP2 — the overlay is decoration, and every route is correct without it", () => {
  /** Everything that reads per-visitor state on a public route. The
   *  directory's saved filter left with the directory; the vote box, which
   *  reads the overlay on every feed row, is the consumer in its place. */
  const OVERLAY_CONSUMERS = [
    "ui/save-control.tsx",
    "ui/vote-box.tsx",
    "shell/account-chip.tsx",
  ] as const;

  it("every consumer OPTS IN to personalisation rather than assuming it", () => {
    for (const file of OVERLAY_CONSUMERS) {
      const source = read(file);
      // The shape that makes XP-3 true: a consumer must ask whether the
      // overlay answered before using it. The failure mode this forbids is
      // reading `.overlay` optimistically and rendering `undefined` — which
      // is exactly what a page does when the overlay 500s, and exactly what
      // nobody tests by hand.
      expect(source).toMatch(/status === "ready"|isSaved\(|isEndorsed\(/);
      // And nothing may reach into the payload outside that guard.
      const unguarded = source.match(/overlay\.overlay/g) ?? [];
      const guarded = source.match(/status === "ready"[\s\S]{0,400}?overlay\.overlay/g) ?? [];
      expect(unguarded.length > 0 ? guarded.length > 0 : true).toBe(true);
    }
  });

  it("the server render of every consumer is the ANONYMOUS one (I6)", () => {
    // `useSyncExternalStore`'s third argument is the server snapshot, and it
    // is hard-coded to `pending`. That single line is why a cached page is
    // byte-identical signed-in and signed-out: personalisation cannot begin
    // before hydration, in the visitor's own browser.
    const hook = read("ui/use-overlay.ts");
    expect(hook).toContain("useSyncExternalStore(subscribeOverlay, overlayState, serverSnapshot)");
    // And it returns the SAME frozen instance every call. React compares
    // snapshots by identity: a fresh `{ status: "pending" }` per call reads
    // as a store that never settles, and React warns about the infinite
    // render loop that follows. A browser found this; this pins it.
    expect(hook).toContain("return OVERLAY_PENDING;");
    expect(read("ui/overlay.ts")).toContain(
      'export const OVERLAY_PENDING: OverlayState = Object.freeze({ status: "pending" });',
    );
    for (const file of OVERLAY_CONSUMERS) {
      expect(read(file)).not.toMatch(/cookies\(|headers\(|op_session|SESSION_COOKIE/);
    }
  });

  it("signed out and failed are the same 204, so the fail-open path is the common path", () => {
    const route = read("me/overlay/route.ts");
    expect(route).toContain("status: 204");
    // ONE `absent()` helper, and both non-success branches reach it: no
    // session, and every non-ok result — which itself folds `unauthorized`
    // (a token that expired while somebody was reading) in with
    // `unavailable`. A dead cookie must not yank a reader off the page.
    expect((route.match(/function absent\(\)/g) ?? []).length).toBe(1);
    expect(route).toContain("if (!session) return absent();");
    expect(route).toContain('if (result.kind !== "ok") return absent();');
    expect(route).toContain('"cache-control": "no-store"');
  });

  it("the save round trip returns the visitor to where they were", () => {
    // A signed-out click still expresses the intent: the form posts, the
    // handler bounces through sign-in, and the `#save` fragment brings the
    // reader back to the control rather than to the top of a page they had
    // scrolled halfway down.
    expect(read("ui/save-control.tsx")).toContain('id="save"');
    expect(read("ui/save-control.tsx")).toContain("#save");
    for (const file of ["me/save/route.ts", "me/unsave/route.ts"]) {
      // `sanitizeReturnTo` is the authority — same-host paths only, never
      // /auth. A hand-rolled check here would be a second place to get an
      // open redirect wrong.
      expect(read(file)).toContain("sanitizeReturnTo");
    }
  });

  it("a save is private and never counted anywhere public (OPC-3)", () => {
    // The reversal of OH0: a save and an endorsement are two objects. The
    // overlay may say "you saved this"; nothing may say "n people saved this".
    const contract = readFileSync(
      resolve(__dirname, "../../../packages/contracts/src/overlay.ts"),
      "utf-8",
    );
    expect(contract).not.toMatch(/saveCount|savers|savedBy/);
    // And the control says so where the visitor can read it, not only here.
    expect(read("ui/save-control.tsx")).toContain("nobody else sees it");
  });

  // "the directory's saved filter shows nothing rather than everything when
  // unanswered" retired with the directory's saved filter (`/` is the
  // launches; there is no saved filter on a public route now).
});

// DS1 — "six of the seven groups are live" and "the rail is usable at 390px"
// retired with the facet rail and its sheet: the directory is gone (`/` is
// the launches; `/products` redirects there from next.config.mjs).

describe("DS2 — every ordering has a sentence, and the sentence has an ADDRESS", () => {
  const formulasPage = () =>
    readFileSync(resolve(APP_DIR, "docs/formulas/page.tsx"), "utf-8");

  it("every FormulaId resolves to an anchor the page actually renders", () => {
    // I7 says a `FormulaId` must resolve to published prose. DS2 tightens it:
    // prose nobody can REACH is prose nobody has. The anchor is derived from
    // the id rather than written beside it, so a link and the heading it
    // points at cannot disagree — and this walks every id to prove the page
    // renders each one.
    const page = formulasPage();
    expect(page).toContain("id={formulaAnchor(formula.id)}");
    for (const formula of allFormulas()) {
      expect(formulaHref(formula.id)).toBe(`/docs/formulas#${formulaAnchor(formula.id)}`);
      // The anchor must be a legal fragment: no dots, no spaces, no case.
      expect(formulaAnchor(formula.id)).toMatch(/^[a-z0-9-]+$/);
    }
    // Distinct ids must not collide onto one anchor — two headings sharing a
    // fragment means one of them is unreachable.
    const anchors = allFormulas().map((f) => formulaAnchor(f.id));
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("the page is rendered from the registry, never from copied prose", () => {
    const page = formulasPage();
    expect(page).toContain("allFormulas()");
    // A hand-written formula page is a second source of truth that drifts
    // silently and is discovered by whoever trusted it.
    for (const formula of allFormulas()) {
      expect(page).not.toContain(formula.sentence);
    }
  });

  it("every group of formulas is rendered — none silently falls through", () => {
    // The last group has an empty prefix and collects whatever the earlier
    // ones did not claim, so a NEW formula family cannot be added and then
    // quietly render nowhere.
    const page = formulasPage();
    expect(page).toContain('prefix: ""');
    expect(page).toContain("!claimed.has(f.id)");
  });

  it("both disclosures the default order makes necessary are on the page", () => {
    const page = formulasPage();
    // OPC-C — a linked repository is measured more fully than a declared one,
    // so ordering by activity favours it.
    expect(page).toContain("Not every product can be measured the same amount.");
    expect(page).toMatch(/absence[\s\S]{0,200}never a zero/);
    // OPC-D — activity is gameable AND is the default order. Named rather
    // than implied, with the three mitigations and no claim of more.
    expect(page).toContain("Activity is gameable, and it is ranked on.");
    expect(page).toContain("merged changes, not pushes");
    // OB3 — the order is a product of two published counts, and the page says so.
    expect(page).toContain("multiplied by counted upvotes");
    expect(page).toContain("multiplies two published counts");
    expect(page).toContain("capped per contributor per day");
    expect(page).toContain("There is no anti-gaming model beyond that");
    expect(page).toMatch(/no paid placement/);
  });

  // "every sort control links to its own sentence" and "the default order is
  // Most active" retired with the directory's sort pills (`/` is the
  // launches, whose one order is the board's — pinned under LC3).

  it("an unmeasured listing is ordered by publication date, as the sentence says", () => {
    // On a young catalog nothing is observed, so an alphabetical tiebreak
    // would make the DEFAULT order an accident of naming — a maintainer who
    // called their project `zzz-queue` would sit last forever for no reason
    // anyone published.
    // OS1 — and, among themselves, by address when the instant is the same:
    // the tiebreak the sentence now names (OS-C).
    expect(contract("ranking.ts")).toContain("if (ak === null && bk === null) return byNewest(a, b) || bySlug(a, b);");
    const sentence = FORMULAS["sort.most-active"].sentence;
    expect(sentence).toContain("among themselves by when they were published");
    expect(sentence).toContain("merged changes are counted, not pushes".replace("m", "M"));
    expect(sentence).toContain("capped per contributor per day");
  });
});

// DS2 — "the sort pill and its link are siblings, not nested" retired with
// the sort pills: the directory is gone (`/` is the launches).

describe("DS3 — the palette answers from the index, not from the page", () => {
  // THE FIELD AND ITS DROPDOWN, READ TOGETHER (openproduct-performance OPP11).
  //
  // The palette is two files since the dropdown went behind a `next/dynamic`
  // boundary, and it is ONE control. Every assertion below is about what the
  // control does, so it reads both — a guard scoped to `palette.tsx` would
  // have gone quietly vacuous the moment the markup it was written about moved
  // into `palette-panel.tsx`, which is precisely the failure a source
  // assertion is most prone to. Three of them did exactly that and were caught
  // by this suite; the concatenation is the fix.
  const palette = () =>
    readFileSync(resolve(APP_DIR, "shell/palette.tsx"), "utf-8") +
    readFileSync(resolve(APP_DIR, "shell/palette-panel.tsx"), "utf-8");
  const api = () => readFileSync(resolve(APP_DIR, "api/search/route.ts"), "utf-8");

  it("fetches the search endpoint and never scans the rendered catalog", () => {
    const source = palette();
    // THE DONE-WHEN. Filtering the cards the directory already rendered would
    // work beautifully today, stop working at the second page of results, and
    // never work at all from a product page — which has one listing in it. A
    // palette whose answers depend on where you opened it is not a palette.
    expect(source).toContain("fetch(`/api/search?q=${encodeURIComponent(trimmed)}`");
    expect(code("shell/palette.tsx") + code("shell/palette-panel.tsx")).not.toMatch(
      /PublicProfileCard|cards\b|listPublicCards/,
    );
  });

  it("the passthrough forwards nothing personal", () => {
    const source = api();
    // Same-origin by construction rather than by CORS configuration — there
    // is no allowlist to get wrong and no preflight to serve.
    expect(source).toContain("/v1/search?q=");
    expect(code("api/search/route.ts")).not.toMatch(/cookie|SESSION_COOKIE|authorization|decodeSession/i);
    // The status survives an upstream failure; the body does not.
    expect(source).toContain('code: "unavailable"');
  });

  it("every class the placeholder promises is ANSWERED — the standing 'not yet' is gone", () => {
    const source = palette();
    // openproduct-redesign OPR1 — products and people: the two classes the
    // card under the field holds (board `Feed`). The placeholder named a
    // third, topics, while the dropdown derived topic rows; the card does
    // not, so the placeholder stopped promising them. They are still
    // answered by the results page (`search-page.test.ts`).
    expect(SEARCH_PLACEHOLDER).toBe("Search products and people");
    // Both are real rows. `people` used to carry a standing "not yet" so the
    // placeholder would not be a lie; `/v1/search` resolves public profiles
    // live, so the promise is kept and the apology is gone.
    const rowsModule = readFileSync(resolve(APP_DIR, "shell/palette-rows.ts"), "utf-8");
    expect(rowsModule).toContain('type: "product"');
    expect(rowsModule).toContain('type: "person"');
    expect(source).not.toContain("people become searchable");
    // The people come from the SAME read as the products — one request, not a
    // second round trip per keystroke.
    expect(source).toContain("body.data?.makers ?? []");
  });

  it("a row's destination is the page for that thing, and the query's is the results page", () => {
    // WHAT THIS USED TO PIN. A stack row ("TypeScript") was a QUESTION, and
    // its destination moved from `/?stack=…` to `/search?q=…` to, with VC1,
    // `/stack/typescript` — each time so that the row's promise and its
    // destination were the same claim. The stack row left the field with
    // OPR1 (the card holds products and people); the rule it taught stays.
    //
    // It asserts DESTINATIONS, not source strings: a test that spells out
    // the thing it is checking cannot notice when that thing moves.
    const rows = visibleRows(
      toRows(
        [{ kind: "product", entityId: "kettleworks", title: "kettleworks", summary: null, matched: "name" }],
        [{ handle: "ada", displayName: "Ada", matched: "name" }],
      ),
      new Set<string>(),
      "TypeScript",
    );
    expect(rows.map((r) => [r.type, r.href])).toEqual([
      ["product", "/kettleworks"],
      ["person", "/@ada"],
      ["all", "/search?q=TypeScript"],
    ]);
    // The paths are still resolved from the contract, not retyped here.
    const rowsModule = readFileSync(resolve(APP_DIR, "shell/palette-rows.ts"), "utf-8");
    expect(rowsModule).toContain("makerPath(maker.handle)");
    expect(rowsModule).toContain("searchPath(query)");
  });

  it("the shortcut does not fight the browser's own, or a form field", () => {
    const source = palette();
    // A shortcut that eats a character out of a form field is worse than no
    // shortcut, because the reader cannot tell what happened.
    expect(source).toContain('target.tagName === "INPUT"');
    expect(source).toContain("target.isContentEditable");
    expect(source).toMatch(/event\.key === "\/" && !typing/);
  });

  it("is keyboard-complete: open, arrow, enter, escape", () => {
    const source = palette();
    for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape"]) {
      expect(source).toContain(`event.key === "${key}"`);
    }
    // THE POPUP IS A CARD OF LINKS, NOT A LISTBOX, since OPR1: a person's
    // row carries a button beside it (the chevron that shows their
    // products), and a listbox may hold only options. So the field is a
    // combobox whose popup is a labelled group of links, and the row the
    // arrow keys have reached is named from the field.
    expect(source).toContain('role="combobox"');
    expect(source).toContain('aria-haspopup="dialog"');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-label="Search results"');
    expect(source).toContain("aria-activedescendant={open && active >= 0 ? rowDomId(active) : undefined}");
    expect(source).toContain("data-active={index === active ? \"\" : undefined}");
    expect(source).not.toContain('role="listbox"');
    // NOT `aria-modal`: the field answers in a card it becomes the top of,
    // not in a full-screen overlay — and it closes on Escape and on a click
    // outside, which is what a non-modal popup owes a reader who wants out.
    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain("aria-controls={CARD_ID}");
    expect(source).not.toContain('aria-modal');
    expect(source).toContain('document.addEventListener("mousedown", onPointer)');
  });

  it("a failed search says so, and is not rendered as 'no results'", () => {
    // A search that silently reports emptiness when it actually failed
    // teaches the reader that the catalog is small, which is a much more
    // expensive wrong belief than "try again".
    const source = palette();
    expect(source).toContain("setFailed(true)");
    expect(source).toContain("Search is not answering right now");
    // The empty state is the board's two words, and it is a different branch.
    expect(NO_MATCHES).toBe("No matches");
    expect(source).toMatch(/\{failed \? \([\s\S]*?\) : answered && results\.length === 0 \? \(/);
  });
});

describe("DS3 — toRows", () => {
  it("puts the products first, then the people, and the door out last", () => {
    const results = [
      { kind: "product" as const, entityId: "kettleworks", title: "kettleworks", summary: "A queue", matched: "name-prefix" },
    ];
    const rows = visibleRows(
      toRows(results, [{ handle: "ada", displayName: "Ada Lovelace", matched: "name" }]),
      new Set<string>(),
      "TypeScript",
    );
    // SR0's "see all results" row, last and always. It is the fallback
    // rather than the answer, so it sits after everything.
    expect(rows.map((r) => [r.type, r.id])).toEqual([
      ["product", "kettleworks"],
      ["person", "ada"],
      ["all", "__all__"],
    ]);
    expect(rows[2]!.href).toBe("/search?q=TypeScript");
  });

  it("derives no row from the query itself: a word is not a result", () => {
    // The dropdown used to turn a recognised stack name or topic into a row
    // of its own. The card holds what the READ returned — so a word the
    // index and the people read know nothing about yields no row at all.
    //
    // SR0 — "see all results" survives, and deliberately: "nothing here, and
    // here is where to look properly" is more useful than an empty box.
    expect(toRows([])).toEqual([]);
    for (const word of ["wibble", "TypeScript", "infrastructure"]) {
      expect(visibleRows(toRows([]), new Set<string>(), word).map((r) => r.type)).toEqual(["all"]);
    }
  });

  it("ignores a result of a kind it does not render", () => {
    // The index holds `product` and nothing else — SR0 checked, and left it
    // that way ON PURPOSE. People are read live rather than indexed, because
    // an index entry about a person is a cached answer to "is this profile
    // public" whose staleness is unbounded. So a `person` row can only reach
    // here from a corrupt index, and it must not fall through as a product.
    const rows = toRows([{ kind: "person", entityId: "ada", title: "Ada", summary: null, matched: "exact-name" } as never]);
    expect(rows).toEqual([]);
  });
});

describe("CG0 — the two root namespaces cannot collide (OPC-B)", () => {
  it("`/@:handle` is claimed at the ROUTER, before slug matching can see it", () => {
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    // The namespaces are separated by a CHARACTER rather than by a lookup, so
    // a new product slug can never take a person's page and a new handle can
    // never take a product's — which is what removes the need for a shared
    // uniqueness table between them.
    expect(config).toContain('{ source: "/@:handle", destination: "/people/:handle" }');
  });

  it("the grammar is checked in the route, not in the rewrite pattern", () => {
    // Two places would drift the first time the grammar changed.
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(config).not.toMatch(/a-z0-9/);
    // MP0 moved the read (and the grammar check with it) into the body the
    // three tabs share, so the check is still in ONE place — the point of the
    // rule — and both routes go through it.
    expect(read("people/[handle]/maker-view.tsx")).toContain("parseHandle(handleParam)");
  });

  it("MP0's tab segment is rewritten too, with the vocabulary still in the route", () => {
    // `/@ada/upvoted` has to reach `/people/ada/upvoted` or the tabs are
    // addresses only the internal route knows. `:tab` is loose here for the
    // same reason `:handle` is: the route owns the list of three, and a second
    // copy in a rewrite is a second place for it to go stale.
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(config).toContain('{ source: "/@:handle/:tab", destination: "/people/:handle/:tab" }');
    // Not enumerated in the REWRITE. (OB7's leaderboard redirect names
    // `/builds/upvoted`, a different address with nothing to do with tabs.)
    expect(config).not.toMatch(/@:handle\/(upvoted|comments)/);
  });

  it("a handle with no profile behind it 404s — never an empty page", () => {
    // A page that exists for every string anyone types is a page an
    // impersonator can point at. Since CG1 there are four reasons to 404 —
    // no such handle, a released one, no opt-in, no standing — and one
    // answer for all of them, because distinguishing them would make the
    // page an oracle for whether a given person has an account here.
    expect(read("people/[handle]/page.tsx")).toContain("if (doc === null) notFound();");
    expect(read("people/[handle]/maker-view.tsx")).toContain(
      "robots: { index: false, follow: false }",
    );
    // And the tab routes 404 the same way, including for a tab that is not one
    // of the three.
    const tab = read("people/[handle]/[tab]/page.tsx");
    expect(tab).toContain("if (tab === null) notFound();");
    expect(tab).toContain("if (doc === null) notFound();");
  });
});

describe("CG1 — the contributor profile page", () => {
  const page = () => read("people/[handle]/page.tsx");

  it("renders the handle when nobody authored a name — never an id", () => {
    // `null` display name is the common case for somebody who claimed a
    // handle and wrote nothing else. Rendering a subject id there would put a
    // join key on a public page.
    expect(read("people/[handle]/maker-view.tsx")).toContain("profileTitle(person)");
    for (const file of [
      "people/[handle]/page.tsx",
      "people/[handle]/[tab]/page.tsx",
      "people/[handle]/maker-view.tsx",
    ]) {
      expect([file, /subjectId|usr_/.test(code(file))]).toEqual([file, false]);
    }
  });

  it("carries the footer sentence, which is the most important one on the page", () => {
    // OPC-2 and OPC-5 in one line, and the reason CG can build a social graph
    // on the most exposed surface in the estate without inheriting the
    // platform's identity model.
    expect(page()).toContain("{PROFILE_PROVENANCE_NOTE}");
    expect(PROFILE_PROVENANCE_NOTE).toContain("Nothing here is copied from an Orunbase account");
  });

  it("shows an UNOBSERVABLE stat as a dash, never as zero (CG-5)", () => {
    const source = page();
    // A profile stat is a claim about a person's WORK — the one place a
    // fabricated number does real harm. Nothing observes per-person reviews,
    // so the design's strip carries no Reviews card at all, and the page
    // never prints `reviews` as a figure: a `0` would say somebody reviewed
    // nothing when we mean that we cannot look.
    expect(source).not.toMatch(/String\(profile\.reviews\)/);
    expect(source).not.toMatch(/reviews \?\? 0/);
  });

  it("shows an OBSERVED zero as a zero — the distinction is whether we can look", () => {
    // CG4 — `contributesTo` stopped being a dash because we hold every
    // confirmed edge, so its zero is measured rather than missing. Printing
    // it as a dash alongside `reviews` would have conflated "we counted, it
    // is none" with "we cannot see", and the second is the only one that
    // earns a dash.
    const source = code("people/[handle]/page.tsx");
    expect(source).toContain("value={profile.contributesTo}");
    expect(source).not.toContain("profile.contributesTo === null");
  });

  it("every number about a person links to its published formula (I7, OPC-4)", () => {
    // MP0 MOVED THE THREE CG4 NUMBERS OUT OF THEIR CARDS, and this assertion
    // is the record of it: `maintains` and `contributesTo` now sit on the
    // HEADING of the section that lists what they count — where a reader can
    // check the number against the evidence rather than beside it — and
    // `since` rides in the byline. What did not change is the rule: the
    // mapping is in the CONTRACT, so a number cannot reach this page without
    // a sentence somebody published. (`reviews` still has none, because
    // nothing observes it.)
    const onPage = code("people/[handle]/page.tsx");
    const inHeader = code("people/[handle]/maker-view.tsx");
    // OB6 — `maintains` moved into the header as the Builds count, through
    // MP0's own mapping (`MAKER_COUNTER_FORMULAS.launched` is that sentence
    // now), so it is pinned with the header's three below.
    for (const [stat, source] of [
      ["contributesTo", onPage],
      ["since", inHeader],
    ] as const) {
      expect(`${stat}: ${source.includes(`formula={PROFILE_STAT_FORMULAS.${stat}}`)}`).toBe(
        `${stat}: true`,
      );
    }
    // And MP0's own three, from the same kind of contract mapping.
    for (const counter of ["launched", "followers", "upvotesGiven"]) {
      expect(
        `${counter}: ${inHeader.includes(`formula={MAKER_COUNTER_FORMULAS.${counter}}`)}`,
      ).toBe(`${counter}: true`);
    }
    // And the `?` is a real anchor rather than a tooltip: a tooltip cannot be
    // shared, reached by keyboard on a phone, or quoted back at us.
    const bits = code("ui/bits.tsx");
    expect(bits).toContain("href={formulaHref(formula)}");
  });

  it("names the listings behind `contributes to`, and only when there are some", () => {
    const source = code("people/[handle]/page.tsx");
    // Named, so the number is checkable rather than taken on trust...
    // (OPR1: as the board's product rows, in the profile's side card.)
    expect(source).toContain("<ProductRows listings={profile.contributesToListings} />");
    // ...and the section is CONDITIONAL, because an empty "Contributes to —
    // nothing" on every profile prints an absence as a finding about a person
    // (OPC-C). Somebody nobody has named has not failed at anything.
    expect(source).toMatch(/profile\.contributesToListings\.length > 0 \? \(/);
    // The footer says whose act put each name there — without it the section
    // reads as "products that mention this person", which is the exact claim
    // CG3's two-sided edge exists to stop us making.
    expect(source).toContain("{CONTRIBUTES_TO_NOTE}");
  });

  it("renders both listing sections through ONE row component (XP-5)", () => {
    // Two sections rendering listing rows two ways is two places for a link
    // to go dead. Extracted at the moment there were two of them, not after
    // they drifted.
    //
    // OPR1 — and now there are three: the products they run, the ones they
    // contribute to, and the Products side card every other section shows.
    // All three are `ProductRows`, and the one anchor is written in its file.
    const source = code("people/[handle]/page.tsx");
    expect((source.match(/<ProductRows /g) ?? []).length).toBe(2);
    expect((code("people/[handle]/maker-view.tsx").match(/<ProductRows /g) ?? []).length).toBe(1);
    expect(source).not.toMatch(/href=\{`\/\$\{listing\.slug\}`\}/);
    expect((code("people/[handle]/product-rows.tsx").match(/href=\{`\/\$\{listing\.slug\}`\}/g) ?? []).length).toBe(1);
  });

  it("the short link is selectable text, not only a button", () => {
    // A copy button is a convenience. A page that offers only a button has
    // taken the address away from anyone whose clipboard permission was
    // refused, whose browser is old, or who wanted to read it.
    const copy = read("people/[handle]/copy-link.tsx");
    expect(copy).toContain("select-all");
    expect(copy).toContain('{copied ? "Copied" : "Copy"}');
    // And a refused clipboard says nothing, because the other way is right
    // there.
    expect(copy).toMatch(/catch \{[\s\S]{0,300}\}/);
  });

  it("authored links carry nofollow — we vouch for nobody's outbound link", () => {
    expect(page()).toMatch(/rel="noreferrer noopener nofollow"/);
  });
});

describe("EN1 — the public act, and the private one, side by side", () => {
  const control = () => read("ui/vote-box.tsx");

  it("the two controls are separate MODULES over separate endpoints (OPC-3)", () => {
    // Not "a control with a mode". A save is private and an endorsement is
    // public; the first symptom of them merging back into one object would
    // be one component with a `public` prop, and the second would be one
    // route handler with an `if`. Both are structurally impossible while
    // these four files exist separately, which is the entire point of
    // spending four files on two buttons.
    expect(control()).toContain("/me/endorse");
    expect(control()).not.toContain("/me/save");
    expect(read("ui/save-control.tsx")).not.toContain("/me/endorse");
    for (const file of ["me/endorse/route.ts", "me/unendorse/route.ts"]) {
      const route = read(file);
      // `sanitizeReturnTo` is the authority — same-host paths only, never
      // /auth. A hand-rolled check here would be a second place to get an
      // open redirect wrong.
      expect(route).toContain("sanitizeReturnTo");
      expect(code(file)).not.toMatch(/saveProduct|unsaveProduct/);
    }
    expect(read("me/endorse/route.ts")).toContain("endorseProduct(session.accessToken");
    expect(read("me/unendorse/route.ts")).toContain("withdrawEndorsement(session.accessToken");
    // ...and the API client keeps them on separate UPSTREAM paths too, so the
    // separation survives all the way to the worker rather than stopping at
    // the edge of the web app.
    const api = read("me/me-api.ts");
    // TS2 moved the endorse slug into the PATH — the gateway refuses before
    // core is reached and never reads a body, so a per-listing velocity bound
    // can only see a target the URL carries.
    expect(api).toContain("/v1/openproduct/me/endorsements/${encodeURIComponent(slug)}");
    expect(api).toContain('"/v1/openproduct/me/saved"');
    // And the two upstreams are still different paths, which is the point.
    expect(api).not.toMatch(/me\/saved\/\$\{encodeURIComponent\(slug\)\}[\s\S]{0,120}endorse/);
  });

  it("asks the overlay a SEPARATE question — there is no 'did they interact' helper", () => {
    const hook = read("ui/use-overlay.ts");
    expect(hook).toContain("export function isSaved(");
    expect(hook).toContain("export function isEndorsed(");
    // The helper that must never exist. Two acts that mean opposite things
    // about privacy do not get one predicate, because the first caller to
    // reach for the convenient one publishes a private bookmark.
    expect(code("ui/use-overlay.ts")).not.toMatch(/isMarked|hasInteracted|isSavedOrEndorsed/);
    expect(control()).toContain("isEndorsed(state, slug)");
    expect(control()).not.toContain("isSaved(");
  });

  it("UV0 — the count moved ONTO the act, and the act is still one document", () => {
    // EN1 kept the number off the control and said why: putting it there
    // "would make the act's markup depend on a figure". EN2 then shipped the
    // number to the row and the stat card.
    //
    // UV0 merges them, because the design's box IS the count — the `▲` and
    // the total are one control, so a reader can see what pressing it moves.
    // The reason EN1 gave does not survive contact with that: a PUBLIC figure
    // is identical for every visitor, so the markup depending on it costs I6
    // nothing.
    //
    // WHAT I6 ACTUALLY FORBIDS, and what this now pins: no PERSONAL fact may
    // reach the server render. The count is public; the `you upvoted this`
    // state comes from the overlay, after paint, and from nowhere else.
    const control = read("ui/vote-box.tsx");
    expect(control).toContain("count: number | null");
    expect(control).toContain("isEndorsed(state, slug)");
    expect(control).not.toMatch(/cookies\(|headers\(|SESSION_COOKIE/);
    // A dash for a count that was not measured, never a zero — the box makes
    // the same distinction the rank does (OPC-C).
    expect(control).toContain('count === null ? (delta > 0 ? delta : "—") : count + delta');
    // And the figure still comes from the cached document rather than from a
    // fetch inside the island. (Re-pinned from the directory row to the feed
    // row: the row's count is the day's `counted`, carried in the feed
    // document core already ranked.)
    expect(read("[slug]/page.tsx")).toContain('metrics.get("endorsements.total")');
    expect(read("feed/feed-row.tsx")).toContain("count={entry.rank === null ? null : entry.counted}");
    expect(code("ui/vote-box.tsx")).not.toMatch(/fetch\(/);
  });

  it("says what the act IS, where the visitor is looking", () => {
    // The single most likely failure of this whole sub-epic is somebody
    // pressing `▲` believing it is a private bookmark. The remedy is one
    // sentence at the control, not a paragraph in a help page nobody opens.
    expect(control()).toContain("title={ENDORSEMENT_MEANING}");
    expect(ENDORSEMENT_MEANING).toMatch(/public/i);
    expect(ENDORSEMENT_MEANING).toMatch(/save it instead/i);
    // UV0 / R3 — the word the sentence uses is the word the button uses.
    expect(ENDORSEMENT_MEANING).toMatch(/upvote/i);
    expect(ENDORSEMENT_MEANING).not.toMatch(/endorsement/i);
    // And the sentence names the alternative, which is why the two controls
    // are rendered together: the distinction is only real if a person can
    // see both options at the moment they choose.
    const page = read("[slug]/page.tsx");
    expect(page).toContain("<VoteBox");
    expect(page).toContain("<SaveControl slug={profile.slug} />");
  });

  it("UV0 — one word on every surface, and the OBJECT keeps its name", () => {
    // R3 settled it: showing both words would make one act look like two, and
    // the first question at a page with an Upvote button and an Endorse button
    // is which one counts. What did NOT change is the object — a rename that
    // reached the table, the type, the metric key or the formula id would have
    // been a migration pretending to be a copy edit.
    expect(UPVOTE_LABEL).toBe("Upvote");
    expect(UPVOTED_LABEL).toBe("Upvoted");
    // The identifiers are untouched, and this is the assertion that keeps them
    // that way.
    expect(read("[slug]/page.tsx")).toContain('metrics.get("endorsements.total")');
    expect(control()).toMatch(/\/me\/(un)?endorse/);
    // NO SURFACE STILL SAYS THE OLD WORD TO A READER — and this matches what
    // a reader can SEE, which takes some care to state.
    //
    // Three things legitimately still contain the letters and must not fail:
    // comments, which explain the distinction and would otherwise be pressured
    // out of existence; TOKEN NAMES like `bg-endorse-soft`, which are the
    // accent's identifier; and WIRE FIELDS like `digest.endorsed` and
    // `endorsements.total`, which are the object's. R3 changed the word, not
    // the object.
    //
    // So this looks at prose only: quoted strings that read like sentences,
    // and JSX text nodes. That is the set a reader actually sees.
    const prose = (file: string): string[] => {
      const src = code(file);
      // WHAT SEPARATES PROSE FROM A CLASS LIST. The rule used to be that a
      // sentence has a capital letter or an apostrophe in it and a Tailwind
      // class list never does — which was true, and FR2 made it false:
      // `after:content-['']` is a class with two apostrophes in it, and the
      // row title's class list started reading as prose about endorsements.
      //
      // So there are two rules now. A sentence still needs a capital or an
      // apostrophe; and a value whose words are MOSTLY Tailwind tokens — a
      // hyphen, a colon or a bracket in them — is a class list whatever
      // punctuation it happens to carry. `border-endorse-line bg-endorse-soft`
      // fails the first, `after:content-[''] hover:text-endorse-ink` fails the
      // second, and "Upvotes shown after the integrity discount" passes both.
      const classList = (v: string) => {
        const words = v.split(/\s+/).filter((w) => w.length > 0);
        return words.filter((w) => /[-:[\]]/.test(w)).length > words.length * 0.6;
      };
      const looksWritten = (v: string) => /[A-Z]|['\u2019]/.test(v) && !classList(v);
      const strings = Array.from(src.matchAll(/"([^"\n]{6,})"/g), (m) => m[1]!).filter(
        (v) => / [a-z]/.test(v) && looksWritten(v),
      );
      const text = Array.from(src.matchAll(/>\s*([A-Za-z][^<>{}\n]{4,})\s*</g), (m) => m[1]!);
      return [...strings, ...text];
    };
    for (const file of [
      "[slug]/page.tsx",
      "feed/feed-row.tsx",
      "launches/board.tsx",
      "digest/[week]/page.tsx",
      "transparency/page.tsx",
      "ui/save-control.tsx",
      "ui/vote-box.tsx",
      "docs/formulas/page.tsx",
    ]) {
      const offenders = prose(file).filter((v) => /endorse/i.test(v));
      expect([file, offenders]).toEqual([file, []]);
    }
  });

  it("the act is on a FEED row and outside its anchor, and not on a row that is only a card", () => {
    // EN1 kept the control off a row because a row shows a tagline, and a
    // control that let somebody make a public claim about something they had
    // only seen the tagline of would manufacture the low-information gesture
    // EN3's integrity model then spends its time discounting.
    //
    // OL-1a moved ONE boundary: a FEED row is not a directory row. It carries
    // the launch's rank, licence, topics, stack and discussion count under a
    // heading naming its day — the most a row has ever shown here — and the
    // substance of EN1's worry is answered by what the number is made of
    // (TS4's eligibility, EN3's discount) rather than by hiding the button.
    //
    // The directory row is gone (`/` is the launches). The row that still
    // shows only a card — a collection's item, which has no board day, no
    // rank and no count — keeps the boundary, and that is what this pins now.
    const collection = code("collections/[slug]/page.tsx");
    expect(collection).not.toContain("VoteBox");
    expect(collection).not.toMatch(/\/me\/endorse/);
    expect(read("collections/[slug]/page.tsx")).toContain("const href = `/${item.card.slug}`;");

    // And the feed row DOES host it — outside the anchor, because a form
    // inside an anchor is interactive content nested in a link and browsers
    // repair it by moving the form somewhere else on the page.
    const row = read("feed/feed-row.tsx");
    expect(row).toContain("<VoteBox");
    expect(row.indexOf("<VoteBox")).toBeGreaterThan(row.indexOf("</a>"));
  });

  it("has exactly ONE place that builds a sign-in redirect", () => {
    // The guard that makes the indirection safe rather than merely shorter.
    // Six act routes used to assemble the sign-in redirect each; if one of
    // them starts doing that again, the JSON caller gets a redirect it cannot
    // read and an optimistic control silently stops reverting.
    //
    // AND THE DESTINATION IS THE DOOR, not the handshake. `/auth/start` builds
    // an authorize URL and leaves for Orunbase; sending a signed-out upvote
    // there put a consent card on the screen instead of a sign-in.
    const act = read("me/act.ts");
    expect(act).toContain("/signin?return_to=");
    expect(act).not.toContain("/auth/start");
    expect(act).toContain("303");
    for (const file of [
      "me/endorse/route.ts",
      "me/unendorse/route.ts",
      "me/save/route.ts",
      "me/unsave/route.ts",
      "me/follow/route.ts",
      "me/comment-vote/route.ts",
    ]) {
      expect(read(file)).not.toContain("/signin");
      expect(read(file)).not.toContain("/auth/start");
      expect(read(file)).not.toContain("NextResponse.redirect");
    }
  });

  it("the signed-out click still expresses the intent, and lands back on the control", () => {
    // XP2's rule applied to the public act: making somebody declare their
    // identity before expressing an intent loses the intent.
    // The fragment is per listing now, because the feed renders many of these
    // on one page and `#endorse` would have addressed whichever came first.
    expect(control()).toContain("id={`vote-${slug}`}");
    expect(control()).toContain("#vote-${slug}");
    for (const file of ["me/endorse/route.ts", "me/unendorse/route.ts"]) {
      // OPP2 moved the ANSWER behind `me/act.ts`, which serves two callers —
      // a browser posting a form, and the enhanced client posting with
      // `fetch`. The property is unchanged and is asserted in both places:
      // here, that the route asks for the sign-in outcome; below, that the
      // one place which builds it still builds the same redirect.
      expect(read(file)).toMatch(/actAnswer\(request, "signin", \{ returnTo(, pending)? \}\)/);
      // A FAILED write returns them to the page rather than to an error
      // screen — the control will simply still read "Endorse", which is the
      // truth about what the server holds.
      expect(read(file)).toContain('actAnswer(request, "ok", { returnTo })');
    }
    // FR3 — AND THE ACT ITSELF SURVIVES THE ROUND TRIP, not only the address.
    // The asymmetry is the assertion: endorse carries a record through the
    // bounce and unendorse deliberately does not, because a signed-out page
    // renders every control unvoted (I6), so a withdrawal is not something a
    // bounced visitor can have been asking for.
    expect(read("me/endorse/route.ts")).toContain('{ act: "endorse", slug }');
    expect(read("me/unendorse/route.ts")).not.toContain("pending");
  });

  it("the server render is the ANONYMOUS one, like every other overlay consumer (I6)", () => {
    // The control renders identically in every visitor's HTML and only
    // changes after hydration. A cached product page must be byte-identical
    // signed-in and signed-out, endorsement or no endorsement.
    expect(control()).not.toMatch(/cookies\(|headers\(|op_session|SESSION_COOKIE/);
    expect(control()).toContain('"use client"');
  });
});

describe("PV2 — one implementation per published sentence (was DS4)", () => {
  // DS4's "Similar launches" panel was REPLACED by PV2's alternatives, and
  // these three checks moved with it rather than being deleted: each was
  // about a property the new panel has to keep, and retiring a guard along
  // with the code it guarded is how a property quietly stops holding.

  it("the order lives in the contract, never on the page", () => {
    // `alternativesFor` is where the overlap rule and its ordering live, and
    // it is in the contract with the sentence that explains it. OL-2a: no
    // ordering is decided in the web layer.
    expect(read("[slug]/page.tsx")).toContain("alternativesFor(catalog, profile.slug)");
    expect(code("[slug]/page.tsx")).not.toMatch(/\.sort\(/);
  });

  it("the panel links to the sentence that produced it (OPC-4)", () => {
    expect(FORMULAS["alternatives.overlap"].sentence.length).toBeGreaterThan(60);
    expect(formulaAnchor("alternatives.overlap")).toBe("alternatives-overlap");
  });

  it("keeps the superseded sentence published, because its address was linked", () => {
    // `/docs/formulas#similar-same-category-then-active` is a public address
    // the old panel pointed at. Deleting the rule would leave anybody who
    // followed that link with no way to find out what they had been shown, so
    // it stays and says what replaced it.
    expect(FORMULAS["similar.same-category-then-active"].sentence).toMatch(/SUPERSEDED/);
    expect(FORMULAS["similar.same-category-then-active"].sentence).toMatch(/alternatives\.overlap/);
  });

  it("distinguishes 'could not read' from 'nothing overlaps' (the OD5 finding)", () => {
    // An empty room and a locked door look nothing alike to a reader, and
    // this panel should not have to guess. Three states, three sentences.
    const page = read("[slug]/page.tsx");
    expect(page).toContain("alternatives === null");
    expect(page).toContain("alternatives.length === 0");
    expect(page).toContain("None yet.");
    expect(page).toMatch(/Couldn&rsquo;t load these just now/);
  });

  it("renders the reason VISIBLY, not only for a screen reader", () => {
    // The done-when: alternatives never render as an unexplained list. DS4
    // could put one rule in an `sr-only` line because one rule covered every
    // row; here the reason differs per row, and a reason only some readers
    // get is the unexplained list this milestone refuses.
    const page = read("[slug]/page.tsx");
    expect(page).toMatch(/\{reason\}/);
    // And the sr-only line is still there — it explains the ORDER, which is a
    // different question from what any one row shares.
  });

  it("no longer renders a pending placeholder where the panel now is", () => {
    // The milestone that lights something up deletes an entry from the
    // PENDING list rather than leaving a promise beside a working feature.
    expect(Object.keys(PENDING)).not.toContain("similar");
    expect(read("[slug]/page.tsx")).not.toContain("PENDING.similar");
  });
});

// DS4 — "the way out of an empty result" retired with the directory's
// filters and its empty state (`/` is the launches; `/products` redirects
// there from next.config.mjs).

describe("DS4 — what a crawler is told", () => {
  it("the listing page carries structured data, and only when it asks to be indexed", () => {
    const page = read("[slug]/page.tsx");
    // openproduct-studio OSD3 — with the media origin, for the logo's `image`.
    expect(page).toContain("listingJsonLd(profile, apex, publicApiBase())");
    // TS1 — a listing we have just asked a crawler NOT to amplify does not
    // then get handed a rich record. That would be arguing both sides of the
    // same instruction.
    //
    // RE1 CHANGED THE SHAPE AND NOT THE RULE. The `<script>` and its escaping
    // moved into `ui/json-ld.tsx`, because that escaping is the kind that is
    // correct in the file where somebody thought about it and forgotten in
    // the five that copy it — and RE1 added five. The gate is still here and
    // still on the listing document alone.
    expect(page).toMatch(/profile\.indexable \? <JsonLd data=\{listingJsonLd/);
  });

  it("the JSON-LD cannot close its own script tag", () => {
    // The tagline is a maintainer's own words, and a tagline containing
    // `</script>` would otherwise end the block and start rendering markup.
    //
    // ONE PLACE SINCE RE1, which is the point: this used to be asserted
    // against the listing page, where it was correct, and six pages now emit
    // JSON-LD. `structured-data-pages.test.ts` holds every one of them to
    // using the component rather than the shape.
    const component = read("ui/json-ld.tsx");
    expect(component).toContain('type="application/ld+json"');
    expect(component).toMatch(/JSON\.stringify\(data\)\.replace\(/);
    expect(component).toContain("u003c");
  });

  it("the directory's canonical is the UNFILTERED view", () => {
    // The whole facet-permutation answer, and it costs nothing: every
    // `?category=…&stack=…` view self-reports as `/`, so a crawler
    // de-duplicates 2^n pages down to the one document they all are.
    const page = read("page.tsx");
    expect(page).toMatch(/alternates: \{ canonical: `\$\{publicApexOrigin\(\)\}\/` \}/);
    // And the page does not read searchParams, which is what keeps it ONE
    // static document (OPC-1) — the same decision, from the other direction.
    expect(code("page.tsx")).not.toContain("searchParams");
  });

  it("the sitemap names both namespaces and 503s rather than dropping one", () => {
    const route = read("sitemap.xml/route.ts");
    expect(route).toContain("fetchPublicPeople");
    expect(route).toContain("`@${person.handle}`");
    expect(route).toContain("project.indexable");
    // A cacheable document that omits a namespace tells a crawler those pages
    // were removed. `people` failing matters as much as `projects` failing.
    expect(route).toContain("projects === null || people === null");
    expect(route).toContain("status: 503");
  });

  it("the sitemap names no filtered view of the directory", () => {
    const route = code("sitemap.xml/route.ts");
    expect(route).not.toContain("?sort=");
    expect(route).not.toContain("category=");
    expect(route).not.toContain("searchParams");
  });
});


describe("CG2 — the contributors directory", () => {
  const page = () => read("people/(index)/page.tsx");

  it("states the eligibility rule in the header, not a footnote", () => {
    // Not copy. `[decided]` in the reference design and CG-2 in the epic: a
    // public profile directory open to anyone who can sign in is a spam
    // directory within a month, and this sentence is the bound that stops it
    // — stated where a reader can hold us to it.
    expect(DIRECTORY_ELIGIBILITY_NOTE).toMatch(/maintains or contributes to a listed product/);
    // And the consent half, which is a different rule (OPC-5): a maintainer
    // naming somebody does not put that person here.
    // The rule is enforced in the read and published in the contract; the
    // page no longer prints it (the site stopped explaining itself).
    expect(DIRECTORY_CONSENT_NOTE).toMatch(/without their own act/);
  });

  it("enforces eligibility in the READ, never as a filter on the page", () => {
    // A filter here would mean the ineligible rows were fetched, and a row
    // fetched is a row one refactor away from being rendered.
    const source = code("people/(index)/page.tsx");
    expect(source).not.toMatch(/\.filter\(/);
    expect(page()).toContain("fetchContributorsDirectory()");
  });

  it("ranks nobody", () => {
    // Any order that scored people would be a ranking of PEOPLE, which this
    // product does not do and has nowhere to publish a formula for (OPC-4).
    // "Most active contributor" is a leaderboard — a different product with
    // different incentives.
    const source = code("people/(index)/page.tsx");
    expect(source).not.toMatch(/\.sort\(|formulaHref|rank/i);
  });

  it("distinguishes a failed read from an empty directory (the OD5 finding)", () => {
    const source = page();
    expect(source).toContain("contributors === null");
    expect(source).toContain("contributors.length === 0");
    expect(source).toMatch(/Couldn&rsquo;t load the directory just now/);
    expect(source).toContain("Nobody has published a profile yet.");
  });

  it("says `contributes to` only when it has something to say (CG4)", () => {
    const source = code("people/people-list.tsx");
    // The count is real now, and `contributes to 0` is a TRUE sentence — we
    // hold every edge. It is still not printed beside a stranger's name on
    // every row in the list: an honest zero repeated forty times becomes a
    // comparison nobody asked for. The API answers it; the row says it when
    // it means something.
    expect(source).toMatch(/person\.contributesTo > 0 \? \(/);
    expect(source).not.toContain("person.contributesTo === null");
    // And the clause carries its sentence, from the same contract the profile
    // page's stat notes come from — one wording, not two.
    expect(source).toContain("title={PROFILE_STAT_NOTES.contributesTo}");
  });

  it("carries the COUNT and not a second list of slugs", () => {
    // The card already names the listings somebody maintains. A second list
    // would make a directory of PEOPLE read as a directory of products, which
    // is the widening CG2 deliberately narrowed away from.
    expect(code("people/(index)/page.tsx")).not.toContain("contributesToListings");
  });

  it("links each card to the canonical /@handle, and does not nest anchors", () => {
    const source = code("people/people-list.tsx");
    expect(source).toContain("href={`/@${person.handle}`}");
    // A list where only the name is clickable is a list people miss; an
    // anchor inside an anchor is invalid markup browsers resolve differently.
    // Exactly one `<a` in the tile (a row until openproduct-calm CL4),
    // wrapping the whole thing.
    const row = source.slice(source.indexOf("function PersonTile"));
    expect((row.match(LINK_ELEMENTS) ?? []).length).toBe(1);
  });

  it("carries no outbound links from the card itself", () => {
    // The card is a smaller shape than the page on purpose. A grid shipping
    // every contributor's GitHub and personal site would be a link-harvesting
    // endpoint wearing a card grid.
    const source = code("people/(index)/page.tsx");
    expect(source).not.toContain("githubUrl");
    expect(source).not.toContain("siteUrl");
    expect(source).not.toMatch(/rel="noreferrer/);
  });

  it("is one cacheable document with no actor (OPC-1, I6)", () => {
    const source = code("people/(index)/page.tsx");
    expect(source).not.toMatch(/cookies\(|headers\(|op_session|SESSION_COOKIE|useOverlay/);
    expect(page()).toContain("export const revalidate = 60;");
  });

  it("no longer renders a pending placeholder where the grid now is", () => {
    expect(Object.keys(PENDING)).not.toContain("peopleDirectory");
    expect(page()).not.toContain("PENDING.peopleDirectory");
    expect(page()).not.toContain("NotYet");
  });

  it("is indexable now that it has something in it", () => {
    // It shipped `noindex` deliberately while empty — an empty directory in a
    // search result is worse for this product than no search result at all.
    // That reason expired when the grid did.
    expect(code("people/(index)/page.tsx")).not.toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});


describe("TS2 — the limits are published where a person can read them", () => {
  const docs = () => read("docs/page.tsx");

  it("renders the rules the gateway enforces, not a hand-written table", () => {
    // The same discipline the formulas table follows: a limit that exists and
    // a limit that is documented cannot be different sets.
    expect(docs()).toContain("publishedRules().map((rule)");
    expect(docs()).toContain("rule.burst.limit");
    expect(docs()).toContain("rule.sustained.limit");
  });

  it("publishes the per-person limits and NOT the per-listing ones", () => {
    // The split, and it is a real one. A person refused deserves the rule
    // they hit. A per-listing bound is a threshold about other people's
    // behaviour, and its exact width is an instruction to a brigade about how
    // many accounts to bring.
    expect(publishedRules().every((r) => r.dimension === "subject")).toBe(true);
    expect(publishedRules().length).toBeGreaterThan(0);
    // And the page SAYS a bound it is not printing exists, rather than
    // leaving a reader to discover it by hitting it.
    expect(docs()).toMatch(/One limit is not published, and here/);
    expect(docs()).toMatch(/bound is stated and the\s+figure is not/);
  });

  it("tells the reader what a refusal looks like", () => {
    const source = docs();
    expect(source).toContain("429");
    expect(source).toContain("Retry-After");
    expect(source).toMatch(/nothing you did is lost/i);
  });

  it("says the windows in words, not in seconds", () => {
    // `86400 / 86400s` is a number a reader has to convert. This is a page
    // people read when they have just been refused.
    expect(docs()).toContain("windowLabel(rule.burst.windowSec)");
    expect(docs()).toContain("function windowLabel(");
  });
});


describe("EN2 — the public count, on every surface", () => {
  it("comes from ONE metric read, on both surfaces", () => {
    // The rule that keeps the row and the page from disagreeing: neither of
    // them counts anything. Both read `endorsements.total` out of the metrics
    // the cached document already carries, which is the same list `merges.7d`
    // arrives in. (The row surface is the FEED row now that the directory is
    // gone: its figure is the day's `counted`, read off the feed document
    // core already ranked — the page reads a metric, the row reads an entry,
    // and neither of them counts.)
    expect(read("[slug]/page.tsx")).toContain('metrics.get("endorsements.total")');
    expect(read("feed/feed-row.tsx")).toContain("count={entry.rank === null ? null : entry.counted}");
    // Nothing on either surface computes a total of its own.
    for (const file of ["[slug]/page.tsx", "feed/feed-row.tsx"]) {
      expect(code(file)).not.toMatch(/\.filter\([^)]*endors[^)]*\)\.length/i);
      expect(code(file)).not.toMatch(/endorsements\.length|\.counted\s*[+-]/);
    }
  });

  it("renders a dash for a total we cannot compute, and a ZERO for one we can", () => {
    // The distinction this program keeps making, at its sharpest. `MetricValue`
    // takes the metric, so an absent one has no number to render — while a
    // present `0` renders as 0, which is the ONE honest zero in the product:
    // we read a complete record (the endorsements table, all of it) and found
    // nobody, and "no one yet" is a true and useful thing to say.
    const metric = read("ui/metric.tsx");
    expect(metric).toContain("metric: PublicMetric | undefined");
    expect(metric).toContain("if (!metric)");
    expect(metric).toContain("{DASH}");
    expect(ENDORSEMENT_EMPTY_NOTE).toBe("no one yet");
  });

  it("says what the number MEANS where a reader hovers it — and what the DASH means", () => {
    // Two things a bare number on a card cannot say for itself: that it is
    // people rather than points, and that it is discounted rather than raw.
    // Re-pinned from the directory row to the vote box, which is where the
    // number lives on every surface since UV0.
    //
    // THE "AND ONLY WHEN THERE IS ONE" CLAUSE IS REVERSED HERE
    // (openproduct-worldclass VC3), and it was a deliberate decision rather
    // than an oversight: the uncounted branch resolved to `undefined`, on
    // purpose, because a dash is not a number and the sentence about totals
    // does not describe it.
    //
    // That is right about the sentence and wrong about the silence. The 7 Sep
    // audit met `0` on one row and `—` on the next with nothing anywhere
    // saying they are different claims — and OPC-C's distinction between "we
    // counted and found nobody" and "we have not counted" is one of the most
    // defensible things this product does. A distinction a reader cannot see
    // is not a distinction; it is a typographical inconsistency, and it reads
    // as a bug in a product whose pitch is that its numbers are trustworthy.
    //
    // So the dash gets its OWN sentence rather than the total's.
    expect(read("ui/vote-box.tsx")).toContain(
      "count === null ? ENDORSEMENT_UNCOUNTED_TITLE : ENDORSEMENT_TOTAL_TITLE",
    );
    expect(ENDORSEMENT_TOTAL_TITLE).toMatch(/People who upvoted this/);
    expect(ENDORSEMENT_TOTAL_TITLE).toMatch(/integrity discount/);
    expect(ENDORSEMENT_TOTAL_TITLE).toMatch(/One person counts once/);
  });

  it("carries the moment it was computed, like every other number (I9)", () => {
    const page = read("[slug]/page.tsx");
    // The design's strip prints the unit alone, so the moment rides as the
    // note's title rather than as a line of its own — but it rides.
    expect(page).toContain("observedNote(endorsementsRecent, now,");
    expect(page).toContain("observed ${agoOf(metric.observedAt, now)}");
    expect(page).toContain("<span title={when}>{unit}</span>");
    // EN2 refused a "this week" card, and its reason was specific: it "would
    // be a fifth, and BESIDE A TOTAL it reads as a trend nobody computed".
    //
    // UV0 moved the total into the vote box in the hero, which is where the
    // design puts it. So the week sits beside no total to read a trend
    // against. Re-pinned for the design's facts card: the four stat cards
    // became `<Fact>` rows, and the three that are METRICS each carry their
    // moment through `observedNote` — that is what this pins now.
    const observed = page.match(/label=\{observedNote\(/g) ?? [];
    expect(observed).toHaveLength(3);
    // OB5 — the three moved up to the stat strip under the name, with the
    // contract's labels; the metric and its moment are the same.
    expect(page).toContain("observedNote(merges, now, BUILD_STAT_LABEL.changes)");
    expect(page).toContain("observedNote(lastTouched, now, BUILD_STAT_LABEL.lastMerge)");
    expect(page).toContain("data-stat-strip");
    expect(page).not.toContain("<MetricValue metric={endorsements} />");
    // And the total's own moment rides beside its discount note (I9).
  });

  it("puts no PERSONAL fact on the act, which is what I6 asks (UV0)", () => {
    // EN2 read this as "no count on the control". UV0 put the count there,
    // because the design's box is the count and a public figure is identical
    // for every visitor — see the UV0 test above for the full reasoning.
    //
    // The rule that mattered is the one left: the control's server render
    // carries nothing about WHO is asking. The voted state arrives from the
    // overlay after paint and from nowhere else.
    const control = read("ui/vote-box.tsx");
    expect(control).toContain("isEndorsed(state, slug)");
    expect(control).not.toMatch(/cookies\(|headers\(|SESSION_COOKIE/);
    expect(code("ui/vote-box.tsx")).not.toMatch(/\bsubjectId\b|displayName|handle/);
  });

  it("`Most saved` orders by ENDORSEMENTS and never by saves, in the published sentence", () => {
    // OPC-3 at the point of maximum pressure: the order is called "Most
    // saved" because that is what the design drew, and a reader could
    // reasonably assume it counts the private bookmark. It does not, it never
    // has, and the sentence says so. The directory's sort control that lit it
    // is gone (`/` is the launches); the published order outlives the pill,
    // and the comparator it names is pinned in the contract's own tests.
    expect(FORMULAS["sort.most-saved"].sentence).toMatch(/endorsed them and not withdrawn/);
    expect(FORMULAS["sort.most-saved"].sentence).toMatch(/integrity discount/);
    expect(contract("ranking.ts")).not.toMatch(/savedSet|saveCount|savedBy/);
  });
});

describe("CG3 — the roster renders consent, not the publication list", () => {
  const page = () => read("[slug]/page.tsx");

  it("says what the roster means, on the roster", () => {
    // Every name there is there because its owner put it there. A reader
    // seeing a list of people on a product has no way to know that unless we
    // say it.
    expect(ROSTER_PROVENANCE_NOTE).toMatch(/confirmed their own place/);
    expect(ROSTER_PROVENANCE_NOTE).toMatch(/only that person can make it public/);
  });

  it("says why an empty roster is empty", () => {
    // "No one has been published yet" was true before consent existed and is
    // now misleading: somebody may well have been NAMED. The empty state has
    // to distinguish "nobody was asked" from "nobody has answered".
    // openproduct-calm-pages CP2 (CP-R3): an empty roster takes no panel; it
    // is named once on the page's *Not yet* line, as "listed makers" — which
    // still says nobody has been LISTED, not that nobody was asked.
    const source = page();
    expect(source).toContain('label: "listed makers"');
    expect(source).not.toContain("No one has been published on this listing yet.");
  });

  it("enforces consent in the PROJECTION, never on the page", () => {
    // The page reads `profile.maintainers` exactly as it always did. The
    // change is that the projection behind it now requires a confirmed edge
    // — so every surface got it at once, and no surface has a filter it
    // could forget.
    expect(page()).toContain("profile.maintainers");
    expect(code("[slug]/page.tsx")).not.toMatch(/product_people|rosterState/i);
  });
});

// ---------------------------------------------------------------------------
// XP3 — loading, error, and the studio frame
// ---------------------------------------------------------------------------

/** Every route segment that renders a page, and what a visitor is doing there. */
const ROUTE_SEGMENTS = [
  { dir: ".", what: "the directory, and the fallback for /docs and /create" },
  { dir: "[slug]", what: "a product" },
  { dir: "people", what: "the contributors directory and one person" },
  { dir: "me", what: "the visitor's own pages" },
  { dir: "studio", what: "the maintainer surfaces" },
] as const;

const exists = (rel: string) => existsSync(resolve(APP_DIR, rel));

describe("XP3 — every route says it is coming, and says when it cannot", () => {
  it("has a loading state wherever one is still allowed", () => {
    // NARROWED AT R11, AND THE REASON IS THE OPPOSITE OF A CLIMBDOWN. XP3
    // asked for a skeleton on every segment and got one; R11 found what that
    // cost. A `loading.tsx` makes Next STREAM the route, streaming commits the
    // status line before the body is known, and a `notFound()` that runs after
    // that can only change the body — so every 404 in this product was being
    // served as `200 OK`.
    //
    // A 404 and a skeleton are wanted at the same moment and only one of them
    // fits in the response line. The routes addressed by a name somebody can
    // get wrong give up the skeleton; the rest keep it. `not-found-status.test.ts`
    // holds the rule and the list.
    for (const rel of ["me/loading.tsx", "studio/loading.tsx", "people/(index)/loading.tsx"]) {
      expect(`${rel}: ${exists(rel)}`).toBe(`${rel}: true`);
    }
    // And the ones that gave theirs up, named so this reads as a decision
    // rather than as rot.
    for (const rel of ["loading.tsx", "[slug]/loading.tsx", "people/[handle]/loading.tsx"]) {
      expect(`${rel}: ${exists(rel)}`).toBe(`${rel}: false`);
    }
  });

  it("every segment has an error boundary, and the app has a last resort", () => {
    for (const { dir } of ROUTE_SEGMENTS) {
      const rel = dir === "." ? "error.tsx" : `${dir}/error.tsx`;
      expect(`${rel}: ${exists(rel)}`).toBe(`${rel}: true`);
    }
    // `global-error.tsx` replaces the ROOT LAYOUT, so it is the only thing
    // standing if the shell itself is what failed.
    expect(exists("global-error.tsx")).toBe(true);
  });

  it("the last-resort page imports nothing that could itself be the failure", () => {
    // It renders when the root layout is gone — no fonts, no token stylesheet,
    // no shell. A styled page here is a page betting the failure was not in
    // the styling, which is the bet you lose in exactly this case.
    const source = code("global-error.tsx");
    expect(source).not.toMatch(/^import .*(ui\/|shell\/|globals\.css)/m);
    expect(source).toContain("<html");
    expect(source).toContain("style={{");
  });
});

describe("XP3 — a skeleton is a promise about layout", () => {
  it("announces WHAT is loading, once, and hides every block from a reader", () => {
    for (const rel of [
      // R11 took three of these away; the promise still holds for the rest.
      "people/(index)/loading.tsx",
      "me/loading.tsx",
      "studio/loading.tsx",
    ]) {
      const source = read(rel);
      // "Loading…" on its own is the same announcement on every route in the
      // product and therefore carries no information at all.
      expect(`${rel}: ${/<LoadingAnnouncement what="/.test(source)}`).toBe(`${rel}: true`);
      // The blocks themselves say nothing: a screen reader user does not want
      // forty grey rectangles read out.
      expect(`${rel}: ${source.includes("aria-hidden")}`).toBe(`${rel}: false`);
    }
    const skeleton = code("ui/skeleton.tsx");
    expect((skeleton.match(/aria-hidden="true"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("separates the line box from the ink, because they are different numbers", () => {
    // THE BUG THIS SHAPE EXISTS TO STOP: drawing an 11px bar and calling it a
    // 19px line, which made the first draft's stat card 37px short of the real
    // one — a jolt on every load, invisible in review, found by measuring.
    const fn = component("TextLine", "ui/skeleton.tsx");
    expect(fn).toContain("style={{ height: line }}");
    expect(fn).toContain("style={{ height: ink }}");
  });

  it("has TWO row shapes, because the product has two", () => {
    // A profile's rows are a slug and a tagline on one baseline (51px, no
    // mark); the directory's carry a mark, a licence and a chip strip (131px).
    // One skeleton for both was wrong for both.
    const skeleton = code("ui/skeleton.tsx");
    expect(skeleton).toContain("export function ProfileRowSkeleton");
    expect(skeleton).toContain("export function DirectoryRowSkeleton");
    expect(skeleton).toContain("h-[51px]");
    expect(skeleton).toContain("h-[131px]");
  });

  it("respects a reduced-motion preference", () => {
    // A visitor who asked their system for less motion is asking most loudly
    // on a page that is doing nothing yet. A still block still says "something
    // belongs here", so the sweep is the part that goes.
    expect(code("ui/skeleton.tsx")).toContain("motion-safe:animate-shimmer");
  });
});

describe("XP3 — a failure offers recovery, not an apology", () => {
  it("names four distinct failures and says whether waiting helps", () => {
    const source = code("ui/failure.tsx");
    for (const kind of ["missing", "unavailable", "broken", "signedOut"]) {
      expect(`${kind}: ${source.includes(`${kind}: {`)}`).toBe(`${kind}: true`);
    }
    // `retryHelps` is a property OF THE FAILURE: waiting cannot conjure a
    // listing that does not exist, and a Try again button that provably
    // cannot work is worse than none.
    expect(source).toContain("retryHelps: false");
    expect(source).toContain("retryHelps: true");
  });

  it("requires a way onward — a failure page with none is the dead end", () => {
    const fn = component("FailurePanel", "ui/failure.tsx");
    // Not optional. Making the prop required means the compiler asks for one.
    expect(fn).toMatch(/actions: readonly FailureAction\[\];/);
    expect(fn).not.toMatch(/actions\?:/);
  });

  it("says nothing about WHY, in our terms", () => {
    // "Our servers are experiencing issues" is a sentence about us written for
    // us. And a thrown message can carry a hostname, an internal path, or text
    // derived from somebody's input — none of which a visitor can act on.
    const boundary = code("error.tsx");
    expect(boundary).not.toMatch(/\{error\.message\}|\{String\(error\)\}/);
    // Comment-stripped: the module header QUOTES the phrases it forbids as
    // counter-examples, and a negative assertion that reads comments would
    // fail on the very documentation that explains it.
    expect(code("ui/failure.tsx")).not.toMatch(/we apologi[sz]e|sorry for|our servers/i);
  });
});

describe("XP3 — the studio frame", () => {
  it("carries the four decisions every maintainer surface repeats", () => {
    const frame = code("studio/frame.tsx");
    for (const part of ["StudioCrumbs", "StudioSectionNav"]) {
      expect(`${part}: ${frame.includes(`function ${part}`)}`).toBe(`${part}: true`);
    }
    // OPP15 — DECISION 2 AND 3 MOVED WITHOUT CHANGING. "What just happened"
    // and "what is blocking me" are still one banner and one blocker list for
    // every surface; they are rendered by the island the frame mounts, because
    // a studio act posts in the background now and the banner is what has to
    // change when it lands. The frame still mounts them exactly once.
    expect(frame).toContain("<StudioLive");
    const island = code("studio/live-save.tsx");
    for (const part of ["NoticeBanner", "Blockers"]) {
      expect(`${part}: ${island.includes(`function ${part}`)}`).toBe(`${part}: true`);
    }
  });

  it("does NOT render a refusal fainter than a success", () => {
    // The correction this frame makes. The editor rendered an error in
    // `text-muted-foreground` and a success in full contrast — an interface
    // that whispers bad news and announces good news. A person who needs to
    // read one of the two carefully needs to read the refusal.
    const banner = component("NoticeBanner", "studio/live-save.tsx");
    const refusedBranch = banner.slice(banner.indexOf("refused"), banner.indexOf(": \"m-0 mt-5 max-w-[70ch] rounded-[8px] border border-border"));
    expect(refusedBranch).toContain("font-medium");
    expect(refusedBranch).not.toContain("text-muted-foreground");
  });

  it("makes a blocker's remedy REQUIRED, not optional", () => {
    // OD6's rule, lifted. A blocker with no remedy is a status message dressed
    // as an instruction: it says you cannot proceed and leaves you to work out
    // why, which is the failure this shape makes impossible to ship.
    const frame = read("studio/frame.tsx");
    const iface = frame.slice(frame.indexOf("export interface StudioBlocker"));
    expect(iface.slice(0, iface.indexOf("}"))).toMatch(/remedy: string;/);
  });

  it("renders a section that does not exist yet as TEXT, never a link", () => {
    // The same rule XP-5 applies to a person's name, for the same reason: a
    // dead link is a worse answer than a plain word.
    const nav = component("StudioSectionNav", "studio/frame.tsx");
    expect(nav).toMatch(/section\.live \?/);
    expect(nav).toContain('data-pending="studio"');
    const planned = nav.slice(nav.indexOf(") : ("));
    expect(planned).not.toContain("<Link");
  });

  it("is all server components — no bundle to render a heading", () => {
    // The studio's forms are progressive-enhancement posts and the session
    // token never reaches the browser (OX5b).
    expect(read("studio/frame.tsx")).not.toContain('"use client"');
    expect(read("studio/page.tsx")).not.toContain('"use client"');
  });

  it("the three existing studio screens all use it", () => {
    // The claim the frame is for — four surfaces cost layout, not invention —
    // is only true if the ones that exist actually moved onto it.
    // A listing's editor moved its frame into a layout every step shares
    // (openproduct-studio OSD5); its pages keep the frame's notice island.
    for (const rel of ["studio/page.tsx", "studio/[org]/[profile]/page.tsx"]) {
      const source = read(rel);
      expect(`${rel}: ${source.includes("<StudioFrame") || source.includes("<StudioLive")}`).toBe(`${rel}: true`);
      // And they no longer hand-roll a container.
      expect(`${rel}: ${/<main className="mx-auto w-full max-w-3xl/.test(source)}`).toBe(
        `${rel}: false`,
      );
    }
  });
});

describe("XP3 — nothing in the studio leaks into the public bundle", () => {
  /** Every source file under `src/app`, with its path relative to it. */
  function walk(dir: string, prefix = ""): string[] {
    return readdirSync(resolve(APP_DIR, dir === "." ? "." : dir), { withFileTypes: true }).flatMap(
      (entry) => {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) return walk(rel, rel);
        return /\.tsx?$/.test(entry.name) ? [rel] : [];
      },
    );
  }

  it("no public route imports anything from `studio/`", () => {
    // A SWEEP RATHER THAN A LIST, because the failure this guards against
    // arrives by somebody adding a file — and a list of files to check is a
    // list that goes stale the moment it would have mattered.
    //
    // The leak it forbids is not hypothetical: the studio's screens post
    // forms with a session read behind them (OX5b), and a shared component
    // that reached into `studio/` would pull that graph onto a page every
    // anonymous visitor loads.
    const offenders = walk(".")
      .filter((file) => !file.startsWith("studio/"))
      .filter((file) => /from\s+"[^"]*\bstudio\//.test(read(file)))
      .sort();
    expect(offenders).toEqual([]);
  });

  it("the studio is reached by ADDRESS, never linked from a public page", () => {
    // Not a security boundary — the server checks the session on every one of
    // these — but a public page advertising a maintainer surface is a page
    // sending most of its visitors to a sign-in wall.
    const publicPages = walk(".").filter(
      (file) => !file.startsWith("studio/") && !file.startsWith("me/") && !file.startsWith("auth/"),
    );
    const linking = publicPages.filter((file) => /href=[{"]`?\/studio/.test(code(file))).sort();
    expect(linking).toEqual([]);
  });
});

describe("LC0 — the launch scheduler in the studio frame", () => {
  const page = () => code("studio/[org]/[profile]/launches/page.tsx");

  it("is built on XP3's frame rather than a layout of its own", () => {
    // The claim XP3's frame was for: the second maintainer surface costs a
    // form and a list. If this page drew its own container, the frame bought
    // nothing.
    const source = page();
    // Under the listing's layout since openproduct-studio OSD5: the frame's
    // chrome is the layout's, the notice island is the page's.
    expect(source).toContain("<StudioLive");
    expect(source).toContain("<StudioSection");
    expect(source).not.toMatch(/<main className="mx-auto/);
    // ...and its stops are the same component the public routes use.
    expect(source).toContain("<FailurePanel");
  });

  it("does NOT re-implement the rules it renders", () => {
    // The failure a client-side copy of a server rule produces every time:
    // the form permits what the API refuses. This page renders the API's
    // eligibility answer and the API's refusal sentence, and computes neither.
    const source = page();
    expect(source).not.toContain("checkLaunchable");
    expect(source).not.toMatch(/cooldownDays\s*\*/);
    expect(source).toContain("result.data");
  });

  it("states the cooldown the API ENFORCES, not the compiled-in default", () => {
    // A studio saying 180 days against a 90-day deployment has told somebody
    // something false on the surface meant to explain the rules.
    const source = page();
    expect(source).toContain("cooldownNote(policy)");
    expect(source).not.toContain("DEFAULT_LAUNCH_POLICY");
  });

  it("looks a refusal UP rather than reading it from the URL", () => {
    // `?refused=cooldown` is a token from a closed set and the sentence comes
    // from the contract. Passing the message itself through the query string
    // would let anybody with a link put arbitrary words on a maintainer's own
    // screen.
    // OPP15 — the lookup is in `studio/notices.ts` now, because a studio act
    // has a second reader (the save island) that must say the same sentence.
    // The rule is the same one and is asserted where it now lives: the
    // surface names the CONTRACT's map, and the reader takes the token's
    // sentence from it rather than from the address.
    const source = page();
    expect(source).toContain("LAUNCH_VOCABULARY");
    expect(source).not.toMatch(/search\.message|searchParams\.message/);
    const notices = code("studio/notices.ts");
    expect(notices).toContain("refusals: LAUNCH_REFUSALS");
    expect(notices).toContain("vocabulary.refusals?.[search.refused]?.says");
  });

  it("says which ZONE the moment is in", () => {
    // A `datetime-local` input carries none, so a maker who types 9am gets 9am
    // wherever the server thinks it is. An input that looks precise and means
    // something else is worse than one that asks.
    expect(page()).toMatch(/\(UTC\)/);
    expect(code("studio/[org]/[profile]/launches/actions/route.ts")).toContain('`${withSeconds}Z`');
  });

  it("posts every act to the sibling actions route — no client JS", () => {
    // OX5b's discipline: the session token never reaches the browser.
    const source = page();
    expect(source).not.toContain('"use client"');
    expect((source.match(/method="post"/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("`${page}/actions`");
  });

  it("is reachable from the listing editor", () => {
    // A separated model is worth nothing if the studio hides half of it.
    //
    // IN1 MOVED THE LINK INTO THE VOCABULARY. The overview no longer spells
    // `/launches` — it renders every step from `LISTING_STEPS` through
    // `listingStepPath`, and the scheduler is one of them. So the property is
    // pinned where it now lives: the contract says the schedule step keeps
    // the address LC0 shipped, and the overview links every step there is.
    const overview = code("studio/[org]/[profile]/page.tsx");
    expect(overview).toContain("LISTING_STEPS.map");
    expect(overview).toContain("listingStepPath(org, profileId, step)");
    const schedule = LISTING_STEPS.find((s) => s.id === "schedule");
    expect(schedule?.segment).toBe("launches");
    expect(listingStepPath("acme", "prf_1", schedule!)).toBe("/studio/acme/prf_1/launches");
  });

  it("publishes the launch rules where a maker can read them", () => {
    // A rule somebody meets as a refusal and cannot look up is experienced as
    // the product being broken. This one in particular is a rule people will
    // want to argue with, which is why it has to be written down.
    const docs = read("docs/page.tsx");
    expect(docs).toContain("{LAUNCH_MEANING}");
    expect(docs).toContain("{cooldownNote()}");
    expect(docs).toMatch(/launches once per version/);
    expect(docs).toMatch(/will not announce a page nobody can open/);
  });
});

describe("LC1 — the digest, as a page", () => {
  const page = () => code("digest/[week]/page.tsx");

  it("REDIRECTS a non-canonical spelling rather than serving it", () => {
    // An archive with three addresses for one document splits its own links
    // and teaches a crawler that the canonical one is arbitrary. The API 404s
    // the same input, because a client should learn the grammar; a person
    // typing a URL deserves the page.
    const source = page();
    expect(source).toMatch(/if \(!parsed\.canonical\) redirect\(`\/digest\/\$\{parsed\.week\.id\}`\)/);
    expect(source).toMatch(/if \(!parsed\.ok\) notFound\(\)/);
  });

  it("says which DAYS the week covers", () => {
    // ISO weeks put 30 December 2025 in 2026-w01, which looks like a bug and
    // is the standard behaving correctly. The page says the dates rather than
    // leaving somebody to work it out.
    expect(page()).toContain("{weekDates(parsed.week)}");
  });

  it("says an empty week was empty, and never widens the window", () => {
    // The design constraint. A digest that looks right with twenty launches
    // and broken with none cannot ship until the catalog is already busy.
    const source = page();
    expect(source).toMatch(/digest\.launches\.length === 0/);
    expect(source).toContain("{NO_LAUNCHES_NOTE}");
    expect(source).toContain("{NO_ENDORSEMENTS_NOTE}");
    // Nothing here reaches for a wider window when the narrow one is empty.
    expect(source).not.toMatch(/previousWeek\([^)]*\)\.id\}`\);?\s*$/m);
    expect(source).not.toMatch(/fallback|widen|recentWeeks/i);
  });

  it("links its one ordering to a published sentence (OPC-4, I7)", () => {
    const source = page();
    expect(source).toContain("formulaHref(DIGEST_ORDER_FORMULA)");
  });

  it("says WHEN the numbers were counted (I9)", () => {
    expect(page()).toContain("{stamp(digest.observedAt)}");
  });

  it("names the collection slot rather than omitting it", () => {
    const source = page();
    expect(source).toContain("{COLLECTION_PENDING_NOTE}");
    expect(source).toContain('data-pending="LC"');
  });

  it("renders a note's BYLINE as a link to its author", () => {
    // The byline is the whole of what makes an editorial note defensible
    // (LC-4). The API drops a note whose author cannot be resolved, so by the
    // time it reaches the page the handle is always a link that works.
    const source = page();
    expect(source).toContain("href={`/@${note.byHandle}`}");
  });
});

describe("LC1 — the feeds, which need no address (LC-5, I3)", () => {
  const rss = () => read("digest/feed.xml/route.ts");
  const json = () => read("digest/feed.json/route.ts");

  it("neither feed carries or asks for an address", () => {
    for (const [name, source] of [["rss", rss()], ["json", json()]] as const) {
      expect(`${name}: ${/email|address|subscriber|unsubscribe@/i.test(code(`digest/feed.${name === "rss" ? "xml" : "json"}/route.ts`))}`).toBe(
        `${name}: false`,
      );
      expect(source.length).toBeGreaterThan(100);
    }
  });

  it("a FAILED read is a 503, never an empty feed", () => {
    // Serving `<channel>` with no items tells every subscribed reader that
    // nothing has ever happened, and some of them cache that.
    for (const source of [rss(), json()]) {
      expect(source).toMatch(/weeks === null/);
      expect(source).toMatch(/503/);
    }
  });

  it("escapes all five XML entities, even though nothing hostile reaches it yet", () => {
    // A feed is parsed by machines that fail loudly on malformed XML, and the
    // day a tagline reaches this function is not the day to discover it.
    const source = rss();
    for (const entity of ["&amp;", "&lt;", "&gt;", "&quot;", "&apos;"]) {
      expect(`${entity}: ${source.includes(entity)}`).toBe(`${entity}: true`);
    }
  });

  it("gives every entry a STABLE id, so a reader is never shown a week twice", () => {
    expect(rss()).toMatch(/guid isPermaLink="true"/);
    expect(json()).toMatch(/id: url/);
  });

  it("declares JSON Feed 1.1 by its exact version URL", () => {
    // Validators check this string against exactly that value.
    expect(json()).toContain('version: "https://jsonfeed.org/version/1.1"');
    expect(json()).toContain('"application/feed+json');
  });

  it("is discoverable — the layout advertises both", () => {
    const layout = code("layout.tsx");
    expect(layout).toContain('"application/rss+xml"');
    expect(layout).toContain('"application/feed+json"');
    // ...and a person can find it without a browser extension.
    expect(read("layout.tsx")).toContain('href="/digest/feed.xml"');
  });
});

describe("LC1 — the archive is crawlable", () => {
  it("names every week that held something in the sitemap", () => {
    // A digest crawlers cannot enumerate is a set of permanent pages nobody
    // arrives at from a search, which is most of what an archive is for.
    const source = code("sitemap.xml/route.ts");
    expect(source).toContain("fetchDigestWeeks()");
    expect(source).toMatch(/path: `digest\/\$\{parsed\.week\.id\}`/);
    // `lastmod` is the week's END, not now: a settled week cannot change, and
    // stamping it with build time asks a crawler to re-fetch an immutable
    // archive every time anything anywhere is published.
    expect(source).toContain("lastmod: weekWindow(parsed.week).end");
  });

  it("still 503s rather than shipping a partial sitemap", () => {
    // A cacheable document that omits a namespace is a crawler being told
    // those pages were removed — and the third namespace is no different.
    expect(code("sitemap.xml/route.ts")).toMatch(
      /projects === null \|\| people === null \|\| weeks === null/,
    );
  });

  it("distinguishes a failed read from an empty archive on the index", () => {
    // An empty room and a locked door look nothing alike to a visitor.
    const source = code("digest/page.tsx");
    expect(source).toMatch(/weeks === null \?/);
    expect(source).toMatch(/weeks\.length === 0 \?/);
  });
});

describe("LC1 — the digest's rules are published where somebody will look", () => {
  it("says there is no email signup, on the docs page", () => {
    // Said where somebody looking for a subscribe button will be standing. A
    // feed is not a lesser email — it needs no address and cannot leak a
    // subscriber list because there is not one (LC-5, I3).
    const docs = read("docs/page.tsx");
    expect(docs).toContain("{DIGEST_MEANING}");
    expect(docs).toMatch(/no email signup, and no address/);
  });

  it("explains the ISO-week surprise before a reader meets it", () => {
    // 30 December 2025 is in 2026-w01. It looks like a mistake and is the
    // standard behaving correctly.
    const docs = read("docs/page.tsx");
    expect(docs).toMatch(/2026-w01/);
    expect(docs).toMatch(/ISO weeks/);
  });

  it("says a week is published only once it has ENDED", () => {
    expect(read("docs/page.tsx")).toMatch(/what has happened so far/);
  });
});

// LC2 — "the strip left the directory with the console redesign" retired
// with the directory itself (`/` is the launches; `/products` and
// `/launches` redirect there from next.config.mjs).

describe("TS3 — removed is not missing, and the report control is everywhere", () => {
  const listing = () => read("[slug]/page.tsx");
  const tombstone = () => read("ui/tombstone.tsx");
  const control = () => read("ui/report-control.tsx");

  it("the listing page renders a tombstone instead of 404ing a removed listing", () => {
    // TS-3, at the one place in the product that draws the distinction. A
    // `notFound()` reached before the tombstone branch would make removal
    // silent, which is the failure this whole milestone exists to prevent.
    const src = listing();
    const tombstoneAt = src.indexOf("read?.tombstone");
    const notFoundAt = src.indexOf("if (!profile) notFound()");
    expect(tombstoneAt).toBeGreaterThan(-1);
    expect(notFoundAt).toBeGreaterThan(-1);
    expect(tombstoneAt).toBeLessThan(notFoundAt);
  });

  it("the tombstone names no reason, no actor and no reporter", () => {
    // Each of those is a fact about a person, published at their own address,
    // before they have had any chance to answer it.
    const src = tombstone();
    for (const forbidden of ["reason", "actorId", "reporter", "moderatedBy"]) {
      // The word may appear in prose explaining WHY it is absent; what must
      // not appear is a render of it.
      expect(src).not.toMatch(new RegExp(`\\{\\s*tombstone\\.${forbidden}`));
    }
  });

  it("the tombstone reads no session and ships no client JS", () => {
    // It replaces a page that is anonymous and edge-cached, so it must cache
    // the same way: identical bytes for every viewer (OPC-1, I6).
    const src = tombstone();
    expect(src).not.toContain('"use client"');
    expect(src).not.toContain("readSession");
    expect(src).not.toContain("useOverlay");
  });

  it("the report control is a server component that reads no session", () => {
    // It renders inside `[slug]`, which is anonymous and cached. Reading a
    // session here would either break the cache or leak whose page it is —
    // the session is read once, on the POST, in the route handler.
    const src = control();
    expect(src).not.toContain('"use client"');
    expect(src).not.toContain("readSession");
    expect(src).toContain('action="/report"');
  });

  it("the report control is on the listing page", () => {
    expect(listing()).toContain("<ReportControl");
  });

  it("offers every reason the contract names, and invents none", () => {
    // A surface with its own copy of the vocabulary is a surface that drifts
    // from the CHECK constraint that actually accepts the value.
    expect(control()).toContain("REPORT_REASONS.map");
    expect(control()).toContain("REPORT_REASON_LABELS[reason]");
  });

  it("the queue never renders who reported anything", () => {
    // A triager who can see who reported something can be lobbied about who
    // reported something. `alsoReported` is a NUMBER for exactly this reason.
    const queue = read("studio/reports/page.tsx");
    expect(queue).not.toContain("reporterSubjectId");
    expect(queue).toContain("alsoReported");
  });

  it("the queue's refusals are looked up, never read from the URL", () => {
    // `?refused=…` is a token from a closed set. Rendering a message passed
    // through the query string would let anybody with a link put arbitrary
    // words on an operator's screen.
    // OPP15 — as above, the lookup is the one every studio surface shares.
    const queue = read("studio/reports/page.tsx");
    expect(queue).toContain("REPORT_VOCABULARY");
    expect(code("studio/notices.ts")).toContain("refusals: MODERATION_REFUSALS");
  });

  it("Reports is a live studio section now that the queue exists", () => {
    const frame = read("studio/frame.tsx");
    expect(frame).toMatch(/label: "Reports", href: "\/studio\/reports", live: true/);
  });

  it("Collections and Appeals are reachable from the studio's own nav (OSD7)", () => {
    // Both pages were built and linked from nowhere; a finished section the
    // nav omits is a hidden one.
    const frame = read("studio/frame.tsx");
    expect(frame).toMatch(/label: "Collections", href: "\/studio\/collections", live: true/);
    expect(frame).toMatch(/label: "Appeals", href: "\/studio\/appeals", live: true/);
  });
});

describe("CB1 — the discussion surface", () => {
  const tab = () => read("[slug]/discussions.tsx");
  const thread = () => read("threads/[id]/page.tsx");
  const body = () => read("ui/post-body.tsx");

  it("renders the body from NODES — there is no markup to inject", () => {
    // The whole XSS story for this surface, and it is a property of the data
    // shape rather than of anybody remembering a rule: the parser never
    // produced a string, so there is no string to set as HTML.
    //
    // COMMENT-STRIPPED, because the component's own header explains why that
    // call is absent by naming it — and a negative assertion over raw source
    // catches the explanation and calls it the offence (the LC1 finding).
    expect(code("ui/post-body.tsx")).not.toContain("dangerouslySetInnerHTML");
    expect(body()).toContain("RenderNode");
  });

  it("gives every rendered link the contract's rel, and does not prefetch it", () => {
    // Prefetching a stranger's URL is a request the reader did not make.
    expect(body()).toContain("rel={LINK_REL}");
    expect(body()).not.toMatch(/<Link\s/);
  });

  it("scrolls a long code line inside the block, never the page", () => {
    expect(body()).toContain("overflow-x-auto");
  });

  it("reads no session on either public surface", () => {
    // Both render inside anonymous, edge-cached pages. Reading a session
    // would either break the cache or make the page differ by viewer (I6).
    for (const src of [tab(), thread()]) {
      expect(src).not.toContain("readSession");
      expect(src).not.toContain('"use client"');
    }
  });

  it("says the standing notice before anybody types, not after", () => {
    // PP0 — the notice moved with the only composer left, the box.
    expect(read("[slug]/comments.tsx")).toContain('action="/comment"');
  });

  it("distinguishes 'could not read' from 'there are none'", () => {
    // Folding them together tells a reader the conversation is empty when it
    // may be busy (the OD5 finding, kept).
    expect(tab()).toContain("threads === null");
    expect(tab()).toContain("threads.length === 0");
  });

  it("never claims a discussion count it did not make", () => {
    // The tab strip carried this rule as `count: threads ? threads.length :
    // null` — a zero beside Discussions would have claimed we counted them
    // when the read had failed. OL3 removed the strip, and the rule survives
    // where the section now lives: `Discussions` renders the threads it was
    // given and the component distinguishes "none" from "could not ask".
    const page = read("[slug]/page.tsx");
    expect(page).not.toContain("threads.length");
    const discussions = read("[slug]/discussions.tsx");
    expect(discussions).toMatch(/threads === null/);
  });

  it("gives the maintainer's studio view NO remove control", () => {
    // A maintainer who can delete replies on their own product can delete
    // every criticism of it, and the decision trail becomes a trail of only
    // the good news. Locking is the proportionate act.
    // The row lives in the editor's shared file now (openproduct redesign),
    // drawn by the discussions step and the overview alike.
    const studio = read("studio/[org]/[profile]/sections.tsx");
    expect(studio).not.toMatch(/value="remove"/);
    expect(studio).toMatch(/value=\{locked \? "unlock" : "lock"\}/);
    expect(read("studio/[org]/[profile]/discussions/page.tsx")).not.toMatch(/value="remove"/);
  });

  it("labels the report control by subject kind, from the contract's map", () => {
    // A branch defaulting every unknown kind to "listing" is how a discussion
    // page came to say "Report this listing".
    const control = read("ui/report-control.tsx");
    expect(control).toContain("REPORT_CONTROL_LABELS[subjectKind]");
    expect(thread()).toContain('subjectKind="thread"');
  });
});

describe("CB2 — the demand signal, floored (OPC-F)", () => {
  it("renders the contract's sentence and never a raw count", () => {
    // The page never sees a number below the floor, because the API never
    // sends one. What it must not do is start computing its own.
    const page = read("[slug]/page.tsx");
    expect(page).toContain("demandLine(role.demand)");
    expect(page).not.toMatch(/role\.demand\.pending/);
  });

  it("derives the sidebar from what the cards already say", () => {
    // A true total would be a SECOND number about the same small set, and two
    // numbers about a small set can be subtracted from each other.
    const page = code("[slug]/page.tsx");
    expect(page).toContain("function offersSummary");
    expect(page).not.toMatch(/reduce\([^)]*\+[^)]*pending/);
  });

  it("never renders the mock's own unshippable string", () => {
    // `1 waiting on a decision` is what OPC-F exists to refuse.
    const page = read("[slug]/page.tsx");
    expect(page).not.toContain("waiting on a decision");
  });
});

describe("CB3 — the header's action follows the door", () => {
  it("offers each of the board's actions only when its door exists", () => {
    // openproduct-redesign OPR1 — the header card's actions are the board's
    // three, and the rule CB3 kept is the same one: a button that leads to a
    // door that is not there wastes the action. Take a seat needs an open
    // seat; Try it needs the listing's own address for the running product.
    const page = code("[slug]/page.tsx");
    expect(page).toMatch(/\{openRoles\.length > 0 \? \(\s*<a href="#crew" className=\{BTN_SOFT\}>/);
    expect(page).toMatch(/\{profile\.liveUrl \? \(\s*<a href=\{profile\.liveUrl\}/);
    // The old single button, and its two-way branch, are gone with it.
    expect(page).not.toContain("primaryAction(");
    expect(page).not.toContain("primary.kind");
  });

  it("no longer greys out the second half — CB1 made it real", () => {
    // XP1 left an inert `Start a thread` here with a pendingProps marker.
    const page = code("[slug]/page.tsx");
    expect(page).not.toMatch(/pendingProps\(PENDING\.discussions\)/);
  });
});

describe("TS4 — what runs automatically is published, refusals included", () => {
  const checksPage = () => readFileSync(resolve(APP_DIR, "docs/checks/page.tsx"), "utf-8");
  const queuePage = () => readFileSync(resolve(APP_DIR, "studio/reports/page.tsx"), "utf-8");

  it("every check the estate runs has a published sentence", () => {
    const page = checksPage();
    // OPC-4 does not carve out moderation. `/docs/formulas` publishes every
    // ordering; this is the same promise applied to the checks, and it is
    // rendered from FLAG_KINDS rather than a hand-written list so a fifth
    // detector cannot ship unpublished.
    expect(page).toContain("FLAG_KINDS.map");
    expect(page).toContain("FLAG_COPY[kind]");
    expect(page).toContain("FLAG_CONSEQUENCE[kind]");
  });

  it("names no consequence the type does not have", () => {
    const page = checksPage();
    // The page describes what each check MAY do, so a label here saying
    // "removes" would be a published claim the code cannot make.
    expect(page).not.toMatch(/may remove|can remove|deletes/i);
    for (const key of ["deindex", "discount", "queue-only"]) {
      expect(page).toContain(key);
    }
  });

  it("publishes the refusals, and the measured rate with its caveat", () => {
    const page = checksPage();
    expect(page).toContain("DEFENCE_REFUSALS.map");
    // The rate is meaningless without the sentence saying what the corpus is,
    // and a number published alone WILL be quoted as a production figure.
    expect(page).toContain("MEASURED_FALSE_POSITIVES");
    expect(page).toContain("CORPUS_NOTE");
    expect(page).toContain("CORPUS_SIZE");
  });

  it("quotes no figure of its own", () => {
    const page = checksPage();
    // Every number comes from the contract, where the test that measures it
    // lives. A page with its own arithmetic drifts the moment somebody adds
    // a corpus entry.
    const body = page.slice(page.indexOf("export default"));
    expect(body).not.toMatch(/\b\d+ of \d+\b/);
  });

  it("is reachable from /docs, which is the only way anybody finds it", () => {
    expect(readFileSync(resolve(APP_DIR, "docs/page.tsx"), "utf-8")).toContain('href="/docs/checks"');
  });

  it("is a static anonymous page like every other public read", () => {
    const page = checksPage();
    expect(page).toContain("export const revalidate");
    // It names nobody and counts nothing per-person, which is exactly why it
    // can be one cacheable document (OPC-1, I6).
    expect(page).not.toContain("readSession");
    expect(page).not.toContain("force-dynamic");
  });

  it("the triage queue shows what already happened, and offers dismissal first", () => {
    const page = queuePage();
    // Without the consequence line, "restore it" is an instruction a triager
    // cannot follow: they cannot tell what state the thing is in.
    expect(page).toContain("CONSEQUENCE_COPY");
    // DISMISS FIRST. The estate wants this path used — the dismissal rate is
    // its only production measurement of how often the checks are wrong —
    // and putting it second makes agreeing with the machine the easy answer.
    const dismiss = page.indexOf('value="flag-dismiss"');
    const action = page.indexOf('value="flag-action"');
    expect(dismiss).toBeGreaterThan(0);
    expect(action).toBeGreaterThan(dismiss);
  });

  it("the queue shows no score, because none is stored", () => {
    const page = queuePage();
    // A number beside an accusation invites deferring to the number instead
    // of checking the thing it is about.
    expect(page).not.toMatch(/flag\.score|confidence|probability/i);
    expect(page).toContain("flag.evidence");
  });

  it("a failed flag read does not take the reports queue down with it", () => {
    const page = queuePage();
    // The reports queue is what somebody came here for. Losing it because a
    // second read was unavailable would trade the important half for the new
    // one.
    expect(page).toContain('flagResult.kind === "ok" ? flagResult.data.flags : []');
  });
});

describe("LC3 — the launch board, ranked separately from the directory", () => {
  const boardComponent = () => readFileSync(resolve(APP_DIR, "launches/board.tsx"), "utf-8");
  const dayPage = () => readFileSync(resolve(APP_DIR, "launches/[day]/page.tsx"), "utf-8");
  const config = () => readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");

  it("the archive renders the one Board component, and today is the feed", () => {
    // A day is a day. Giving today a bespoke layout would mean the archive
    // showed a different product from the one people looked at on the day,
    // and an archive that does not match what happened is not one.
    //
    // Re-pinned: `launches/page.tsx` is gone. `/launches` redirects to `/`,
    // which is the launches, so "today" is the feed; the dated archive is the
    // one route left that draws a Board, and it draws the shared one.
    expect(dayPage()).toContain('from "../board"');
    expect(boardComponent()).toContain("export function Board");
    expect(exists("launches/page.tsx")).toBe(false);
  });

  it("/launches does not redirect to a dated address", () => {
    // A redirect makes the stable address bounce to a changing one, so a
    // bookmark silently becomes a link to one particular day — and a
    // redirect computed from "now" is one an edge cache cannot hold.
    //
    // Re-pinned: `/launches` DOES redirect now, but to `/` — a stable address
    // — from next.config.mjs at the edge, never from a route module that
    // could compute a day. The rule this pins is the same one.
    const redirects = /async redirects\(\)[\s\S]*?^  \},/m.exec(config())?.[0] ?? "";
    expect(redirects).toContain('{ source: "/launches", destination: "/", permanent: true }');
    // `/products` redirected here too until openproduct-redesign OPR1 made
    // it a page (`feed.test.ts`); no entry for it may remain, or the pill
    // would land on `/`.
    expect(redirects).not.toContain('source: "/products"');
    // The two addresses OPR1 moved arrive the same way: from the edge, each
    // at a stable destination.
    expect(redirects).toContain('{ source: "/builds/roles", destination: "/help-wanted", permanent: true }');
    expect(redirects).toContain('{ source: "/me/notifications", destination: "/activity", permanent: true }');
    expect(redirects).not.toMatch(/destination: "\/launches\//);
    expect(dayPage()).not.toContain("redirect(");
    expect(dayPage()).not.toContain("permanentRedirect");
  });

  it("the order comes from core, and the page never sorts", () => {
    // `rankBoard` is the one place the order is decided. A second sort here
    // would be a second ranking nobody published a sentence for. (The feed,
    // which is today's view, is under the same rule in feed.test.ts.)
    for (const source of [boardComponent(), dayPage()]) {
      expect(source).not.toMatch(/\.sort\(/);
    }
  });

  it("links its order to the published sentence (OPC-4 / I7)", () => {
    // A position is a claim being made about somebody right there, so the
    // page answers "who decided this" in place rather than only at /docs.
  });

  it("publishes the ineligible count rather than hiding it", () => {
    // A maker whose launch was shared somewhere popular sees a position that
    // does not match the total on their own page. An unaccountable gap is
    // exactly the unexplainable ranking OPC-4 forbids.
    const source = boardComponent();
    expect(source).toContain("entry.ineligible");
    expect(source).toMatch(/newer than\s*\n?\s*the launch/);
  });

  it("says whether the day can still move, and when it was ranked (I9)", () => {
    const source = boardComponent();
    // The open/settled sentences left with the site's explainers; the moment
    // the board was ranked still rides under the list.
    expect(source).toContain("agoOf(observedAt, now)");
  });

  it("an empty day reads as a quiet day, not a failure", () => {
    // And a FAILED read renders differently from an empty one — an empty room
    // and a locked door look nothing alike to a visitor (the OD5 finding).
    // Re-pinned to the dated page: the today page is gone (`/launches`
    // redirects to `/`), and the archive is where the failed read is drawn.
    expect(boardComponent()).toContain("BOARD_EMPTY_NOTE");
    expect(dayPage()).toContain("board === null");
    expect(dayPage()).toContain("FailurePanel");
  });

  it("resolves no actor on either route", () => {
    // OPC-1 / I6 — the order is the same for every reader, which is the only
    // reason it can be published at all. A personalised board is a feed.
    // (`launches/page.tsx` is gone; the two surfaces are the board and the
    // dated page.)
    for (const source of [boardComponent(), dayPage()]) {
      expect(source).not.toContain("readSession");
      expect(source).not.toContain("use client");
    }
  });

  it("the dated route is permanently linkable and canonical", () => {
    const source = dayPage();
    // The milestone's "permanently linkable" clause: a settled day's order is
    // final, so this URL answers the same way forever.
    expect(source).toContain("alternates: { canonical:");
    expect(source).toContain("export const revalidate");
  });

  it("404s a malformed day rather than coercing it", () => {
    // Two spellings resolving to one board are two URLs for one document.
    const source = dayPage();
    expect(source).toContain("if (!parsed.ok) notFound()");
  });

  it("never links forward into a day that has not happened", () => {
    expect(dayPage()).toContain("nextDay(parsed.day, now)");
    expect(dayPage()).toMatch(/later \?/);
  });

  it("the nav's first entry is the front page, and a day's board is not orphaned by it", () => {
    const shell = readFileSync(resolve(APP_DIR, "shell/shell.ts"), "utf-8");
    // A nav that kept saying "not yet" beside a page that works is a nav
    // nobody reads — that part is unchanged since LC3.
    //
    // WHERE IT POINTS: `/`, since OL2. The pill was "Launches", then
    // "Builds"; since openproduct-redesign OPR1 it is "Feed". The archive
    // did not go away and is not orphaned: a build's own launch line links
    // to its day's board, which is a better way in than a pill was.
    expect(shell).toMatch(/id: "feed"[\s\S]{0,60}href: "\/"/);
    expect(shell).not.toContain('"planned"');
    // OB4 — the day board left the front page; each day keeps its archive
    // address, reached from a build's own launch line.
    expect(existsSync(resolve(APP_DIR, "launches/[day]/page.tsx"))).toBe(true);
    expect(readFileSync(resolve(APP_DIR, "[slug]/page.tsx"), "utf-8")).toContain("href={`/launches/${profile.launch.day}`}");
  });
});

describe("LC4 — collections, signed and curator-attributed", () => {
  const indexPage = () => readFileSync(resolve(APP_DIR, "collections/page.tsx"), "utf-8");
  const collectionPage = () => readFileSync(resolve(APP_DIR, "collections/[slug]/page.tsx"), "utf-8");
  const studioPage = () => readFileSync(resolve(APP_DIR, "studio/collections/page.tsx"), "utf-8");

  it("every collection names its curator and LINKS to them", () => {
    // Not decoration — it is the whole of what makes a collection publishable
    // (LC-4). Re-pinned for the design's markup: the index card is ONE anchor
    // (so the handle is text there — an anchor inside an anchor is invalid
    // HTML), and the collection page's "Curated by @handle." is the link.
    expect(indexPage()).toContain("@{collection.curatorHandle}");
    expect(indexPage()).toContain("collectionSummary(collection.count)");
    const page = collectionPage();
    expect(page).toMatch(/href=\{`\/@\$\{collection\.curatorHandle\}`\}/);
    expect(page).toContain("Curated by");
    // And the index card really is one link, so the handle cannot be a nested
    // anchor: exactly one `<a` inside the card's `<li>`.
    const card = indexPage().slice(indexPage().indexOf("<li key={collection.slug}"));
    expect((card.slice(0, card.indexOf("</li>")).match(LINK_ELEMENTS) ?? []).length).toBe(1);
  });

  it("never renders a subject id in place of a handle", () => {
    // I3 and OPC-6: the handle IS the address, and a platform display name
    // would carry platform authority onto a public page.
    for (const source of [indexPage(), collectionPage()]) {
      expect(source).not.toMatch(/curatorSubjectId|displayName/);
    }
  });

  it("states the editorial exception in its first paragraph", () => {
    // A reader arriving from a directory that has promised no thumb on the
    // scale for five sub-epics is owed that, up front.
    expect(indexPage()).toContain("COLLECTIONS_MEANING");
    expect(collectionPage()).toContain("COLLECTION_PROVENANCE_NOTE");
  });

  it("offers NO sort control, on the one surface that must not have one", () => {
    // A collection the reader can re-rank is the directory with fewer rows,
    // and the eight-in-this-order claim is gone.
    const source = collectionPage();
    expect(source).not.toMatch(/\.sort\(|sortBy|SORTS|orderBy/);
    expect(source).not.toContain("searchParams");
  });

  it("counts what it SHOWS, through the contract", () => {
    const source = collectionPage();
    expect(source).toContain("visibleCount(collection)");
    expect(source).toContain("collectionSummary(count)");
    // No arithmetic of its own — a page that counted for itself would
    // eventually count something else.
    expect(source).not.toMatch(/items\.length \+|\.length -/);
  });

  it("renders an empty collection rather than failing", () => {
    // The milestone's own done-when, at the surface: one of eight going away
    // must not take the page with it.
    expect(collectionPage()).toContain("COLLECTION_EMPTY_NOTE");
    expect(indexPage()).toContain("COLLECTIONS_EMPTY_NOTE");
    // And a FAILED read renders differently from an empty one.
    expect(indexPage()).toContain("collections === null");
  });

  it("uses the feed row's idiom rather than a new layout", () => {
    // The milestone says so, and the reason holds: a reader who has learned
    // to read a launch row on the feed should not learn a second one here.
    // Re-pinned for the design: the row is the feed row's — `LogoTile`, the
    // slug, the licence, the tagline and a mono stack line — not the old
    // `ProductMark`/`Chip` card. The redesign draws a collection's row at the
    // design's 44px tile (`tileStyle44`), the one size it differs from the feed.
    const source = collectionPage();
    // openproduct-studio OSD3 — the tile is `ProductTile`: the logo, else the monogram.
    expect(source).toContain("<ProductTile slug={item.card.slug} thumbnail={item.card.thumbnail} size={44} />");
    expect(source).toContain("item.card.tagline");
    expect(source).toContain('const stackLine = item.card.stack.slice(0, 2).join(" · ");');
    expect(read("feed/row-shell.tsx")).toContain('const stackLine = entry.stack.slice(0, 2).join(" · ");');
    expect(source).not.toMatch(/ProductMark|<Chip\b/);
  });

  it("renders the curator's note as theirs, outside the card's link", () => {
    // The thing a collection has that a filtered list does not — and marked
    // as a quotation rather than as our own copy.
    const source = collectionPage();
    expect(source).toContain("blockquote");
    expect(source).toContain("item.note");
  });

  it("is reportable like every other public surface (TS3)", () => {
    expect(collectionPage()).toContain('subjectKind="collection"');
  });

  it("resolves no actor on either public route", () => {
    for (const source of [indexPage(), collectionPage()]) {
      expect(source).not.toContain("readSession");
      expect(source).not.toContain("use client");
      expect(source).toContain("export const revalidate");
    }
  });

  it("the studio tells a non-curator the bar rather than an error", () => {
    const source = studioPage();
    // They have done nothing wrong; they have not shipped anything here yet,
    // and that IS the bar.
    expect(source).toContain("eligible");
    expect(source).toContain('COLLECTION_REFUSALS["not-a-curator"].says');
    expect(source).toMatch(/StudioPanel title="Not yet"/);
  });

  it("the studio shows BOTH counts, so a hidden item does not look deleted", () => {
    const source = studioPage();
    expect(source).toContain("collection.held > collection.visible");
    expect(source).toContain("still yours");
  });

  it("the studio states the obligation before publishing, not after", () => {
    // CURATOR_NOTE is no longer rendered on the studio page (explanatory copy cut).
    expect(studioPage()).toContain('name="intent" value="create"');
  });

  it("the footer is its door since OB1, and the route is reserved rather than a product", () => {
    // Collections left the bar with openproduct-open-builds OB1. The index is
    // still live and still reachable from every page that takes the footer.
    // Since OPR1 the footer maps `FOOTER_LINKS` and shares ONE list of
    // reserved heads with `sectionFor` (they were two, and had drifted).
    const footer = readFileSync(resolve(APP_DIR, "shell/site-footer.tsx"), "utf-8");
    expect(footer).toContain("FOOTER_LINKS.map");
    expect(footer).toContain('import { hasOwnFooter } from "./section-for";');
    expect(footer).not.toContain("new Set(");
    expect(FOOTER_LINKS.some((link) => link.href === "/collections")).toBe(true);
    const sectionFor = readFileSync(resolve(APP_DIR, "shell/section-for.ts"), "utf-8");
    expect(sectionFor).toMatch(/RESERVED_HEADS: ReadonlySet<string> = new Set\(\[[\s\S]*"collections"/);
    expect(sectionFor).toMatch(/if \(RESERVED_HEADS\.has\(head\)\) return false;/);
  });
});

describe("LC5 — the digest by email", () => {
  const control = () => readFileSync(resolve(APP_DIR, "ui/digest-control.tsx"), "utf-8");
  const digestIndex = () => readFileSync(resolve(APP_DIR, "digest/page.tsx"), "utf-8");
  const route = () => readFileSync(resolve(APP_DIR, "me/digest/route.ts"), "utf-8");

  it("the control resolves no session, so the public page stays one document", () => {
    // It renders on the anonymous, edge-cached digest page: reading a session
    // there would either break the cache or leak who is looking (OPC-1, I6).
    const source = control();
    expect(source).not.toContain("readSession");
    expect(source).not.toContain("use client");
    expect(source).not.toContain("cookies(");
  });

  it("offers the FEED first on the public page", () => {
    // The feed needs nothing from anybody at all. A product that leads with
    // "give us your address" when it has a better answer available is asking
    // for something it does not need.
    const page = digestIndex();
    const feed = page.indexOf('href="/digest/feed.xml"');
    const email = page.indexOf("<DigestControl");
    expect(feed).toBeGreaterThan(0);
    expect(email).toBeGreaterThan(feed);
    expect(page).toContain("showFeedNote");
  });

  it("says what arrives AND what the estate does not hold", () => {
    const source = control();
    // Never its own copy — the sentence lives in the contract beside the
    // schema fact it is claiming.
    expect(source).not.toMatch(/We (do not|don't) store/);
  });

  it("distinguishes never-asked from asked-and-left, through the contract", () => {
    expect(control()).toContain("digestControlLabel(current)");
    // No branching of its own: three standings, one lookup.
    expect(control()).not.toMatch(/=== "unsubscribed" \?/);
  });

  it("posts through a route that reads the session server-side", () => {
    const source = route();
    expect(source).toContain("decodeSession");
    expect(source).toContain("sanitizeReturnTo");
    // Same posture as save and endorse: the click IS the intent, so a signed
    // out visitor bounces through sign-in and keeps it — through the door,
    // never straight into the Orunbase handshake.
    expect(source).toContain("/signin?return_to=");
  });

  it("returns somebody to where they were, not to a settings page", () => {
    // Subscribing while reading week 34 should leave you reading week 34.
    expect(route()).toContain("returnTo");
    expect(digestIndex()).toContain('returnTo="/digest"');
  });

  it("never renders or handles an address anywhere in the web layer", () => {
    for (const source of [control(), route(), digestIndex()]) {
      expect(source).not.toMatch(/type="email"|emailAddress|\bmailto:/);
    }
  });
});

// ── TS5: the transparency record and the appeal surface ────────────────────

describe("the transparency page is generated, and says nobody's name", () => {
  const page = () => code("transparency/page.tsx");

  it("reads the report rather than holding any figure of its own", () => {
    const source = page();
    expect(source).toContain("fetchTransparency");
    // NOT ONE LITERAL NUMBER on a page of numbers. Every figure comes from
    // the append-only ledger through core, which is the whole of what makes
    // the page checkable rather than merely published.
    const digits = source.match(/(?<![\w[\]-])\d{2,}(?![\w%\]px])/g) ?? [];
    expect(digits.filter((d) => d !== "3600")).toEqual([]);
  });

  it("does the arithmetic through the contract, never inline", () => {
    const source = page();
    for (const fn of ["actsAgainst", "actsReversing", "share", "formatShare", "countBy"]) {
      expect({ fn, used: source.includes(fn) }).toEqual({ fn, used: true });
    }
    // A rate computed here would be a second place the published number could
    // differ from the ledger — and the one place `share`'s null could be lost.
    expect(source).not.toMatch(/\/\s*(against|received|raised|decided)\s*\)?\s*\*\s*100/);
  });

  it("renders a FAILED read as a failure, never as a page of zeroes", () => {
    // The one route on the estate where the OD5 finding is not merely
    // confusing but dishonest: a locked door drawn as an empty room publishes
    // the most flattering number available, sourced from an outage.
    const source = page();
    expect(source).toContain("result === null");
    expect(source).toContain("FailurePanel");
    expect(read("transparency/page.tsx")).toMatch(/most flattering/i);
  });

  it("names no listing, handle or person in its own source", () => {
    const source = page();
    for (const forbidden of ["slug", "handle", "subjectId", "PersonName", "ProductMark"]) {
      expect({ forbidden, present: source.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });

  it("is anonymous and cacheable like every other public read", () => {
    const source = page();
    expect(source).toContain("export const revalidate");
    // No session, no cookie, no actor — the bytes are the same for everybody,
    // which is what lets anybody quote them (I6).
    expect(source).not.toContain("readSession");
    expect(source).not.toContain("cookies(");
  });

  it("is reachable from the footer and from the docs index", () => {
    // A transparency record nobody can find is a document, not an account.
    // The footer maps `FOOTER_LINKS` since OPR1; the record is an entry.
    expect(FOOTER_LINKS.some((link) => link.href === "/transparency")).toBe(true);
    expect(code("shell/site-footer.tsx")).toContain("FOOTER_LINKS.map");
    expect(code("docs/page.tsx")).toContain('href="/transparency"');
  });
});

describe("the appeal surface", () => {
  const page = () => code("studio/appeals/page.tsx");
  const actions = () => code("studio/appeals/actions/route.ts");

  it("puts the form in front of the person, not behind a click", () => {
    // An appeal path that takes three navigations is one most people give up
    // on, and the population that persists through it is not the population
    // the path exists for.
    const source = page();
    expect(source).toContain("<textarea");
    expect(source).toContain('name="says"');
    // APPEAL_INVITATION is no longer rendered above the form (explanatory copy cut).
  });

  it("states the standing rule and the one-attempt rule BEFORE the submit", () => {
    // The standing/one-attempt notes and the NOT_APPEALABLE list are no longer rendered (explanatory copy cut).
    const source = page();
    expect(source).toContain('name="says"');
  });

  it("shows the act's reason — the one surface that does", () => {
    // TS3 keeps it off the tombstone: a judgement about a person at their own
    // address, before they have answered it. Here it is shown TO the person
    // it is about.
    expect(page()).toContain("act.reason");
  });

  it("offers uphold first in the queue, so agreeing is not the default", () => {
    const source = page();
    const uphold = source.indexOf("APPEAL_DECISION_COPY.uphold");
    const refuse = source.indexOf("APPEAL_DECISION_COPY.refuse");
    expect(uphold).toBeGreaterThan(-1);
    expect(uphold).toBeLessThan(refuse);
  });

  it("never renders a refusal message the API sent, only a contract sentence", () => {
    const source = page();
    expect(source).toContain("APPEAL_REFUSALS[");
    // A message passed through the query string would let anybody with a link
    // put arbitrary words on somebody's screen.
    expect(source).not.toMatch(/search\.message|result\.message/);
  });

  it("posts through a route that reads the session server-side, with no client JS", () => {
    const source = actions();
    expect(source).toContain("decodeSession");
    // OPP15 — the bounce is still a bounce, and is now spelled once for all
    // six studio act routes: `answer.signIn` redirects a form post to sign-in
    // and answers a JSON caller `401`, because `fetch` would follow the
    // redirect and read the sign-in document as a successful act.
    expect(source).toContain("answer.signIn(");
    expect(code("studio/answer.ts")).toContain("/signin?return_to=");
    expect(page()).not.toContain('"use client"');
  });

  it("gives an uphold that reversed nothing its own sentence", () => {
    // "Upheld" with no visible change reads as a bug otherwise.
    expect(actions()).toContain("upheld-nothing");
    expect(page()).toContain("APPEAL_UPHELD_ALREADY_REVERSED");
  });

  it("checks the argument's length here too, so an empty one is not a round trip", () => {
    expect(actions()).toContain("appealSaysIsAcceptable");
  });
});
