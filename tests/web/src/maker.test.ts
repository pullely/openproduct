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

  it("names all four, from the contract — and the first as the site names it", () => {
    const strip = read("people/[handle]/maker-tabs.tsx");
    expect(strip).toContain("MAKER_TABS.map");
    // PE1 — History is the fourth.
    // OB6 — the default tab is id `launched`, the bare address.
    expect(Object.values(MAKER_TAB_LABELS)).toEqual(["Builds", "Upvoted", "Comments", "History"]);
    // openproduct-redesign OPR1 — the board's pill for what a person runs is
    // *Products*, the navigation's own word. The page renames that ONE label
    // over the contract's and takes the other three as they are, so a fifth
    // tab still arrives named.
    expect(strip).toMatch(
      /export const SECTION_LABELS: Record<MakerTab, string> = \{\s*\.\.\.MAKER_TAB_LABELS,\s*launched: "Products",\s*\};/,
    );
    expect(strip).toContain("{SECTION_LABELS[tab]}");
    expect(strip).not.toContain("{MAKER_TAB_LABELS[tab]}");
    // …and a section's title in the browser tab says the same word.
    expect(read(VIEW)).toContain("`${title} · ${SECTION_LABELS[tab]}`");
  });

  it("draws them as the board's pills in the profile card, the current one ink", () => {
    const strip = markupOf("people/[handle]/maker-tabs.tsx");
    expect(strip).toContain('aria-label="Profile sections"');
    expect(strip).toContain("${SECTION_PILL} ${isCurrent ? SECTION_PILL_ON : SECTION_PILL_OFF}");
    const design = read("ui/design.ts");
    expect(design).toContain('export const SECTION_PILL_ON = "bg-primary font-semibold text-primary-foreground";');
    // 36px, and 44px where the pointer is a finger.
    expect(design).toMatch(/export const SECTION_PILL =\s*"inline-flex h-\[36px\][^"]*rounded-full[^"]*max-sm:h-\[44px\]/);
    // A count is said only above zero.
    expect(strip).toMatch(/\{count > 0 \? \(/);
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

// openproduct-redesign OPR1 — the profile card of boards `Person` and
// `PhonePerson`: the maker's public profile, on the data a person has today.
describe("the profile card is the board's", () => {
  const view = markupOf(VIEW);
  const card = view.slice(view.indexOf('<section aria-label="Profile"'), view.indexOf("</section>", view.indexOf("<MakerTabs")));

  it("has ONE h1 across the page, and it is the person's name in the page title", () => {
    const rows = "people/[handle]/maker-rows.tsx";
    const pieces = [BARE, TAB, VIEW, "people/[handle]/maker-tabs.tsx", rows, "people/[handle]/product-rows.tsx"];
    const count = pieces.reduce((sum, file) => sum + (markupOf(file).match(/<h1\b/g) ?? []).length, 0);
    expect(count).toBe(1);
    expect(card).toContain("<h1 className={`${PAGE_TITLE} break-words`}>{title}</h1>");
  });

  it("draws the cover band, the round mark over it, the name, their line and the facts", () => {
    const order = ["className={COVER_PERSON}", "{initialsOf(title)}", "<h1", "{person.bio}", "Maker of", "on openproduct since"].map(
      (mark) => card.indexOf(mark),
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The board's 92px mark with the card's colour ringed round it; 72px on a
    // phone.
    expect(card).toMatch(/h-\[92px\] w-\[92px\][^"]*rounded-full[^"]*ring-\[5px\] ring-card[^"]*max-sm:h-\[72px\]/);
    const design = read("ui/design.ts");
    expect(design).toMatch(/export const COVER_PERSON =\s*"h-\[120px\][^"]*max-sm:h-\[72px\]"/);
  });

  it("says Maker of N products from the list the Products pill opens, and only when there is one", () => {
    expect(card).toMatch(/\{products > 0 \? \(/);
    expect(view).toContain("const products = person.maintains.length;");
    expect(card).toMatch(/Maker of\{" "\}\s*<StatInline\s+value=\{person\.maintains\.length\}\s+label=\{products === 1 \? "product" : "products"\}/);
    // A count that is zero is not said.
    expect(card).toMatch(/\{person\.followers > 0 \? \(/);
    expect(card).toMatch(/\{doc\.counts\.upvotesGiven > 0 \? \(/);
  });

  it("carries ONE Follow, and it follows the PERSON", () => {
    // Owner rule 3: a person is followed only from their own profile. One
    // control, in the card, of kind `person`, on their handle.
    const follows = [BARE, TAB, VIEW, "people/[handle]/maker-rows.tsx", "people/[handle]/product-rows.tsx"].flatMap(
      (file) => markupOf(file).match(/<FollowButton\b[\s\S]*?\/>/g) ?? [],
    );
    expect(follows).toHaveLength(1);
    expect(follows[0]).toMatch(/kind="person"\s+value=\{person\.handle\}/);
    expect(follows[0]).toContain("returnTo={`/@${person.handle}`}");
    expect(card).toContain(follows[0]);
    // …and nothing on the page follows a product: the rows link to them.
    expect(view).not.toContain('kind="listing"');
    // The board's ink button; the product page's Follow is the outlined one.
    // Both are variants of the control itself (`size="hero"` and a `tone`),
    // not selectors wrapped round it from outside.
    expect(follows[0]).toMatch(/size="hero"\s+tone="ink"/);
    expect(markupOf("[slug]/page.tsx")).toMatch(/size="hero"\s+tone="outline"/);
    expect(read("ui/design.ts")).not.toContain("FOLLOW_PILL");
    const control = markupOf("ui/follow-button.tsx");
    expect(control).toContain('"h-[40px] justify-center px-5 text-[15px] font-semibold max-sm:h-[44px] max-sm:w-full"');
    expect(control).toContain('tone?: "plain" | "outline" | "ink";');
    expect(markupOf("[slug]/page.tsx")).toMatch(/<FollowButton\s+kind="listing"\s+value=\{profile\.slug\}/);
  });

  it("puts the sections in the card's bottom edge, and keeps every address the page had", () => {
    expect(card).toContain("<MakerTabs handle={person.handle} current={doc.tab} counts={doc.counts}");
    // The tab and cursor routes are where they were.
    expect(read(TAB)).toContain("parseMakerTab(raw)");
    expect(read("people/[handle]/[tab]/[cursor]/page.tsx")).toContain("parseHistoryCursor(rawCursor)");
    expect(view).toContain("makerHistoryPath(person.handle, doc.nextCursor)");
    expect(MAKER_TABS.map((tab) => makerPath("ada", tab))).toEqual([
      "/@ada",
      "/@ada/upvoted",
      "/@ada/comments",
      "/@ada/history",
    ]);
  });
});

describe("what a person did is flat cards, and what they run is rows", () => {
  it("draws each act as a card of its own, not a ruled row", () => {
    const rows = markupOf("people/[handle]/maker-rows.tsx");
    expect(rows).toContain('<ul className="m-0 grid list-none gap-[18px] p-0 max-sm:gap-2.5">');
    expect(rows).toContain("${BOARD_CARD}");
    expect(rows).not.toMatch(/border-t border-line/);
    expect(rows).not.toMatch(/border-dashed/);
    expect(rows).toContain("data-keyrow");
  });

  it("lists their products as rows that are links to the product pages", () => {
    const products = markupOf("people/[handle]/product-rows.tsx");
    expect(products).toContain("href={`/${listing.slug}`}");
    expect(products).toContain("min-h-[56px]");
    expect(products).not.toContain('"use client"');
    // The bare page lists them; every other section keeps them in the side
    // card (board `Person`), under one heading.
    const view = markupOf(VIEW);
    expect(view).toMatch(/<h2 id="maker-products" className=\{SIDE_TITLE\}>\s*Products\s*<\/h2>/);
    expect(view).toContain("<ProductRows listings={person.maintains} />");
  });

  it("copies no placeholder off the board", () => {
    for (const file of [BARE, TAB, VIEW, "people/[handle]/maker-tabs.tsx", "people/[handle]/maker-rows.tsx"]) {
      expect([file, /\[(Maker of|Their one-line|Your name|date|n)\b[^\]]*\]/.test(markupOf(file))]).toEqual([file, false]);
      expect([file, /Welcome to openproduct/.test(markupOf(file))]).toEqual([file, false]);
    }
  });
});

describe("nothing personal is in a profile's server render (I6)", () => {
  it("hands Follow only what every visitor shares", () => {
    const view = markupOf(VIEW);
    expect(view).toMatch(
      /<FollowButton\s+kind="person"\s+value=\{person\.handle\}\s+followers=\{person\.followers\}\s+returnTo=\{`\/@\$\{person\.handle\}`\}\s+size="hero"\s+tone="ink"\s+countHidden\s+\/>/,
    );
    for (const file of [BARE, TAB, VIEW, "people/[handle]/maker-tabs.tsx", "people/[handle]/product-rows.tsx"]) {
      const source = markupOf(file);
      for (const personal of ["isFollowing", "useOverlay", "readSession", "following="]) {
        expect([file, personal, source.includes(personal)]).toEqual([file, personal, false]);
      }
      expect([file, /from "next\/headers"/.test(source)]).toEqual([file, false]);
    }
  });

  it("stays a cached document: every profile address declares its revalidate", () => {
    for (const file of [BARE, TAB, "people/[handle]/[tab]/[cursor]/page.tsx"]) {
      expect([file, read(file).includes("export const revalidate = 60;")]).toEqual([file, true]);
    }
  });
});

describe("the people directory took the tokens, and nothing else (OPR1)", () => {
  it("draws people as flat cards with no border and no dashed panel", () => {
    for (const file of ["people/people-list.tsx", "people/(index)/page.tsx"]) {
      const source = markupOf(file);
      expect([file, /border-dashed|border border-border\b|rounded-\[20px\]/.test(source)]).toEqual([file, false]);
      expect([file, source.includes("EMPTY_NOTE")]).toEqual([file, true]);
    }
    expect(markupOf("people/people-list.tsx")).toContain("rounded-[16px] bg-card px-[22px] py-5");
  });

  it("still has its one h1 and its own address", () => {
    const page = markupOf("people/(index)/page.tsx");
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(page).toContain("<h1 className={PAGE_TITLE}>People building in the open</h1>");
  });
});
