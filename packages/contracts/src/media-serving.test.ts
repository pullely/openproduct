// Media serving contract (openproduct-worldclass MD1).
//
// Three claims:
//
//   A REFERENCE IS STRICT. It becomes a URL segment and an R2 key, and a
//   reference that could carry a slash or a dot-dot could name somebody
//   else's object.
//
//   NOTHING UPSCALES. A derivative exists only below the original's width,
//   and its height comes from the stored dimensions — no file is probed.
//
//   ONE FUNCTION SPELLS THE ADDRESS. The page and the gateway read it, so
//   the address cannot be written two ways.

import { describe, expect, it } from "vitest";

import {
  MEDIA_ALT_MAX,
  MEDIA_FORMATS,
  MEDIA_MAX_BYTES,
  MEDIA_REFUSALS,
  MEDIA_WIDTHS,
  derivativeHeight,
  derivativeWidths,
  mediaPath,
  mediaSrcSet,
  parseMediaRef,
} from "./media-serving.js";

const HASH = "a".repeat(64);

describe("a reference is strict", () => {
  it("accepts exactly 64 lowercase hex, a dot, and a known format", () => {
    expect(parseMediaRef(`${HASH}.png`)).toEqual({ hash: HASH, format: "png" });
    expect(parseMediaRef(`${HASH}.jpg`)?.format).toBe("jpg");
    expect(parseMediaRef(`${HASH}.webp`)?.format).toBe("webp");
  });

  it("refuses everything that is not that", () => {
    for (const bad of [
      `${HASH}.svg`, // a document with a script surface, never a picture
      `${HASH}.gif`,
      `${HASH.toUpperCase()}.png`,
      `${HASH.slice(1)}.png`,
      `../${HASH}.png`,
      `${HASH}/w400.webp`, // a derivative address is not a reference
      "",
    ]) {
      expect([bad, parseMediaRef(bad)]).toEqual([bad, null]);
    }
  });

  it("names three formats and no SVG", () => {
    expect(Object.keys(MEDIA_FORMATS).sort()).toEqual(["jpg", "png", "webp"]);
    expect(JSON.stringify(MEDIA_FORMATS)).not.toContain("svg");
  });
});

describe("nothing upscales", () => {
  it("offers every standard width strictly below the original", () => {
    // MD3 added 160, the thumbnail's width — see MEDIA_WIDTHS for the sum.
    expect(derivativeWidths({ width: 1920 })).toEqual([160, 400, 800, 1600]);
    expect(derivativeWidths({ width: 1600 })).toEqual([160, 400, 800]);
    expect(derivativeWidths({ width: 801 })).toEqual([160, 400, 800]);
    expect(derivativeWidths({ width: 800 })).toEqual([160, 400]);
    expect(derivativeWidths({ width: 400 })).toEqual([160]);
    expect(derivativeWidths({ width: 160 })).toEqual([]);
  });

  it("computes a derivative's height from the stored dimensions, never zero", () => {
    expect(derivativeHeight({ width: 1200, height: 630 }, 400)).toBe(210);
    expect(derivativeHeight({ width: 1200, height: 630 }, 800)).toBe(420);
    expect(derivativeHeight({ width: 8000, height: 1 }, 400)).toBe(1);
  });

  it("keeps the widths ascending, because a srcset reads them that way", () => {
    expect([...MEDIA_WIDTHS]).toEqual([...MEDIA_WIDTHS].sort((a, b) => a - b));
  });
});

describe("one function spells the address", () => {
  it("serves an original at its reference and a derivative under its hash", () => {
    expect(mediaPath(`${HASH}.png`)).toBe(`/v1/media/${HASH}.png`);
    expect(mediaPath(`${HASH}.png`, 800)).toBe(`/v1/media/${HASH}/w800.webp`);
  });

  it("refuses to spell an address for something that is not a reference", () => {
    expect(() => mediaPath("not-a-ref")).toThrow(/Not a media reference/);
  });

  it("builds a srcset from the widths that exist, plus the original", () => {
    const set = mediaSrcSet({ ref: `${HASH}.jpg`, width: 1200 });
    expect(set).toBe(
      `/v1/media/${HASH}/w160.webp 160w, /v1/media/${HASH}/w400.webp 400w, /v1/media/${HASH}/w800.webp 800w, /v1/media/${HASH}.jpg 1200w`,
    );
  });
});

describe("the ceilings say what they are", () => {
  it("states the byte ceiling in the refusal a maker reads", () => {
    expect(MEDIA_REFUSALS.payload_too_large).toContain(`${Math.round(MEDIA_MAX_BYTES / 1024 / 1024)} MB`);
  });

  it("bounds alt text, because it is a name and not a caption", () => {
    expect(MEDIA_ALT_MAX).toBeLessThanOrEqual(300);
  });

  it("says the bytes decide, in the sentence a maker sees", () => {
    // The whole security posture of the upload path in one refusal.
    expect(MEDIA_REFUSALS.unsupported_media_type.toLowerCase()).toContain("bytes decide");
  });
});
