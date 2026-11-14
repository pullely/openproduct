// Which addresses the sitemap says exist (openproduct-worldclass AG0).
//
// THE FINDING THIS FILE COMES FROM. The audit browsed the entire site and did
// not find the shipped API — `/v1/products`, `/v1/facets`,
// `/v1/openapi.json`, running and anonymous and cached for months. It could
// not have: nothing linked `/docs` except its own two children, and the
// sitemap did not name it either, so neither a reader nor a crawler had a way
// in. "An API nobody can find has the same value as an API that does not
// exist" is the sub-epic's own sentence.
//
// AG1 ADDED A SECOND SURFACE WITH THE SAME EXPOSURE — an MCP server — and the
// last block here holds it to the lesson: a tool that exists and a tool that is
// documented cannot be different sets, and the page renders them from the tool
// set the server registers rather than from a list beside it.
//
// `/docs` turned out not to be alone. Seven static public pages were missing,
// because every entry in that list was added by the milestone that built the
// page it names — the right instinct, and it leaves a list that is correct
// about what somebody remembered.
//
// SO THE LIST IS CHECKED AGAINST THE FILESYSTEM. Every static page under
// `src/app` is either in the sitemap or in `EXCLUDED` below with a reason.
// A new public page cannot be added while quietly staying out of the one
// document whose job is to say which addresses exist — the same shape
// `route-census.test.ts` uses, and for the same reason it gives: a
// hand-written list is correct when written and wrong within weeks.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

const SITEMAP = read("sitemap.xml/route.ts");

/** The literal `{ path: "x" }` entries — the static half of the document. */
const listed = new Set([...SITEMAP.matchAll(/\{ path: "([^"]+)"/g)].map((m) => m[1]!));

/**
 * Every `page.tsx` under `src/app`, as the route it serves.
 *
 * Route groups — `(index)` — are not path segments and are stripped, which is
 * the one piece of Next routing this has to know. A path holding a `[param]`
 * is DYNAMIC and cannot be enumerated from the filesystem at all: those enter
 * the sitemap from a read (`projects`, `people`, `weeks`) or a derivation
 * (`topics`, `stack`), which is a different question from this one.
 */
function routes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      const segment = /^\(.*\)$/.test(entry) ? prefix : prefix ? `${prefix}/${entry}` : entry;
      out.push(...routes(full, segment));
    } else if (entry === "page.tsx") {
      // A path holding a `[param]` is dynamic and cannot be enumerated from
      // the filesystem: those entries come from a read or a derivation, which
      // is a different question from this one.
      if (!prefix.includes("[")) out.push(prefix);
    }
  }
  return out;
}

/** Pages deliberately absent, each with the reason. A page joins this list by
 *  argument, never by being forgotten. */
const EXCLUDED: Record<string, string> = {
  "": "the root is emitted by `sitemapXml` itself, always first",
  me: "personal — rendered per request for one reader, and behind a session",
  "me/applications":
    "personal — the old address of one reader's requests; it arrives at the Seats section of `/me` (openproduct-redesign OPR1)",
  activity:
    "personal — one reader's inbox (it was `me/notifications` until openproduct-redesign OPR1 moved the address)",
  "me/saved":
    "personal — the old address of one reader's private list (OPC-3); it arrives at the Saved section of `/me` (openproduct-redesign OPR1)",
  "me/settings": "personal — one reader's own settings, behind a session (openproduct-redesign OPR1)",
  studio: "personal — the maintainer's own workspace, behind a session",
  "studio/appeals": "personal — one maintainer's appeals",
  "studio/collections": "personal — one curator's collections",
  "studio/link": "personal — the repository-linking flow",
  "studio/reports": "personal — one maintainer's reports",
  signin:
    "declares `robots: { index: false, follow: false }` — a door, not a destination, and a sitemap entry would ask a crawler to index a form",
  "threads/new":
    "FO0 — the composer, `noindex` for the same reason `signin` is: a form is a step, and it reads a session",
  search:
    "the bare page is indexable and canonicalises to itself, but its content is an empty field; every page worth reaching from it is already named here individually",
};

describe("the sitemap names every static public page", () => {
  const found = routes(APP_DIR).sort();

  it("finds the pages at all, so an empty walk cannot pass", () => {
    // The vacuous-test guard this epic has now shipped twice and caught
    // twice: a walk that found nothing would agree with any sitemap.
    expect(found.length).toBeGreaterThan(15);
    expect(found).toContain("docs");
    expect(found).toContain("stack");
  });

  it("lists every one of them, or excludes it with a reason", () => {
    const missing = found.filter((route) => !listed.has(route) && !(route in EXCLUDED));
    expect(missing).toEqual([]);
  });

  it("excludes nothing it also lists", () => {
    // A page in both places is a decision made twice and disagreed with once.
    const both = Object.keys(EXCLUDED).filter((route) => listed.has(route));
    expect(both).toEqual([]);
  });

  it("has a reason for every exclusion, and a page for every reason", () => {
    // A page that no longer exists, still excluded, is a decision nobody can
    // check any more — and the next reader takes it as evidence about a file
    // that is not there.
    const stale = Object.keys(EXCLUDED).filter(
      (route) => route !== "" && !found.includes(route),
    );
    expect(stale).toEqual([]);
    const unreasoned = Object.entries(EXCLUDED).filter(([, why]) => why.trim().length === 0);
    expect(unreasoned).toEqual([]);
  });

  it("names no page that does not exist", () => {
    // The other direction: a sitemap entry for a route nobody serves is a
    // crawler being sent to a 404 by the document that promised the page.
    // Dynamic entries are built from reads and are not literals here, so
    // everything in `listed` should be a real static route — except the two
    // index pages whose CHILDREN are dynamic.
    const dynamicParents = new Set(["leaderboard/month", "leaderboard/year"]);
    const ghosts = [...listed].filter(
      (route) => !found.includes(route) && !dynamicParents.has(route),
    );
    expect(ghosts).toEqual([]);
  });
});

describe("AG0 — the API is reachable, and that is the whole milestone", () => {
  it("the footer links `/docs`, not only its children", () => {
    // It linked `/docs/checks` — a CHILD of a page it did not link — so the
    // only ways in were from `/docs`' own two children, themselves reached
    // from footnotes under a formula.
    // Since OPR1 the footer maps one list (`FOOTER_LINKS` in `shell.ts`);
    // the door and its child are entries of it.
    const footer = read("shell/site-footer.tsx")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(footer).toContain("FOOTER_LINKS.map");
    const links = read("shell/shell.ts");
    expect(links).toMatch(/\{ label: "[^"]+", href: "\/docs" \}/);
    expect(links).toMatch(/\{ label: "[^"]+", href: "\/docs\/checks" \}/);
  });

  it("the sitemap names the docs surface and both its pages", () => {
    for (const path of ["docs", "docs/formulas", "docs/checks"]) {
      expect([path, listed.has(path)]).toEqual([path, true]);
    }
  });

  it("a route on `/docs` is a link to that route, not a string to retype", () => {
    // TWO CLICKS TO A WORKING REQUEST, literally: the footer is one, a row is
    // the second. `href` is built from the SAME base the `curl` line uses, so
    // the address a reader clicks and the one the page tells them to type
    // cannot come apart.
    const docs = read("docs/page.tsx");
    expect(docs).toContain('href={`${base}${path}`}');
    expect(docs).toContain("curl {base}/v1/products");
    for (const path of ['path: "/v1/products"', 'path: "/v1/facets"', 'path: "/v1/openapi.json"']) {
      expect([path, docs.includes(path)]).toEqual([path, true]);
    }
  });

  it("never links the one route that is a TEMPLATE", () => {
    // `/v1/products/{slug}` has no real address on a page that holds no
    // catalogue read, and a link to a literal `{slug}` would 404 — which is
    // worse than text, because the one thing this milestone must not do is
    // make a broken promise about the API being reachable.
    const docs = read("docs/page.tsx");
    expect(docs).toMatch(/route: "GET \/v1\/products\/\{slug\}",\s*\n\s*path: null,/);
    expect(docs).toContain("base && path ?");
  });
});

describe("AG1 — the agent surface is documented from the tool set itself", () => {
  const docs = read("docs/page.tsx");

  it("names the endpoint on the page a reader can now find", () => {
    // AG0's finding was an API nobody could locate. An agent surface
    // documented nowhere would be the same mistake made twice, one milestone
    // later.
    expect(docs).toContain("{base}/mcp");
    expect(docs).toContain("Model Context Protocol");
  });

  it("renders the tools from the contract, not from a list beside it", () => {
    // The page's own rule, stated in its header: "rendered from the SAME
    // contracts the API serves, so a formula that exists and a formula that is
    // documented cannot be different sets".
    expect(docs).toContain("AGENT_TOOLS.map(");
    expect(docs).toContain("{tool.description}");
    // No hand-typed tool name anywhere on the page.
    for (const name of ["list_products", "get_product", "list_facets"]) {
      expect([name, docs.includes(`"${name}"`)]).toEqual([name, false]);
    }
  });

  it("says it is anonymous, because that is the decision a reader needs", () => {
    expect(docs).toContain("Anonymous and stateless");
    expect(docs).toContain("no credential to obtain");
  });
});

describe("a scroll region takes a tab stop only while nothing inside it has one", () => {
  // ONE RULE, BOTH WAYS, and the pair of milestones that found each half.
  // FR5 gave both `/docs` tables a `tabIndex` because neither held anything
  // focusable and a keyboard user could not scroll them. AG0 then turned the
  // first table's route names into links — three stops inside the box — and
  // the box's own stop became a fourth wrapping them, which `a11y.mjs` reports
  // as a nested interactive: two targets in one box, and a reader who cannot
  // tell which one they are on. Axe passes it either way; the estate's own
  // walk is what caught it.
  const docs = read("docs/page.tsx");

  it("the linked table has no tabIndex, because its links are the way in", () => {
    const linked = docs.slice(docs.indexOf('aria-label="The anonymous catalog routes"'));
    const untilTable = linked.slice(0, linked.indexOf("<table"));
    expect(untilTable).not.toContain("tabIndex");
  });

  it("the table with no links in it keeps its own", () => {
    const rates = docs.slice(docs.indexOf('aria-label="The rate limits"'));
    expect(rates.slice(0, rates.indexOf("<table"))).toContain("tabIndex={0}");
    // And nothing inside it is focusable, which is what makes that correct.
    const body = rates.slice(0, rates.indexOf("</section>"));
    expect(body).not.toMatch(/<a\b|<button\b/);
  });
});
