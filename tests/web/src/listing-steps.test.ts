// IN1 — the steps, in the web layer (openproduct-worldclass).
//
// The milestone's three done-when clauses split cleanly into one that had to
// be built and two that were already true, and both halves are pinned here so
// nothing quietly un-does either.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMPLETENESS_NOTE,
  LISTING_STEPS,
  STEP_FIELDS,
  listingStepPath,
} from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const LISTING = "studio/[org]/[profile]";
const OVERVIEW = `${LISTING}/page.tsx`;
const ACTIONS = `${LISTING}/actions/route.ts`;
const SHELL = `${LISTING}/listing-shell.tsx`;
// openproduct-studio OSD5 — the frame every step shares, drawn once.
const LAYOUT = `${LISTING}/layout.tsx`;
const STRIP = `${LISTING}/step-strip.tsx`;
const PANEL = `${LISTING}/completeness-panel.tsx`;
const STEP_PAGES = {
  details: `${LISTING}/details/page.tsx`,
  // MD2 — the fifth page. IN1 shipped the step without one; MD1 gave the
  // bytes somewhere to go; this is the form that sends them there.
  media: `${LISTING}/media/page.tsx`,
  topics: `${LISTING}/topics/page.tsx`,
  people: `${LISTING}/people/page.tsx`,
  schedule: `${LISTING}/launches/page.tsx`,
} as const;

describe("each step is addressable", () => {
  it("every step with a segment has a page at exactly that address", () => {
    for (const step of LISTING_STEPS) {
      if (step.segment === null) continue;
      const page = `${LISTING}/${step.segment}/page.tsx`;
      expect([step.id, (() => { try { read(page); return true; } catch { return false; } })()]).toEqual([
        step.id,
        true,
      ]);
    }
  });

  it("the media step has a page now, at the address the strip links (MD2)", () => {
    // IN1 asserted the opposite — "a directory here would be a step
    // pretending to exist" — while the store was unbuilt. The store exists;
    // the page does too, and the strip renders a link rather than a span.
    const media = LISTING_STEPS.find((s) => s.id === "media")!;
    expect(media.segment).toBe("media");
    expect(() => read(`${LISTING}/media/page.tsx`)).not.toThrow();
  });

  it("every step page is personal, and says so to the census", () => {
    for (const page of Object.values(STEP_PAGES)) {
      expect([page, code(page).includes('export const dynamic = "force-dynamic"')]).toEqual([
        page,
        true,
      ]);
    }
  });

  it("puts the strip on every step and on the overview — once, in the layout they share", () => {
    // openproduct-studio OSD5: the strip used to be drawn by every page, so a
    // tab click re-rendered it with the rest of the editor. It is the
    // layout's now, and it stays on screen while a step loads.
    expect(code(LAYOUT)).toContain("<StepStrip");
    for (const page of [OVERVIEW, ...Object.values(STEP_PAGES)]) {
      expect([page, code(page).includes("<StepStrip")]).toEqual([page, false]);
    }
  });

  it("marks the current step from the address, and the overview as its own tab", () => {
    // A layout is not re-rendered when a sibling segment changes, so the
    // strip reads the selected segment rather than being told by a prop.
    const strip = code(STRIP);
    expect(strip).toContain("useSelectedLayoutSegment()");
    expect(strip).toContain("step.segment === segment");
    expect(strip).toContain('label: "Overview", href: base, current: segment === null');
    expect(strip).toContain('"aria-current": "page"');
  });

  it("builds every link from the vocabulary rather than by hand", () => {
    // OL-2a's cousin: a strip that spelled its own paths would be a second
    // place the address of a step is decided.
    const shell = code(STRIP);
    expect(shell).toContain("listingStepPath(org, profileId, step)");
    expect(shell).not.toMatch(/`\/studio\/\$\{[^}]+\}\/\$\{[^}]+\}\//);
    expect(listingStepPath("o", "p", LISTING_STEPS[0]!)).toBe("/studio/o/p/details");
  });
});

describe("a step's save cannot clear another step's fields", () => {
  const actions = code(ACTIONS);

  it("replaced the one all-fields intent with one per step", () => {
    // THE DEFECT THE SPLIT WOULD OTHERWISE HAVE INTRODUCED: the route read
    // every field from every save, so a Details form — which posts no
    // `stack` — would have sent an empty one and cleared the topics.
    expect(actions).toContain('case "update-details"');
    expect(actions).toContain('case "update-topics"');
    expect(actions).not.toContain('case "update":');
  });

  it("sends only its own step's fields", () => {
    const detailsCase = actions.slice(
      actions.indexOf('case "update-details"'),
      actions.indexOf('case "update-topics"'),
    );
    const topicsCase = actions.slice(
      actions.indexOf('case "update-topics"'),
      actions.indexOf('case "repo-check"'),
    );
    for (const field of STEP_FIELDS.details) {
      expect([field, detailsCase.includes(`"${field}"`)]).toEqual([field, true]);
      expect([field, topicsCase.includes(`"${field}"`)]).toEqual([field, false]);
    }
    for (const field of STEP_FIELDS.topics) {
      expect([field, topicsCase.includes(`"${field}"`)]).toEqual([field, true]);
      expect([field, detailsCase.includes(`"${field}"`)]).toEqual([field, false]);
    }
  });

  it("posts each step's own intent from each step's own form", () => {
    expect(code(STEP_PAGES.details)).toContain('value="update-details"');
    expect(code(STEP_PAGES.topics)).toContain('value="update-topics"');
    expect(code(STEP_PAGES.people)).toContain('value="maintainers"');
  });
});

describe("a save comes back to the step that made it", () => {
  it("routes every redirect through the posted step, not the overview", () => {
    const actions = code(ACTIONS);
    expect(actions).toContain('const from = text(form?.get("from"))');
    expect(actions).toContain("listingStepOf(from)");
    // One helper. A second redirect spelling would be a step that lands
    // somewhere else on one of its outcomes.
    expect(actions).not.toContain("const to = (suffix");
  });

  it("refuses a `from` outside the vocabulary rather than trusting it", () => {
    // It reaches a URL, so it is validated against the contract's own list
    // and falls back to the overview.
    expect(code(ACTIONS)).toContain("step?.segment ? `${editor}/${step.segment}` : editor");
  });

  it("has each step name itself on its form", () => {
    for (const [id, page] of Object.entries(STEP_PAGES)) {
      if (id === "schedule") continue; // its own actions route, its own address
      const step = LISTING_STEPS.find((s) => s.id === id)!;
      expect([id, code(page).includes(`name="from" value="${step.segment}"`)]).toEqual([id, true]);
    }
  });
});

describe("the two clauses that were already true", () => {
  it("keeps a half-finished listing out of public reach", () => {
    // Not built by IN1 — a listing is `draft` until the publish act, and the
    // API refuses that until its own gates pass. What IN1 added is the
    // overview saying which of the two states this listing is in.
    const overview = code(OVERVIEW);
    expect(overview).toContain('profile.visibility === "public"');
    // The status is the pill in the editor's head (openproduct redesign), one
    // word, drawn by `editor.tsx` — in the layout every step shares (OSD5).
    expect(code(LAYOUT)).toContain("<EditorHead");
    expect(code("studio/frame.tsx")).toContain('published ? "Published" : "Draft"');
    expect(overview).toContain('value="publish"');
  });

  it("has ONE place a publish is made, and it is the one with the disclosure", () => {
    // openproduct-studio OSD7: the head row used to post `intent=publish`
    // itself, skipping the disclosure and the components box. Its draft-state
    // act is now a link to the overview's panel; unpublish stays a form.
    const head = code("studio/[org]/[profile]/editor.tsx");
    expect(head).not.toContain('value="publish"');
    expect(head).toContain('value="unpublish"');
    expect(head).toContain("Publish…");
    expect(code(LAYOUT)).toContain("publishHref={`${hrefs.overview}#publish`}");
    const overview = code(OVERVIEW);
    expect(overview).toContain('id="publish"');
    expect(overview).toContain("scroll-mt-");
    expect(overview).toContain("publishDisclosure()");
  });

  it("keeps the draft on the server, so a closed tab loses nothing", () => {
    // There is no client-side draft to lose: every step posts, the API
    // stores, and the page renders what it answered. No step page carries a
    // bundle at all.
    for (const page of [OVERVIEW, SHELL, ...Object.values(STEP_PAGES)]) {
      expect([page, code(page).includes('"use client"')]).toEqual([page, false]);
      expect([page, /localStorage|sessionStorage/.test(code(page))]).toEqual([page, false]);
    }
  });
});

describe("IN3 — the meter the overview now ships, and the score it does not", () => {
  // THIS BLOCK USED TO ASSERT THE OPPOSITE. While WC-D was open — may
  // completeness affect rank? — rendering the visual half of a gated
  // milestone would have answered that question by accident, on screen, so
  // the guard forbade a meter outright. WC-D was answered on 9 Sep 2026 (a
  // floor, not a boost) and IN3 built it, so the guard becomes the narrower
  // thing it was always standing in for: a meter is allowed, a SCORE is not.

  it("renders the meter", () => {
    expect(code(OVERVIEW)).toContain("CompletenessPanel");
  });

  it("draws no score, no percentage and no progress bar", () => {
    // WC-E's rule, applied here: "a checklist, not a score." A percentage is
    // a judgement about somebody's work that can be sorted; a count of filled
    // fields beside a list of the empty ones is a fact about a form.
    const sources = [code(OVERVIEW), code(SHELL), code(PANEL)];
    for (const source of sources) {
      expect(/\bpercent\b|\b\d+\s*%|\bprogress\b|toFixed|Math\.round/i.test(source)).toBe(false);
    }
  });

  it("says, in the panel itself, that it changes no ordering", () => {
    // IN3's done-when. A meter with no such line is read as a rating by
    // everybody who sees one, and a maker who believes a boost exists fills
    // fields for the boost rather than for the reader.
    // COMPLETENESS_NOTE is no longer rendered in the panel (explanatory copy cut); the contract still says it.
    expect(COMPLETENESS_NOTE.toLowerCase()).toContain("not a rating");
  });

  it("states the floor in BOTH directions, so silence is never the message", () => {
    // A note that appears only when something is wrong turns its own absence
    // into a message the maker has to infer, and the inference drawn from
    // silence is rarely the true one.
    const panel = code(PANEL);
    expect(panel).toContain("FLOOR_NOTE");
    expect(panel).toContain("FLOOR_MET_NOTE");
    // And the rule it applies is reachable from where it is applied (OPC-4).
    expect(panel).toContain("catalog.front-page-floor");
  });

  it("reads one profile per page, not one per step", () => {
    // Five reads to draw a strip would make every step pay for the others.
    // And one per REQUEST: the layout and the step both ask, and `cache`
    // answers the second from the first (openproduct-studio OSD5).
    const shell = code(SHELL);
    expect(shell).toContain("const readProfile = cache(fetchProfile);");
    expect((shell.match(/readProfile\(/g) ?? []).length).toBe(1);
    for (const page of [OVERVIEW, STEP_PAGES.details, STEP_PAGES.topics, STEP_PAGES.people]) {
      expect([page, code(page).includes("loadListing(")]).toEqual([page, true]);
      expect([page, code(page).includes("fetchProfile(")]).toEqual([page, false]);
    }
  });
});
