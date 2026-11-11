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
import { toRows } from "@openproduct-web/app/shell/palette-rows";

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

describe("the palette's door out — and the link OL2 broke", () => {
  it("points a stack row at a page that KEEPS its promise", () => {
    // THIS WAS BROKEN IN PRODUCTION FOR THE WHOLE OF OL2'S LIFE, and the
    // shape of that bug is what this test is really about. DS3 wrote
    // `/?stack=…` when `/` was the directory; OL2 moved the directory to
    // `/products` and left `/` as the launch feed. The row still ARRIVED
    // somewhere real — which is why nothing caught it — and the filter was
    // silently dropped, so a row promising "every product built with it"
    // delivered the front page.
    //
    // The destination has moved twice since and now three times: to
    // `/products`, then — when the directory was retired — to
    // `/search?q=TypeScript`, and now, with VC1, to the page that exists for
    // exactly this question. `/stack/typescript` IS every product built with
    // it, so the row's promise and its destination are the same claim again,
    // which is the property the OL2 bug broke and the one worth pinning.
    const rows = toRows([], "TypeScript");
    expect(rows[0]!.href).toBe("/stack/typescript");
    // Never the feed with a query nobody reads, in any of its spellings.
    expect(rows[0]!.href).not.toMatch(/^\/\?/);
    expect(rows[0]!.href).not.toBe("/");
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
    const rows = toRows([], "anything at all");
    const last = rows.at(-1)!;
    expect(last.type).toBe("all");
    expect(last.title).toBe(SEE_ALL_RESULTS);
    expect(last.href).toBe("/search?q=anything%20at%20all");
  });

  it("offers that door even when nothing else matched", () => {
    // "Nothing here, and here is where to look properly" is more useful than
    // an empty box, and the results page can say why in a way a palette has
    // no room for.
    expect(toRows([], "wibble").map((r) => r.type)).toEqual(["all"]);
  });

  it("offers NO door when nothing has been typed", () => {
    // An empty palette should not offer to search for nothing.
    expect(toRows([], "")).toEqual([]);
    expect(toRows([], "   ")).toEqual([]);
  });

  it("surfaces topics, which are destinations in a way a stack is not", () => {
    const rows = toRows([], "infrastructure");
    const topic = rows.find((r) => r.type === "topic");
    expect(topic).toBeDefined();
    expect(topic!.href).toBe("/topics/infrastructure");
  });
});
