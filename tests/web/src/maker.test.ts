// The maker page and its three tabs (openproduct-launch MP0).
//
// The TAB VOCABULARY is pinned in packages/contracts, the READS in
// packages/db and the HANDLER in tests/core. What is pinned here is what the
// web layer owns:
//
//   - three addresses, one body, and the tab is a path segment not a query
//   - both routes are cacheable, which is what a path segment buys
//   - each tab is a LINK, not a button that swaps client state
//   - the counters are the tabs' own numbers, never `rows.length`
//   - CG4's three numbers kept their published sentences when they moved
//   - a save has no tab, and the page never reads one
//   - it renders no actor (I6)

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAKER_COUNTER_FORMULAS,
  MAKER_TABS,
  MAKER_TAB_LABELS,
  PROFILE_STAT_FORMULAS,
  makerPath,
} from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

/** The file with its comments removed — a guard about markup must not read
 *  prose, because the comment above a decision names the thing it rejected. */
const markupOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const BARE = "people/[handle]/page.tsx";
const TAB = "people/[handle]/[tab]/page.tsx";
const VIEW = "people/[handle]/maker-view.tsx";

describe("three addresses, one body", () => {
  it("both routes render the SAME component", () => {
    // The header, the counters and the tab strip cannot drift between tabs if
    // there is only one of each.
    for (const file of [BARE, TAB]) {
      expect([file, read(file).includes("<MakerView")]).toEqual([file, true]);
    }
  });

  it("the tab is a PATH SEGMENT, and neither route reads searchParams", () => {
    // A page that reads `searchParams` is dynamic: its `revalidate` is
    // accepted and silently ignored and every response goes out `no-store`.
    // UV2 shipped exactly that and the budget lane caught it reading the
    // response header rather than the source.
    for (const file of [BARE, TAB, VIEW]) {
      expect([file, /searchParams/.test(read(file))]).toEqual([file, false]);
    }
    expect(makerPath("ada", "upvoted")).toBe("/@ada/upvoted");
  });

  it("both routes declare a revalidate AND generateStaticParams", () => {
    // In Next 15 a dynamic segment enters the prerender manifest — the
    // registry the ISR cache is keyed from — only when it declares this
    // function. Without it the `revalidate` beside it does nothing.
    for (const file of [BARE, TAB]) {
      const src = read(file);
      expect([file, /export const revalidate = \d+;/.test(src)]).toEqual([file, true]);
      expect([file, /export (?:async )?function generateStaticParams\(/.test(src)]).toEqual([
        file,
        true,
      ]);
    }
  });

  it("`launched` has no address of its own", () => {
    // `/@ada/launched` and `/@ada` would be two addresses for one document.
    expect(read(TAB)).toContain('parsed === "launched"');
    expect(read(TAB)).toContain("if (tab === null) notFound();");
  });

  it("each tab canonicalises to ITSELF, because they are three documents", () => {
    const view = read(VIEW);
    expect(view).toContain("alternates: { canonical:");
    expect(view).toContain("`/@${doc.contributor.handle}/${tab}`");
  });
});

describe("the tab strip", () => {
  it("is LINKS, not buttons that swap client state", () => {
    // Each tab is a different document at a different address, so it can be
    // opened in a new tab, bookmarked, sent to somebody and crawled. UV2's
    // range switch made the same call and the a11y lane pins it there.
    // `<AppLink>` since OPP1 — still an anchor in the document, now with a
    // client-side navigation behind it. What this pins is unchanged: a link,
    // never a button that swaps state without changing the address.
    const strip = markupOf("people/[handle]/maker-tabs.tsx");
    expect(strip).toContain("<AppLink");
    expect(strip).not.toContain("<button");
    expect(strip).toContain("makerPath(handle, tab)");
  });

  it("marks the current tab rather than removing its link", () => {
    const strip = markupOf("people/[handle]/maker-tabs.tsx");
    expect(strip).toContain('"aria-current": "page"');
  });

  it("names all four, from the contract", () => {
    const strip = read("people/[handle]/maker-tabs.tsx");
    expect(strip).toContain("MAKER_TABS.map");
    expect(strip).toContain("MAKER_TAB_LABELS[tab]");
    // PE1 — History is the fourth.
    // OB6 — the default tab is Builds (id `launched`, the bare address).
    expect(Object.values(MAKER_TAB_LABELS)).toEqual(["Builds", "Upvoted", "Comments", "History"]);
  });

  it("takes its counts from the DOCUMENT, never from `rows.length`", () => {
    // `rows` is the truncated list. A tab counting it would disagree with
    // itself the moment somebody has more than the page shows.
    const strip = markupOf("people/[handle]/maker-tabs.tsx");
    expect(strip).not.toContain("rows.length");
    // OB6 — the Builds tab counts the listings the person runs, from the
    // document's own array, never the rows on screen.
    expect(strip).toContain("countOf(counts, tab, builds)");
    expect(markupOf("people/[handle]/maker-view.tsx")).toContain("builds={person.maintains.length}");
  });

  it("the page says so when the list is shorter than the count", () => {
    const rows = markupOf("people/[handle]/maker-rows.tsx");
    expect(rows).toContain("makerTruncationNote(");
  });
});

describe("the numbers", () => {
  it("the design's three are in the header, each with its sentence", () => {
    const view = read(VIEW);
    for (const counter of ["launched", "followers", "upvotesGiven"]) {
      expect([counter, view.includes(`MAKER_COUNTER_FORMULAS.${counter}`)]).toEqual([
        counter,
        true,
      ]);
    }
  });

  it("the follower count is read from ONE place", () => {
    // FL0 publishes it on the contributor projection; a second copy in a
    // second shape is a second number that can be wrong.
    const view = markupOf(VIEW);
    expect(view).toContain("person.followers");
    expect(view).not.toContain("counts.followers");
  });

  it("CG4's numbers kept their sentences when they left their cards", () => {
    // MP0 moved `maintains` and `contributesTo` onto the heading of the
    // section that lists what they count, and `since` into the byline. A
    // number losing its `?` was never on the table (OPC-4, I7).
    // OB6 — `maintains` is the header's Builds count now, through MP0's
    // mapping, which names the same sentence.
    expect(MAKER_COUNTER_FORMULAS.launched).toBe(PROFILE_STAT_FORMULAS.maintains);
    expect(read(VIEW)).toContain("formula={MAKER_COUNTER_FORMULAS.launched}");
    expect(read(BARE)).toContain("formula={PROFILE_STAT_FORMULAS.contributesTo}");
    expect(read(VIEW)).toContain("formula={PROFILE_STAT_FORMULAS.since}");
    // And the `?` is a real anchor rather than a tooltip.
    expect(read("ui/bits.tsx")).toContain("href={formulaHref(formula)}");
  });

  it("`reviews` still has no number anywhere", () => {
    // Nothing observes per-person reviews. A dash would be a column about
    // somebody's work that says nothing; the rule stays published instead.
    for (const file of [BARE, VIEW]) {
      expect([file, /reviews/.test(markupOf(file))]).toEqual([file, false]);
    }
  });
});

describe("what has no tab", () => {
  it("a SAVE does not, and the page never reads one", () => {
    // EN0 split the save from the endorsement so the private gesture would
    // stay private. Every row in `saved_products` was created under a promise
    // nobody can now be asked to renew.
    expect(MAKER_TABS).not.toContain("saved");
    for (const file of [BARE, TAB, VIEW, "people/[handle]/maker-rows.tsx"]) {
      expect([file, /saved|savedCount/.test(read(file))]).toEqual([file, false]);
    }
  });

  it("an upvote that does not count yet says so rather than being hidden", () => {
    const rows = read("people/[handle]/maker-rows.tsx");
    expect(rows).toContain("row.counting");
    expect(rows).toContain("not counted yet");
  });

  it("a day with no board figures gets no ordinal", () => {
    const rows = read("people/[handle]/maker-rows.tsx");
    expect(rows).toContain("row.rank === null");
  });
});

describe("I6 — one document with no actor in it", () => {
  it("nothing on these routes is a client component", () => {
    for (const file of [BARE, TAB, VIEW, "people/[handle]/maker-tabs.tsx", "people/[handle]/maker-rows.tsx"]) {
      expect([file, read(file).includes('"use client"')]).toEqual([file, false]);
    }
  });

  it("no route reads a cookie, a header or a session", () => {
    for (const file of [BARE, TAB, VIEW]) {
      expect([file, /cookies\(|headers\(|op_session|readSession/.test(read(file))]).toEqual([
        file,
        false,
      ]);
    }
  });

  it("reads ONE document per address", () => {
    // The header, all three counts and one list arrive together, so the most
    // linked-to surface on the estate still costs one round trip.
    //
    // TWO CALL SITES, ONE ROUND TRIP: `generateMetadata` reads the same
    // document the body does and Next dedupes the fetch. What this pins is
    // that `loadMaker` is the ONLY read either route makes — a second
    // `fetch*` here would be a second round trip nobody deduped.
    for (const file of [BARE, TAB]) {
      const reads = new Set(read(file).match(/await (?:load|fetch)[A-Z]\w*\(/g));
      expect([file, [...reads]]).toEqual([file, ["await loadMaker("]]);
    }
  });
});
