// Topic pages, in the web layer (openproduct-launch TP0).
//
// The INDEX and the ORDER are tested in packages/contracts and the READS in
// tests/core. What is pinned here is what the web layer owns:
//
//   - `/topics` is a page and the nav's last planned pill is live
//   - a topic page is the BOARD filtered, and the topic page is the card's
//     one destination — the directory is gone, so nothing links to it
//   - the page decides no order
//   - a fact it does not have renders absent, never as a zero (OPC-C)
//   - the feed row does not put an anchor inside an anchor
//   - the topic index and every topic are in the sitemap

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { topicPath } from "@openproduct/contracts";
import { SECTIONS } from "@openproduct-web/app/shell/shell";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

/** The file with its comments removed — a guard about markup must not read
 *  prose, because the comment above a decision names the thing it rejected. */
const markupOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the addresses", () => {
  it("the nav's last planned pill is live", () => {
    const pill = SECTIONS.find((s) => s.id === "topics");
    expect(pill?.status).toBe("live");
    expect(pill?.href).toBe("/topics");
  });

  it("the `planned` machinery stays, and Open roles left it at OB4", () => {
    // It is the reason a nav could describe the shape of this product for
    // eleven milestones without lying about what existed. OB1's Open roles
    // used it until OB4 gave the section an address.
    const planned = SECTIONS.filter((s) => s.status === "planned");
    expect(planned.map((s) => s.id)).toEqual([]);
    expect(SECTIONS.find((s) => s.id === "roles")?.status).toBe("live");
    expect(read("shell/shell.ts")).toContain('SectionStatus = "live" | "planned"');
  });

  it("a topic addresses by its canonical value, never by its label", () => {
    expect(topicPath("dev-tools")).toBe("/topics/dev-tools");
  });
});

describe("a topic page is the BOARD filtered, and the only place a topic leads", () => {
  it("no longer links to a directory view — the directory does not exist", () => {
    // Inverted with the launch design: the topic page is the destination, and
    // a link to `/products?category=x` would be a link to nowhere.
    for (const file of ["topics/page.tsx", "topics/[topic]/page.tsx"]) {
      expect([file, read(file).includes("topicDirectoryPath")]).toEqual([file, false]);
      expect([file, read(file).includes("DIRECTORY_PATH")]).toEqual([file, false]);
    }
    // Nor a hand-written one: the parameter the helper built has no page behind it.
    for (const file of ["topics/page.tsx", "topics/[topic]/page.tsx"]) {
      expect([file, read(file).includes("/products?")]).toEqual([file, false]);
    }
  });

  it("the index card links to the topic page", () => {
    // The card's one destination, now that there is no directory to cross-link.
    expect(read("topics/page.tsx")).toContain("topicPath(topic.value)");
  });

  it("neither page decides an order of its own", () => {
    // Core hands back entries carrying the board's own rank, already ordered.
    // HB4 — the topic page's directory list is the ONE exception, and it is
    // not an order of the page's own: `byMostActive` is the directory's
    // published default, at its own address, the same comparator `/` uses.
    expect(/\.sort\(/.test(markupOf("topics/page.tsx"))).toBe(false);
    const topic = markupOf("topics/[topic]/page.tsx");
    expect(topic.match(/\.sort\([^)]*\)/g)).toEqual([".sort(byMostActive)"]);
    for (const file of ["topics/page.tsx", "topics/[topic]/page.tsx"]) {
      expect([file, /rankBoard|buildTopic/.test(markupOf(file))]).toEqual([file, false]);
    }
  });

  it("reads one document for the index, and two — concurrently — for a topic (HB4)", () => {
    expect(read("topics/page.tsx").match(/await fetch[A-Z]\w+\(/g)).toEqual(["await fetchTopics("]);
    // The topic page's `generateMetadata` reads the same document the body
    // does; Next dedupes the fetch. HB4 adds the directory — the same cached
    // document `/` reads — in the same `Promise.all`, so it is still one
    // wait.
    const topic = read("topics/[topic]/page.tsx");
    expect(new Set(topic.match(/fetch[A-Z]\w+\(/g))).toEqual(
      new Set(["fetchTopic(", "fetchPublicDirectory("]),
    );
    expect(topic).toContain("await Promise.all([fetchTopic(value), fetchPublicDirectory()])");
  });

  it("HB4 — carries the whole topic under the month, and the count is the list's own length", () => {
    const topic = markupOf("topics/[topic]/page.tsx");
    expect(topic).toContain("cardsInTopic(cards, doc.value)");
    expect(topic).toContain("{topicDirectoryMeta(directory.length)}");
    expect(topic).toContain("{TOPIC_DIRECTORY_HEADING}");
    expect(topic).toContain("<BuildTile key={card.slug} card={card} returnTo={returnTo} />");
    // Absent when the directory could not be read — never a zero.
    expect(topic).toContain("directory !== null && directory.length > 0 ?");
  });

  it("reuses the FEED ROW rather than drawing a second kind of row", () => {
    // The row is the unit that repeats. A topic page with its own row would be
    // a second set of fourteen measurements to keep in step.
    expect(read("topics/[topic]/page.tsx")).toContain("<FeedRow");
  });
});

describe("what is absent", () => {
  it("HAS a follower count now, and a Follow button — FL0 made both honest", () => {
    // TP0 shipped these pages with neither: nothing observed a follow, so a
    // zero would have been a claim rather than a measurement (OPC-C), and a
    // control that looks live and does nothing is worse than an absent one.
    // These two assertions are the inverse of the ones they replace, and the
    // inversion is the record of what FL0 changed.
    for (const file of ["topics/page.tsx", "topics/[topic]/page.tsx"]) {
      expect([file, markupOf(file).includes("<FollowButton")]).toEqual([file, true]);
      expect([file, /followers=\{/.test(markupOf(file))]).toEqual([file, true]);
    }
  });

  it("counts PRODUCTS, not launches", () => {
    // LC0 made a launch a separate act from a publish so the two could be
    // counted apart.
    // Only the index card carries a count now; the topic page's header is the
    // design's title and description, and its empty panel is the note alone.
    expect(markupOf("topics/page.tsx").includes("products")).toBe(true);
    for (const file of ["topics/page.tsx", "topics/[topic]/page.tsx"]) {
      const src = markupOf(file);
      expect([file, /\{\s*\w+\.products\s*\}\s*\{?[^}]*launch/i.test(src)]).toEqual([file, false]);
    }
  });

  it("distinguishes a failed read from a quiet topic (the OD5 finding)", () => {
    expect(read("topics/page.tsx")).toContain("if (doc === null) notFound()");
    expect(read("topics/[topic]/page.tsx")).toContain("if (doc === null) notFound()");
  });

  it("an empty window says nothing LAUNCHED, not that nothing is here", () => {
    // The topic's products are one click away, so an empty list would make the
    // wrong claim silently.
    const page = read("topics/[topic]/page.tsx");
    expect(page).toContain("doc.entries.length === 0");
    expect(page).toContain("{doc.emptyNote}");
  });
});

describe("the feed row's topic", () => {
  it("renders the vocabulary's LABEL rather than the slug", () => {
    expect(read("feed/row-shell.tsx")).toContain("labelOf(TOPIC_FACET, value)");
  });

  it("IS a link, and the row is not — so no anchor ever nests in another", () => {
    // The design draws each topic as a link of its own. An anchor inside an
    // anchor is invalid HTML that browsers repair by splitting the outer one,
    // so the row is a flex container whose links are SIBLINGS: the name, the
    // tile, the tagline and each topic are each their own `<a>`, and no `<a>`
    // wraps the row.
    const row = markupOf("feed/row-shell.tsx");
    const meta = row.split("function Meta")[1] ?? "";
    expect(meta).toContain("href={topicPath(value)}");
    expect(row).not.toMatch(/<li[^>]*>\s*<a/);
  });

  it("the PRODUCT page makes it a link, where there is room for one", () => {
    const page = read("[slug]/page.tsx");
    expect(page).toContain("href={topicPath(profile.category)}");
  });
});

describe("the sitemap", () => {
  it("names the index and every topic that has a page", () => {
    const sitemap = read("sitemap.xml/route.ts");
    expect(sitemap).toContain('{ path: "topics", lastmod: null }');
    expect(sitemap).toContain("topics/${topic.value}");
  });

  it("READS the topics rather than deriving them from the directory", () => {
    // Core decides which values are renderable. A sitemap that guessed would
    // eventually advertise a 404.
    expect(read("sitemap.xml/route.ts")).toContain("fetchTopics()");
  });

  it("fails the whole document rather than emitting a partial one", () => {
    // A cacheable sitemap that omits a namespace tells a crawler those pages
    // were removed — confidently wrong is worse than absent.
    expect(read("sitemap.xml/route.ts")).toContain("topicDoc === null");
  });
});
