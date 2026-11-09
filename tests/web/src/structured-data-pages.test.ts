// JSON-LD beyond the listing (openproduct-worldclass RE1).
//
// The audit's P1·08, triaged: JSON-LD shipped, on the LISTING only. Six other
// public surfaces are lists of pages with a parent above them, and a crawler
// arriving at any of them from a search result has no way to learn that the
// parent exists.
//
// WHY A CRAWLER GETS A TRAIL AND A READER MOSTLY DOES NOT: this site draws
// breadcrumbs on two surfaces, because its hierarchy is one level deep nearly
// everywhere and a trail with one rung is furniture. A crawler's problem is
// the opposite one.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FORBIDDEN_JSONLD_FIELDS } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const code = (file: string) =>
  read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const TRAILED = [
  "[slug]/page.tsx",
  "topics/[topic]/page.tsx",
  "launches/[day]/page.tsx",
  "collections/[slug]/page.tsx",
  "people/[handle]/page.tsx",
];

const LISTED = [
  "topics/[topic]/page.tsx",
  "launches/[day]/page.tsx",
  "collections/[slug]/page.tsx",
];

describe("every page with a parent says so to a machine", () => {
  it.each(TRAILED)("%s emits a BreadcrumbList", (file) => {
    expect(code(file)).toContain("breadcrumbJsonLd(");
  });

  it.each(LISTED)("%s emits a CollectionPage", (file) => {
    expect(code(file)).toContain("collectionPageJsonLd(");
  });
});

describe("the count in the machine-readable document counts the rendered list", () => {
  // WC-7 IN THE MACHINE-READABLE LAYER. `numberOfItems` is `paths.length`
  // inside the builder, so the only way to get it wrong is to pass an array
  // the page does not render — which is what these assertions check. A count
  // that could disagree with its list is a count that eventually does.
  it.each([
    ["topics/[topic]/page.tsx", "doc.entries.map((entry) => `/${entry.slug}`)", "doc.entries"],
    ["launches/[day]/page.tsx", "board.board.map((entry) => `/${entry.slug}`)", "board.board"],
    ["collections/[slug]/page.tsx", "collection.items.map((item) => `/${item.card.slug}`)", "collection.items"],
  ])("%s lists the array it renders", (file, expression, array) => {
    const source = code(file);
    expect(source).toContain(expression);
    // …and that array is the one the page hands to its own renderer.
    expect(source.match(new RegExp(array.replace(/[.[\]]/g, "\\$&"), "g"))?.length).toBeGreaterThan(1);
  });

  it("passes no separate count to the builder anywhere", () => {
    // The builder takes the paths and counts them; it takes no `total`, and
    // no call site can supply one. A grep is the cheapest way to keep that
    // true through the next refactor.
    for (const file of LISTED) {
      expect(code(file)).not.toMatch(/numberOfItems|count:\s|total:\s/);
    }
  });
});

describe("the escaping lives in one place", () => {
  it("is a component rather than a shape five files copy", () => {
    // `JSON.stringify` escapes what it must EXCEPT `<`, which is the whole
    // risk: a tagline containing `</script>` would close the tag and
    // everything after it would be markup somebody else wrote. It was correct
    // where it was written and is the kind of rule that gets forgotten by the
    // fifth file that copies the shape — and RE1 added five.
    expect(read("ui/json-ld.tsx")).toContain('.replace(/</g, "\\\\u003c")');
  });

  it("is what every page uses, including the one that had its own", () => {
    for (const file of TRAILED) expect(code(file)).toContain("<JsonLd");
    expect(code("[slug]/page.tsx")).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders nothing without a canonical origin", () => {
    // A document consumed away from the page cannot carry relative addresses
    // — they resolve against whatever host quoted it — so on a preview host
    // the honest output is no document at all.
    expect(code("ui/json-ld.tsx")).toContain("if (data === null) return null;");
  });
});

describe("no page emits a rating, and the leaderboard least of all", () => {
  it("names none of the forbidden fields anywhere in the app", () => {
    // A leaderboard is the single most tempting place on this site to emit
    // `aggregateRating` — it is literally a ranked list with numbers beside
    // it. The numbers are endorsements, an endorsement is not a review, and
    // nothing here is out of five.
    // MATCHED AS A PROPERTY, not as a substring. `review` is a word this
    // product uses in prose — the moderation record is full of reviews — and
    // a scan for the bare string reports the listing page for a sentence
    // about human review, which is the opposite of the thing forbidden here.
    // What is forbidden is a FIELD, so the pattern is the field position.
    const offenders: string[] = [];
    for (const file of [...TRAILED, "ui/json-ld.tsx"]) {
      for (const field of FORBIDDEN_JSONLD_FIELDS) {
        if (new RegExp(`\\b${field}\\s*:`).test(code(file))) offenders.push(`${file}: ${field}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the listing's `noindex` gate on the listing document only", () => {
    // `noindex` says do not amplify THIS page. A breadcrumb is about the pages
    // ABOVE it, which are indexable and whose relationship is true regardless
    // — so the trail is emitted either way and the rich record is not.
    const source = code("[slug]/page.tsx");
    expect(source).toMatch(/profile\.indexable \? <JsonLd data=\{listingJsonLd/);
    expect(source).toMatch(/<JsonLd\s+data=\{breadcrumbJsonLd/);
  });
});
