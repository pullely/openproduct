// The product page (openproduct-open-builds OB5; rebuilt to the boards
// `Product` and `ProductIdea` in openproduct-redesign OPR-3).
//
// What is pinned: the shipping page's header card (the stage mark beside the
// name, the pitch, the facts, the actions, the tabs as links), its side
// column (Crew, Built with, In the open, then the four figures — each a dash
// rather than a zero when it was not observed), the idea page's note, and
// that nothing personal and nothing of the maker view is in the server
// render. The page's source is `[slug]/product-page.tsx`; `[slug]/page.tsx`
// and the tab routes beside it are thin route files over it.

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

const PAGE = "[slug]/product-page.tsx";


/** One page's own source: from its function to the next top-level piece. */
const between = (source: string, from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to));
const shippingOf = (source: string) => between(source, "async function ShippingPage(", "function UpdatesTab(");
const ideaOf = (source: string) => between(source, "async function IdeaPage(", "type Catalog =");

// openproduct-redesign OPR1 — THE FIGURES NO LONGER LEAD. The redesign's
// first finding is that the page counted instead of showing (design §1), and
// the `Product` board's header card carries no numbers at all. The four
// figures are still read, still in the contract's order and words, still a
// dash when unobserved — in the side column, under the board's own three
// cards.
describe("the four figures sit in the side column", () => {
  it("is four figures, in the contract's order and words, after the board's cards", () => {
    expect(Object.values(BUILD_STAT_LABEL)).toEqual(["Changes, 7 days", "Upvotes, 7 days", "Most active", "Last merge"]);
    const page = code(PAGE);
    expect(page).toContain("data-stat-strip");
    expect(page.match(/<Stat\b/g)).toHaveLength(4);
    // Not in the header card: in the side column, after Crew, Built with and
    // In the open.
    const shipping = shippingOf(page);
    const side = shipping.slice(shipping.indexOf("<aside className={BOARD_STACK}>"));
    const order = ["<CrewSideCard", "<BuiltWithCard", "<InTheOpenCard", "<RepositoryPanel"].map((mark) => side.indexOf(mark));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const header = shipping.slice(shipping.indexOf("id={HERO_ID}"), shipping.indexOf("className={BOARD_COLUMNS}"));
    expect(header).not.toContain("<Stat");
    expect(header).not.toContain("MetricValue");
    expect(between(page, "function RepositoryPanel(", "function AlternativesPanel(")).toContain("data-stat-strip");
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

  it("puts the figures and the facts in the repository panel, each fact said once", () => {
    const page = code(PAGE);
    const details = between(page, "{BUILD_DETAILS_HEADING}", "function AlternativesPanel(");
    expect(details).toContain("observedNote(merges");
    expect(details).toContain("observedNote(endorsementsRecent");
    expect(details).toContain('label="Published"');
    // The category and licence are on the header's line of facts and the
    // About tab's tiles, the hosting is a Built with pill and the pricing an
    // In the open row: not here too.
    for (const moved of ['label="Category"', 'label="Hosting"', 'label="Pricing"']) {
      expect([moved, details.includes(moved)]).toEqual([moved, false]);
    }
  });
});

describe("seats, in the redesign's word", () => {
  it("says open seats on the product page, never people wanted", () => {
    // The contract's words still name the lists that have not been redrawn.
    expect(rolesOpenLabel(1)).toBe("1 role open");
    expect(BUILD_ROLES_HEADING).toBe("Open roles");
    const page = code(PAGE);
    // The header's last fact (board: "2 open seats"), singular for one.
    expect(page).toContain("{openSeatsLabel(openRoles.length)}");
    expect(page).toContain('return count === 1 ? "1 open seat" : `${count} open seats`;');
    // The card that says what each seat asks for is the board's: Open seats.
    expect(page).toContain('<CardHead id="seats-heading" title="Open seats">');
    // `people-wanted` survives only as the anchor other pages already link to.
    expect(page).toContain('export const SEATS_ANCHOR = "people-wanted";');
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

  it("gives a seat one control: Take the seat, Requested from the overlay, or the crew's Edit seat", () => {
    const seats = code("[slug]/maker/seats.tsx");
    expect(seats).toContain('"use client"');
    // The door is the existing join flow on the console (OD4, S5); no door,
    // no button.
    expect(seats).toContain("href={`${consoleOrigin()}/join/${joinLinkRef}?from=openproduct`}");
    expect(seats).toContain("if (!joinLinkRef) return null;");
    // "Requested" is the visitor's own state: it comes with the overlay.
    expect(seats).toContain("const requested = useOpeningRequested(openingId);");
    expect(seats).toContain("Requested");
    expect(seats).toContain('{quiet ? "Take it" : "Take the seat"}');
    expect(seats).toContain('{quiet ? "Edit" : "Edit seat"}');
  });
});

// openproduct-redesign OPR-3 — the header card of board `Product`.
describe("the header card is the board's", () => {
  const page = code(PAGE);
  const shipping = shippingOf(page);
  const header = shipping.slice(shipping.indexOf("id={HERO_ID}"), shipping.indexOf("className={BOARD_COLUMNS}"));

  it("has ONE h1 on each page, and it is the product's name in the page title", () => {
    expect(shipping.match(/<h1\b/g)).toHaveLength(1);
    expect(ideaOf(page).match(/<h1\b/g)).toHaveLength(1);
    expect(page.match(/<h1\b/g)).toHaveLength(2);
    expect(header).toContain("<h1 className={`${PAGE_TITLE} min-w-0 break-words`}>{slug}</h1>");
    // Lora 400 at 40px, 28 on a phone — the shared title, not a local size.
    expect(code("ui/design.ts")).toMatch(
      /export const PAGE_TITLE =\s*"m-0 font-serif text-display font-normal[^"]*max-sm:text-title/,
    );
  });

  it("wears the stage mark beside the name: SHIPPING · N OF M, from the document's counts", () => {
    const mark = header.slice(header.indexOf("<h1"), header.indexOf("<ProductPitch"));
    expect(mark).toContain('<StageMark stage="shipping" counts={profile.milestoneCounts} />');
    // The words are the shared stage module's, so no page spells its own.
    expect(page).not.toMatch(/SHIPPING ·|\bOF \$\{/);
  });

  it("draws the cover band, the logo over it, the pitch and the line of facts, in that order", () => {
    const order = ["className={COVER_PRODUCT}", "<ProductTile", "<h1", "<ProductPitch", "<HeroFacts>"].map((mark) =>
      header.indexOf(mark),
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The pitch is the listing's one line, and the same paragraph for
    // everybody on the server.
    expect(header).toContain('<ProductPitch slug={slug} tagline={profile.tagline} tryUrl={profile.tryUrl} look="shipping" />');
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
      "{profile.followers > 0 ? ",
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

  it("offers Follow, Take a seat and Try it — and Try it only with `tryUrl`", () => {
    const actions = header.slice(header.indexOf("data-hero-actions"));
    // Two to a row on a phone (board `PhoneProduct`), and a third action
    // takes the whole row rather than half of one beside a hole.
    expect(actions).toContain("max-sm:grid max-sm:grid-cols-2 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2");
    // Follow follows the PRODUCT (owner rule 3).
    expect(actions).toMatch(/<FollowButton\s+kind="listing"\s+value=\{slug\}/);
    expect(page).not.toContain('kind="person"');
    // Take a seat goes to the open seats on the Crew tab, and only when a
    // seat is open.
    expect(shipping).toContain('const seatsHref = `${productTabPath(slug, "crew")}#${SEATS_ANCHOR}`;');
    expect(actions).toMatch(/\{openRoles\.length > 0 \? \(\s*<AppLink href=\{seatsHref\} className=\{BTN_SOFT\}>\s*Take a seat\s*<\/AppLink>/);
    // Try it is the address the crew gave for the running product, or absent.
    expect(actions).toMatch(
      /\{profile\.tryUrl \? \(\s*<a href=\{profile\.tryUrl\} rel="noreferrer noopener" data-try-it className=\{BTN_INK\}>\s*Try it/,
    );
    expect(shipping.match(/Try it/g)?.length).toBe(1);
    // No stand-in destination: not the live address, not the repository.
    expect(actions).not.toContain("profile.liveUrl");
    expect(actions).not.toMatch(/Try it[\s\S]{0,40}profile\.repoUrl/);
  });

  it("keeps Upvote, Save and Share in the header's secondary row", () => {
    expect(header).toMatch(/<SecondaryActs\s+profile=\{profile\}\s+upvote=\{<VoteBox slug=\{slug\}/);
    const acts = between(page, "function SecondaryActs(", "async function ShippingPage(");
    const order = ["{upvote}", "<SaveControl", "<ShareControl"].map((mark) => acts.indexOf(mark));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("no longer carries OPR1's interim outline: no anchor pills, no not-yet line, no section twice", () => {
    expect(page).not.toContain("SECTION_NAV_LABEL");
    expect(page).not.toContain("listingSections");
    expect(page).not.toContain("data-not-yet");
    expect(page).not.toContain("SEATS_HEADING");
    // The side Crew card steps aside on the Crew tab, which is the same
    // people and seats at full width.
    expect(shipping).toMatch(/\{tab === "crew" \? null : \(\s*<CrewSideCard/);
  });
});

describe("the side column is the board's three cards, then what the repository says", () => {
  const page = code(PAGE);
  const shipping = shippingOf(page);
  const side = shipping.slice(shipping.indexOf("<aside className={BOARD_STACK}>"));

  it("draws Crew, Built with and In the open in the board's order, each only with something in it", () => {
    const order = ["<CrewSideCard", "<BuiltWithCard", "<InTheOpenCard", "<RepositoryPanel", "<LaunchHealth", "<AlternativesPanel"].map(
      (mark) => side.indexOf(mark),
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(page).toContain("if (maintainers.length === 0 && openRoles.length === 0 && !needsBuilder) return null;");
    expect(page).toContain("if (entries.length === 0) return null;");
    expect(page).toContain("if (!lead && !profile.repoUrl && !profile.workspaceRef && !profile.pricing) return null;");
  });

  it("lists the people, then every open seat as a teal row whose door is the seat's own control", () => {
    const crew = between(page, "export function CrewSideCard(", "export function OpenSeatsCard(");
    expect(crew).toContain("<CrewPeople maintainers={maintainers} />");
    expect(page).toContain("<PersonName");
    expect(crew).toContain("openRoles.map((role) => (");
    expect(crew).toContain("className={SEAT_ROW}");
    expect(crew).toContain("${SEAT_RING} h-[32px] w-[32px] border-[1.5px]");
    expect(crew).toContain("<SeatAction slug={slug} openingId={role.id} title={role.title} joinLinkRef={role.joinLinkRef} quiet />");
    expect(code("ui/design.ts")).toContain(
      'export const SEAT_ROW = "flex items-center justify-between gap-2.5 rounded-[14px] bg-seat-wash px-3 py-2.5";',
    );
  });

  it("makes Built with from the stack, the published components and the hosting, each said once", () => {
    expect(page).toContain("...profile.stack,");
    expect(page).toContain("...components.map((component) =>");
    expect(page).toContain('...(profile.hosting ? [labelOf("hosting", profile.hosting) ?? profile.hosting] : []),');
    expect(page).toMatch(/export function builtWithOf\(profile: PublicProfile\): string\[\] \{[\s\S]*?\.\.\.new Set\(\[/);
    expect(page).toContain("className={STACK_PILL}");
  });

  it("names the repository, the workspace and the pricing as label and value rows", () => {
    const open = between(page, "export function InTheOpenCard(", "export function shippedMark(");
    for (const label of ["Repository", "Workspace", "Pricing"]) {
      expect([label, open.includes(`<span className="text-muted-foreground">${label}</span>`)]).toEqual([label, true]);
    }
    expect(open).toContain("{repositoryLabel(profile.repoUrl)}");
    expect(open).toContain('rel="noreferrer noopener"');
  });
});

// openproduct-redesign OPR-3 — board `ProductIdea`.
describe("the idea page is the lavender note", () => {
  const page = code(PAGE);
  const idea = ideaOf(page);
  const note = idea.slice(idea.indexOf("data-idea-note"), idea.indexOf("className={BOARD_COLUMNS}"));

  it("is a note with one square corner on the idea wash, marked AN IDEA, NOT BUILT YET", () => {
    expect(note).toContain("rounded-[4px_16px_16px_16px] bg-idea-wash");
    expect(note).toContain("{IDEA_MARK}");
    expect(code("ui/stage.ts")).toContain('export const IDEA_MARK = "An idea, not built yet";');
    const order = ["{IDEA_MARK}", "<h1", "<ProductPitch", "<HeroFacts", "data-hero-actions", "data-idea-track"].map((mark) => note.indexOf(mark));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("quotes the idea in one line, in the serif italic, from the tagline", () => {
    expect(note).toContain('<ProductPitch slug={slug} tagline={profile.tagline} tryUrl={profile.tryUrl} look="idea" />');
    const pitch = code("[slug]/maker/details.tsx");
    expect(pitch).toMatch(/idea: "[^"]*font-serif text-title italic/);
    // In quotation marks, as the board's note quotes it.
    expect(pitch).toMatch(/\{look === "idea" \? `(?:\\u201C|\u201C)\$\{shown\}(?:\\u201D|\u201D)` : shown\}/);
  });

  it("offers Take a seat, I'd use this and Follow — the upvote relabelled, its count only above zero", () => {
    const actions = note.slice(note.indexOf("data-hero-actions"), note.indexOf("data-idea-track"));
    const order = ["Take a seat", "<WouldUseButton", "<FollowButton"].map((mark) => actions.indexOf(mark));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const use = code("[slug]/would-use.tsx");
    expect(use).toMatch(/export const WOULD_USE_LABEL = "I(?:\\u2019|\u2019)d use this";/);
    // The same act and the same two routes as the upvote: no second table.
    expect(use).toContain('useToggle("endorsed", slug, !pressed)');
    expect(use).toContain("/me/endorse?slug=");
    expect(use).toContain("/me/unendorse?slug=");
    expect(use).toContain("{shown > 0 ? ");
    // So the idea page has no second upvote in its secondary row.
    expect(note).toContain("<SecondaryActs profile={profile} upvote={null} />");
    expect(idea).not.toContain("<VoteBox");
  });

  it("marks where the idea stands: three steps, the first one current", () => {
    expect(page).toContain('export const IDEA_STEPS = ["Idea", "First builder", "First milestone"] as const;');
    expect(note).toContain('aria-label="Where this idea stands"');
    expect(note).toContain('aria-current={index === 0 ? "step" : undefined}');
  });

  it("reads The problem from the idea post's blocks, and from the pitch without one", () => {
    expect(idea).toContain('const ideaPost = posts?.posts.find((post) => post.kind === "idea") ?? null;');
    const problem = between(page, "function problemOf(", "async function IdeaPage(");
    for (const block of ['"problem"', '"who"', '"why-now"']) {
      expect([block, problem.includes(`blockText(post.blocks, ${block})`)]).toEqual([block, true]);
    }
    expect(problem).toContain("return { problem: pitch, who: null, whyNow: null };");
    for (const title of ["The problem", "Who has it", "Why now"]) {
      expect([title, idea.includes(`title="${title}"`)]).toEqual([title, true]);
    }
  });

  it("has no tabs and no Updates until something is posted; then it shows the posts", () => {
    expect(idea).not.toContain("productTabLinks");
    expect(idea).toContain("const updates = (posts?.posts ?? []).filter((post) => post.id !== ideaPost?.id);");
    expect(idea).toMatch(/\{updates\.length > 0 \? \(\s*<>\s*<h2[^>]*>Updates<\/h2>\s*<PostList/);
  });

  it("draws the dashed Needs a first builder slot while the crew is only its maker", () => {
    expect(idea).toContain("needsBuilder={profile.maintainers.length <= 1}");
    const crew = between(page, "export function CrewSideCard(", "export function OpenSeatsCard(");
    expect(crew).toContain("{IDEA_NEEDS_BUILDER}");
    expect(crew).toContain("border-dashed border-idea/[0.35]");
    // In the open says the stage and that nothing is built yet.
    expect(idea).toContain("emptyRepository");
    expect(page).toContain("Not started");
  });
});

describe("nothing personal is in the product page's server render (I6)", () => {
  const ROUTES = ["[slug]/page.tsx", "[slug]/about/page.tsx", "[slug]/crew/page.tsx", "[slug]/talk/page.tsx", "[slug]/updates/[cursor]/page.tsx"];

  it("is a server component that reads no session, cookie, header or query", () => {
    for (const file of [PAGE, ...ROUTES]) {
      const source = code(file);
      expect([file, source.includes('"use client"')]).toEqual([file, false]);
      expect([file, /\b(readSession|cookies|headers)\s*\(/.test(source)]).toEqual([file, false]);
      expect([file, /from "next\/headers"/.test(source)]).toEqual([file, false]);
      expect([file, /from "\.\.\/(me|auth|studio)\//.test(source)]).toEqual([file, false]);
      // A page that reads its query is rendered per request.
      expect([file, /searchParams/.test(source)]).toEqual([file, false]);
    }
    for (const file of ROUTES) {
      expect([file, code(file).includes("export const revalidate = 60;")]).toEqual([file, true]);
    }
  });

  it("leaves who follows, who saved and who voted to the overlay controls", () => {
    const page = code(PAGE);
    // The page hands each control only what every visitor shares: the slug,
    // the public count, the address to come back to.
    expect(page).toMatch(
      /<FollowButton\s+kind="listing"\s+value=\{slug\}\s+followers=\{profile\.followers\}\s+returnTo=\{here\}\s+size="hero"\s+tone="outline"\s+countHidden\s+\/>/,
    );
    expect(page).toContain("<SaveControl slug={profile.slug} />");
    for (const personal of ["isFollowing", "useOverlay", "useCrewOf", "useMaker", "following=", "saved=", "voted="]) {
      expect([personal, page.includes(personal)]).toEqual([personal, false]);
    }
    // And the control that knows is a client island reading the overlay.
    const follow = code("ui/follow-button.tsx");
    expect(follow).toContain('"use client"');
    expect(follow).toContain("useOverlay(");
  });
});
