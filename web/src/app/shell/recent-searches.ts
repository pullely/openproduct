// What this browser searched for last (openproduct search DS3b).
//
// THE LIST IS PURE AND THE STORAGE IS THIN, for the reason `palette-rows.ts`
// gives about itself: the web test lane is module-level and has no DOM, so the
// RULE — what a recent list becomes when somebody searches again — lives in
// functions a test can call, and `localStorage` is touched only by the two
// wrappers at the bottom.
//
// IT NEVER LEAVES THE BROWSER, and that is the whole privacy story. A recent
// search is a record of what somebody was curious about, which is exactly the
// kind of thing a product should not accumulate centrally to decorate a
// dropdown with. It is written to this origin's `localStorage`, read back by
// the same field, and sent to nothing: the search request carries the query
// being typed and no history at all. There is no server-side "recent
// searches" to leak, to subpoena, or to quietly turn into a ranking signal —
// and `/api/search` forwards nothing personal by construction, which is what
// keeps that true rather than merely intended.

/** This origin's key. Namespaced like the submit draft's (`op.create.draft`). */
export const RECENT_KEY = "op.search.recent";

/** How many the field offers. Five is LinkedIn's own depth, and it is the
 *  point past which a dropdown stops being a shortcut and becomes a list. */
export const RECENT_LIMIT = 5;

/**
 * The list after somebody searches for `query` — newest first, no repeats.
 *
 * CASE-FOLDED FOR THE COMPARISON AND NOT FOR THE STORE: searching `Rust`
 * after `rust` moves the one entry to the top and keeps the NEW spelling,
 * because what somebody just typed is what they will recognise. An empty or
 * whitespace query changes nothing — the field records a search, not a
 * keystroke.
 */
export function withRecent(list: readonly string[], query: string): string[] {
  const entry = query.trim();
  if (entry.length === 0) return [...list];
  const folded = entry.toLowerCase();
  return [entry, ...list.filter((item) => item.trim().toLowerCase() !== folded)].slice(
    0,
    RECENT_LIMIT,
  );
}

/** The list with one entry removed — the ✕ beside a row. */
export function withoutRecent(list: readonly string[], query: string): string[] {
  const folded = query.trim().toLowerCase();
  return list.filter((item) => item.trim().toLowerCase() !== folded);
}

/**
 * What is stored, sanitised.
 *
 * A STORE IS INPUT LIKE ANY OTHER. This value is per-origin and per-browser,
 * so the realistic case is not an attacker but a stale or half-written entry
 * from an older version of this field — and a dropdown that renders whatever
 * JSON it finds would be a dropdown that can be broken by its own history.
 * Strings only, trimmed, empties dropped, capped at the limit.
 */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

/** Read, never throwing: Safari's private mode makes `localStorage` a getter
 *  that throws, and a search field that cannot open is worse than one with no
 *  history. */
export function readRecent(): string[] {
  try {
    return parseRecent(window.localStorage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

/** Write, never throwing — same reason, and a quota error must not swallow
 *  the navigation the reader actually asked for. */
export function writeRecent(list: readonly string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_LIMIT)));
  } catch {
    // Deliberately swallowed — see above.
  }
}
