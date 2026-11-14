// The search results page in the web layer (openproduct-launch SR0; rebuilt
// to boards `Search` and `PhoneSearch` in openproduct-redesign OPR1).
//
// The RULES are pinned in packages/contracts, the ELIGIBILITY in packages/db
// against a live engine, and the handler in tests/core. What is pinned here is
// what the web layer owns:
//
//   - the page is CRAWLABLE and NOT CACHED, and it says which is which
//   - it declares no `revalidate`, because one would be silently ignored
//   - it resolves no actor, so I6 holds for it
//   - a failed read and an empty result look nothing alike (OD5)
//   - the form works with no JavaScript, so a result is a shareable URL
//   - the board: the count and the query as the one `h1`, the segmented
//     control with its counts, a product's Follow, a person's chevron rule,
//     the highlight, `No matches.`
//   - the header card's door out points at the SEARCH PAGE — it pointed at
//     the feed once and nothing noticed

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SEARCH_SCOPE_NOTE, SEE_ALL_RESULTS } from "@openproduct/contracts";
import {
  NO_MATCHES,
  SEARCH_UNAVAILABLE,
  canExpandPerson,
  highlightParts,
  personLine,
  personName,
  personProducts,
  queryStems,
  resultTotal,
  searchSegments,
  sectionHead,
  totalLabel,
  visibleSections,
  type SearchPerson,
} from "@openproduct-web/app/search/segments";
import { toRows, visibleRows } from "@openproduct-web/app/shell/palette-rows";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

const page = () => read("search/page.tsx");

/** The file with its comments removed — a guard about markup must not read
 *  prose, because the comment above a decision names the thing it rejected. */
const markupOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("crawlable, and not cached — which are different things", () => {
  it("declares NO revalidate, because a page reading searchParams is dynamic", () => {
    // Next 15 accepts a `revalidate` beside a `searchParams` read and ignores
    // it, serving `no-store` to everybody. Six routes shipped that way once;
    // XP4's census exists because of it. Declaring one here would look like
    // caching and be nothing.
    expect(markupOf("search/page.tsx")).not.toMatch(/export const revalidate/);
  });

  it("does not claim to be personal either", () => {
    // `force-dynamic` would put it in the census's PERSONAL class, which is a
    // lie about a page that resolves no actor.
    expect(markupOf("search/page.tsx")).not.toMatch(/export const dynamic/);
  });

  it("renders on the server and carries metadata a crawler can read", () => {
    const src = page();
    expect(src).toContain("export async function generateMetadata");
    expect(src).toContain("searchTitle(q)");
  });

  it("asks not to be INDEXED for a query, while staying crawlable", () => {
    // Crawlable is not the same as worth indexing. A result page for every
    // string anybody ever linked is thin content by any measure — but the
    // bare `/search` is a real page and may be indexed.
    const src = page();
    expect(src).toContain("index: false, follow: true");
    expect(src).toContain("q.length === 0 ? undefined");
  });

  it("resolves no actor — I6 applies to it too", () => {
    const src = page();
    for (const leak of ["cookies(", "headers(", "readSession", "SESSION_COOKIE", "op_session"]) {
      expect([leak, src.includes(leak)]).toEqual([leak, false]);
    }
  });
});

describe("what a reader is told", () => {
  it("tells a failed read apart from an empty result (OD5)", () => {
    // Printing "No matches" over a search that could not run would send
    // somebody away believing the commons is empty. The page branches on the
    // read having failed BEFORE it draws the control that can say nothing
    // matched, and the two sentences are different sentences.
    const src = markupOf("search/page.tsx");
    expect(src).toMatch(/doc === null \? \([\s\S]*?\{SEARCH_UNAVAILABLE\}[\s\S]*?\) : \(\s*<SearchView/);
    expect(SEARCH_UNAVAILABLE).toContain("unavailable");
    expect(SEARCH_UNAVAILABLE).not.toBe(NO_MATCHES);
    expect(markupOf("search/search-view.tsx")).toContain("{NO_MATCHES}");
  });

  it("says No matches once, never one empty section per class", () => {
    // Was: three empty sections collapsed into the contract's one sentence.
    // Now the board's rule — a class with nothing in it is not drawn at all,
    // and when nothing is drawn the page says so in one place.
    expect(NO_MATCHES).toBe("No matches.");
    const none = { products: 0, people: 0, topics: 0 };
    expect(visibleSections("all", none)).toEqual([]);
    expect(visibleSections("people", { products: 3, people: 0, topics: 1 })).toEqual([]);
    const view = markupOf("search/search-view.tsx");
    expect(view).toMatch(/shown\.length === 0 \? \(/);
    expect(view.match(/\{NO_MATCHES\}/g)).toHaveLength(1);
  });

  it("publishes what search looks at, in the page's description", () => {
    // OPC-4. "Relevance" sounds like a technical detail, which is exactly why
    // it is said in the description a crawler and a shared link carry. The
    // board has no room for a paragraph on the page (design.md §2 rule 9).
    expect(page()).toContain("description: SEARCH_SCOPE_NOTE");
    expect(SEARCH_SCOPE_NOTE).toContain("search.relevance");
  });

  it("says why each person is in the list", () => {
    // A list of people with no reason beside them leaves a reader wondering
    // what was matched — and "their bio" is a very different answer from
    // "their handle".
    expect(markupOf("search/person-row.tsx")).toContain("personLine(person, MAKER_MATCH_LABELS[person.matched])");
    const ada: SearchPerson = { handle: "ada", displayName: "Ada", matched: "bio" };
    expect(personLine(ada, "bio")).toBe("@ada · matched their bio");
  });

  it("is one page with one h1: the query, under the count as a mono label", () => {
    const src = markupOf("search/page.tsx");
    expect(src.match(/<h1\b/g)).toHaveLength(1);
    // The title is the query in quotation marks, or `Search` before one.
    expect(src).toMatch(/<h1 className=\{`\$\{PAGE_TITLE\}[^`]*`\}>\s*\{q\.length === 0 \? "Search" : <>&ldquo;\{q\}&rdquo;<\/>\}/);
    // The count sits over it in the mono label, and only once a read answered.
    expect(src).toMatch(/\{doc \? <span className=\{EYEBROW\}>\{totalLabel\(resultTotal\(counts\)\)\}<\/span> : null\}\s*<h1/);
    // No client file of the page draws a second one.
    for (const file of ["search/search-view.tsx", "search/person-row.tsx", "search/search-field.tsx"]) {
      expect([file, /<h1\b/.test(markupOf(file))]).toEqual([file, false]);
    }
  });

  it("counts results in the reader's words", () => {
    expect(totalLabel(0)).toBe("0 results");
    expect(totalLabel(1)).toBe("1 result");
    expect(totalLabel(12)).toBe("12 results");
    expect(resultTotal({ products: 4, people: 2, topics: 1 })).toBe(7);
  });
});

describe("the segmented control and its counts", () => {
  const counts = { products: 4, people: 2, topics: 1 };

  it("is All and one segment per class the read returns, each with its count", () => {
    expect(searchSegments(counts)).toEqual([
      { key: "all", label: "All", count: 7 },
      { key: "products", label: "Products", count: 4 },
      { key: "people", label: "People", count: 2 },
      { key: "topics", label: "Topics", count: 1 },
    ]);
  });

  it("names the fourth segment for what it holds: topics, not posts", () => {
    // The board's fourth segment is Posts. A post is not stored until OPR2
    // and `/v1/search` returns none; it returns topics.
    const labels = searchSegments(counts).map((s) => s.label);
    expect(labels).not.toContain("Posts");
    expect(labels).toContain("Topics");
  });

  it("keeps a class with nothing in it, at zero — the control does not move", () => {
    const segments = searchSegments({ products: 3, people: 0, topics: 0 });
    expect(segments.map((s) => s.key)).toEqual(["all", "products", "people", "topics"]);
    expect(segments.map((s) => s.count)).toEqual([3, 3, 0, 0]);
  });

  it("counts what the page shows, from the one read", () => {
    const src = markupOf("search/page.tsx");
    expect(src).toContain("products: products.length,");
    expect(src).toContain("people: people.length,");
    expect(src).toContain("topics: topics.length,");
    expect(src).toContain("doc.results.slice(0, SEARCH_LAUNCH_LIMIT)");
  });

  it("shows every class under All and one class under its own segment", () => {
    expect(visibleSections("all", counts)).toEqual(["products", "people", "topics"]);
    expect(visibleSections("people", counts)).toEqual(["people"]);
    expect(visibleSections("all", { products: 2, people: 0, topics: 1 })).toEqual(["products", "topics"]);
  });

  it("heads a section under All only, with its own count", () => {
    expect(sectionHead("products", 4)).toBe("Products · 4");
    const view = markupOf("search/search-view.tsx");
    expect(view).toMatch(/\{segment === "all" \? \(\s*<h2/);
  });

  it("is a group of pressed buttons at the board's sizes: 40px, 44px on a phone", () => {
    const view = markupOf("search/search-view.tsx");
    expect(view).toContain('role="group"');
    expect(view).toContain('aria-label="Show results"');
    expect(view).toContain("aria-pressed={on}");
    expect(view).toMatch(/min-h-\[40px\][^"`]*max-sm:min-h-\[44px\]/);
    // The count is in the mono face, amber on the pressed segment.
    expect(view).toContain('on ? "text-amber-ink" : "text-muted-foreground"');
    // Starts on All, so the server render — and a reader with no JavaScript —
    // gets every section.
    expect(view).toContain('React.useState<SearchSegment>("all")');
  });
});

describe("a product row", () => {
  it("is the tile, the name, the summary with its matched words marked, and Follow", () => {
    const src = markupOf("search/page.tsx");
    expect(src).toContain("<ProductTile slug={hit.entityId} thumbnail={hit.thumbnail} size={44} />");
    expect(src).toContain("highlightParts(hit.summary, query)");
    expect(src).toMatch(/<mark key=\{index\} className="[^"]*bg-amber-soft/);
    expect(src).toContain("<ProductFollow slug={hit.entityId} name={hit.title} returnTo={returnTo} />");
  });

  it("follows the PRODUCT, through the listing follow every other surface writes", () => {
    // design.md §2 rule 3. The same route, overlay key and optimistic toggle
    // as the product page's own button.
    const follow = markupOf("search/product-follow.tsx");
    expect(follow).toContain('followKey({ kind: "listing", value: slug })');
    expect(follow).toContain('useToggle("follows", key, !following)');
    expect(follow).toContain("/me/follow?kind=listing&value=${encodeURIComponent(slug)}");
    expect(follow).toContain('method="post"');
    expect(follow).toMatch(/min-h-\[40px\][^"`]*max-sm:min-h-\[44px\]/);
    // A person is followed only from their own profile.
    expect(markupOf("search/person-row.tsx")).not.toMatch(/Follow|\/me\/follow/);
  });

  it("prints no stage, because the read carries none", () => {
    // The board prints Shipping or Idea beside the name; a product has no
    // stored stage until OPR2.
    expect(markupOf("search/page.tsx")).not.toMatch(/Shipping|>Idea</);
  });

  it("marks whole words, on the board's stems", () => {
    expect(queryStems("Send policies to HR")).toEqual(["send", "polic"]);
    expect(highlightParts("Send policies, collect acknowledgments", "policy acknowledgment")).toEqual([
      { text: "Send policies, collect ", hit: false },
      { text: "acknowledgments", hit: true },
    ]);
    expect(highlightParts("Check job ads before they go live", "ads")).toEqual([
      { text: "Check job ", hit: false },
      { text: "ads", hit: true },
      { text: " before they go live", hit: false },
    ]);
  });

  it("marks nothing for a query too short to mean anything, and survives a query that is a pattern", () => {
    expect(highlightParts("An AI tool register", "ai")).toEqual([{ text: "An AI tool register", hit: false }]);
    expect(highlightParts("", "anything")).toEqual([]);
    // A query is somebody's text, not a regular expression.
    expect(() => highlightParts("what (is) this [thing]", "(is) [thing] a+b \\d")).not.toThrow();
    expect(highlightParts("a+b equals c", "a+b")).toEqual([
      { text: "a+b", hit: true },
      { text: " equals c", hit: false },
    ]);
  });
});

describe("a person row, and the chevron rule", () => {
  const ada: SearchPerson = { handle: "ada", displayName: "Ada Lovelace", matched: "name" };

  it("has NO chevron on today's read, which sends no products for a person", () => {
    // `/v1/search` returns a handle, a name and which field matched.
    expect(canExpandPerson(ada)).toBe(false);
    expect(personProducts(ada)).toEqual([]);
    expect(canExpandPerson({ ...ada, products: [] })).toBe(false);
  });

  it("has one when the read carries their products, and says how many", () => {
    const withProducts: SearchPerson = {
      ...ada,
      products: [
        { slug: "kettleworks", title: "Kettleworks" },
        { slug: "ackstack", title: "ackstack" },
      ],
    };
    expect(canExpandPerson(withProducts)).toBe(true);
    expect(personLine(withProducts, "name")).toBe("2 products");
    expect(personLine({ ...ada, products: [{ slug: "one", title: "One" }] }, "name")).toBe("1 product");
  });

  it("never invents a list from something that is not one", () => {
    const odd = { ...ada, products: "kettleworks" } as unknown as SearchPerson;
    expect(canExpandPerson(odd)).toBe(false);
    expect(personProducts(odd)).toEqual([]);
  });

  it("draws the chevron and the list behind the rule, and starts closed", () => {
    const row = markupOf("search/person-row.tsx");
    // The button exists only when the row can open…
    expect(row).toMatch(/\{canExpandPerson\(person\) \? \(\s*<button/);
    // …the products only when it can AND has been opened…
    expect(row).toMatch(/\{canExpandPerson\(person\) && open \? \(\s*<ul/);
    // …and nobody's products show until somebody asks (design.md §2 rule 6).
    expect(row).toContain("React.useState(false)");
    expect(row).toContain("aria-expanded={open}");
    expect(row).toContain('aria-label={`${open ? "Hide" : "Show"} products of ${name}`}');
    expect(row).toContain("<ChevronIcon up={open}");
  });

  it("is their name or their handle, a link to the profile, and no stand-in", () => {
    expect(personName(ada)).toBe("Ada Lovelace");
    expect(personName({ handle: "ada", displayName: null, matched: "handle" })).toBe("@ada");
    const row = markupOf("search/person-row.tsx");
    expect(row).toContain("makerPath(person.handle)");
    expect(row).toContain("View profile");
    // The chevron is a sibling of the link, never inside it.
    expect(row).not.toMatch(/<AppLink[^>]*>(?:(?!<\/AppLink>)[\s\S])*<button/);
  });
});

describe("the form is a form", () => {
  const field = () => read("search/search-field.tsx");

  it("is a real GET, so the page works with no JavaScript and the result is a URL", () => {
    // The header's card is the fast path, not the only one. A search whose
    // result cannot be shared or reloaded is a search that only exists while
    // you are looking at it. The form moved into the page's own field
    // component with OPR1; it is still a form.
    const src = markupOf("search/search-field.tsx");
    expect(src).toMatch(/<form\s+action="\/search"\s+method="get"/);
    expect(src).toContain('name="q"');
    expect(page()).toContain("<SearchField ");
  });

  it("bounds the query before echoing it into a heading and a title", () => {
    // An unbounded query is a page whose <title> is a paragraph.
    expect(page()).toContain("slice(0, 120)");
    expect(page()).toContain("maxLength={120}");
    expect(field()).toContain("maxLength={maxLength}");
  });

  it("makes no read at all for an empty query", () => {
    // "Show me everything" is what the lists are for, and core answers an
    // empty query with nothing anyway.
    expect(page()).toContain("q.length === 0 ? null : await fetchSearch(q)");
  });

  it("is the phone's field: focused on arrival with nothing asked, with a clear button", () => {
    // On a phone the header's search is a LINK to this page, so the typing
    // happens here. From `sm` up the header has the field and this is not
    // displayed.
    const src = markupOf("search/search-field.tsx");
    expect(src).toMatch(/className="hidden [^"]*max-sm:flex"/);
    expect(page()).toContain("focusOnArrival={q.length === 0}");
    expect(src).toContain("if (focusOnArrival) input.current?.focus();");
    // The clear button is there only while there is text, empties the field
    // and hands the caret back.
    expect(src).toMatch(/\{value\.length > 0 \? \(\s*<button/);
    expect(src).toContain('aria-label="Clear search"');
    expect(src).toMatch(/setValue\(""\);\s*input\.current\?\.focus\(\);/);
    // 44px, with a 16px face so a phone does not zoom on focus.
    expect(src).toContain("min-h-[44px]");
    expect(src).toContain("text-nozoom");
    expect(src).toMatch(/grid h-\[44px\] w-\[44px\]/);
  });
});

describe("the header search's door out — and the link OL2 broke", () => {
  const NOBODY: ReadonlySet<string> = new Set();

  it("never sends a query to the feed with a filter nobody reads", () => {
    // THIS WAS BROKEN IN PRODUCTION FOR THE WHOLE OF OL2'S LIFE, and the
    // shape of that bug is what this test is really about. DS3's stack row
    // wrote `/?stack=…` when `/` was the directory; OL2 moved the directory
    // and left `/` as the feed. The row still ARRIVED somewhere real — which
    // is why nothing caught it — and the filter was silently dropped.
    //
    // The row moved three times after that and, with openproduct-redesign
    // OPR1, left the field: the card under the header search holds products
    // and people (board `Feed`). What is worth pinning survives the row:
    // every destination the card can offer for a query is a real page for
    // THAT query — a product, a person, or the results page with the words
    // in its address — and never `/` with a query string.
    const rows = visibleRows(
      toRows(
        [{ kind: "product", entityId: "kettleworks", title: "kettleworks", summary: null, matched: "name" }],
        [{ handle: "ada", displayName: "Ada", matched: "name" }],
      ),
      NOBODY,
      "TypeScript",
    );
    expect(rows.map((r) => r.href)).toEqual(["/kettleworks", "/@ada", "/search?q=TypeScript"]);
    for (const row of rows) {
      expect(row.href).not.toMatch(/^\/\?/);
      expect(row.href).not.toBe("/");
    }
  });

  it("no longer knows a directory path at all — the next move has nowhere to carry", () => {
    // Changed with the launch restyle: `DIRECTORY_PATH` left the contract
    // with the directory, so the pin is that nothing here still points there.
    const rows = markupOf("shell/palette-rows.ts");
    expect(rows).not.toContain("DIRECTORY_PATH");
    expect(rows).not.toContain("/products");
    expect(rows).not.toContain("`/?stack=");
  });

  it("ends every query with a way to see all results", () => {
    const rows = visibleRows([], NOBODY, "anything at all");
    const last = rows.at(-1)!;
    expect(last.type).toBe("all");
    expect(last.title).toBe(SEE_ALL_RESULTS);
    expect(last.href).toBe("/search?q=anything%20at%20all");
  });

  it("offers that door even when nothing else matched", () => {
    // "Nothing here, and here is where to look properly" is more useful than
    // an empty box, and the results page can say why in a way a card has no
    // room for.
    expect(visibleRows(toRows([]), NOBODY, "wibble").map((r) => r.type)).toEqual(["all"]);
  });

  it("offers NO door when nothing has been typed", () => {
    // An empty field should not offer to search for nothing.
    expect(visibleRows([], NOBODY, "")).toEqual([]);
    expect(visibleRows([], NOBODY, "   ")).toEqual([]);
  });

  it("leaves topics to the page the door leads to, which answers them", () => {
    // The card holds two classes (products and people). A topic is still a
    // destination and a query for one is still answered — on the results
    // page, one `See all results` away, in its own segment.
    expect(toRows([]).some((r) => (r.type as string) === "topic")).toBe(false);
    expect(visibleRows([], NOBODY, "infrastructure").at(-1)!.href).toBe("/search?q=infrastructure");
    expect(searchSegments({ products: 0, people: 0, topics: 1 }).at(-1)).toEqual({
      key: "topics",
      label: "Topics",
      count: 1,
    });
    expect(page()).toContain("topics.map((topic) => (");
  });
});
