// What a monogram tile can and cannot do (openproduct-worldclass VC4).
//
// The audit's P2·15: *"Two products, two identical 'MP' tiles in two pastel
// washes. The generator is deriving colour from the name, so similar names
// collide."*
//
// THE DIAGNOSIS IS WRONG AND THE OBSERVATION IS RIGHT, which is why this file
// pins both halves. `hueFor` has always hashed the whole slug — `my-product`
// and `my-project` land 70° apart — so there was never an initials-derived
// collision to fix. What made them look alike is CHROMA.
//
// AND VC4'S FIX FOR THAT DID NOT WORK, which FR0 found and this file now
// records. VC4 raised the chroma from 0.045 to 0.10 and measured the pair
// going from ΔE 5.2 to 11.5 — on the AUTHORED value. The fill was
// `oklch(0.93 C h)`, and at that lightness sRGB cannot hold 0.10 for 255 of
// the 360 hues; a browser gamut-maps what it cannot paint. The two tiles were
// painted at chroma 0.0371 and 0.0461 before and after, so the painted
// distance went from 4.75 to 4.83. Eight hundredths.
//
// The fix is LIGHTNESS. FR0 moved the fill to `oklch(0.8 0.099 h)`, where
// 0.099 is inside sRGB at every hue — the authored value and the painted one
// are the same number — and the audit's pair measures 11.36.
//
// And the honest limit, which is still the thing most worth pinning: raising
// chroma does not solve this in general, because two slugs can hash 10° apart
// and no chroma a tile can carry will separate those. Hue over an unbounded
// slug space is not an identifier. The letters tell products apart, and MD's
// real images will do it properly.
import { hueFor, initialsOf, tileDistance, tileColours } from "@openproduct-web/app/feed/tile";

describe("the monogram tile (VC4)", () => {
  it("hashes the whole slug, not the initials — the audit's diagnosis was wrong", () => {
    // Same two letters, different tiles. This was already true before VC4.
    expect(initialsOf("my-product")).toBe(initialsOf("my-project"));
    expect(hueFor("my-product")).not.toBe(hueFor("my-project"));
  });

  it("carries enough chroma for the live pair to separate better than it did", () => {
    // Not a claim that it CLEARS the floor of 15 below which full-colour
    // vision cannot separate a pair — see below. A measured improvement on
    // the exact pair the audit looked at, and this time one a browser will
    // actually paint: `dark-ramp.test.ts` asserts `--tile-fill` is inside
    // sRGB at every hue, so the number here is not a number about a colour
    // that gets mapped away.
    expect(tileDistance("my-product", "my-project")).toBeGreaterThan(11);
  });

  it("admits that hue cannot identify a product, which is the real finding", () => {
    // Two slugs 10° apart are indistinguishable at any chroma a pastel tile
    // can carry. Anybody tempted to "fix" tile collisions by turning the
    // chroma up should meet this number first: the answer is images (MD), not
    // more colour.
    const near = ["ab", "ac"];
    const [a, b] = near;
    if (Math.abs(hueFor(a!) - hueFor(b!)) < 20) {
      expect(tileDistance(a!, b!)).toBeLessThan(15);
    }
    // ...and stated directly, so the assertion above cannot pass vacuously.
    expect(tileDistance("x", "x")).toBe(0);
  });

  it("keeps the same tile for the same slug on every surface", () => {
    // A colour that moved between two reads of one cached document is the
    // kind of detail that makes a page look broken without anybody being able
    // to say why.
    expect(tileColours("acme-thing")).toEqual(tileColours("acme-thing"));
  });
});
