// The launch form (openproduct-account OPA5, moved to `/submit` by
// openproduct-launch SB0).
//
// What is pinned: the S10 hand-off parameters (names, order, bounds — the
// console's `parseDraftParams` reads exactly these), the one decision a
// submit makes (signed in → hand off; signed out → stash and bounce with
// `return_to=/submit`), the stash's round trip and its defensive read, and —
// by source — that the page reads the session client-side only and no longer
// says the account comes later.
//
// SB0 MOVED THE ADDRESS AND NOT THE FORM, and the reason is worth having
// here: the design's route table lists `/submit` as "the in-app launch form",
// but the prototype has no such view. Its "List your product" button calls
// `requireUser` and then alerts *"Publishing a workspace happens in Orunbase;
// this prototype stops here."* — which is exactly OL-8's decision. So there
// was no form in the design to copy, and the fields below are the ones that
// were already right.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DRAFT_KEY,
  LIMITS,
  SIGN_IN_FOR_SUBMIT,
  clampDraft,
  clearDraft,
  draftCanSubmit,
  handoffUrl,
  readDraft,
  submitPlan,
  writeDraft,
  type DraftStorage,
} from "@openproduct-web/app/submit/handoff";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");

function fakeStorage(): DraftStorage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
}

const DRAFT = { name: "Kettleworks", tagline: "Kettles, but smart", pitch: "Why it matters & who it's for" };

describe("the hand-off (S10)", () => {
  it("carries name, tagline and pitch, in that order, URL-encoded, to the console's landing", () => {
    const url = handoffUrl("https://app.orunbase.com/", DRAFT);
    expect(url).toBe(
      "https://app.orunbase.com/start/openproduct?name=Kettleworks&tagline=Kettles%2C+but+smart&pitch=Why+it+matters+%26+who+it%27s+for",
    );
  });

  it("omits an empty tagline or pitch, and is relative when no console origin is configured", () => {
    expect(handoffUrl("", { name: "Acme", tagline: "", pitch: "" })).toBe("/start/openproduct?name=Acme");
  });

  it("holds the bounds the console reads with — 64 / 140 / 1000", () => {
    expect(LIMITS).toEqual({ name: 64, tagline: 140, pitch: 1000 });
    const d = clampDraft({ name: "n".repeat(200), tagline: "t".repeat(500), pitch: "p".repeat(5000) });
    expect(d.name).toHaveLength(64);
    expect(d.tagline).toHaveLength(140);
    expect(d.pitch).toHaveLength(1000);
  });

  it("trims, collapses whitespace and strips control characters", () => {
    expect(clampDraft({ name: "  Acme \tThing   here\u0000 " }).name).toBe("Acme Thing here");
  });

  it("needs a name of at least two characters, nothing else", () => {
    expect(draftCanSubmit(clampDraft({ name: "A" }))).toBe(false);
    expect(draftCanSubmit(clampDraft({ name: "Ab" }))).toBe(true);
  });
});

describe("the one decision a submit makes", () => {
  it("signed in → hand off at once", () => {
    expect(submitPlan(true, "https://app.orunbase.com", DRAFT)).toEqual({
      kind: "handoff",
      url: handoffUrl("https://app.orunbase.com", DRAFT),
    });
  });

  it("signed out → sign in, returning to /create — never a hand-off the console would only bounce", () => {
    expect(submitPlan(false, "https://app.orunbase.com", DRAFT)).toEqual({ kind: "signIn", href: "/signin?return_to=%2Fsubmit" });
    expect(SIGN_IN_FOR_SUBMIT).toBe("/signin?return_to=%2Fsubmit");
  });
});

describe("the stash across the sign-in round trip", () => {
  it("round-trips the draft under a key beside the studio's", () => {
    const s = fakeStorage();
    writeDraft(s, DRAFT);
    expect(DRAFT_KEY).toBe("op.create.draft");
    expect(s.store.has(DRAFT_KEY)).toBe(true);
    expect(readDraft(s)).toEqual(DRAFT);
    clearDraft(s);
    expect(readDraft(s)).toBeNull();
  });

  it("reads defensively — junk, arrays and an all-empty draft are no draft", () => {
    const s = fakeStorage();
    s.setItem(DRAFT_KEY, "not json");
    expect(readDraft(s)).toBeNull();
    s.setItem(DRAFT_KEY, JSON.stringify(["x"]));
    expect(readDraft(s)).toBeNull();
    s.setItem(DRAFT_KEY, JSON.stringify({ name: "", tagline: "   ", pitch: 7 }));
    expect(readDraft(s)).toBeNull();
    s.setItem(DRAFT_KEY, JSON.stringify({ name: "n".repeat(99), pitch: 7 }));
    expect(readDraft(s)).toEqual({ name: "n".repeat(64), tagline: "", pitch: "" });
  });

  it("is a no-op with no storage at all", () => {
    expect(readDraft(null)).toBeNull();
    expect(() => writeDraft(null, DRAFT)).not.toThrow();
    expect(() => clearDraft(null)).not.toThrow();
  });
});

describe("the page (source pins)", () => {
  const page = readFileSync(resolve(APP_DIR, "submit/page.tsx"), "utf-8");
  const helpers = readFileSync(resolve(APP_DIR, "submit/handoff.ts"), "utf-8");

  it("reads the session client-side at submit, from /auth/session — never a cookie", () => {
    expect(page).toContain('fetch("/auth/session", { cache: "no-store" })');
    expect(page).toContain("submitPlan(await sessionSignedIn()");
    expect(page).not.toMatch(/cookies\(|\.cookies|op_session|SESSION_COOKIE/);
  });

  it("stashes before the bounce and resumes on the way back", () => {
    expect(page).toContain("writeDraft(storage(), draft);");
    expect(page).toContain("const stashed = readDraft(storage());");
    expect(page).toContain("if (signedIn) leave(stashed);");
    expect(page).toContain("clearDraft(storage());");
  });

  it("no longer says the account comes later, and imports no console module", () => {
    expect(page).not.toContain("before any account exists");
    expect(page).not.toContain("signing in if you haven");
    // The lede that explained the account hand-off was cut; the page no longer describes it.
    expect(page).not.toMatch(/from "@\/lib\/session"|web-console|@saas\//);
    // The helpers are pure: OB6 added the one import they need, the
    // contract's repo rule — and still nothing from the console.
    expect(helpers.match(/^import .*$/gm)).toEqual([
      'import { OPEN_BUILD_REPO_KEY, isGithubRepoUrl } from "@openproduct/contracts";',
    ]);
  });
});

describe("SB0 — the design's address, and the one it replaced", () => {
  const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
  const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
  const submit = read("submit/page.tsx");

  it("serves the form at /submit, which is what the design calls it", () => {
    // The design-reference's route table: `Submit | /submit | the in-app
    // launch form`. The product shipped it at `/create` under OPA5, before
    // that table existed.
    // OB6 — the form is *Open a build*, the header button's own words.
    expect(submit).toContain("{OPEN_BUILD_HEADING}");
  });

  it("keeps /create working, as an EDGE redirect and not a route module", () => {
    // THIS ASSERTION USED TO CHECK A ROUTE MODULE, AND PRODUCTION PROVED IT
    // WRONG. `app/create/page.tsx` was one `permanentRedirect` and passed
    // every test and every lane. Then the deploy answered:
    //
    //   HTTP/2 200
    //   cache-control: s-maxage=31536000
    //   (empty body)
    //
    // Not a 308. Next prerendered the redirect, so what shipped was an RSC
    // payload the CLIENT router follows — a browser still arrives, a crawler
    // sees a 200 with an empty document cached for a year. Worse than the 308
    // the milestone claimed and worse than the page it replaced.
    //
    // No test could have caught it: they all read source or hit a local
    // server, and the difference only exists in what the adapter deploys.
    // `curl -I` against the live host found it.
    //
    // A `redirects()` entry is issued at the EDGE, before the renderer.
    expect(config).toContain('source: "/create"');
    expect(config).toContain('destination: "/submit"');
    expect(config).toContain("permanent: true");
  });

  it("has no /create route module left to drift", () => {
    // Two pages are always worse than one, and a page that redirects is still
    // a page. The module is deleted, not emptied.
    expect(existsSync(resolve(APP_DIR, "create/page.tsx"))).toBe(false);
  });

  it("is a redirect and NOT a rewrite, unlike the /@handle short link", () => {
    // `/@handle` is REWRITTEN because the pretty form is the one somebody was
    // handed and the bar must keep it. Here the opposite holds: the design's
    // address is the one to be seen and shared, so the bar should change —
    // which only a redirect does. Both now live in the same file, so the two
    // mechanisms are readable side by side.
    expect(config).toMatch(/rewrites\(\)[\s\S]*\/@:handle/);
    expect(config).toMatch(/redirects\(\)[\s\S]*\/create/);
    // And `/submit` is not rewritten from anything — it is simply the address.
    expect(config).not.toContain('destination: "/create"');
  });

  it("sends somebody back to /submit after sign-in, not to the old address", () => {
    // The bounce is the one place the address is written down twice. If this
    // still said `/create` the round trip would work — through the redirect —
    // and the draft would survive; it would just show the wrong address in
    // the bar at the moment somebody is deciding whether to trust the page.
    expect(SIGN_IN_FOR_SUBMIT).toBe("/signin?return_to=%2Fsubmit");
  });

  it("keeps the stash key it already had", () => {
    // Somebody bouncing through sign-in AT THE MOMENT OF THE DEPLOY has a
    // draft under the old key. Renaming it would throw away the one thing
    // this stash exists to protect, to tidy a private string nobody reads.
    expect(DRAFT_KEY).toBe("op.create.draft");
  });

  it("points every link in the product at the new address", () => {
    // A link left on `/create` still arrives, so this would not be a bug a
    // visitor could see — it would be an extra hop on the product's own
    // busiest call to action, and a slow accretion of them.
    // The call to action was the header's outlined pill until
    // openproduct-redesign OPR1: the boards' bar has no room for it, so the
    // door is an entry of the footer's list now (`FOOTER_LINKS`), on every
    // page that draws the site footer.
    for (const file of ["shell/top-panel.tsx", "shell/site-footer.tsx", "shell/shell.ts"]) {
      expect([file, read(file).includes('"/create"')]).toEqual([file, false]);
    }
    expect(read("shell/shell.ts")).toContain('{ label: "Open a build", href: "/submit" }');
    expect(read("shell/site-footer.tsx")).toContain("FOOTER_LINKS.map");
  });

  it("collects exactly what it collected before, and the reason is the design", () => {
    // SB0 MOVED THE ADDRESS AND NOT THE FORM. The route table promises "the
    // in-app launch form", and the prototype has no such view: its "List your
    // product" calls `requireUser` and then alerts "Publishing a workspace
    // happens in Orunbase; this prototype stops here" — which is exactly
    // OL-8's decision. There was no form in the design to copy.
    //
    // Widening the draft was the other option and it needs two sides: the
    // three parameters are a seam contract the console's `parseDraftParams`
    // reads, so a fourth field here would be a field nothing receives.
    expect(Object.keys(LIMITS).sort()).toEqual(["name", "pitch", "tagline"]);
    const url = handoffUrl("https://console.test", {
      name: "Acme",
      tagline: "t",
      pitch: "p",
    });
    expect(url).toBe("https://console.test/start/openproduct?name=Acme&tagline=t&pitch=p");
  });
});
