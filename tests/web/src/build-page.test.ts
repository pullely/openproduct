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

// openproduct-redesign OPR1 — THE FIGURES NO LONGER LEAD. The redesign's
// first finding is that the page counted instead of showing (design §1), and
// the `Product` board's header card carries no numbers at all. The four
// figures are still read, still in the contract's order and words, still a
// dash when unobserved — in the side column's Details card, under the board's
// own three cards.
describe("the four figures sit in the side column", () => {
  it("is four figures, in the contract's order and words, after the board's cards", () => {
    expect(Object.values(BUILD_STAT_LABEL)).toEqual(["Changes, 7 days", "Upvotes, 7 days", "Most active", "Last merge"]);
    const page = code(PAGE);
    expect(page).toContain("data-stat-strip");
    expect(page.match(/<Stat\b/g)).toHaveLength(4);
    // Under the name, before the outline: the strip is in the hero.
    // Not in the header card: after its row of sections, after the reading
    // column, and after Crew, Built with and In the open.
    expect(page.indexOf("data-stat-strip")).toBeGreaterThan(page.indexOf("aria-label={SECTION_NAV_LABEL}"));
    expect(page.indexOf("data-stat-strip")).toBeGreaterThan(page.indexOf('id="open-heading"'));
    const header = page.slice(page.indexOf("id={HERO_ID}"), page.indexOf("className={BOARD_COLUMNS}"));
    expect(header).not.toContain("<Stat");
    expect(header).not.toContain("MetricValue");
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

  it("puts the figures and the facts in the Details card, each fact said once", () => {
    const page = code(PAGE);
    const details = page.slice(page.indexOf("{BUILD_DETAILS_HEADING}"), page.indexOf("<LaunchHealth"));
    expect(details).toContain("observedNote(merges");
    expect(details).toContain("observedNote(endorsementsRecent");
    expect(details).toContain('label="Published"');
    // The category and licence are on the header's line of facts, the hosting
    // is a Built with pill and the pricing an In the open row: not here too.
    for (const moved of ['label="Category"', 'label="Hosting"', 'label="Pricing"']) {
      expect([moved, details.includes(moved)]).toEqual([moved, false]);
    }
  });
});

describe("seats, in the redesign's word", () => {
  it("says open seats and Help wanted on the product page, never people wanted", () => {
    // The contract's words still name the lists that have not been redrawn.
    expect(rolesOpenLabel(1)).toBe("1 role open");
    expect(BUILD_ROLES_HEADING).toBe("Open roles");
    const page = code(PAGE);
    // The header's last fact (board: "2 open seats"), singular for one.
    expect(page).toContain("{openSeatsLabel(openRoles.length)}");
    expect(page).toContain('return count === 1 ? "1 open seat" : `${count} open seats`;');
    // The card that says what each seat asks for is headed as the navigation
    // names the place: Help wanted.
    expect(page).toContain('const SEATS_HEADING = "Help wanted";');
    expect(page).toContain("{SEATS_HEADING}");
    expect(page).not.toContain("people wanted");
    expect(page).not.toContain("Where it needs people");
    expect(page).not.toContain("roles open");
  });

  it("draws a seat in teal — never the green of success, never red", () => {
    const page = code(PAGE);
    expect(page).toContain("text-seat-ink");
    expect(page).toContain("bg-seat-wash");
    expect(page).not.toMatch(/\b(?:bg|text)-success\b/);
    expect(page).not.toMatch(/\b(?:bg|text|border)-destructive\b/);
  });
});

// openproduct-redesign OPR1 — the header card of board `Product`, the
// visitor view, on the data a listing has today.
describe("the header card is the board's", () => {
  const page = code(PAGE);
  const header = page.slice(page.indexOf("id={HERO_ID}"), page.indexOf("className={BOARD_COLUMNS}"));

  it("has ONE h1 on the page, and it is the product's name in the page title", () => {
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(header).toContain("<h1 className={`${PAGE_TITLE} min-w-0 break-words`}>{profile.slug}</h1>");
    // Lora 400 at 40px, 28 on a phone — the shared title, not a local size.
    expect(code("ui/design.ts")).toMatch(
      /export const PAGE_TITLE =\s*"m-0 font-serif text-display font-normal[^"]*max-sm:text-title/,
    );
  });

  it("draws the cover band, the logo over it, the pitch and the line of facts, in that order", () => {
    const order = ["className={COVER_PRODUCT}", "<ProductTile", "<h1", "{profile.tagline}", "<HeroFacts>"].map((mark) =>
      header.indexOf(mark),
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The band is decoration and the desktop board's alone.
    expect(header).toContain('<div aria-hidden="true" className={COVER_PRODUCT} />');
    expect(code("ui/design.ts")).toMatch(/export const COVER_PRODUCT =\s*"h-\[140px\][^"]*max-sm:hidden"/);
    // The logo at the board's 92px with the card's colour ringed round it.
    expect(page).toContain("ring-[5px] ring-card");
    expect(page).toContain("sm:!h-[92px] sm:!w-[92px] sm:!rounded-[26px]");
  });

  it("states a fact only when the data has it, with no dot left dangling", () => {
    const facts = header.slice(header.indexOf("<HeroFacts>"), header.indexOf("</HeroFacts>"));
    for (const gate of [
      "{profile.category ? (",
      "{profile.licence ? ",
      "{profile.hosting ? ",
      "{profile.followers > 0 ? (",
      "{openRoles.length > 0 ? (",
    ]) {
      expect([gate, facts.includes(gate)]).toEqual([gate, true]);
    }
    // The separators are drawn between the facts that rendered, not typed
    // between the ones that might.
    expect(facts).not.toContain("·");
    expect(page).toContain("const facts = Children.toArray(children);");
    expect(page).toContain("if (facts.length === 0) return null;");
  });

  it("offers Follow, Take a seat and Try it — and Try it only with a live address", () => {
    const actions = header.slice(header.indexOf("data-hero-actions"));
    // Follow follows the PRODUCT (owner rule 3).
    expect(actions).toMatch(/<FollowButton\s+kind="listing"\s+value=\{profile\.slug\}/);
    expect(page).not.toContain('kind="person"');
    // Take a seat goes to the crew card, and only when a seat is open.
    expect(actions).toMatch(/\{openRoles\.length > 0 \? \(\s*<a href="#crew" className=\{BTN_SOFT\}>\s*Take a seat\s*<\/a>/);
    expect(page).toMatch(/<section\s+id="crew"/);
    // Try it is the listing's own address for the running product, or absent.
    expect(actions).toMatch(
      /\{profile\.liveUrl \? \(\s*<a href=\{profile\.liveUrl\} rel="noreferrer noopener" className=\{BTN_INK\}>\s*Try it/,
    );
    expect(page.match(/Try it/g)?.length).toBe(1);
    expect(page.match(/profile\.liveUrl/g)?.length).toBe(2);
    // No stand-in destination: not the repository, not a fragment.
    expect(actions).not.toMatch(/Try it[\s\S]{0,40}profile\.repoUrl/);
  });

  it("builds none of the board's later parts: no tabs that switch, no progress, no maker view", () => {
    for (const later of ["SHIPPING", "aria-pressed", "New post", "Edit details", "Needs you", "Manage"]) {
      expect([later, page.includes(later)]).toEqual([later, false]);
    }
    // The row in the header is the page's own outline: anchors, not buttons.
    expect(header).toMatch(/<a href=\{`#\$\{section\.id\}`\} className=\{`\$\{SECTION_PILL\}/);
  });
});

describe("the side column is the board's three cards, then what the repository says", () => {
  const page = code(PAGE);
  const side = page.slice(page.indexOf("<aside className={BOARD_STACK}>"));

  it("draws Crew, Built with and In the open in the board's order, each only with something in it", () => {
    const order = ['id="crew-heading"', 'id="stack-heading"', 'id="open-heading"', "<ObservedRow", "<LaunchHealth", 'id="alternatives"'].map(
      (mark) => side.indexOf(mark),
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(side).toContain("{profile.maintainers.length > 0 || openRoles.length > 0 ? (");
    expect(side).toContain("{builtWith.length > 0 ? (");
    expect(side).toContain("{profile.repoUrl || profile.workspaceRef || profile.pricing ? (");
  });

  it("lists the people, then every open seat as a teal row whose door is the join link", () => {
    const crew = side.slice(side.indexOf('id="crew"'), side.indexOf('id="stack-heading"'));
    expect(crew).toContain("<PersonName");
    expect(crew).toContain("{openRoles.map((role) => (");
    expect(crew).toContain("className={SEAT_ROW}");
    expect(crew).toContain("${SEAT_RING} h-[32px] w-[32px] border-[1.5px]");
    expect(crew).toMatch(/\{role\.joinLinkRef \? \(\s*<a\s+href=\{`\$\{consoleOrigin\(\)\}\/join\/\$\{role\.joinLinkRef\}\?from=openproduct`\}/);
    expect(crew).toContain("Take it");
    expect(code("ui/design.ts")).toContain(
      'export const SEAT_ROW = "flex items-center justify-between gap-2.5 rounded-[14px] bg-seat-wash px-3 py-2.5";',
    );
  });

  it("makes Built with from the stack, the published components and the hosting, each said once", () => {
    expect(page).toContain("...profile.stack,");
    expect(page).toContain("...components.map((component) =>");
    expect(page).toContain('...(profile.hosting ? [labelOf("hosting", profile.hosting) ?? profile.hosting] : []),');
    expect(page).toMatch(/const builtWith = \[\s*\.\.\.new Set\(\[/);
    expect(side).toContain("className={STACK_PILL}");
  });

  it("names the repository, the workspace and the pricing as label and value rows", () => {
    const open = side.slice(side.indexOf('id="open-heading"'), side.indexOf("<ObservedRow"));
    for (const label of ["Repository", "Workspace", "Pricing"]) {
      expect([label, open.includes(`<span className="text-muted-foreground">${label}</span>`)]).toEqual([label, true]);
    }
    expect(open).toContain("{repositoryLabel(profile.repoUrl)}");
    expect(open).toContain('rel="noreferrer noopener"');
  });
});

describe("nothing personal is in the product page's server render (I6)", () => {
  it("is a server component that reads no session, cookie or header", () => {
    const page = code(PAGE);
    expect(page).not.toContain('"use client"');
    expect(page).not.toMatch(/\b(readSession|cookies|headers)\s*\(/);
    expect(page).not.toMatch(/from "next\/headers"/);
    expect(page).not.toMatch(/from "\.\.\/(me|auth|studio)\//);
    expect(page).toContain("export const revalidate = 60;");
  });

  it("leaves who follows, who saved and who voted to the overlay controls", () => {
    const page = code(PAGE);
    // The page hands each control only what every visitor shares: the slug,
    // the public count, the address to come back to.
    expect(page).toMatch(
      /<FollowButton\s+kind="listing"\s+value=\{profile\.slug\}\s+followers=\{profile\.followers\}\s+returnTo=\{`\/\$\{profile\.slug\}`\}\s+size="hero"\s+countHidden\s+\/>/,
    );
    expect(page).toContain("<SaveControl slug={profile.slug} />");
    for (const personal of ["isFollowing", "useOverlay", "following=", "saved=", "voted="]) {
      expect([personal, page.includes(personal)]).toEqual([personal, false]);
    }
    // And the control that knows is a client island reading the overlay.
    const follow = code("ui/follow-button.tsx");
    expect(follow).toContain('"use client"');
    expect(follow).toContain("useOverlay(");
  });
});
