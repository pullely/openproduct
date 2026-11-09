// The build page (openproduct-open-builds OB5).
//
// What is pinned: how a build is moving is the first thing under its name —
// a stat strip of four figures, each a glyph, a label and a value that is a
// dash rather than a zero when it was not observed — and the rail says Code,
// Repo health and Details. The words follow the product (D4): roles open,
// never people wanted.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUILD_DETAILS_HEADING,
  BUILD_ROLES_HEADING,
  BUILD_STAT_LABEL,
  LAUNCH_HEALTH_HEADING,
  OBSERVED_FRAME_HEADING,
  rolesOpenLabel,
} from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = "[slug]/page.tsx";

describe("the stat strip leads the page", () => {
  it("is four figures, in the contract's order and words", () => {
    expect(Object.values(BUILD_STAT_LABEL)).toEqual(["Changes, 7 days", "Upvotes, 7 days", "Most active", "Last merge"]);
    const page = code(PAGE);
    expect(page).toContain("data-stat-strip");
    expect(page.match(/<Stat\b/g)).toHaveLength(4);
    // Under the name, before the outline: the strip is in the hero.
    expect(page.indexOf("data-stat-strip")).toBeLessThan(page.indexOf("aria-label={SECTION_NAV_LABEL}"));
  });

  it("draws each figure with the glyph the rows use", () => {
    const page = code(PAGE);
    for (const glyph of ["<ChangesIcon", "<UpvoteIcon", "<ActiveIcon", "<ClockIcon"]) {
      expect([glyph, page.includes(glyph)]).toEqual([glyph, true]);
    }
  });

  it("renders a dash, never a zero, for a figure nobody observed (OPC-C)", () => {
    const page = code(PAGE);
    expect(page).toContain("<MetricValue metric={merges} />");
    expect(page).toContain("<MetricValue metric={endorsementsRecent} />");
    expect(page).toContain("mostActiveRank === null ? (");
    expect(page).toContain("lastTouched ? agoOf(fromEpochSeconds(lastTouched.value), now) : DASH");
  });

  it("reads the rank from the front page's own order, never a second one", () => {
    const page = code(PAGE);
    expect(page).toContain("mostActiveRankOf(catalog, profile.slug)");
    expect(page).not.toMatch(/\.sort\(byMostActive\)/);
  });
});

describe("the rail says Code, Repo health and Details", () => {
  it("names the three panels in the reader's words", () => {
    expect(OBSERVED_FRAME_HEADING).toBe("Code");
    expect(LAUNCH_HEALTH_HEADING).toBe("Repo health");
    expect(BUILD_DETAILS_HEADING).toBe("Details");
    expect(code("[slug]/observed-row.tsx")).toContain("<CodeIcon");
    expect(code("[slug]/launch-health.tsx")).toContain("<HealthIcon");
  });

  it("keeps the moved figures out of the Details list", () => {
    const page = code(PAGE);
    const details = page.slice(page.indexOf("{BUILD_DETAILS_HEADING}"), page.indexOf("<LaunchHealth"));
    expect(details).not.toContain("observedNote(merges");
    expect(details).not.toContain("observedNote(endorsementsRecent");
    expect(details).toContain('label="Published"');
  });
});

describe("roles, in the reader's word (D4)", () => {
  it("says roles open, never people wanted", () => {
    expect(rolesOpenLabel(1)).toBe("1 role open");
    expect(rolesOpenLabel(3)).toBe("3 roles open");
    expect(BUILD_ROLES_HEADING).toBe("Open roles");
    const page = code(PAGE);
    expect(page).toContain("{rolesOpenLabel(openRoles.length)}");
    expect(page).toContain("{BUILD_ROLES_HEADING}");
    expect(page).not.toContain("people wanted");
    expect(page).not.toContain("Where it needs people");
  });
});
