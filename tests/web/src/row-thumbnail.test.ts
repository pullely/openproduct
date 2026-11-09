// MD3 — the row's tile picture, decided (openproduct-worldclass).

import { MEDIA_THUMBNAIL_WIDTH, MEDIA_WIDTHS } from "@openproduct/contracts";
import { TILE_SIZE, thumbnailSource } from "@openproduct-web/app/feed/thumbnail";

const REF = `${"a".repeat(64)}.png`;

describe("a derivative, never the hero", () => {
  it("asks for the thumbnail width and nothing else — no srcset climbing to the original", () => {
    const source = thumbnailSource({ ref: REF, alt: "The dashboard", width: 1200, height: 630 }, "https://api.example.test/");
    expect(source.src).toBe(`https://api.example.test/v1/media/${"a".repeat(64)}/w${MEDIA_THUMBNAIL_WIDTH}.webp`);
    expect("srcSet" in source).toBe(false);
  });

  it("is the smallest standard width, by construction", () => {
    expect(MEDIA_THUMBNAIL_WIDTH).toBe(Math.min(...MEDIA_WIDTHS));
  });

  it("reserves the tile's box, not the picture's — 52×52, so nothing shifts", () => {
    const source = thumbnailSource({ ref: REF, alt: "x", width: 1200, height: 630 }, "https://api.example.test");
    expect([source.width, source.height]).toEqual([TILE_SIZE, TILE_SIZE]);
  });

  it("is decorative beside the name: an empty alt, like the monogram it replaces", () => {
    expect(thumbnailSource({ ref: REF, alt: "The dashboard", width: 1200, height: 630 }, "x").alt).toBe("");
  });
});
