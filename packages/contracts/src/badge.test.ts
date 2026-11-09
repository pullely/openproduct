import { describe, expect, it } from "vitest";

import {
  BADGE_CACHE_CONTROL,
  BADGE_HEIGHT,
  BADGE_LABEL,
  badgeHtml,
  badgeMarkdown,
  badgeSvg,
  badgeValue,
  badgeVariantPath,
  badgeVariantValue,
  badgeWidth,
  BADGE_VARIANTS,
} from "./badge.js";
import type { PublicProfile } from "./index.js";

describe("what the badge says", () => {
  it("prefers the fact that is settled forever", () => {
    // A launch rank is a fact about a DAY and is true once that day closes.
    // The badge is fetched by a proxy on behalf of readers who will never
    // visit this site, so the most durable true thing is the right thing.
    expect(badgeValue({ launch: { rank: 3, of: 11 } as never })).toBe("#3 of 11");
  });

  it("says `listed`, never `0`", () => {
    // OPC-C: a zero is a claim and a dash is "not measured". A badge has room
    // for neither nuance nor a legend, so a listing with nothing counted says
    // something true instead of a number about somebody's product that they
    // would then have to explain in their own README.
    // `{}` rather than `{ launch: undefined }`: this package compiles with
    // `exactOptionalPropertyTypes`, under which an explicit `undefined` is not
    // the same as an absent key — which is the same distinction the field
    // itself makes. `launch` is ABSENT when there is nothing to say, never
    // `null`, because "we looked and it placed nowhere" is a different claim
    // (OPC-C), and the type says so.
    expect(badgeValue({})).toBe("listed");
    expect(badgeValue({})).not.toMatch(/\d/);
  });
});

describe("the box is closed", () => {
  // DIMENSION-LOCKED: a badge that reflows its container is a badge a
  // maintainer removes. The SVG carries explicit `width` and `height`, and its
  // text is fitted with `textLength` so a long value cannot push past them.
  it("declares the width it draws, at every value length", () => {
    for (const value of ["listed", "#3 of 11", "#128 of 1024", "x".repeat(40)]) {
      const svg = badgeSvg(value);
      const width = badgeWidth(value);
      expect(svg).toContain(`width="${width}"`);
      expect(svg).toContain(`height="${BADGE_HEIGHT}"`);
      expect(svg).toContain(`viewBox="0 0 ${width} ${BADGE_HEIGHT}"`);
    }
  });

  it("fits its text rather than hoping the estimate was right", () => {
    // Shields.io ships a font-metrics table because it has to place text it
    // cannot measure. `textLength` tells the renderer the exact width to fit
    // the glyphs into, so the estimate only has to look un-stretched — being
    // a pixel wrong costs nothing, where being wrong WITHOUT it would cost
    // the badge its box.
    const svg = badgeSvg("#3 of 11");
    expect(svg.match(/textLength="\d+"/g)?.length).toBe(2);
    expect(svg).toContain('lengthAdjust="spacingAndGlyphs"');
  });

  it("is always exactly one row high", () => {
    expect(BADGE_HEIGHT).toBe(20);
    for (const value of ["listed", "x".repeat(60)]) {
      expect(badgeSvg(value)).toContain(`height="${BADGE_HEIGHT}"`);
    }
  });
});

describe("what a stranger's proxy is allowed to do with it", () => {
  it("is the same picture for every requester", () => {
    // WC-4 and I6, on the surface that will be fetched by GitHub's image
    // proxy on behalf of anybody reading any repository that pasted it.
    expect(badgeSvg("listed")).toBe(badgeSvg("listed"));
    expect(badgeSvg("listed")).not.toMatch(/user|session|token|handle/i);
  });

  it("may be held for an hour here and far longer out there", () => {
    // A badge is EXPECTED to lag; that is what separates it from a social
    // card, which is fetched once and never again.
    expect(BADGE_CACHE_CONTROL).toContain("public");
    expect(BADGE_CACHE_CONTROL).toContain("max-age=3600");
    expect(BADGE_CACHE_CONTROL).not.toContain("private");
  });
});

describe("the SVG is a document served to the world", () => {
  it("escapes what it interpolates", () => {
    // A slug cannot contain `<` or `&`, and that is not a reason to
    // interpolate one unescaped into a document anybody can request.
    const svg = badgeSvg('a<b&c"d');
    expect(svg).toContain("&lt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).not.toMatch(/>a<b/);
  });

  it("carries its own accessible name", () => {
    // An `<img>` in a README gets whatever alt text the maker typed, and most
    // type none. The badge says what it is even when the markup does not.
    const svg = badgeSvg("#3 of 11");
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title>openproduct — #3 of 11</title>");
    expect(svg).toContain('aria-label="openproduct — #3 of 11"');
  });

  it("uses literal colours, because it gets no stylesheet", () => {
    // An SVG served as an image gets no CSS from the page embedding it and
    // cannot read `--foreground`. A README renders on white by default, so
    // the light ramp is the right one — a badge that guessed at dark mode
    // would be wrong half the time somewhere it can never correct itself.
    const svg = badgeSvg("listed");
    expect(svg).toMatch(/#252422/);
    expect(svg).toMatch(/#fbfaf8/);
    expect(svg).not.toContain("var(--");
    expect(svg).not.toContain("oklch");
  });
});

describe("the line a maker pastes", () => {
  it("is a link, because a badge that is not a link is a picture of a claim", () => {
    expect(badgeMarkdown("https://openproduct.live", "my-product")).toBe(
      "[![openproduct](https://openproduct.live/badge/my-product)](https://openproduct.live/my-product)",
    );
  });

  it("offers the HTML form too, with the dimensions in it", () => {
    const html = badgeHtml("https://openproduct.live", "my-product", "listed")!;
    expect(html).toContain(`width="${badgeWidth("listed")}"`);
    expect(html).toContain(`height="${BADGE_HEIGHT}"`);
    expect(html).toContain(`alt="${BADGE_LABEL}"`);
  });

  it("offers nothing without a canonical origin", () => {
    // A snippet copied off a preview host would put that host in somebody's
    // README permanently.
    expect(badgeMarkdown(null, "my-product")).toBeNull();
    expect(badgeHtml(null, "my-product", "listed")).toBeNull();
  });
});

describe("OB7 — the build's own numbers, as variants", () => {
  // No launch: `launch` is optional, and absent is not the same as null.
  const profile: Pick<PublicProfile, "launch"> = {};

  it("are listed, most active and changes, each at its own path — never a query string", () => {
    expect([...BADGE_VARIANTS]).toEqual(["listed", "most-active", "changes"]);
    expect(badgeVariantPath("acme", "listed")).toBe("/badge/acme");
    expect(badgeVariantPath("acme", "most-active")).toBe("/badge/acme/most-active");
    expect(badgeVariantPath("acme", "changes")).toBe("/badge/acme/changes");
    expect(badgeMarkdown("https://op.test", "acme", "changes")).toBe(
      "[![openproduct](https://op.test/badge/acme/changes)](https://op.test/acme)",
    );
    // The bare badge's line is unchanged, so no pasted README moves.
    expect(badgeMarkdown("https://op.test", "acme")).toBe("[![openproduct](https://op.test/badge/acme)](https://op.test/acme)");
  });

  it("say the number when there is one", () => {
    expect(badgeVariantValue("most-active", { profile, rank: 3, merges: null })).toBe("most active #3");
    expect(badgeVariantValue("changes", { profile, rank: null, merges: 12 })).toBe("12 changes this week");
    expect(badgeVariantValue("changes", { profile, rank: null, merges: 1 })).toBe("1 change this week");
  });

  it("fall back to listed — never a zero, never a dash — when there is nothing true to say", () => {
    expect(badgeVariantValue("most-active", { profile, rank: null, merges: 5 })).toBe("listed");
    expect(badgeVariantValue("changes", { profile, rank: 1, merges: 0 })).toBe("listed");
    expect(badgeVariantValue("changes", { profile, rank: 1, merges: null })).toBe("listed");
  });
});
