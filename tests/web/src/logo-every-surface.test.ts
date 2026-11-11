// The logo on every surface (openproduct-studio OSD3, decision OSD-5).
//
// ONE COMPONENT DRAWS A PRODUCT'S FACE. Every surface that draws a product's
// tile draws `ProductTile` — the maker's logo where there is one, the
// monogram otherwise — so a product has one face everywhere. These are
// source pins, like the rest of this suite's layout tests: the surfaces are
// server components reading the public API, and what matters is which
// component they call and with which field.

import { readFileSync } from "node:fs";
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
  ["feed/build-tile.tsx", "<ProductTile slug={card.slug} thumbnail={card.thumbnail} size={72} phoneSize={52} />"],
  ["[slug]/page.tsx", "thumbnail={thumbnail}\n              size={76}"],
  ["[slug]/page.tsx", "tile={<ProductTile slug={profile.slug} thumbnail={thumbnail} size={32} />}"],
  ["[slug]/page.tsx", "<ProductTile slug={card.slug} thumbnail={card.thumbnail} size={44} />"],
  ["launches/board.tsx", "<ProductTile slug={entry.slug} thumbnail={entry.thumbnail} size={72} phoneSize={52} />"],
  ["collections/[slug]/page.tsx", "<ProductTile slug={item.card.slug} thumbnail={item.card.thumbnail} size={44} />"],
  ["search/page.tsx", "<ProductTile slug={hit.entityId} thumbnail={hit.thumbnail} size={72} phoneSize={52} />"],
  ["people/[handle]/maker-rows.tsx", "<ProductTile slug={slug} thumbnail={row.thumbnail} size={52} />"],
  // CL4 — a maker's builds are tiles, at the build tile's 72px (52 on a phone).
  ["people/[handle]/page.tsx", "<ProductTile slug={listing.slug} thumbnail={listing.thumbnail} size={72} phoneSize={52} />"],
  // openproduct-calm-pages CP5 — saved builds and the studio's listings are tiles.
  ["me/saved/page.tsx", "<ProductTile slug={product.slug} thumbnail={product.thumbnail} size={72} phoneSize={52} />"],
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

  it("the product bar takes its tile from the server page and reads no data itself", () => {
    const bar = read("[slug]/product-bar.tsx");
    expect(bar).toContain('"use client"');
    expect(bar).toContain("{tile}");
    expect(bar).not.toContain("ui/logo-tile");
    expect(bar).not.toContain("ui/product-tile");
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
