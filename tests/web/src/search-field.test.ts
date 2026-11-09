// The search field (openproduct-commons DS3, re-cut to a dropdown).
//
// What is pinned here is the half of the field that is not a React tree: what
// a recent-search list BECOMES, what an index hit becomes, and the properties
// of the dropdown that a reader would notice if they broke — that it is not a
// modal, that both triggers open the same panel, and that this browser's
// history never leaves it.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PALETTE_SECTIONS,
  initialsOf,
  toRows,
  type PaletteRowType,
} from "@openproduct-web/app/shell/palette-rows";
import {
  RECENT_KEY,
  RECENT_LIMIT,
  parseRecent,
  withRecent,
  withoutRecent,
} from "@openproduct-web/app/shell/recent-searches";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
/** The file's CODE — comments stripped, so a guard about what the field does
 *  never reads the prose explaining what it deliberately does not do. */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("what this browser searched for last", () => {
  it("puts the newest first and keeps no duplicates", () => {
    expect(withRecent(["rust", "go"], "postgres")).toEqual(["postgres", "rust", "go"]);
    expect(withRecent(["rust", "go"], "go")).toEqual(["go", "rust"]);
  });

  it("folds case to COMPARE and keeps the spelling somebody just typed", () => {
    // They will recognise what they wrote, not what they wrote last week.
    expect(withRecent(["rust"], "Rust")).toEqual(["Rust"]);
    expect(withRecent(["Rust", "go"], "  rust  ")).toEqual(["rust", "go"]);
  });

  it("records a search and never a keystroke", () => {
    expect(withRecent(["rust"], "")).toEqual(["rust"]);
    expect(withRecent(["rust"], "   ")).toEqual(["rust"]);
  });

  it("is bounded, so the dropdown stays a shortcut rather than a list", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"];
    expect(withRecent(many, "new").length).toBe(RECENT_LIMIT);
    expect(withRecent(many, "new")[0]).toBe("new");
  });

  it("forgets exactly one entry", () => {
    expect(withoutRecent(["rust", "go"], "RUST")).toEqual(["go"]);
    expect(withoutRecent(["rust", "go"], "nothing")).toEqual(["rust", "go"]);
  });

  it("treats what is stored as input, because a stale entry can break a field", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent('{"not":"an array"}')).toEqual([]);
    expect(parseRecent('["rust", 7, null, "  go  ", ""]')).toEqual(["rust", "go"]);
    expect(parseRecent(JSON.stringify(["a", "b", "c", "d", "e", "f"])).length).toBe(RECENT_LIMIT);
  });

  it("never leaves this browser — the request carries the query and nothing else", () => {
    // A recent search is a record of what somebody was curious about. There is
    // no server-side copy of it to leak or to quietly become a ranking input,
    // and this is the assertion that keeps it that way: the read is one query
    // parameter, and neither the field nor the passthrough sends the list.
    const field = code("shell/palette.tsx");
    expect(field).toContain("fetch(`/api/search?q=${encodeURIComponent(trimmed)}`");
    expect(field).not.toMatch(new RegExp(`${RECENT_KEY.replace(/\./g, "\\.")}[^"]*`, "i"));
    expect(code("shell/recent-searches.ts")).not.toMatch(/fetch\(|navigator\.sendBeacon/);
    expect(code("api/search/route.ts")).not.toMatch(/recent/i);
  });
});

describe("what an index hit becomes", () => {
  const hit = (id: string, title = id) => ({
    kind: "product",
    entityId: id,
    title,
    summary: "a summary",
    matched: "name-prefix",
  });

  it("answers makers from the SAME read as the launches", () => {
    // One request per keystroke, not two: `/v1/search` resolves public
    // profiles live, so somebody who turned their profile off stops being
    // findable on the next keystroke rather than at the next cache expiry.
    const rows = toRows(
      [hit("kettleworks")],
      "ada",
      [{ handle: "ada", displayName: "Ada Lovelace", matched: "name" }],
    );
    const person = rows.find((r) => r.type === "person")!;
    expect(person.title).toBe("Ada Lovelace");
    expect(person.href).toBe("/@ada");
    expect(person.detail).toContain("@ada");
    // WHY they matched, said in a word — nobody is left wondering how a
    // search for one thing found a person.
    expect(person.detail).toContain("name");
  });

  it("falls back to the handle rather than inventing a name", () => {
    const rows = toRows([], "x", [{ handle: "ada", displayName: null, matched: "handle" }]);
    expect(rows.find((r) => r.type === "person")!.title).toBe("@ada");
  });

  it("takes no makers as no maker rows, and asks for none by default", () => {
    expect(toRows([hit("a")], "a").some((r) => r.type === "person")).toBe(false);
  });

  it("every class the field can render has a heading, except the door out", () => {
    // The dropdown groups by class under the same words the results page
    // uses, so following `See all results` lands on a page laid out the way
    // the dropdown was.
    const types: PaletteRowType[] = ["product", "person", "topic", "stack", "all"];
    for (const type of types) {
      expect([type, type in PALETTE_SECTIONS]).toEqual([type, true]);
    }
    expect(PALETTE_SECTIONS.all).toBeNull();
    expect(PALETTE_SECTIONS.person).toBe("Makers");
  });

  it("never renders an empty mark", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("kettleworks")).toBe("KE");
    expect(initialsOf("")).toBe("··");
    expect(initialsOf("---")).toBe("··");
  });
});

describe("the dropdown is not a modal, and it does not move the page", () => {
  // Both files, for the reason `routes.test.ts` states at its own DS3 block:
  // the dropdown moved into `palette-panel.tsx` when OPP11 split it, and a
  // guard that keeps reading only `palette.tsx` stops guarding anything.
  const field = () => read("shell/palette.tsx") + read("shell/palette-panel.tsx");

  it("throws no scrim and locks no scroll", () => {
    // THE BAR'S OWN BUG. The overlay covered the chrome it belongs to and set
    // `body.style.overflow = hidden`, and a locked scrollbar moves the page
    // under a sticky bar — which is what "the top panel is not stable" was.
    const source = code("shell/palette.tsx") + code("shell/palette-panel.tsx");
    expect(source).not.toMatch(/document\.body\.style\.overflow/);
    expect(source).not.toContain('aria-modal');
    expect(source).not.toMatch(/fixed inset-0/);
    // Anchored to the input instead, so opening it moves nothing.
    expect(field()).toContain("absolute left-0 top-[calc(100%+6px)]");
  });

  it("closes the way a non-modal popup must: Escape, or a click outside", () => {
    const source = field();
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('document.addEventListener("mousedown", onPointer)');
  });

  it("both triggers open the SAME panel, so nothing is lost on a small screen", () => {
    // Above `lg` the trigger is the field; below it, a 38px magnifier —
    // because the measured field collapsed to 72px at 1024 once People was
    // back in the nav. The panel, the recents and every result class are
    // identical either way.
    const source = field();
    expect(source).toContain('aria-controls="search-results"');
    expect(source.match(/aria-controls="search-results"/g)?.length).toBe(2);
    expect(source).toContain("lg:hidden");
    expect(source).toContain("lg:flex");
  });
});

describe("the bar holds still", () => {
  it("is one row at a fixed height, and nothing in it may wrap, at EVERY width", () => {
    // THIS USED TO SAY "above `sm`", and the exception was the bug. Below
    // `sm` the bar wrapped with a `min-height`, on the reasoning that there
    // is genuinely not enough width — which is true, and the conclusion was
    // wrong. A row that may grow grows: the audit measured 147px across three
    // rows at 375px, eighteen percent of the viewport before a word of the
    // product (P0·05). FR1 removed the exception, which forced the question
    // the wrapping was postponing — what leaves the row — and the answer was
    // the five section pills and the wordmark.
    const panel = read("shell/top-panel.tsx");
    expect(panel).toContain("h-[80px]");
    expect(panel).toContain("flex-nowrap");
    expect(panel).not.toContain("max-sm:flex-wrap");
    expect(panel).not.toContain("max-sm:min-h-[60px]");
    // 56px on a phone, and the height sits on the `<header>` with
    // `box-border` so the 1px hairline is inside it rather than a
    // fifty-seventh pixel on top.
    expect(panel).toContain("max-sm:h-[56px]");
    expect(panel).toContain("max-sm:box-border");
  });

  it("reserves the account control's width for both of its branches", () => {
    // The two branches are different widths (`Sign in` ~84px, the account
    // disc 36px). Stacked in one grid cell and hidden with `visibility`, the
    // cell is the wider of the two in BOTH states — so the section pills do
    // not jump sideways when the boot script stamps the signed-in class.
    const chip = read("shell/account-chip.tsx");
    expect(chip.match(/\[grid-area:1\/1\]/g)?.length).toBe(2);
    const css = readFileSync(resolve(APP_DIR, "../styles/globals.css"), "utf-8");
    const rules = css.slice(css.indexOf('[data-auth-branch="signed-in"]'));
    expect(rules).toContain("visibility: hidden");
  });
});

describe("sign out actually signs out", () => {
  it("leaves the client router out of it, because the target is not a page", () => {
    // THE BUG THIS PINS. `/auth/signout` is a ROUTE HANDLER: it clears two
    // cookies and redirects. Routed through `next/link` the client router asks
    // it for an RSC payload, gets a document redirect instead, and the
    // sign-out silently does not happen. A real anchor performs the
    // navigation the handler is written for.
    const chip = read("shell/account-chip.tsx");
    expect(chip).toMatch(/href="\/auth\/signout"[\s\S]{0,120}?plain/);
    // And the one destination that leaves this origin entirely takes the same
    // treatment, for the same reason.
    expect(chip).toMatch(/href=\{workspace\}[\s\S]{0,60}?plain/);
    // `plain` is a real branch, not a decoration: it renders an anchor.
    expect(chip).toMatch(/if \(plain\) \{[\s\S]{0,200}?<a/);
  });

  it("still clears both cookies and returns the visitor to the launches", () => {
    const route = read("auth/signout/route.ts");
    expect(route).toContain("SESSION_COOKIE");
    // A hint that survived a sign-out would paint an account chip for
    // somebody who no longer has an account here.
    expect(route).toContain("SESSION_HINT_COOKIE");
    expect(route).toContain('NextResponse.redirect(new URL("/", request.url))');
  });
});
