// The logo on every surface (openproduct-studio OSD3, decision OSD-5).
//
// ONE COMPONENT DRAWS A PRODUCT'S FACE. Every surface that draws a product's
// tile draws `ProductTile` — the maker's logo where there is one, the
// monogram otherwise — so a product has one face everywhere. These are
// source pins, like the rest of this suite's layout tests: the surfaces are
// server components reading the public API, and what matters is which
// component they call and with which field.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { authoredMedia } from "@openproduct/contracts";
import { thumbnailSource } from "@openproduct-web/app/feed/thumbnail";
import { ogLogoUrl, productCopy } from "@openproduct-web/app/ui/og";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

/** Every surface that draws a product's tile, and the call it makes. */
const SURFACES: Array<[string, string]> = [
  // CL5 — the launch rows and the search results are tiles, at 72 (52 on a phone).
  ["feed/row-shell.tsx", "<ProductTile slug={entry.slug} thumbnail={entry.thumbnail} size={72} phoneSize={52} />"],
  // CL2 — the build tile, at the ladder's 72px step.
  // OPR1 — the product card (boards `Products`) and the seat ticket (boards
  // `Seats`): the ladder's 44px and 32px steps.
  ["feed/product-card.tsx", "<ProductTile slug={card.slug} thumbnail={card.thumbnail} size={44} />"],
  ["help-wanted/seat-card.tsx", "<ProductTile slug={seat.product.slug} thumbnail={seat.product.thumbnail} size={32} />"],
  // OPR1 — the header card's tile: the ladder's 76 rung grown to the board's
  // 92px by the page's own class, and the phone board's 52px.
  ["[slug]/page.tsx", "thumbnail={thumbnail}\n                  size={76}\n                  phoneSize={52}\n                  className={HERO_TILE}"],
  ["[slug]/page.tsx", "<ProductTile slug={card.slug} thumbnail={card.thumbnail} size={44} />"],
  ["launches/board.tsx", "<ProductTile slug={entry.slug} thumbnail={entry.thumbnail} size={72} phoneSize={52} />"],
  ["collections/[slug]/page.tsx", "<ProductTile slug={item.card.slug} thumbnail={item.card.thumbnail} size={44} />"],
  // OPR1 — a search result is a row in a card (board `Search`), at the 44px step.
  ["search/page.tsx", "<ProductTile slug={hit.entityId} thumbnail={hit.thumbnail} size={44} />"],
  ["people/[handle]/maker-rows.tsx", "<ProductTile slug={slug} thumbnail={row.thumbnail} size={44} />"],
  // CL4 — a maker's builds are tiles, at the build tile's 72px (52 on a phone).
  // OPR1 — a person's products are the board's rows: one component for the
  // profile's two lists and its side card.
  ["people/[handle]/product-rows.tsx", "<ProductTile slug={listing.slug} thumbnail={listing.thumbnail} size={44} />"],
  // openproduct-calm-pages CP5 — saved builds and the studio's listings are tiles.
  // OPR1 — the saved list is a section of `/me` (board `Me`), beside the
  // products this person makes: 52px and 44px, the ladder's nearest steps to
  // the board's tiles.
  ["me/sections.tsx", "<ProductTile slug={listing.slug} thumbnail={listing.thumbnail} size={52} />"],
  ["me/sections.tsx", "<ProductTile slug={product.slug} thumbnail={product.thumbnail} size={44} />"],
  ["studio/page.tsx", "<ProductTile slug={listing.slug} thumbnail={listing.thumbnail} size={72} phoneSize={52} />"],
];

describe("every product tile is ProductTile (OSD-5)", () => {
  it.each(SURFACES)("%s draws the logo-or-monogram tile", (file, call) => {
    const source = read(file);
    expect(source).toContain(call);
    // No surface keeps a bare monogram beside it: a second face for the same
    // product is the failure this milestone exists to end.
    expect(source).not.toMatch(/<LogoTile\b/);
  });

  it("the product page draws its tile on the server, and pins no second bar under the site's header", () => {
    // openproduct-redesign OPR1 — the product bar (a client island that
    // re-drew the name, the outline and one action once the hero scrolled
    // away) is gone: the site's header stays at the top of every page now,
    // and a second bar pinned under it is a row taken for state (owner rule
    // 10). What it guarded still holds, more simply — the tile is rendered by
    // the server page and no client component on it draws one.
    const page = read("[slug]/page.tsx");
    expect(page).not.toContain('"use client"');
    expect(page).not.toContain("ProductBar");
    expect(page).not.toContain("data-product-bar");
    expect(page).not.toMatch(/className="[^"]*\b(?:fixed|sticky)\b/);
    expect(existsSync(resolve(APP_DIR, "[slug]/product-bar.tsx"))).toBe(false);
    for (const island of ["share-control.tsx", "install-line.tsx", "badge-snippet.tsx", "comment-draft.tsx"]) {
      const source = read(`[slug]/${island}`);
      expect([island, source.includes('"use client"')]).toEqual([island, true]);
      expect([island, /ui\/(logo|product)-tile/.test(source)]).toEqual([island, false]);
    }
  });
});

describe("ProductTile shares LogoTile's ladder", () => {
  const tile = read("ui/product-tile.tsx");
  const logo = read("ui/logo-tile.tsx");

  it("takes every size on the ladder and draws the ladder's own box", () => {
    expect(tile).toContain("size?: TileSize;");
    expect(logo).toContain("export type TileSize = 32 | 36 | 40 | 44 | 52 | 72 | 76;");
    expect(tile).toContain("tileBox(size)");
    expect(logo).toContain("${tileBox(size)} ${tileType(size)}");
  });

  it("stays a decorative server component with a fixed box", () => {
    expect(tile).not.toContain('"use client"');
    expect(tile).toContain('aria-hidden="true"');
    expect(tile).toContain("width={source.width}");
    expect(tile).toContain("height={source.height}");
    expect(tile).toContain("object-contain");
  });

  it("reserves the tile's own size, whatever rung it sits on", () => {
    const thumb = { ref: `${"a".repeat(64)}.png`, alt: "Mark", width: 256, height: 256 };
    for (const size of [32, 44, 76]) {
      const source = thumbnailSource(thumb, "https://api.example.test", size);
      expect([source.width, source.height]).toEqual([size, size]);
    }
  });
});

describe("the OG card draws the logo satori can decode", () => {
  const logo = (ext: string) =>
    authoredMedia({ id: "l1", kind: "logo", ref: `${"d".repeat(64)}.${ext}`, alt: "Mark", width: 256, height: 256, position: 0 });
  const hero = authoredMedia({ id: "h1", kind: "hero", ref: `${"e".repeat(64)}.png`, alt: "Hero", width: 1200, height: 630, position: 0 });

  it("uses a PNG or JPEG logo's original", () => {
    expect(ogLogoUrl([logo("png")], "https://api.example.test/")).toBe(
      `https://api.example.test/v1/media/${"d".repeat(64)}.png`,
    );
    expect(ogLogoUrl([logo("jpg")], "https://api.example.test")).toBe(
      `https://api.example.test/v1/media/${"d".repeat(64)}.jpg`,
    );
  });

  it("keeps the monogram for a WebP logo, and never promotes the hero", () => {
    expect(ogLogoUrl([logo("webp")], "https://api.example.test")).toBeNull();
    expect(ogLogoUrl([hero], "https://api.example.test")).toBeNull();
    expect(ogLogoUrl([], "https://api.example.test")).toBeNull();
  });

  it("carries the logo on the copy, and the card draws it in the tile's place", () => {
    expect(productCopy("my-product", null, null, "data:image/png;base64,AA").logo).toBe("data:image/png;base64,AA");
    const card = read("og/card.tsx");
    expect(card).toContain("{copy.logo ? (");
    const route = read("og/product/[slug]/route.tsx");
    expect(route).toContain("ogLogoUrl(profile.media, publicApiBase())");
  });
});
