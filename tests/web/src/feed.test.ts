// The feed's page and its row (openproduct-launch OL2).
//
// The GROUPING is tested in packages/contracts and the READ in tests/core.
// What is pinned here is what the web layer is responsible for:
//
//   - `/` is the feed, and the ONLY list: `/products` and `/launches` are
//     redirects to it, issued from next.config.mjs
//   - nothing on the page decides an order (OL-2a)
//   - the row is the design's fourteen measurements, and a fact it does not
//     have renders absent rather than as a zero (OPC-C)
//   - the tile's colour is derived from the slug, so it is the same on every
//     render of one cached document
//   - every link whose WORDS promise the catalogue carries the feed's address

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUILD_TILE_LABEL,
  BUILD_ORDERS,
  BUILD_ORDER_LABEL,
  FEED_PAGE_HEADING,
  buildOrderPath,
  catalogueMomentCopy,
} from "@openproduct/contracts";
import { ordinal } from "@openproduct-web/app/ui/ordinal";
import { hueFor, initialsOf } from "@openproduct-web/app/feed/tile";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

describe("`/` is Open builds, and there is no second list (OB4)", () => {
  it("the front page reads the catalogue, and nothing else", () => {
    const page = read("page.tsx");
    // ONE read since openproduct-calm CL2: the margin left with render C
    // (CL-R5), so the sidebar's document is no longer read here. The day
    // board left at OB4.
    expect(page).toContain("const directory = await fetchDirectoryPage();");
    expect(page.match(/fetch[A-Z]\w+\(\)/g)).toEqual(["fetchDirectoryPage()"]);
    expect(page).not.toContain("fetchFeed(");
    expect(page).not.toContain("fetchSidebar(");
    expect(page).not.toContain("<Sidebar");
    expect(existsSync(resolve(APP_DIR, "feed/sidebar.tsx"))).toBe(false);
  });

  it("is titled Open builds, renders no day board, and draws the list in the Most active order", () => {
    expect(FEED_PAGE_HEADING).toBe("Open builds");
    const page = read("page.tsx");
    expect(page).toContain("{FEED_PAGE_HEADING}");
    expect(page).toContain("{FEED_PAGE_SUBTITLE}");
    // The order is the contract's: the floor, then the comparator.
    expect(page).toContain('orderBuilds(cards, "most-active")');
    expect(page).toContain('order="most-active"');
    // No board on the front page: no groups, no day cards, no launch rows.
    for (const gone of ["groups.map", "GroupCard", "FeedRow", "feedIsEmpty", "launches/${"]) {
      expect([gone, page.includes(gone)]).toEqual([gone, false]);
    }
    expect(existsSync(resolve(APP_DIR, "feed/feed.tsx"))).toBe(false);
    const list = read("feed/builds.tsx");
    expect(list).toContain("<SortControl current={order} />");
    expect(list).toContain("<BuildTile key={card.slug} card={card}");
    // The tile invents nothing a card does not carry: no rank, no comment
    // count, the listing's own public total on the vote box.
    const tile = read("feed/build-tile.tsx");
    expect(tile).toContain("size={72} phoneSize={52}");
    expect(tile).toContain("text-[22px]");
    expect(tile).toContain("count={endorsementsOf(card)}");
    expect(tile).not.toContain("#discussion");
    expect(tile).not.toContain('"use client"');
    expect(existsSync(resolve(APP_DIR, "feed/card-row.tsx"))).toBe(false);
  });

  it("each tile names its three figures once and shows the number (CL-R3, CL-R4)", () => {
    expect(BUILD_TILE_LABEL).toEqual({ changes: "Changes · 7d", upvotes: "Upvotes · 7d", roles: "Roles open" });
    const tile = read("feed/build-tile.tsx");
    expect(tile).toContain("mergesOf(card)");
    // A dash for a repo we did not read — never a zero (OPC-C).
    expect(tile).toContain("changes === null ? DASH : changes");
    expect(tile).toContain("{recentEndorsementsOf(card)}");
    expect(tile).toContain("{card.roleOpeningCount}");
    for (const label of ["{BUILD_TILE_LABEL.changes}", "{BUILD_TILE_LABEL.upvotes}", "{BUILD_TILE_LABEL.roles}"]) {
      expect(tile).toContain(label);
    }
    // The sentences the row repeated beside every number are gone.
    expect(tile).not.toContain("changes this week");
    expect(tile).not.toContain("roles open\"");
    expect(tile).not.toContain("contributors wanted");
    // Two lines of tagline at most.
    expect(tile).toContain("line-clamp-2");
  });

  it("the sort control is four links, Most active first, each its own cacheable address", () => {
    expect([...BUILD_ORDERS]).toEqual(["most-active", "newest", "upvoted", "roles"]);
    expect(BUILD_ORDERS.map((o) => BUILD_ORDER_LABEL[o])).toEqual(["Most active", "Newest", "Upvoted", "Roles"]);
    expect(buildOrderPath("most-active")).toBe("/");
    expect(buildOrderPath("roles")).toBe("/builds/roles");
    const control = read("feed/sort-control.tsx");
    expect(control).toContain("href={buildOrderPath(order)}");
    expect(control).toContain('aria-current={on ? "page" : undefined}');
    expect(control).not.toContain('"use client"');
    // A query string would make the document dynamic (UV2's finding).
    const orders = read("builds/[order]/page.tsx");
    expect(orders).toContain("export const revalidate = 60;");
    // Not `dynamicParams = false`: the incremental cache starts each deploy
    // empty, so Next would 404 every order (it did, in production).
    expect(orders).not.toMatch(/export const dynamicParams/);
    expect(orders).toContain("if (!isBuildOrder(order) || order === \"most-active\") notFound();");
    expect(orders).toContain("BUILD_ORDER_SEGMENTS.map((order) => ({ order }))");
    expect(orders).not.toMatch(/searchParams/);
    expect(read("page.tsx")).not.toMatch(/searchParams/);
  });

  it("the directory and the board index are redirects to `/`, issued at the edge", () => {
    expect(existsSync(resolve(APP_DIR, "products/page.tsx"))).toBe(false);
    expect(existsSync(resolve(APP_DIR, "launches/page.tsx"))).toBe(false);
    expect(existsSync(resolve(APP_DIR, "list/directory.tsx"))).toBe(false);
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(config).toContain('{ source: "/products", destination: "/", permanent: true }');
    expect(config).toContain('{ source: "/launches", destination: "/", permanent: true }');
    // A day's own board survives as the archive, outside the nav.
    expect(existsSync(resolve(APP_DIR, "launches/[day]/page.tsx"))).toBe(true);
  });

  it("the front page is canonical at `/`, and the sitemap names no second list", () => {
    expect(read("page.tsx")).toContain("${publicApexOrigin()}/`");
    expect(read("sitemap.xml/route.ts")).not.toContain('{ path: "products"');
  });

  it("distinguishes a failed read from an empty catalogue", () => {
    const page = read("page.tsx");
    // An empty room and a locked door look nothing alike to a visitor (OD5).
    expect(page).toContain("cards === null ? (");
    expect(page).toContain("<FailurePanel");
    expect(read("feed/builds.tsx")).toContain("BUILD_ORDER_EMPTY[order]");
  });
});

describe("nothing on the page decides an order (OL-2a)", () => {
  it("neither the page nor the list sorts, ranks or compares a count — the contract does", () => {
    for (const file of ["page.tsx", "feed/builds.tsx", "feed/build-tile.tsx", "feed/more-builds.tsx", "builds/[order]/page.tsx"]) {
      const source = read(file);
      expect([file, /\.sort\(/.test(source)]).toEqual([file, false]);
      expect([file, /\brankBoard\b/.test(source)]).toEqual([file, false]);
      expect([file, /counted\s*[<>]/.test(source)]).toEqual([file, false]);
    }
  });

  it("the launch row keeps its board rank where a board is drawn", () => {
    // The day's board at `/launches/{day}` and the topic page still draw the
    // launch row; its rank is a fact the board published.
    expect(read("feed/feed-row.tsx")).not.toContain("isFirstToday(");
    expect(read("feed/feed-row.tsx")).toContain("firstToday");
    expect(read("feed/row-shell.tsx")).toContain("<Rank rank={entry.rank} />");
  });
});

describe("the row renders an absent fact as absent, never as zero (OPC-C)", () => {
  // IN0 SPLIT THE ROW: the markup moved to `feed/row-shell.tsx` so `/submit`
  // can render it without the two acting boxes, which `feed-row.tsx` imports
  // at module scope. Every assertion below is about the markup, so it follows
  // the markup — nothing here changed about what the row draws.
  const row = read("feed/row-shell.tsx");

  it("shows no position for a launch the sweep has not reached", () => {
    // Re-pinned at the row layout: the rank is inline before the name as
    // `1.` rather than a padded serif numeral in a 30px gutter, so the
    // absence is a component that renders NOTHING rather than an empty
    // string held in a column — never a zero or a dash.
    expect(row).toContain("if (rank === null) return null;");
    expect(row).toContain("{rank}.");
    // And the row still starts at the name for an unranked launch: there is
    // no reserved column left to hold open.
    expect(row).not.toContain("w-[30px]");
  });

  it("shows no count for an unranked launch", () => {
    // UV0 moved the box out of the row and into `ui/vote-box.tsx`, which is
    // the control both this row and the product page draw. The rule came with
    // it: a count that was not measured is a dash, never a zero.
    const box = read("ui/vote-box.tsx");
    // A count never measured stays a dash — until this visitor's own vote,
    // which is the one number about it they can see move.
    expect(box).toContain('count === null ? (delta > 0 ? delta : "—") : count + delta');
    // And the row passes `null` for a launch the sweep has not ranked, rather
    // than passing its zero through. THE COMPOSITION, not the shell: IN0 moved
    // the markup out and left the two boxes — and what they are handed — where
    // they were.
    expect(read("feed/feed-row.tsx")).toContain(
      "count={entry.rank === null ? null : entry.counted}",
    );
  });

  it("omits the demand badge rather than saying `0 people wanted`", () => {
    expect(row).toContain("entry.roleOpeningCount > 0");
  });

  it("shows the comment count at zero, as the design does, and links it to the discussion", () => {
    // `0 comments` is an invitation to be the first — the link goes to the
    // discussion — and the design draws it on every row. This is an OBSERVED
    // zero: the thread was counted and found empty (OPC-C's honest zero).
    // Re-pinned at the row layout: the count left the meta line for a box of
    // its own (`ui/comment-box.tsx`), so the behaviour is pinned where it
    // now lives — the row still passes every count through, zero included.
    expect(read("feed/feed-row.tsx")).toContain("count={entry.commentCount}");
    // Comments stripped: a guard about markup must not read the prose that
    // explains why the dash it forbids is not rendered.
    const box = read("ui/comment-box.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(box).toContain("`/${slug}#discussion`");
    expect(box).toContain("{count}");
    // No dash and no absence: a zero is rendered as a zero.
    expect(box).not.toContain("—");
    expect(box).not.toMatch(/count\s*>\s*0/);
    expect(box).not.toContain('"use client"');
  });

  it("omits a licence it did not observe rather than substituting one", () => {
    // MATCHES WHAT IS APPLIED, NOT THE PROSE. Grepping the whole file for
    // "unknown" failed on the COMMENT that explains why the word is not
    // rendered — the same trap XP-1's accent guard fell into and was rewritten
    // to avoid. What the rule actually is: the licence has no fallback value.
    expect(row).toContain("entry.licence ?");
    expect(row).not.toMatch(/entry\.licence\s*\?\?/);
  });
});

describe("the row is the design's own measurements", () => {
  // The measurements followed the markup into `feed/row-shell.tsx` (IN0).
  const row = read("feed/row-shell.tsx");

  it("carries the tile's numbers (openproduct-calm CL5) and the badges' from design-reference.md §4", () => {
    // The launch row took the build tile's shape at CL5: a rounded card per
    // launch, the tile's padding and gap, the 20px name. Its badges, tagline
    // and meta line keep the prototype's values.
    for (const measurement of [
      "gap-[22px]", // the tile's gap
      "rounded-[20px] border border-border bg-card", // one card per launch
      "px-8 py-6", // the tile's padding
      // The 30px gutter and its Newsreader numeral left with the row layout:
      // the rank is inline before the name now, at the name's own size and
      // weight, so those two rungs became the one below.
      "text-[20px]", // name, and the rank before it
      "tracking-[-0.015em]", // name letter-spacing
      "h-[20px]", // both badges
      "rounded-[6px]", // `#1 today`
      "text-[11.5px]", // badges and licence
      "tracking-[0.04em]", // licence letter-spacing
      "text-[15px] leading-[1.45]", // tagline
      "text-[13px]", // meta
    ]) {
      expect([measurement, row.includes(measurement)]).toEqual([measurement, true]);
    }
    // The tile's own measurements live with the tile (`ui/logo-tile.tsx`),
    // which every surface draws at its own size from one ladder; the row asks
    // for the 72px rung, and the 52px one on a phone.
    expect(row).toContain("size={72} phoneSize={52}");
    const tile = read("ui/logo-tile.tsx");
    // openproduct-studio OSD3 split the rung into its box (shared with the
    // logo, `tileBox`) and its type (the monogram's alone).
    expect(tile).toContain('"h-[52px] w-[52px] rounded-[14px]"');
    expect(tile).toContain('"text-[16px] font-medium"');
    // The vote box's own measurements moved with the box at UV0 — it is a
    // control both this row and the product page draw, so its numbers live in
    // one file rather than in two that have to stay in step. 58×58, radius
    // 12, the mark at 11px over IBM Plex Mono 14px: the design's box.
    const box = read("ui/vote-box.tsx");
    for (const measurement of ["h-[52px] w-[52px]", "rounded-[10px]", "text-[14px]"]) {
      expect([measurement, box.includes(measurement)]).toEqual([measurement, true]);
    }
  });

  it("spends the accent on the vote and on `#1 today`, which are the same act", () => {
    // XP-1 — one accent colour, one meaning. Both of these ARE the
    // endorsement (OL-1), so both may wear it.
    expect(row).toContain("bg-endorse-soft");
    expect(row).toContain("text-endorse-ink");
  });

  it("stays a server component — nothing on it is personal", () => {
    // The count is the day's, identical for every reader; the visitor's own
    // vote state arrives after paint from the overlay (UV0, I6).
    expect(row).not.toContain('"use client"');
    expect(read("feed/builds.tsx")).not.toContain('"use client"');
    expect(read("page.tsx")).not.toContain('"use client"');
  });
});

describe("the tile is derived, never random", () => {
  it("gives one slug one hue, every time", () => {
    // A colour that moved between two reads of one cached document is the
    // kind of detail that makes a page look broken without anybody being able
    // to say why.
    expect(hueFor("kettleworks")).toBe(hueFor("kettleworks"));
    expect(hueFor("kettleworks")).not.toBe(hueFor("openproduct"));
    for (const slug of ["a", "kettleworks", "openproduct", "x-9"]) {
      const hue = hueFor(slug);
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("never renders an empty tile", () => {
    expect(initialsOf("open-product")).toBe("OP");
    expect(initialsOf("kettleworks")).toBe("KE");
    expect(initialsOf("a")).toBe("A");
    // A blank tile is a rendering bug that looks like missing data.
    expect(initialsOf("")).toBe("··");
    expect(initialsOf("---")).toBe("··");
  });
});

describe("no link promises a directory that no longer exists", () => {
  it("no page links `/products`, and every catalogue link lands on the launches", () => {
    // The word "directory" left the product with the page. A link that still
    // said it, or still pointed at `/products`, would arrive — the redirect
    // sees to that — but it would arrive after a hop, on the busiest links
    // the product has.
    for (const file of [
      "not-found.tsx",
      "submit/page.tsx",
      "me/saved/page.tsx",
      "me/applications/page.tsx",
      "shell/palette.tsx",
      "shell/palette-rows.ts",
      "[slug]/page.tsx",
      "topics/page.tsx",
      "topics/[topic]/page.tsx",
      "launches/[day]/page.tsx",
    ]) {
      const source = read(file);
      expect([file, /href="\/products"|"\/products\?|DIRECTORY_PATH|topicDirectoryPath/.test(source)]).toEqual([file, false]);
    }
  });

  it("the wordmark and the Products pill both point at the root, because the root is the list", () => {
    expect(read("shell/top-panel.tsx")).toContain('href="/"');
    const shell = read("shell/shell.ts");
    // PL0 — the label is the list's name; the id stays, because `sectionFor`
    // and the archive's paths key on it. OB1 — the list is the builds.
    expect(shell).toContain('{ id: "launches", label: "Builds", href: "/", status: "live", icon: "build" }');
    expect(shell).not.toContain('"/products"');
  });
});

describe("UV1 — where a listing placed on the day it launched", () => {
  const page = read("[slug]/page.tsx");

  it("renders the row only when there IS a placement", () => {
    // OL3 left this row out because the rank was not unmeasured — it did not
    // exist. UV1 gives it one, and keeps the same rule: no launch, or a day
    // the sweep has not reached, renders NO ROW rather than a dash (OPC-C).
    expect(page).toContain("{profile.launch ? (");
    expect(page).toContain("Rank that day");
    // And the absence is the projection's, not a conditional invented here:
    // the wire carries no `launch` key at all when there is nothing to say.
    expect(page).not.toMatch(/profile\.launch\s*\?\?/);
    expect(page).not.toMatch(/launch\s*===\s*null/);
  });

  it("scales the ordinal, and links the day to its own board", () => {
    // A position a reader cannot scale is a number they have to take on
    // trust. "2nd of 11" says how crowded the day was; "2nd" does not.
    expect(page).toContain("{ordinal(profile.launch.rank)} of {profile.launch.of}");
    // OPC-4 — the claim is checkable in one click, against the board that
    // made it.
    expect(page).toContain("`/launches/${profile.launch.day}`");
  });

  it("carries the accountability pair where a maker can find it", () => {
    // LC3 published `ineligible` beside `counted` so a maker whose launch was
    // shared somewhere popular can reconcile the position against the total
    // on their own page. The row is small, so the pair rides as its title.
    expect(page).toContain("profile.launch.counted");
    expect(page).toContain("profile.launch.ineligible > 0");
  });
});

describe("the ordinal", () => {
  it("gets the teens right, which is the only hard part", () => {
    // 11, 12 and 13 take `th` while 21, 22 and 23 do not — and a board with
    // eleven launches on it is an ordinary Tuesday, not an edge case.
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
      "112th",
    ]);
  });
});

describe("OS5 — the catalogue's moment is on the page", () => {
  it("the heading's line says when the catalogue was computed, from the contract, and says nothing on the live join", () => {
    const source = read("feed/builds.tsx");
    // The line beside the control is the count, the order and the moment.
    expect(source).toContain("buildsMeta(order, builds.length, belowFloor, total)");
    expect(source).toContain("catalogueMomentCopy(computedAt)");
    expect(source).toContain("data-catalogue-moment");
    expect(source).toMatch(/<time dateTime=\{computedAt \?\? undefined\}/);
    expect(catalogueMomentCopy(null)).toBeNull();
    // The page hands the directory's moment through; the cursor page renders it the same way.
    expect(read("page.tsx")).toContain("computedAt={directory?.computedAt ?? null}");
    expect(read("products/[cursor]/page.tsx")).toContain("catalogueMomentCopy(page.computedAt)");
  });
});
