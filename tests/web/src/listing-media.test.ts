// MD2 — the listing's media panel, decided (openproduct-worldclass).
//
// The component draws; this module decides. What is pinned here is what a
// page may and may not show: a withdrawn screenshot is not shown, an empty
// list draws no panel, and no image can leave without its dimensions.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { authoredMedia, observedScreenshot, type MediaFact } from "@openproduct/contracts";
import {
  GALLERY_SIZES,
  HERO_SIZES,
  imageSourceOf,
  mediaPanelIsEmpty,
  mediaPanelOf,
  nextGalleryPosition,
  screenshotCaption,
} from "@openproduct-web/app/[slug]/media";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const REF = `${"a".repeat(64)}.png`;
const asset = (kind: "hero" | "gallery", position = 0, id = `id-${kind}-${position}`) => ({
  id,
  kind,
  ref: REF,
  alt: `${kind} ${position}`,
  width: 1200,
  height: 630,
  position,
});

describe("what the panel shows", () => {
  it("splits the rows into hero, gallery in the maker's order, and the capture", () => {
    const media: MediaFact[] = [
      authoredMedia(asset("gallery", 2)),
      authoredMedia(asset("hero")),
      authoredMedia(asset("gallery", 0)),
      observedScreenshot({ ...asset("hero"), kind: "screenshot", id: "shot" }, "2026-09-01T00:00:00.000Z"),
    ];
    const plan = mediaPanelOf(media, NOW);
    expect(plan.hero?.value.kind).toBe("hero");
    expect(plan.gallery.map((g) => g.value.position)).toEqual([0, 2]);
    expect(plan.screenshot?.value.id).toBe("shot");
    expect(mediaPanelIsEmpty(plan)).toBe(false);
  });

  it("WITHDRAWS a screenshot past its window — not shown at all, not shown as old (OPC-7)", () => {
    const fresh = observedScreenshot({ ...asset("hero"), kind: "screenshot" }, "2026-08-12T00:00:00.000Z");
    const stale = observedScreenshot({ ...asset("hero"), kind: "screenshot" }, "2026-08-10T00:00:00.000Z");
    expect(mediaPanelOf([fresh], NOW).screenshot).not.toBeNull();
    expect(mediaPanelOf([stale], NOW).screenshot).toBeNull();
    // And a listing whose ONLY media is a withdrawn capture draws no panel.
    expect(mediaPanelIsEmpty(mediaPanelOf([stale], NOW))).toBe(true);
  });

  it("draws no panel for a listing with no media — the monogram is the stand-in, and there is no penalty (MD-3)", () => {
    expect(mediaPanelIsEmpty(mediaPanelOf([], NOW))).toBe(true);
  });
});

describe("what an <img> is given", () => {
  it("carries the row's own dimensions on every source, and addresses at the API origin", () => {
    const source = imageSourceOf(asset("hero"), "https://api.example.test/", HERO_SIZES);
    expect(source.width).toBe(1200);
    expect(source.height).toBe(630);
    expect(source.alt).toBe("hero 0");
    expect(source.src).toBe(`https://api.example.test/v1/media/${REF}`);
    // 1200 wide: the 160, 400 and 800 derivatives apply, then the original. Every
    // candidate is absolute, at the same origin the document was read from.
    expect(source.srcSet.split(", ")).toEqual([
      `https://api.example.test/v1/media/${"a".repeat(64)}/w160.webp 160w`,
      `https://api.example.test/v1/media/${"a".repeat(64)}/w400.webp 400w`,
      `https://api.example.test/v1/media/${"a".repeat(64)}/w800.webp 800w`,
      `https://api.example.test/v1/media/${REF} 1200w`,
    ]);
    expect(source.sizes).toBe(HERO_SIZES);
  });

  it("never upscales: an original narrower than every standard width has only itself", () => {
    const small = { ...asset("gallery"), width: 160, height: 120 };
    expect(imageSourceOf(small, "https://api.example.test", GALLERY_SIZES).srcSet).toBe(
      `https://api.example.test/v1/media/${REF} 160w`,
    );
  });

  it("captions a screenshot with the day it was taken, and the instant for the machine", () => {
    expect(screenshotCaption("2026-09-01T13:45:00.000Z")).toEqual({
      day: "2026-09-01",
      iso: "2026-09-01T13:45:00.000Z",
    });
  });
});

describe("the studio's next gallery slot", () => {
  it("fills the first hole rather than appending behind a gap", () => {
    const rows: MediaFact[] = [
      authoredMedia(asset("hero")),
      authoredMedia(asset("gallery", 0)),
      authoredMedia(asset("gallery", 1)),
      authoredMedia(asset("gallery", 3)),
    ];
    expect(nextGalleryPosition(rows)).toBe(2);
    expect(nextGalleryPosition([])).toBe(0);
    // The hero does not occupy a gallery slot.
    expect(nextGalleryPosition([authoredMedia(asset("hero"))])).toBe(0);
  });
});

// openproduct-studio OSD1 — the panel may not widen the column it sits in.
//
// The reading column was an implicit grid track, whose minimum is its items'
// min-content; the gallery strip's min-content is every thumbnail side by
// side. /chaseid at 1440px drew a 1389px column in a 790px track. Pinned at
// the source, because the defect is a class, not a behaviour a unit can see.
describe("the panel holds its column", () => {
  const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../../../web/src/app/[slug]");
  const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");

  it("gives the reading column an explicit minmax(0,1fr) track", () => {
    // OPR1 — the column is the boards' stack of cards, spelt once in
    // `ui/design.ts`; the track is still explicit, in the stack and in the
    // two-column grid it sits in.
    expect(read("page.tsx")).toContain("<div className={BOARD_STACK}>");
    const design = readFileSync(resolve(APP, "../ui/design.ts"), "utf-8");
    expect(design).toMatch(/export const BOARD_STACK = "grid min-w-0 grid-cols-\[minmax\(0,1fr\)\] /);
    expect(design).toMatch(/export const BOARD_COLUMNS =\s*"grid grid-cols-\[minmax\(0,1fr\)_300px\] /);
  });

  it("lets the panel shrink below its gallery's min-content", () => {
    expect(read("media-panel.tsx")).toMatch(/className="[^"]*\bmin-w-0\b[^"]*\bmax-w-full\b[^"]*" data-media-panel/);
  });
});
