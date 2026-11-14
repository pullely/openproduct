// The feed's page and its row (openproduct-launch OL2).
//
// The GROUPING is tested in packages/contracts and the READ in tests/core.
// What is pinned here is what the web layer is responsible for:
//
//   - `/` lists the products under the title Products (it becomes the feed
//     of posts in OPR2); `/products` is the same view with its sorts in
//     `?sort=`; `/launches` redirects to `/` from next.config.mjs
//   - nothing on the page decides an order (OL-2a)
//   - the row is the design's fourteen measurements, and a fact it does not
//     have renders absent rather than as a zero (OPC-C)
//   - the tile's colour is derived from the slug, so it is the same on every
//     render of one cached document
//   - every link whose WORDS promise the catalogue carries the feed's address

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BUILD_ORDERS, catalogueMomentCopy, type PublicProfileCard } from "@openproduct/contracts";
import {
  PRODUCTS_EMPTY,
  PRODUCT_SORTS,
  PRODUCT_SORT_LABEL,
  openSeatsLabel,
  productFacts,
} from "@openproduct-web/app/feed/products";
import { ordinal } from "@openproduct-web/app/ui/ordinal";
import { hueFor, initialsOf } from "@openproduct-web/app/feed/tile";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
/** The same file with its comments removed: what the page draws, not what it says about itself. */
const code = (file: string) =>
  read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("`/` lists the products, and says so (openproduct-redesign OPR1)", () => {
  it("the front page draws the Products view in the default sort, and nothing else", () => {
    const page = read("page.tsx");
    // ONE BODY: the Products page's own view, in today's default order. `/`
    // becomes the feed of posts in OPR2; until then it is the product list
    // and is titled as one — nothing on it claims to be a feed.
    expect(page).toContain('<ProductsView sort={DEFAULT_PRODUCT_SORT} returnTo="/" retryHref="/" />');
    expect(page).toContain('title: "Products · openproduct"');
    expect(page).not.toMatch(/<h1[^>]*>\s*Feed|FEED_PAGE_HEADING|Open builds ·/);
    expect(page).not.toContain("fetchFeed(");
    expect(page).not.toContain("fetchSidebar(");
    expect(page).not.toContain("<Sidebar");
    expect(existsSync(resolve(APP_DIR, "feed/sidebar.tsx"))).toBe(false);
    // Static: it reads no query string, so it stays one revalidated document.
    expect(page).toContain("export const revalidate = 60;");
    expect(page).not.toMatch(/searchParams/);
    // No board on the front page: no groups, no day cards, no launch rows.
    for (const gone of ["groups.map", "GroupCard", "FeedRow", "feedIsEmpty", "launches/${"]) {
      expect([gone, page.includes(gone)]).toEqual([gone, false]);
    }
    expect(existsSync(resolve(APP_DIR, "feed/feed.tsx"))).toBe(false);
  });

  it("the view is titled Products, with one h1, the count beside it and the sort", () => {
    const view = read("feed/products-view.tsx");
    expect(view.match(/<h1\b/g)).toHaveLength(1);
    expect(view).toContain("<h1 className={PAGE_TITLE}>Products</h1>");
    expect(view).toContain("{productsCountLine(products.count, products.belowFloor)}");
    expect(view).toContain("<SortMenu current={sort} />");
    expect(view).toContain("sort={<SortControl current={sort} />}");
    // The default sort is the catalogue's first page, continued by cursor;
    // any other sort is the whole catalogue, ordered by the contract.
    expect(view).toContain("const directory = await fetchDirectoryPage();");
    expect(view).toContain("const all = await fetchAllDirectoryProjects();");
    expect(view).toContain("orderBuilds(directory.projects, sort)");
    expect(view).toContain("orderBuilds(all, sort)");
    expect(view).toContain("ordered.slice(0, BUILD_ORDER_PAGE_SIZE)");
    // The stage filter and the milestone bar arrive with OPR2: not drawn, and
    // not faked.
    expect(code("feed/products-view.tsx")).not.toMatch(/Shipping|Ideas|aria-label="Product stages"/);
  });

  it("the card is the board's: face, name, category, facts, pitch, seats and Follow", () => {
    const card = read("feed/product-card.tsx");
    expect(card).toContain("<ProductTile slug={card.slug} thumbnail={card.thumbnail} size={44} />");
    expect(card).toContain("text-card-title font-semibold");
    expect(card).toContain("{productFacts(card)}");
    // Two lines of pitch at most.
    expect(card).toContain("line-clamp-2");
    // The seats link is drawn only when a seat is open, and goes to Help wanted.
    expect(card).toMatch(/card\.roleOpeningCount > 0 \? \(\s*<AppLink\s+href="\/help-wanted"/);
    expect(card).toContain("{openSeatsLabel(card.roleOpeningCount)}");
    // Follow follows the LISTING, through the overlay.
    expect(card).toContain("<FollowProduct slug={card.slug} returnTo={returnTo} />");
    const follow = read("feed/follow-product.tsx");
    expect(follow).toContain('followKey({ kind: "listing", value: slug })');
    expect(follow).toContain('useToggle("follows", key, !following)');
    expect(follow).toContain("aria-pressed={following}");
    // The card invents nothing: no rank, no comment count, no stage, no vote.
    expect(card).not.toContain("#discussion");
    expect(code("feed/product-card.tsx")).not.toMatch(/VoteBox|Shipping|Idea\b/);
    expect(card).not.toContain('"use client"');
    expect(existsSync(resolve(APP_DIR, "feed/card-row.tsx"))).toBe(false);
    // The old tile's name is gone with its last importer — one card, one name.
    expect(existsSync(resolve(APP_DIR, "feed/build-tile.tsx"))).toBe(false);
  });

  it("the card's facts say what was observed, and leave out what was not (OPC-C)", () => {
    const card = (metrics: Array<{ key: string; value: number }>) => ({ metrics }) as unknown as PublicProfileCard;
    expect(productFacts(card([{ key: "merges.7d", value: 12 }, { key: "endorsements.7d", value: 3 }]))).toBe(
      "12 changes · 3 upvotes · 7 days",
    );
    expect(productFacts(card([{ key: "merges.7d", value: 1 }, { key: "endorsements.7d", value: 1 }]))).toBe(
      "1 change · 1 upvote · 7 days",
    );
    // A repository nobody read is not zero changes: the fact is absent.
    expect(productFacts(card([]))).toBe("0 upvotes · 7 days");
    expect(openSeatsLabel(1)).toBe("1 open seat");
    expect(openSeatsLabel(2)).toBe("2 open seats");
  });

  it("the sort control is three links, the default first, and never a client re-sort", () => {
    expect([...BUILD_ORDERS]).toEqual(["most-active", "newest", "upvoted", "roles"]);
    expect([...PRODUCT_SORTS]).toEqual(["most-active", "newest", "upvoted"]);
    expect(PRODUCT_SORTS.map((sort) => PRODUCT_SORT_LABEL[sort])).toEqual(["Most active", "Newest", "Upvoted"]);
    const control = read("feed/sort-control.tsx");
    expect(control.match(/href=\{productsPath\(sort\)\}/g)).toHaveLength(2);
    expect(control).toContain('aria-current={sort === current ? "page" : undefined}');
    expect(control).not.toContain('"use client"');
    // The phone's control opens without JavaScript.
    expect(control).toContain("<details data-product-sort-menu");
    expect(control).not.toMatch(/endorse/);
  });

  it("the board index is a redirect to `/`, issued at the edge, and the faceted directory is gone", () => {
    expect(existsSync(resolve(APP_DIR, "launches/page.tsx"))).toBe(false);
    expect(existsSync(resolve(APP_DIR, "list/directory.tsx"))).toBe(false);
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(config).toContain('{ source: "/launches", destination: "/", permanent: true }');
    // A day's own board survives as the archive, outside the nav.
    expect(existsSync(resolve(APP_DIR, "launches/[day]/page.tsx"))).toBe(true);
  });

  it("`/products` is the same view in the sort its query string names", () => {
    const products = read("products/page.tsx");
    expect(products).toContain("const sort = productSortOf((await searchParams).sort);");
    expect(products).toContain("<ProductsView sort={sort} returnTo={productsPath(sort)} retryHref={productsPath(sort)} />");
    // A page that reads `searchParams` is dynamic: a `revalidate` beside it
    // would be accepted and ignored, so none is declared (the census's QUERY
    // class) — and it still resolves no actor (I6).
    expect(products).not.toMatch(/export const revalidate/);
    expect(products).not.toMatch(/cookies\(|headers\(|readSession/);
    // Not a redirect — a redirect and a page at one address would be the
    // redirect winning, and the pill landing on `/`.
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(config).not.toContain('source: "/products"');
  });

  it("each list address is canonical at itself, and the sitemap names both", () => {
    expect(read("page.tsx")).toContain("${publicApexOrigin()}/`");
    // A sort's canonical is its own address; an unknown `?sort=` is the
    // default list and says `/products`.
    expect(read("products/page.tsx")).toContain("alternates: { canonical: `${origin}${productsPath(sort)}` }");
    expect(read("sitemap.xml/route.ts")).toContain('{ path: "products", lastmod: null }');
  });

  it("Help wanted is its own page of seats, and the old address redirects", () => {
    const page = read("help-wanted/page.tsx");
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(page).toContain("<h1 className={PAGE_TITLE}>Help wanted</h1>");
    // The products with a seat open come from the contract's Roles order.
    expect(page).toContain('orderBuilds(cards, "roles")');
    expect(page).toContain("<SeatCard key={seat.id} seat={seat} action={seatAction(seat, { consoleOrigin: origin })} />");
    expect(page).toContain("export const revalidate = 60;");
    expect(page).toContain("${publicApexOrigin()}/help-wanted`");
    expect(page).not.toMatch(/searchParams|cookies\(|headers\(/);
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(config).toContain('{ source: "/builds/roles", destination: "/help-wanted", permanent: true }');
    expect(read("sitemap.xml/route.ts")).toContain('{ path: "help-wanted", lastmod: null }');
  });

  it("distinguishes a failed read from an empty catalogue", () => {
    const view = read("feed/products-view.tsx");
    // An empty room and a locked door look nothing alike to a visitor (OD5).
    expect(view).toContain("if (products === null) {");
    expect(view).toContain("<FailurePanel");
    expect(read("feed/product-list.tsx")).toContain("{searching ? noProductsMatch(query) : PRODUCTS_EMPTY}");
    expect(PRODUCTS_EMPTY).toBe("No products are listed yet.");
  });
});

describe("nothing on the page decides an order (OL-2a)", () => {
  it("neither the page nor the list sorts, ranks or compares a count — the contract does", () => {
    for (const file of [
      "page.tsx",
      "products/page.tsx",
      "feed/products-view.tsx",
      "feed/products.ts",
      "feed/product-card.tsx",
      "feed/product-list.tsx",
      "help-wanted/page.tsx",
      "help-wanted/seats.ts",
    ]) {
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
    expect(read("feed/products-view.tsx")).not.toContain('"use client"');
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
      // The saved list and the applications are sections of `/me` since
      // openproduct-redesign OPR1; the links they drew are in these two.
      "me/page.tsx",
      "me/sections.tsx",
      "shell/palette.tsx",
      "shell/palette-rows.ts",
      "[slug]/page.tsx",
      "topics/page.tsx",
      "topics/[topic]/page.tsx",
    ]) {
      const source = read(file);
      expect([file, /href="\/products"|"\/products\?|DIRECTORY_PATH|topicDirectoryPath/.test(source)]).toEqual([file, false]);
    }
  });

  it("a day's board says where its list lives now: Products, at /products", () => {
    // Its breadcrumb read "Launches" and went to `/` — the board index that
    // folded into the front page. Since openproduct-redesign OPR1 `/` is the
    // feed and `/products` is a page again (no hop), so the trail names the
    // section the day's products belong to, in the nav's own word, and the
    // structured trail beside it says the same thing.
    const day = code("launches/[day]/page.tsx");
    expect(day).toMatch(/<AppLink href="\/products" className=\{`tap \$\{LINK_QUIET\}`\}>\s*Products\s*<\/AppLink>/);
    expect(day).toContain('{ name: "Products", path: "/products" },');
    expect(day).not.toMatch(/DIRECTORY_PATH|topicDirectoryPath/);
  });

  it("the wordmark and the Feed pill point at the root; Products has an address of its own", () => {
    expect(read("shell/top-panel.tsx")).toContain('href="/"');
    const shell = read("shell/shell.ts");
    // OPR1 — the header is Feed, Products, Help wanted. `/products` is in
    // the shell again, and this time it is a page (above), not a promise.
    expect(shell).toContain('{ id: "feed", label: "Feed", href: "/", icon: "feed" }');
    expect(shell).toContain('{ id: "products", label: "Products", href: "/products", icon: "products" }');
    expect(existsSync(resolve(APP_DIR, "products/page.tsx"))).toBe(true);
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
    const source = read("feed/products-view.tsx");
    // The line beside the title is the count and the moment.
    expect(source).toContain("{productsCountLine(products.count, products.belowFloor)}");
    expect(source).toContain("catalogueMomentCopy(products.computedAt)");
    expect(source).toContain("data-catalogue-moment");
    expect(source).toMatch(/<time dateTime=\{products\.computedAt \?\? undefined\}/);
    expect(catalogueMomentCopy(null)).toBeNull();
    // The view reads the directory's moment; the cursor page renders it the same way.
    expect(source).toContain("computedAt: directory.computedAt,");
    expect(read("products/[cursor]/page.tsx")).toContain("catalogueMomentCopy(page.computedAt)");
  });
});
