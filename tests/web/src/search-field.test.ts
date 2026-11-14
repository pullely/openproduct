// The header search (openproduct-commons DS3; the box that opens in place
// since openproduct-redesign OPR1, design.md §2 rule 6, board `Feed`).
//
// What is pinned here is the half of the search that is not a React tree —
// what a recent-search list BECOMES, what the search read becomes, which rows
// the card shows and where the arrow keys go — and the properties of the box
// a reader would notice if they broke: it opens on input and nothing else, a
// person is one row until somebody opens it, Escape puts the card away,
// Enter and `See all results` both go to `/search?q=…`, it is one card and
// not a dropdown, it respects reduced motion, and this browser's history
// never leaves it.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SEE_ALL_RESULTS, searchPath } from "@openproduct/contracts";

import {
  NO_MATCHES,
  PERSON_ROW_LIMIT,
  PRODUCT_ROW_LIMIT,
  canExpand,
  cardOpen,
  initialsOf,
  nextActive,
  toRows,
  visibleRows,
} from "@openproduct-web/app/shell/palette-rows";
import { SEARCH_PLACEHOLDER } from "@openproduct-web/app/shell/shell";
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

const hit = (id: string, title = id) => ({
  kind: "product",
  entityId: id,
  title,
  summary: "a summary",
  matched: "name-prefix",
});
const ada = { handle: "ada", displayName: "Ada Lovelace", matched: "name" as const };
/** A maker as a response WOULD carry one if the read returned their products.
 *  It does not today; the row model takes the list when it does. */
const adaWithProducts = {
  ...ada,
  products: [
    { slug: "kettleworks", title: "kettleworks" },
    { slug: "ackstack", title: "ackstack" },
  ],
};
const NONE: ReadonlySet<string> = new Set();

describe("what the search read becomes", () => {
  it("a product is a row with its name, its two letters and the word Product", () => {
    const [row] = toRows([hit("kettleworks")]);
    expect(row).toEqual({
      type: "product",
      id: "kettleworks",
      title: "kettleworks",
      kind: "Product",
      href: "/kettleworks",
      initials: "KE",
    });
  });

  it("says what the read knows and no more: no stage, no logo, no summary", () => {
    // The board prints "Shipping" or "Idea" on a product row and draws its
    // logo. The index returns neither a stage nor an image, so the row has
    // no field for either — a stage word here would be made up.
    const [row] = toRows([hit("kettleworks")]);
    expect(Object.keys(row!).sort()).toEqual(["href", "id", "initials", "kind", "title", "type"]);
    expect(code("shell/palette-rows.ts")).not.toMatch(/"Shipping"|"Idea"/);
  });

  it("answers people from the SAME read as the products", () => {
    // One request per keystroke, not two: `/v1/search` resolves public
    // profiles live, so somebody who turned their profile off stops being
    // findable on the next keystroke rather than at the next cache expiry.
    const rows = toRows([hit("kettleworks")], [ada]);
    const person = rows.find((r) => r.type === "person")!;
    expect(person.title).toBe("Ada Lovelace");
    expect(person.href).toBe("/@ada");
    expect(person.kind).toBe("Person");
    expect(person.initials).toBe("AL");
    // Products first, then people — the board's order.
    expect(rows.map((r) => r.type)).toEqual(["product", "person"]);
  });

  it("falls back to the handle rather than inventing a name", () => {
    const rows = toRows([], [{ handle: "ada", displayName: null, matched: "handle" }]);
    expect(rows.find((r) => r.type === "person")!.title).toBe("@ada");
  });

  it("takes no makers as no person rows, and asks for none by default", () => {
    expect(toRows([hit("a")]).some((r) => r.type === "person")).toBe(false);
  });

  it("holds a few of each, because the card is a jump and not the results page", () => {
    const many = Array.from({ length: 12 }, (_, i) => hit(`p${i}`));
    const people = Array.from({ length: 9 }, (_, i) => ({ ...ada, handle: `h${i}` }));
    const rows = toRows(many, people);
    expect(rows.filter((r) => r.type === "product").length).toBe(PRODUCT_ROW_LIMIT);
    expect(rows.filter((r) => r.type === "person").length).toBe(PERSON_ROW_LIMIT);
  });

  it("ignores a hit that is not a product", () => {
    expect(toRows([{ ...hit("x"), kind: "thread" }])).toEqual([]);
  });

  it("never renders an empty mark", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("kettleworks")).toBe("KE");
    expect(initialsOf("")).toBe("··");
    expect(initialsOf("---")).toBe("··");
  });
});

describe("a person is one row until somebody opens it", () => {
  it("has nothing to open when the read sent no products — and never invents any", () => {
    // TODAY'S READ. `/v1/search` returns a handle, a name and which field
    // matched. A person row from it cannot be opened, and has no chevron.
    const [person] = toRows([], [ada]);
    expect(person!.products).toBeUndefined();
    expect(canExpand(person!)).toBe(false);
    expect(visibleRows([person!], new Set(["ada"]), "ada").map((r) => r.type)).toEqual(["person", "all"]);
  });

  it("is collapsed by default: their products are not in the list at all", () => {
    const rows = toRows([], [adaWithProducts]);
    expect(canExpand(rows[0]!)).toBe(true);
    expect(visibleRows(rows, NONE, "ada").map((r) => r.title)).toEqual(["Ada Lovelace", SEE_ALL_RESULTS]);
    // And the box starts with nobody opened, and forgets who was opened when
    // a new answer arrives.
    const box = code("shell/palette.tsx");
    expect(box).toMatch(/useState<ReadonlySet<string>>\(\(\) => new Set\(\)\)/);
    expect(box).toMatch(/setRows\(toRows\([^;]*;\s*setActive\(-1\);\s*setExpanded\(new Set\(\)\);/);
  });

  it("opens to its products, indented directly beneath it", () => {
    const rows = toRows([hit("other")], [adaWithProducts, { ...ada, handle: "bob", displayName: "Bob" }]);
    const shown = visibleRows(rows, new Set(["ada"]), "a");
    expect(shown.map((r) => r.title)).toEqual([
      "other",
      "Ada Lovelace",
      "kettleworks",
      "ackstack",
      "Bob",
      SEE_ALL_RESULTS,
    ]);
    const child = shown[2]!;
    expect(child.under).toBe("ada");
    expect(child.href).toBe("/kettleworks");
    // A product under a person and the same product as a hit of its own are
    // two rows with two ids.
    expect(child.id).not.toBe("kettleworks");
  });

  it("draws the chevron only on a row that can open, beside the link and never inside it", () => {
    const card = code("shell/palette-panel.tsx");
    expect(card).toMatch(/\{canExpand\(row\) \? \(\s*<button/);
    expect(card).toContain("aria-expanded={opened}");
    expect(card).toContain('aria-label={`${opened ? "Hide" : "Show"} products of ${row.title}`}');
    expect(card).toContain("onClick={() => onToggle(row.id)}");
    // A button inside an anchor is invalid HTML: the link closes first.
    expect(card).toMatch(/<\/AppLink>\s*\{canExpand\(row\)/);
    // 40px round, the board's size.
    expect(card).toMatch(/<button[\s\S]*?className="grid h-\[40px\] w-\[40px\][^"]*rounded-full/);
  });
});

describe("the card opens on input, and closes on Escape or an empty field", () => {
  it("is closed until somebody types, whatever has focus", () => {
    expect(cardOpen("", false)).toBe(false);
    expect(cardOpen("   ", false)).toBe(false);
    expect(cardOpen("a", false)).toBe(true);
    // The box asks this function and nothing else, and focus is not an
    // input to it.
    const box = code("shell/palette.tsx");
    expect(box).toContain("const open = cardOpen(query, dismissed)");
    expect(box).not.toMatch(/onFocus=\{\(\) => setOpen/);
    expect(box).toMatch(/onChange=\{\(e\) => \{\s*setQuery\(e\.target\.value\);\s*setDismissed\(false\);/);
  });

  it("closes when the text is cleared", () => {
    expect(cardOpen("ab", false)).toBe(true);
    expect(cardOpen("", false)).toBe(false);
  });

  it("is put away by Escape, and by a click outside, and the text stays", () => {
    expect(cardOpen("ab", true)).toBe(false);
    const box = code("shell/palette.tsx");
    expect(box).toMatch(/event\.key === "Escape"\) \{[\s\S]{0,160}?setDismissed\(true\);/);
    expect(box).toContain('document.addEventListener("mousedown", onPointer)');
    expect(box).toMatch(/!rootRef\.current\.contains\(event\.target as Node\)\) setDismissed\(true\)/);
    // Escape does not clear the query: nothing in the handler sets it.
    const escape = /event\.key === "Escape"\) \{([\s\S]*?)return;\s*\}/.exec(box)?.[1] ?? "";
    expect(escape).not.toContain("setQuery");
  });

  it("renders the card only while open, so it is never in the server render", () => {
    expect(code("shell/palette.tsx")).toMatch(/\{open \? \(\s*<PalettePanel/);
  });

  it("makes no claim before the read answers: No matches needs an answer", () => {
    expect(NO_MATCHES).toBe("No matches");
    const card = code("shell/palette-panel.tsx");
    expect(card).toMatch(/answered && results\.length === 0 \? \(/);
    expect(card).toContain("{NO_MATCHES}");
    // A read that failed has not said nothing matched.
    expect(card).toMatch(/\{failed \? \(/);
    expect(code("shell/palette.tsx")).toContain("answered={rows !== null}");
  });
});

describe("Enter, the arrow keys, and the door out", () => {
  it("See all results goes to the search page with the query, and is always last", () => {
    const rows = visibleRows(toRows([hit("a")], [ada]), NONE, "open source");
    const door = rows[rows.length - 1]!;
    expect(door.type).toBe("all");
    expect(door.title).toBe("See all results");
    expect(door.href).toBe("/search?q=open%20source");
    expect(door.href).toBe(searchPath("open source"));
    // There with nothing above it too: nothing here, and where to look.
    expect(visibleRows([], NONE, "zzz").map((r) => r.type)).toEqual(["all"]);
    // And not there without a query.
    expect(visibleRows([], NONE, "  ")).toEqual([]);
  });

  it("Enter with no row chosen means the whole query", () => {
    const box = code("shell/palette.tsx");
    expect(box).toMatch(/if \(row\) go\(row\.href\);\s*else if \(trimmed\.length > 0\) go\(searchPath\(trimmed\)\);/);
  });

  it("the arrow keys walk the rows in the order they are drawn, wrapping at both ends", () => {
    expect(nextActive(3, -1, 1)).toBe(0);
    expect(nextActive(3, -1, -1)).toBe(2);
    expect(nextActive(3, 0, 1)).toBe(1);
    expect(nextActive(3, 2, 1)).toBe(0);
    expect(nextActive(3, 0, -1)).toBe(2);
    expect(nextActive(0, -1, 1)).toBe(-1);
    const box = code("shell/palette.tsx");
    // The list the keys walk is the list the card draws.
    expect(box).toMatch(/const list = React\.useMemo\(\s*\(\) => visibleRows\(rows \?\? \[\], expanded, trimmed\)/);
    expect(box).toMatch(/setActive\(\(i\) => nextActive\(list\.length, i, event\.key === "ArrowDown" \? 1 : -1\)\)/);
    expect(box).toContain("list={list}");
    // The highlighted row is named to assistive technology from the field.
    expect(box).toContain("aria-activedescendant={open && active >= 0 ? rowDomId(active) : undefined}");
    expect(code("shell/palette-panel.tsx")).toContain("id={rowDomId(index)}");
  });

  it("a person's row opens with the right arrow and closes with the left", () => {
    const box = code("shell/palette.tsx");
    expect(box).toMatch(/event\.key === "ArrowRight" && !isOpen\) \|\| \(event\.key === "ArrowLeft" && isOpen\)/);
  });
});

describe("one search, and the shortcut focuses it", () => {
  it("is the only search field in the shell, and the palette is not a second one", () => {
    const box = code("shell/palette.tsx");
    expect(box).toContain("export function HeaderSearch()");
    expect(box).not.toContain("CommandPalette");
    expect((box.match(/<input/g) ?? []).length).toBe(1);
    expect(code("shell/top-panel.tsx")).not.toMatch(/<input/);
    expect(code("shell/keyboard-layer.tsx")).not.toMatch(/<input/);
  });

  it("⌘K, Ctrl-K and / focus the field, and never steal a keystroke from a form", () => {
    const box = code("shell/palette.tsx");
    expect(box).toMatch(/\(event\.key === "k" \|\| event\.key === "K"\) && \(event\.metaKey \|\| event\.ctrlKey\)/);
    expect(box).toMatch(/event\.key === "\/" && !typing/);
    expect(box).toContain("input.focus()");
    // On a phone the field is not displayed; the shortcut goes to the page.
    expect(box).toMatch(/input\.offsetParent === null\) \{[\s\S]{0,200}?router\.push\(SEARCH_PATH\)/);
  });

  it("is a 40px pill with 16px text and the board's placeholder", () => {
    const box = code("shell/palette.tsx");
    expect(SEARCH_PLACEHOLDER).toBe("Search products and people");
    expect(box).toContain("placeholder={SEARCH_PLACEHOLDER}");
    expect(box).toMatch(/<label[\s\S]*?className=\{`[^`]*\bh-\[40px\][^`]*rounded-full/);
    expect(box).toMatch(/<input[\s\S]*?className="[^"]*text-\[16px\]/);
  });
});

describe("the box becomes the card: one surface, not a dropdown", () => {
  it("widens from 268px to 380px, eased, and holds still for reduced motion", () => {
    // 268px, not the board's 260px: the board's own placeholder is one
    // letter wider than a 260px box at 16px (seen in a browser, cut at the
    // last "e"), so the box is the 8px wider that shows the whole of it.
    const box = code("shell/palette.tsx");
    expect(box).toMatch(/open \? "basis-\[380px\]" : "basis-\[268px\]"/);
    expect(box).toContain("transition-[flex-basis]");
    expect(box).toContain("duration-300");
    expect(box).toContain("ease-[cubic-bezier(0.2,0.8,0.2,1)]");
    expect(box).toContain("motion-reduce:transition-none");
    // The card's entrance is an animation, and reduced motion drops it.
    const card = code("shell/palette-panel.tsx");
    expect(card).toMatch(/animate-menu-in[^"]*motion-reduce:animate-none/);
  });

  it("draws the card behind the field and proud of it, so the field is its first row", () => {
    const card = code("shell/palette-panel.tsx");
    const classes = /role="dialog"[\s\S]*?className="([^"]*)"/.exec(card)?.[1] ?? "";
    // Not hung under the field (`top-[calc(100%+…)]` was the dropdown): it
    // starts 6px ABOVE and beside it and leaves the field's height as its
    // own top padding.
    expect(classes).toContain("absolute");
    expect(classes).toContain("-top-[6px]");
    expect(classes).toContain("-inset-x-[6px]");
    expect(classes).toContain("pt-[54px]");
    expect(classes).not.toMatch(/top-\[calc\(100%/);
    // White, 22px corners, and flat: a one-pixel inset ring, no shadow.
    expect(classes).toContain("bg-card");
    expect(classes).toContain("rounded-[22px]");
    expect(classes).toContain("ring-inset");
    expect(classes).not.toMatch(/\bshadow/);
    // The field sits above it.
    expect(code("shell/palette.tsx")).toMatch(/<label[\s\S]*?className=\{`relative z-\[21\]/);
    expect(classes).toContain("z-20");
  });

  it("throws no scrim and locks no scroll", () => {
    // THE OLD PALETTE'S BUG. The overlay covered the chrome it belongs to
    // and set `body.style.overflow = hidden`, and a locked scrollbar moves
    // the page under a sticky bar.
    const source = code("shell/palette.tsx") + code("shell/palette-panel.tsx");
    expect(source).not.toMatch(/document\.body\.style\.overflow/);
    expect(source).not.toContain("aria-modal");
    expect(source).not.toMatch(/fixed inset-0/);
  });

  it("names the card from the field, once", () => {
    const box = code("shell/palette.tsx");
    expect(box).toContain('role="combobox"');
    expect(box).toContain("aria-expanded={open}");
    expect(box).toContain("aria-controls={CARD_ID}");
    expect(box).toContain('const CARD_ID = "search-results"');
    expect(code("shell/palette-panel.tsx")).toContain("id={id}");
  });

  it("rows are 44px links: a tile or a disc, the name, and what it is", () => {
    const card = code("shell/palette-panel.tsx");
    expect(card).toMatch(/<AppLink[\s\S]*?className=\{`flex min-h-\[44px\]/);
    // A person wears a disc and a product a rounded tile.
    expect(card).toMatch(/row\.type === "person" \? "rounded-full" : "rounded-\[9px\]"/);
    expect(card).toContain("{row.title}");
    expect(card).toContain("{row.kind}");
    // A person's product is indented under them.
    expect(card).toMatch(/child \? "ml-6 border-l-2[^"]*pl-2" : ""/);
  });
});

describe("the bar holds still", () => {
  it("is one row at a fixed height, and nothing in it may wrap, at EVERY width", () => {
    // A row that may grow grows: the audit measured 147px across three rows
    // at 375px (P0·05). FR1 removed the wrapping, which forced the question
    // it was postponing — what leaves the row. On a phone the answer is the
    // sections, the bell, the word and the search box (a link stands in for
    // it); at a tablet's width the word steps aside and the box shrinks.
    const panel = read("shell/top-panel.tsx");
    expect(panel).toContain("h-[60px]");
    expect(panel).toContain("flex-nowrap");
    expect(panel).not.toContain("flex-wrap ");
    expect(panel).not.toContain("min-h-[60px]");
    expect(panel).toContain("max-sm:h-[68px]");
    // The box may shrink rather than push the bell out of the row.
    expect(code("shell/palette.tsx")).toMatch(/relative flex min-w-0 shrink grow-0/);
  });

  it("opening the search moves nothing else in the bar", () => {
    // The right-hand group takes the row's slack and packs to the right, so
    // the box widening eats slack to its LEFT; the bell and the profile
    // control stay where they are.
    const panel = code("shell/top-panel.tsx");
    expect(panel).toMatch(/<div className="flex min-w-0 flex-1 items-center justify-end gap-\[10px\]">\s*(?:\{\}\s*)?<HeaderSearch \/>/);
  });

  it("keeps the account control one disc wide in both of its branches", () => {
    // Stacked in one grid cell and hidden with `visibility`, the cell is as
    // wide as the wider branch in BOTH states. Since OPR1 the two are the
    // same 40px disc, so nothing jumps when the boot script stamps the
    // signed-in class.
    const chip = read("shell/account-chip.tsx");
    expect(chip.match(/\[grid-area:1\/1\]/g)?.length).toBe(2);
    expect((code("shell/account-chip.tsx").match(/grid h-\[40px\] w-\[40px\]/g) ?? []).length).toBe(2);
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
