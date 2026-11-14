// Products and Help wanted (openproduct-redesign OPR1; boards `Products`,
// `PhoneProducts`, `Seats`, `PhoneSeats`).
//
// What the two pages DRAW is pinned where each list of pages already is
// (`feed.test.ts`, `calm-builds.test.ts`, `catalogue-page.test.ts`,
// `floor.test.ts`, `target-size.test.ts`). This file holds the three rules
// the milestone added:
//
//   - a sort is an address: `/products` for the default, a PATH
//     (`/products/by/<order>`) for the others, what an unknown one is, and
//     why a cursor's address can never be one of them
//   - the old `/builds/{order}` addresses redirect, each to the right place,
//     with a status a crawler can read
//   - a seat's ticket: what it says, and the three states its button has

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUILD_ORDERS,
  BUILD_ORDER_SEGMENTS,
  cataloguePagePath,
  decodeCursor,
  encodeCursor,
  type PublicRoleOpening,
} from "@openproduct/contracts";
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORTS,
  PRODUCT_SORT_LABEL,
  isProductSort,
  PRODUCTS_ORDER_SEGMENT,
  PRODUCT_ORDER_SEGMENTS,
  productSortOfSegment,
  productsPath,
} from "@openproduct-web/app/feed/products";
import {
  SEATS_STEP,
  SEAT_CLOSED_LABEL,
  SEAT_PRODUCT_LIMIT,
  SEAT_REQUESTED_LABEL,
  SEAT_TAKE_LABEL,
  seatAction,
  seatDoorHref,
  seatSub,
  seatTotals,
  seatsCountLine,
  seatsCountLineShort,
  seatsOf,
  seatsShownLine,
} from "@openproduct-web/app/help-wanted/seats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("a sort is an address", () => {
  it("offers three of the four published orders, under their published names", () => {
    expect([...PRODUCT_SORTS]).toEqual(["most-active", "newest", "upvoted"]);
    for (const sort of PRODUCT_SORTS) expect((BUILD_ORDERS as readonly string[]).includes(sort)).toBe(true);
    expect(PRODUCT_SORT_LABEL).toEqual({ "most-active": "Most active", newest: "Newest", upvoted: "Upvoted" });
    // Roles is the Help wanted section, not a sort — and no published order
    // sorts by the number of open seats, so the board's "Most open seats" is
    // not offered rather than approximated.
    expect(isProductSort("roles")).toBe(false);
    expect(Object.values(PRODUCT_SORT_LABEL).join(" ")).not.toMatch(/seats|A–Z/i);
  });

  it("the default is today's default, and it has exactly one address", () => {
    expect(DEFAULT_PRODUCT_SORT).toBe("most-active");
    expect(productsPath()).toBe("/products");
    expect(productsPath("most-active")).toBe("/products");
    expect(productsPath("newest")).toBe("/products/by/newest");
    expect(productsPath("upvoted")).toBe("/products/by/upvoted");
    // A PATH, never a query string: a page that reads `?sort=` is rendered
    // per request and goes out `no-store` (design.md §4).
    for (const sort of PRODUCT_SORTS) expect(productsPath(sort)).not.toMatch(/[?=&#]/);
  });

  it("reads the order from the path, and anything it does not know is no page at all", () => {
    expect([...PRODUCT_ORDER_SEGMENTS]).toEqual(["newest", "upvoted"]);
    expect(productSortOfSegment("newest")).toBe("newest");
    expect(productSortOfSegment("upvoted")).toBe("upvoted");
    // The default order's one address is `/products`: it is not ALSO a page
    // under `/products/by/`.
    expect(productSortOfSegment("most-active")).toBeNull();
    for (const unknown of [undefined, null, "", "roles", "NEWEST", "az", "seats", "new", "nope", "__proto__", ["newest"]]) {
      expect([unknown, productSortOfSegment(unknown)]).toEqual([unknown, null]);
    }
  });

  it("every sort's address round-trips through the reader", () => {
    for (const sort of PRODUCT_ORDER_SEGMENTS) {
      const segments = productsPath(sort).split("/");
      expect(segments).toEqual(["", "products", PRODUCTS_ORDER_SEGMENT, sort]);
      expect(productSortOfSegment(segments[3])).toBe(sort);
    }
  });

  it("the sorted pages and `/products` are static, revalidated, and read no query string", () => {
    for (const file of ["products/page.tsx", "products/by/[order]/page.tsx"]) {
      const page = code(file);
      expect(page).toMatch(/^export const revalidate = 60;$/m);
      expect(page).not.toContain("searchParams");
      expect(page).not.toMatch(/cookies\(|headers\(|readSession|force-dynamic/);
    }
    const sorted = code("products/by/[order]/page.tsx");
    // Registered for ISR by naming its orders (XP4), and still open to a
    // cold cache: `dynamicParams` is not turned off.
    expect(sorted).toContain("return PRODUCT_ORDER_SEGMENTS.map((order) => ({ order }));");
    expect(sorted).not.toContain("dynamicParams");
    // An order that was never published is a 404, and each order is
    // canonical to itself.
    expect(sorted).toContain("if (sort === null) notFound();");
    expect(sorted).toContain("alternates: { canonical: `${origin}${productsPath(sort)}` }");
  });
});

describe("`by` beside `[cursor]`: a cursor is never an order, and an order is never a cursor", () => {
  const cursors = [
    { activity: 0, publishedAt: null, slug: "a" },
    { activity: 12, publishedAt: "2026-05-01T09:00:00.000Z", slug: "kettleworks" },
    { activity: null, publishedAt: null, slug: "by" },
    { activity: 9007199254740991, publishedAt: "2026-11-14T00:00:00.000Z", slug: "z".repeat(64) },
  ];

  it("the word `by` is not a cursor, and neither is any order's name", () => {
    expect(PRODUCTS_ORDER_SEGMENT).toBe("by");
    for (const word of [PRODUCTS_ORDER_SEGMENT, ...PRODUCT_SORTS]) expect([word, decodeCursor(word)]).toEqual([word, null]);
  });

  it("no cursor the directory issues is the word `by`, and its address is one segment", () => {
    for (const cursor of cursors) {
      const text = encodeCursor(cursor);
      // base64url of a JSON array: it begins with `W` (`[`), so it cannot be
      // `by` whatever the keys are.
      expect(text.startsWith("W")).toBe(true);
      expect(text).not.toBe(PRODUCTS_ORDER_SEGMENT);
      const path = cataloguePagePath(text);
      expect(path.split("/")).toHaveLength(3);
      expect(path.startsWith(`/products/${PRODUCTS_ORDER_SEGMENT}/`)).toBe(false);
    }
  });

  it("an order's address is two segments under /products, which a cursor's never is", () => {
    for (const sort of PRODUCT_ORDER_SEGMENTS) {
      expect(productsPath(sort).split("/")).toHaveLength(4);
      // Even a hostile cursor cannot reach the sorted pages: the path
      // builder escapes a slash rather than emitting a second segment.
      expect(cataloguePagePath(`${PRODUCTS_ORDER_SEGMENT}/${sort}`)).toBe(`/products/by%2F${sort}`);
    }
  });

  it("the continuation page refuses the stem by name, before the directory is asked", () => {
    const page = code("products/[cursor]/page.tsx");
    const refuse = page.indexOf("if (cursor === PRODUCTS_ORDER_SEGMENT) notFound();");
    expect(refuse).toBeGreaterThan(-1);
    expect(refuse).toBeLessThan(page.indexOf("fetchDirectoryPage(cursor)"));
  });
});

describe("the old order addresses redirect", () => {
  const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");

  it("maps each order to where it lives now, from the edge, in one hop", () => {
    // Every segment the contract ever published under `/builds/` is named,
    // so a new order cannot be added there without deciding where it goes.
    expect([...BUILD_ORDER_SEGMENTS]).toEqual(["newest", "upvoted", "roles"]);
    expect(config).toContain('{ source: "/builds/newest", destination: "/products/by/newest", permanent: true }');
    expect(config).toContain('{ source: "/builds/upvoted", destination: "/products/by/upvoted", permanent: true }');
    expect(config).toContain('{ source: "/builds/roles", destination: "/help-wanted", permanent: true }');
    // The destinations are the addresses the page itself gives its sorts.
    expect(productsPath("newest")).toBe("/products/by/newest");
    expect(productsPath("upvoted")).toBe("/products/by/upvoted");
    // No redirect lands on another redirect: nothing points INTO `/builds/`.
    expect(config).not.toMatch(/destination: "\/builds\//);
  });

  it("is ONE mechanism: no route is left under /builds/, so a segment that was never an order is the site's own 404", () => {
    // A redirecting handler used to sit here beside the config entry, and it
    // answered an unknown segment with a plain-text 404 of its own. With no
    // route at all, Next's router answers and draws `not-found.tsx` — and a
    // page whose body is a redirect (SB0) cannot come back either.
    expect(existsSync(resolve(APP_DIR, "builds"))).toBe(false);
    expect(code("feed/products.ts")).not.toContain("buildOrderRedirect");
  });

  it("the continuation feed still answers at its own address", () => {
    // `/api/builds/{cursor}` is what *Show more* reads; the redirects are
    // for `/builds/…`, a different tree.
    expect(existsSync(resolve(APP_DIR, "api/builds/[cursor]/route.ts"))).toBe(true);
    expect(code("api/builds/[cursor]/route.ts")).toContain("{ builds: page.projects.filter(frontPageEligible), next: page.next }");
  });
});

const opening = (over: Partial<PublicRoleOpening> = {}): PublicRoleOpening => ({
  id: "r1",
  title: "HR-compliance advisor",
  description: null,
  commitment: null,
  status: "open",
  joinLinkRef: "tok_abc",
  demand: { kind: "none" },
  ...over,
});

describe("a seat is today's open role", () => {
  const product = { slug: "ackstack", thumbnail: null };

  it("takes a product's OPEN roles, in the maintainers' order, and carries the product", () => {
    const seats = seatsOf(product, [
      opening({ id: "a", title: "Advisor" }),
      opening({ id: "b", title: "Filled one", status: "filled" }),
      opening({ id: "c", title: "Closed one", status: "closed" }),
      opening({ id: "d", title: "Partner manager", joinLinkRef: null }),
    ]);
    expect(seats.map((seat) => seat.id)).toEqual(["a", "d"]);
    expect(seats[0]).toEqual({
      id: "a",
      title: "Advisor",
      commitment: null,
      joinLinkRef: "tok_abc",
      demand: { kind: "none" },
      product: { slug: "ackstack", thumbnail: null },
    });
    expect(seatsOf(product, [])).toEqual([]);
  });

  it("the title's line counts every open seat and the products they are across", () => {
    const cards = [{ roleOpeningCount: 2 }, { roleOpeningCount: 0 }, { roleOpeningCount: 1 }];
    expect(seatTotals(cards)).toEqual({ seats: 3, products: 2 });
    expect(seatsCountLine(60, 30)).toBe("60 open seats across 30 products");
    expect(seatsCountLine(1, 1)).toBe("1 open seat across 1 product");
    expect(seatsCountLineShort(60, 30)).toBe("60 seats · 30 products");
    expect(seatsCountLineShort(1, 1)).toBe("1 seat · 1 product");
  });

  it("the quiet line says the commitment, and the queue only in the contract's own words", () => {
    expect(seatSub({ commitment: null, demand: { kind: "none" } })).toBe("");
    expect(seatSub({ commitment: " 5 hours a week ", demand: { kind: "none" } })).toBe("5 hours a week");
    // The one place an opening's age is published: nobody has asked yet.
    expect(seatSub({ commitment: null, demand: { kind: "quiet", days: 49 } })).toBe(
      "Nobody yet — this opening is 7 weeks old.",
    );
    expect(seatSub({ commitment: "Part-time", demand: { kind: "few" } })).toBe(
      "Part-time · A few people are waiting on a decision.",
    );
  });

  it("shows ten, and ten more each time", () => {
    expect(SEATS_STEP).toBe(10);
    expect(SEAT_PRODUCT_LIMIT).toBeGreaterThanOrEqual(SEATS_STEP);
    expect(seatsShownLine(10, 60)).toBe("10 of 60 shown");
    expect(seatsShownLine(20, 14)).toBe("14 of 14 shown");
  });
});

describe("the seat card's three states", () => {
  const consoleOrigin = "https://console.example.test";

  it("open: Take the seat is a link to today's request-to-join door", () => {
    expect(seatAction({ joinLinkRef: "tok_abc" }, { consoleOrigin })).toEqual({
      state: "open",
      label: "Take the seat",
      href: "https://console.example.test/join/tok_abc?from=openproduct",
    });
    expect(SEAT_TAKE_LABEL).toBe("Take the seat");
    // The door's address is the one the product page has always printed.
    expect(seatDoorHref("https://console.example.test/", "tok_abc")).toBe(
      "https://console.example.test/join/tok_abc?from=openproduct",
    );
    // An unconfigured console origin degrades to a relative door, as it does there.
    expect(seatDoorHref("", "tok_abc")).toBe("/join/tok_abc?from=openproduct");
  });

  it("requested: says Requested and goes to the visitor's requests, the Seats section of /me", () => {
    expect(seatAction({ joinLinkRef: "tok_abc" }, { consoleOrigin, requested: true })).toEqual({
      state: "requested",
      label: "Requested",
      href: "/me?section=seats",
    });
    expect(SEAT_REQUESTED_LABEL).toBe("Requested");
    // A request that exists is a fact whatever happened to the door since.
    expect(seatAction({ joinLinkRef: null }, { consoleOrigin, requested: true }).state).toBe("requested");
    // And `false` is the same as not saying.
    expect(seatAction({ joinLinkRef: "tok_abc" }, { consoleOrigin, requested: false }).state).toBe("open");
  });

  it("closed: a seat with no door yet has no button, and says so in the product page's words", () => {
    expect(seatAction({ joinLinkRef: null }, { consoleOrigin })).toEqual({
      state: "closed",
      label: "Not accepting offers yet",
      href: null,
    });
    expect(SEAT_CLOSED_LABEL).toBe("Not accepting offers yet");
  });

  it("the card draws each state, and teal only for the seat", () => {
    const card = code("help-wanted/seat-card.tsx");
    // One article per seat, named for the product it is on.
    expect(card).toContain("aria-label={`Open seat on ${seat.product.slug}`}");
    expect(card).toContain("data-seat-state={action.state}");
    // The role's name is the card's heading; the mono label is in seat ink.
    expect(card).toMatch(/<h3 className="m-0 text-card-title font-semibold[^"]*">\{seat\.title\}<\/h3>/);
    expect(card).toContain('<span className="font-mono text-mono-label uppercase text-seat-ink">Open seat</span>');
    // The product it belongs to links to the product's page.
    expect(card).toContain("const product = `/${seat.product.slug}`;");
    expect(card.match(/href=\{product\}/g)).toHaveLength(2);
    // open — the teal pill, a plain anchor (the door is another origin).
    expect(card).toMatch(/<a href=\{action\.href\} data-seat-action="open" className=\{`\$\{BTN_SEAT\} /);
    expect(read("ui/design.ts")).toMatch(/export const BTN_SEAT =\s*"[^"]*bg-seat [^"]*text-card/);
    // requested — the teal tint under seat ink.
    expect(card).toMatch(/data-seat-action="requested"\s+className=\{`[^`]*bg-seat-soft[^`]*text-seat-ink/);
    // closed — words, not a control.
    expect(card).toMatch(/<span data-seat-action="closed"[^>]*>\s*\{action\.label\}\s*<\/span>/);
    // Red is danger only, and the accent is the upvote's.
    expect(card).not.toMatch(/destructive|endorse/);
    // The same bytes for every visitor: the card resolves nobody.
    expect(card).not.toMatch(/"use client"|useOverlay|cookies\(|headers\(/);
  });

  it("the list keeps every seat in the document and decides only how many are out", () => {
    const list = code("help-wanted/seat-list.tsx");
    expect(list.startsWith('"use client";')).toBe(true);
    expect(list).toContain("React.Children.toArray(children)");
    expect(list).toContain("hidden={index >= shown}");
    expect(list).toContain("setShown((n) => n + SEATS_STEP)");
    expect(list).toContain("{seatsShownLine(shown, seats.length)}");
    // No read of its own, and nothing personal.
    expect(list).not.toMatch(/fetch\(|useOverlay|document\.cookie/);
  });

  it("the page marks no seat as requested: the overlay holds a count, not which seats", () => {
    // `MeOverlay.requests` is a number. Until the overlay names the openings
    // a visitor asked about, lighting "Requested" on any ticket would be a
    // guess — so the page passes no `requested`, and every ticket is the
    // anonymous one (I6).
    const page = code("help-wanted/page.tsx");
    expect(page).toContain("seatAction(seat, { consoleOrigin: origin })");
    expect(page).not.toMatch(/requested:|useOverlay|readSession/);
  });

  it("the stage filter is left out until a listing has a stage (OPR2)", () => {
    const page = code("help-wanted/page.tsx");
    expect(page).not.toMatch(/On shipping products|On ideas|aria-label="Seat filters"/);
  });
});
