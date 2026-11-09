// The media model (openproduct-worldclass MD0).
//
// The milestone's claim is that WC-3 — "authored media and observed media are
// different objects and never render as the same thing" — is a PROPERTY OF
// THE MODEL rather than a rule renderers are asked to remember. There are
// three enforcement points and this file exercises two of them:
//
//   the TYPE   — a screenshot in the hero slot does not compile. Proved with
//                an expect-error directive, which fails the BUILD if the line
//                ever starts compiling, so the guard cannot rot into a
//                comment. (Written that way round rather than named here:
//                the directive is recognised inside a comment too, and
//                spelling it in this header made the header itself one.)
//   the SET    — "at most one hero", "at most eight", "no blank alt". A type
//                describes one member, so these live in `mediaViolations`.
//   the SCHEMA — 1820's CHECK constraints, proved against a real engine in
//                repository-pg.test.ts. Deliberately duplicated: the day the
//                two share one enforcement is the day a refactor publishes a
//                screenshot as somebody's hero.

import { describe, expect, it } from "vitest";

import {
  AUTHORED_MEDIA_KINDS,
  GALLERY_MAX,
  MEDIA_KINDS,
  OBSERVED_MEDIA_KINDS,
  SCREENSHOT_STALE_AFTER_DAYS,
  authoredMedia,
  galleryOf,
  heroOf,
  logoOf,
  mediaViolations,
  thumbnailOf,
  observedScreenshot,
  screenshotAlt,
  screenshotOf,
  screenshotWithdrawn,
  type AuthoredAsset,
  type MediaFact,
  type ObservedAsset,
} from "./media.js";
import { SIGNAL_SOURCES } from "./provenance.js";
import { LOGO_MIN_SIDE, MEDIA_REFUSALS, mediaShapeRefusal } from "./media-serving.js";

const AT = "2026-09-01T00:00:00.000Z";
const NOW = new Date("2026-09-08T12:00:00.000Z");

function asset(over: Partial<AuthoredAsset> & { kind: "hero" | "gallery" }): AuthoredAsset {
  return {
    id: `m-${over.kind}-${over.position ?? 0}`,
    ref: "op-media/abc",
    alt: "The kettle dashboard, showing a queue at rest",
    width: 1200,
    height: 630,
    position: 0,
    ...over,
  };
}

function shot(over: Partial<ObservedAsset> = {}): ObservedAsset {
  return {
    id: "m-shot",
    kind: "screenshot",
    ref: "op-media/shot",
    alt: screenshotAlt("kettleworks", AT),
    width: 1280,
    height: 800,
    position: 0,
    ...over,
  };
}

describe("the kind IS the trust class", () => {
  it("splits the three kinds into exactly the two classes, with nothing left over", () => {
    expect([...AUTHORED_MEDIA_KINDS, ...OBSERVED_MEDIA_KINDS].sort()).toEqual([...MEDIA_KINDS].sort());
  });

  it("a maker's image is authored, in their voice, and carries no moment", () => {
    const hero = authoredMedia(asset({ kind: "hero" }));
    expect(hero.provenance).toEqual({ class: "authored", by: "maintainer" });
    // The point of the whole split: there is nowhere on this object to put a
    // date, so no renderer can accidentally show one as a freshness claim.
    expect("observedAt" in hero.provenance).toBe(false);
  });

  it("a capture is observed and cannot exist without the moment it was taken", () => {
    const cap = observedScreenshot(shot(), AT);
    expect(cap.provenance).toEqual({ class: "observed", source: "declared_url", observedAt: AT });
  });

  it("a screenshot in the hero slot does not compile", () => {
    // @ts-expect-error — `authoredMedia` takes an AuthoredAsset, and
    // "screenshot" is not one of its kinds. WC-3, as a build failure.
    expect(() => authoredMedia(shot())).toBeTypeOf("function");
  });

  it("an authored image cannot be handed to the observed constructor either", () => {
    // @ts-expect-error — and in the other direction, so neither half of the
    // rule can be lost on its own.
    expect(() => observedScreenshot(asset({ kind: "hero" }), AT)).toBeTypeOf("function");
  });
});

describe("declared_url — the source MD0 had to add", () => {
  it("is a published source, not a string this module invented", () => {
    const cap = observedScreenshot(shot(), AT);
    expect(cap.provenance.class).toBe("observed");
    if (cap.provenance.class !== "observed") return;
    expect(SIGNAL_SOURCES).toContain(cap.provenance.source);
  });

  it("is NOT one of the repository tiers", () => {
    // The whole reason it exists. `declared_repo` promises a read of a
    // repository; a screenshot of a running site is not one, and saying it
    // was would be the overstatement PV0 found in the catalog, one plane
    // over.
    const cap = observedScreenshot(shot(), AT);
    if (cap.provenance.class !== "observed") return;
    expect(cap.provenance.source).not.toBe("declared_repo");
    expect(cap.provenance.source).not.toBe("linked_repo");
  });
});

describe("reading a listing's media", () => {
  const media: MediaFact[] = [
    authoredMedia(asset({ kind: "hero" })),
    authoredMedia(asset({ kind: "gallery", position: 2 })),
    authoredMedia(asset({ kind: "gallery", position: 0 })),
    authoredMedia(asset({ kind: "gallery", position: 1 })),
    observedScreenshot(shot(), AT),
  ];

  it("finds the hero, the gallery in the maker's order, and the capture", () => {
    expect(heroOf(media)?.value.kind).toBe("hero");
    expect(galleryOf(media).map((m) => m.value.position)).toEqual([0, 1, 2]);
    expect(screenshotOf(media)?.value.kind).toBe("screenshot");
  });

  it("answers null on a listing with nothing, rather than inventing a slot", () => {
    expect(heroOf([])).toBeNull();
    expect(screenshotOf([])).toBeNull();
    expect(galleryOf([])).toEqual([]);
  });

  it("never returns the capture from the hero slot, even as the only image", () => {
    // The failure this is guarding: a listing with a screenshot and no hero,
    // where a renderer reaching for "the first image" would put an automated
    // capture in the frame that says a maker chose it.
    expect(heroOf([observedScreenshot(shot(), AT)])).toBeNull();
  });
});

describe("a capture is withdrawn past its window, never frozen", () => {
  it("stands inside the window", () => {
    expect(screenshotWithdrawn(new Date(NOW.getTime() - 3 * 86_400_000).toISOString(), NOW)).toBe(false);
  });

  it("is withdrawn past it", () => {
    const old = new Date(NOW.getTime() - (SCREENSHOT_STALE_AFTER_DAYS + 1) * 86_400_000);
    expect(screenshotWithdrawn(old.toISOString(), NOW)).toBe(true);
  });

  it("treats an unreadable moment as withdrawn, never as current", () => {
    // The safe direction. A capture whose date we cannot parse is exactly the
    // artefact OPC-7 exists to keep off a page.
    expect(screenshotWithdrawn("not a date", NOW)).toBe(true);
  });
});

describe("the rules a type cannot hold", () => {
  it("passes a well-formed listing", () => {
    expect(
      mediaViolations([
        authoredMedia(asset({ kind: "hero" })),
        authoredMedia(asset({ kind: "gallery", position: 0 })),
        observedScreenshot(shot(), AT),
      ]),
    ).toEqual([]);
  });

  it("refuses a second hero and a second capture", () => {
    const two = mediaViolations([
      authoredMedia(asset({ kind: "hero" })),
      authoredMedia(asset({ kind: "hero", id: "other" })),
      observedScreenshot(shot(), AT),
      observedScreenshot(shot({ id: "other-shot" }), AT),
    ]);
    expect(two.some((v) => v.includes("one hero"))).toBe(true);
    expect(two.some((v) => v.includes("one screenshot"))).toBe(true);
  });

  it("caps the gallery at eight, and eight itself is fine", () => {
    const gallery = (n: number) =>
      Array.from({ length: n }, (_, at) =>
        authoredMedia(asset({ kind: "gallery", position: at, id: `g${at}` })),
      );
    // The boundary in both directions — an off-by-one here is a ceiling that
    // is really seven or really nine.
    expect(mediaViolations(gallery(GALLERY_MAX))).toEqual([]);
    expect(mediaViolations(gallery(GALLERY_MAX + 1)).some((v) => v.includes("at most 8"))).toBe(true);
  });

  it("refuses blank alt text, including whitespace", () => {
    // Whitespace is what a form posts when somebody tabs past the field, and
    // it reads as present to every naive check.
    expect(mediaViolations([authoredMedia(asset({ kind: "hero", alt: "" }))])).toContain(
      "hero media must carry alt text",
    );
    expect(mediaViolations([authoredMedia(asset({ kind: "hero", alt: "   " }))])).toContain(
      "hero media must carry alt text",
    );
  });

  it("refuses an image with no dimensions, because a renderer would drop CLS", () => {
    expect(
      mediaViolations([authoredMedia(asset({ kind: "hero", width: 0, height: 630 }))]),
    ).toContain("hero media must carry positive dimensions");
  });

  it("refuses two images in the same slot", () => {
    const clash = mediaViolations([
      authoredMedia(asset({ kind: "gallery", position: 1, id: "a" })),
      authoredMedia(asset({ kind: "gallery", position: 1, id: "b" })),
    ]);
    expect(clash.some((v) => v.includes("claim position 1"))).toBe(true);
  });

  it("keeps the singleton kinds at position zero", () => {
    expect(
      mediaViolations([authoredMedia(asset({ kind: "hero", position: 3 }))]).some((v) =>
        v.includes("position 0"),
      ),
    ).toBe(true);
  });

  it("reports every violation rather than stopping at the first", () => {
    // MD1's upload path wants to tell a maker what is wrong with their
    // gallery, not fail on the first thing and make them guess the rest.
    const many = mediaViolations([
      authoredMedia(asset({ kind: "hero", alt: "", width: 0 })),
      authoredMedia(asset({ kind: "hero", id: "second" })),
    ]);
    expect(many.length).toBeGreaterThan(2);
  });
});

describe("a capture's alt text says what it is", () => {
  it("names the listing, the date, and that nobody chose it", () => {
    const alt = screenshotAlt("kettleworks", AT);
    expect(alt).toContain("kettleworks");
    expect(alt).toContain("2026-09-01");
    // The half a sighted reader gets from the hairline frame. Without it, a
    // screen-reader user is told a picture of the product exists and not that
    // a machine took it — which is WC-3 lost for the reader who can least
    // afford to lose it.
    expect(alt.toLowerCase()).toContain("automated");
    expect(alt.toLowerCase()).toContain("not a picture chosen by its makers");
  });
});

// openproduct-studio OSD2 — the logo is its own kind, and the tile is the logo.
describe("the logo", () => {
  const logoAsset = (over: Partial<AuthoredAsset> = {}): AuthoredAsset => ({
    id: "logo",
    kind: "logo",
    ref: `${"c".repeat(64)}.png`,
    alt: "The mark",
    width: 256,
    height: 256,
    position: 0,
    ...over,
  });
  const heroAsset: AuthoredAsset = { ...logoAsset(), id: "hero", kind: "hero", width: 1200, height: 630, alt: "The page" };

  it("is authored, never observed", () => {
    expect(MEDIA_KINDS).toContain("logo");
    expect(AUTHORED_MEDIA_KINDS).toContain("logo");
    expect(OBSERVED_MEDIA_KINDS as readonly string[]).not.toContain("logo");
  });

  it("is what the tile draws — never the hero", () => {
    const media = [authoredMedia(heroAsset), authoredMedia(logoAsset())];
    expect(logoOf(media)?.value.id).toBe("logo");
    expect(thumbnailOf(media)).toEqual({ ref: `${"c".repeat(64)}.png`, alt: "The mark", width: 256, height: 256 });
    expect(thumbnailOf([authoredMedia(heroAsset)])).toBeNull();
  });

  it("is one per listing, at position 0", () => {
    expect(mediaViolations([authoredMedia(logoAsset()), authoredMedia(logoAsset({ id: "other" }))])).toContain(
      "A listing has at most one logo; found 2",
    );
    expect(mediaViolations([authoredMedia(logoAsset({ position: 1 }))]).length).toBeGreaterThan(0);
  });

  it("has its own shape: at least 128 on a side, between 4:5 and 5:4", () => {
    expect(mediaShapeRefusal("logo", 256, 256)).toBeNull();
    expect(mediaShapeRefusal("logo", LOGO_MIN_SIDE, LOGO_MIN_SIDE)).toBeNull();
    expect(mediaShapeRefusal("logo", 250, 200)).toBeNull();
    expect(mediaShapeRefusal("logo", 100, 100)).toBe("logo_too_small");
    expect(mediaShapeRefusal("logo", 1200, 630)).toBe("logo_not_square");
    expect(mediaShapeRefusal("logo", 200, 300)).toBe("logo_not_square");
    // The hero's floor is untouched.
    expect(mediaShapeRefusal("hero", 256, 256)).toBe("too_small");
    expect(mediaShapeRefusal("hero", 1200, 630)).toBeNull();
    expect(MEDIA_REFUSALS.logo_not_square).toMatch(/square/);
  });
});
