// The search results page in the web layer (openproduct-launch SR0).
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
//   - the palette's stack row points at the SEARCH PAGE, now that the
//     directory is gone — it pointed at the feed once and nothing noticed

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SEARCH_SCOPE_NOTE, SEE_ALL_RESULTS } from "@openproduct/contracts";
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
    // Printing "nothing matched" over a search that could not run would send
    // somebody away believing the commons is empty.
    const src = page();
    expect(src).toContain("doc === null");
    expect(src).toContain("Search is unavailable right now");
    expect(src).toContain("SEARCH_NOTHING");
  });

  it("collapses three empty sections into one sentence", () => {
    expect(page()).toContain("searchFoundNothing");
  });

  it("publishes what search looks at, on the page that applies it", () => {
    // OPC-4. "Relevance" sounds like a technical detail, which is exactly why
    // it needs saying where the ordering happens.
    expect(page()).toContain("SEARCH_SCOPE_NOTE");
    expect(SEARCH_SCOPE_NOTE).toContain("search.relevance");
  });

  it("says why each person is in the list", () => {
    // A list of people with no reason beside them leaves a reader wondering
    // what was matched — and "their bio" is a very different answer from
    // "their handle".
    expect(page()).toContain("MAKER_MATCH_LABELS[maker.matched]");
  });

  it("writes no sentence of its own where the contract has one", () => {
    const markup = markupOf("search/page.tsx");
    for (const constant of ["SEARCH_EMPTY", "SEARCH_HEADINGS", "SEARCH_NOTHING", "SEARCH_PROMPT"]) {
      expect([constant, markup.includes(constant)]).toEqual([constant, true]);
    }
  });
});

describe("the form is a form", () => {
  it("is a real GET, so the page works with no JavaScript and the result is a URL", () => {
    // The ⌘K palette is the fast path, not the only one. A search whose
    // result cannot be shared or reloaded is a search that only exists while
    // you are looking at it.
    const src = page();
    expect(src).toContain('action="/search" method="get"');
    expect(src).toContain('name="q"');
  });

  it("bounds the query before echoing it into a heading and a title", () => {
    // An unbounded query is a page whose <title> is a paragraph.
    expect(page()).toContain("slice(0, 120)");
    expect(page()).toContain("maxLength={120}");
  });

  it("makes no read at all for an empty query", () => {
    // "Show me everything" is what the directory is for, and core answers an
    // empty query with nothing anyway.
    expect(page()).toContain("q.length === 0 ? null : await fetchSearch(q)");
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
    // page, one `See all results` away, under its own heading.
    expect(toRows([]).some((r) => (r.type as string) === "topic")).toBe(false);
    expect(visibleRows([], NOBODY, "infrastructure").at(-1)!.href).toBe("/search?q=infrastructure");
    expect(page()).toContain("SEARCH_HEADINGS.topics");
    expect(page()).toContain("doc.topics.map");
  });
});
