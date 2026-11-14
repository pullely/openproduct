/**
 * The keyboard layer, as pure functions (openproduct-worldclass FR4).
 *
 * SEPARATE FROM THE LISTENER, for the reason `feed/tile.ts`, `ui/time.ts` and
 * `ui/og.ts` already state about themselves: the web test lane is module-level
 * and has no JSX, so a rule inside a `.tsx` is a rule no test in this
 * repository can hold. What a key MEANS, when a key must be ignored, and which
 * row comes next are decisions worth pinning; the component only wires them to
 * `document`.
 *
 * ONE TABLE, TWO CONSUMERS. `keyboard-layer.tsx` acts on `BINDINGS` and the
 * `?` sheet renders it, so a shortcut that works and is not listed, or is
 * listed and does nothing, is not a state this can reach.
 */

/** What a reader can press, and what the sheet says it does. */
export interface Binding {
  /** The key as `KeyboardEvent.key` reports it. */
  readonly key: string;
  /** How the sheet prints it. */
  readonly shows: string;
  readonly does: string;
}

export const BINDINGS: readonly Binding[] = [
  { key: "k", shows: "⌘K", does: "Search products and people" },
  { key: "/", shows: "/", does: "Search, without a modifier" },
  { key: "j", shows: "j", does: "Move to the next launch, or the next section of a listing" },
  { key: "k", shows: "k", does: "Move to the previous launch, or the previous section" },
  { key: "u", shows: "u", does: "Upvote the launch, or the comment, you are on" },
  { key: "?", shows: "?", does: "Show this list" },
  { key: "Escape", shows: "Esc", does: "Close this list" },
] as const;

/**
 * Is this keystroke somebody typing?
 *
 * NEVER STEAL A KEYSTROKE FROM SOMETHING ACCEPTING TEXT — the rule
 * `shell/palette.tsx` already applies to `/`, lifted here so both layers
 * answer it the same way. A shortcut that eats a character out of a comment
 * box is worse than no shortcut, because the reader cannot tell what happened.
 *
 * A `<summary>` is deliberately NOT typing: it is a control, and `u` on a
 * focused disclosure should still upvote.
 */
export function isTyping(target: TypingTarget | null | undefined): boolean {
  if (!target || typeof target.tagName !== "string") return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable === true
  );
}

/**
 * DUCK-TYPED, NOT `instanceof HTMLElement`, and the reason is the test lane.
 * `instanceof` needs the global to exist, and this repository's web tests run
 * in node with no DOM — so a guard written against `HTMLElement` is a guard no
 * test here can call at all. The two fields below are the whole of what the
 * question needs, and asking for exactly them is what makes the rule
 * checkable.
 */
export interface TypingTarget {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
}

/**
 * Should a single-letter binding fire at all?
 *
 * MODIFIERS ARE SOMEBODY ELSE'S. `⌘J` is the browser's downloads and `Ctrl+U`
 * is view-source; a page that swallows either has broken a binding older than
 * it is. `⌘K` is the one exception and it is claimed explicitly, by the
 * palette, because a search field in a bar is what every reader now expects it
 * to mean.
 */
export function isPlain(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey">): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}

/**
 * Where the cursor lands next.
 *
 * FOCUS IS THE CURSOR, which is the whole design of this layer. A separate
 * highlight would be a second idea of "where you are" — invisible to a screen
 * reader, out of step with `Tab`, and needing its own scroll handling. Moving
 * focus gets announcement, scrolling and the browser's own affordances for
 * free, and `u` can then simply ask which row the focus is in.
 *
 * NOTHING FOCUSED YET LANDS ON THE FIRST ROW for `j` and the last for `k`,
 * rather than doing nothing: the first press of a traversal key should
 * traverse.
 */
export function nextRow(count: number, current: number, step: 1 | -1): number | null {
  if (count === 0) return null;
  if (current < 0) return step === 1 ? 0 : count - 1;
  const next = current + step;
  // CLAMPED, NOT WRAPPED. Wrapping from the last row to the first is a jump
  // the reader did not ask for and cannot see coming; stopping at the end is
  // what every list in every editor does.
  if (next < 0 || next >= count) return null;
  return next;
}

/** The attribute a row wears so this layer can find it. One name, in the
 *  three components that draw a launch row and on the listing's own hero. */
export const ROW_ATTRIBUTE = "data-keyrow";

/** The sheet's own heading, so the component and its test agree on it. */
export const KEYS_SHEET_TITLE = "Keyboard";

/**
 * What the sheet says about the layer itself.
 *
 * A shortcut list that does not say where the shortcuts apply is a list a
 * reader has to test. `j` and `k` move between launches, which means they do
 * nothing on `/docs` — and saying so is cheaper than letting somebody press
 * them twice and conclude the feature is broken.
 */
export const KEYS_SHEET_NOTE =
  "j, k and u work wherever launches are listed; on a listing, j and k walk its sections. Nothing here needs a mouse, and nothing here fires while you are typing.";

/**
 * On a page with ONE row, `j` and `k` walk sections instead (PP2).
 *
 * A listing page is one row — its hero — so row traversal there is a key that
 * does nothing, and a key that does nothing is the FR4 finding again. The page
 * has an outline (`[slug]/sections.ts`); the same two keys walk it. A feed
 * keeps row traversal even when it happens to list one launch beside no
 * sections, and a page with rows AND sections is a page nobody has drawn: rows
 * win there, so a future feed that grows section headings does not silently
 * lose `j`.
 */
export function walksSections(rowCount: number, sectionCount: number): boolean {
  return rowCount <= 1 && sectionCount > 0;
}
