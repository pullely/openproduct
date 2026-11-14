// The keyboard layer (openproduct-worldclass FR4).
//
// The audit's P2·18: *"No keyboard layer — no ⌘K, no `j`/`k`, no `u`."*
//
// HALF OF THAT WAS ALREADY WRONG WHEN IT WAS WRITTEN, and the epic's own
// triage repeated it rather than catching it: `⌘K` and `/` have been bound in
// `shell/palette.tsx` since 5 September, two days BEFORE the audit. The triage
// opened `palette.tsx`, confirmed the dropdown, and recorded "there is no ⌘K
// binding" without looking for the binding — which is the same class of
// mistake WC-2 exists to prevent, made by the document that states WC-2.
//
// What was actually missing is traversal, the act, and the list.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BINDINGS,
  KEYS_SHEET_NOTE,
  ROW_ATTRIBUTE,
  isPlain,
  isTyping,
  nextRow,
} from "@openproduct-web/app/ui/keys";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const code = (file: string) =>
  read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("where the cursor lands next", () => {
  it("starts at the top on the first press of j, and the bottom on k", () => {
    // Doing nothing on the first press is the version of this that gets
    // reported as broken: a traversal key should traverse.
    expect(nextRow(5, -1, 1)).toBe(0);
    expect(nextRow(5, -1, -1)).toBe(4);
  });

  it("moves one row", () => {
    expect(nextRow(5, 2, 1)).toBe(3);
    expect(nextRow(5, 2, -1)).toBe(1);
  });

  it("clamps rather than wraps", () => {
    // Wrapping from the last row to the first is a jump the reader did not
    // ask for and cannot see coming; stopping at the end is what every list
    // in every editor does.
    expect(nextRow(5, 4, 1)).toBeNull();
    expect(nextRow(5, 0, -1)).toBeNull();
  });

  it("has nothing to say about an empty page", () => {
    expect(nextRow(0, -1, 1)).toBeNull();
    expect(nextRow(0, 3, -1)).toBeNull();
  });
});

describe("never steal a keystroke from somebody typing", () => {
  // NO DOM HERE, ON PURPOSE. This lane runs in node, which is why `isTyping`
  // asks for the two fields it needs rather than for an `HTMLElement`: a
  // guard written against a global that does not exist is a guard no test in
  // this repository can call.
  const el = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable });

  it.each(["INPUT", "TEXTAREA", "SELECT"])("leaves a %s alone", (tag) => {
    expect(isTyping(el(tag))).toBe(true);
  });

  it("leaves a contenteditable alone", () => {
    expect(isTyping(el("DIV", true))).toBe(true);
  });

  it.each(["BUTTON", "SUMMARY", "A", "LI"])("still fires on a focused %s", (tag) => {
    // A `<summary>` is a control, not a text field: `u` on a focused
    // disclosure should still upvote.
    expect(isTyping(el(tag))).toBe(false);
  });

  it("says no to a target that is not an element at all", () => {
    expect(isTyping(null)).toBe(false);
    expect(isTyping({})).toBe(false);
  });
});

describe("modifiers belong to somebody else", () => {
  it("refuses ⌘, Ctrl and Alt", () => {
    // `⌘J` is the browser's downloads and `Ctrl+U` is view-source; a page that
    // swallows either has broken a binding older than it is.
    for (const held of ["metaKey", "ctrlKey", "altKey"] as const) {
      expect(isPlain({ metaKey: false, ctrlKey: false, altKey: false, [held]: true })).toBe(false);
    }
  });

  it("allows a bare key, and Shift, which is how `?` is typed at all", () => {
    expect(isPlain({ metaKey: false, ctrlKey: false, altKey: false })).toBe(true);
  });
});

describe("one table, two consumers", () => {
  // A shortcut that works and is not listed, or is listed and does nothing,
  // is the state this arrangement is built to make unreachable.
  const layer = code("shell/keyboard-layer.tsx");
  const palette = code("shell/palette.tsx");

  it("acts on every key it lists", () => {
    const unhandled = BINDINGS.map((b) => b.key).filter(
      (key) => !layer.includes(`"${key}"`) && !palette.includes(`"${key}"`),
    );
    expect(unhandled).toEqual([]);
  });

  it("lists ⌘K and / even though the palette owns them", () => {
    // A reader does not care which component holds a key. Two handlers for
    // one keystroke is a race with no winner, so the layer lists them and
    // binds neither.
    expect(BINDINGS.map((b) => b.shows)).toContain("⌘K");
    expect(BINDINGS.map((b) => b.shows)).toContain("/");
    expect(layer).not.toContain("metaKey || event.ctrlKey");
    expect(layer).not.toMatch(/event\.key === "\/"/);
  });

  it("renders the sheet from the table rather than from a second list", () => {
    expect(read("shell/keyboard-layer.tsx")).toContain("BINDINGS.map");
  });

  it("says where the shortcuts apply", () => {
    // A list that does not say where its keys work is a list a reader has to
    // test. `j` and `k` move between launches, so they do nothing on `/docs`.
    expect(KEYS_SHEET_NOTE).toMatch(/wherever launches are listed/);
    expect(KEYS_SHEET_NOTE).toMatch(/while you are typing/);
  });
});

describe("focus is the cursor", () => {
  it("skips the link a screen reader is told does not exist", () => {
    // FOUND BY DRIVING IT IN A BROWSER. The first `a[href]` in a feed row is
    // the logo tile's, which is `aria-hidden` and `tabIndex={-1}` because it
    // duplicates the title; `j` focused it, moving the ring to a link that
    // does not exist as far as assistive technology is concerned.
    expect(code("shell/keyboard-layer.tsx")).toContain('a[href]:not([aria-hidden="true"])');
  });

  it("moves focus rather than painting a highlight of its own", () => {
    // A separate highlight would be a second idea of "where you are":
    // invisible to a screen reader, out of step with Tab, and needing its own
    // scrolling. This gets announcement and the browser's focus ring free.
    const layer = code("shell/keyboard-layer.tsx");
    expect(layer).toContain("target.focus()");
    expect(layer).toContain("document.activeElement");
    expect(layer).not.toMatch(/setCursor|data-keycursor|highlight/i);
  });

  it("presses the vote button that is already on the page", () => {
    // `u` posts nothing itself, so the sign-in bounce, the optimistic state
    // and the return path are the ones that already work rather than a second
    // implementation of them.
    const layer = code("shell/keyboard-layer.tsx");
    expect(layer).toContain('form[id^="vote-"] button[type="submit"]');
    expect(layer).toContain("vote.click()");
    expect(layer).not.toMatch(/fetch\(|method="post"|\/me\/endorse/);
  });

  it("keeps the promise `aria-modal` makes", () => {
    // Without a trap, Tab walks straight out of the sheet into the page
    // behind — a dialog that says it is modal and is not, which for a screen
    // reader user is worse than one that never claimed it.
    const layer = code("shell/keyboard-layer.tsx");
    expect(layer).toContain('aria-modal="true"');
    expect(layer).toContain('event.key !== "Tab"');
    expect(layer).toContain("event.shiftKey ? at === first : at === last");
  });

  it("resolves no actor (I6)", () => {
    expect(code("shell/keyboard-layer.tsx")).not.toMatch(/cookies\(|headers\(|session|subject/i);
  });
});

describe("the rows the layer traverses", () => {
  it("wears one attribute, and the module names it", () => {
    expect(ROW_ATTRIBUTE).toBe("data-keyrow");
  });

  it.each([
    // The row's markup, `data-keyrow` included, is `row-shell.tsx` since IN0.
    "feed/row-shell.tsx",
    // OPR1 — the product card replaced the build tile.
    "feed/product-card.tsx",
    "launches/board.tsx",
    "[slug]/page.tsx",
  ])("%s marks its row", (file) => {
    expect(read(file)).toContain("data-keyrow");
  });

  it("treats a listing as one row, so `u` works without tabbing first", () => {
    // The reader is plainly on the listing; asking them to Tab to it before
    // pressing `u` would be a shortcut with a prerequisite.
    expect(code("shell/keyboard-layer.tsx")).toContain("all.length === 1 ? 0 : -1");
  });
});
