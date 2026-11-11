// The time helpers, as pure functions (openproduct-worldclass VC6).
//
// SEPARATE FROM THE COMPONENT, and for the reason `feed/tile.ts` already
// states about itself: "the web test lane is module-level and has no JSX, so
// a rule that lives inside a `.tsx` is a rule no test in this repository can
// hold."
//
// These decide how every instant on the site reads, which is exactly the kind
// of thing worth pinning — and writing the test for VC6 is what proved they
// were unreachable. `ui/metric.tsx` re-exports them so no call site moves.

/**
 * "2h ago", "13d ago". Deliberately coarse: a reader deciding whether a
 * product is alive does not need minutes, and a precise figure would imply a
 * precision the 6-hourly sweep does not have.
 *
 * RELATIVE ONLY WITHIN A WEEK (openproduct-worldclass VC6). Past that it
 * answers with the date, because the two forms are useful for different
 * questions and the crossover is about a week. "3h ago" answers *is this
 * alive*; "4mo ago" makes a reader do arithmetic to recover *when*, which is
 * the only thing they wanted by then. The audit found both conventions on one
 * page and asked for a single rule; this is it, and `absoluteOf` below is the
 * other half.
 */
export function agoOf(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "unknown";
  const mins = Math.max(0, Math.floor((now - at) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return absoluteOf(iso);
}

/**
 * The date itself — `3 Sep 2026`, in UTC.
 *
 * UTC BECAUSE EVERY OTHER DATE ON THIS SITE IS. The board resets at midnight
 * UTC, the digest names a UTC week, and a listing rendered in the reader's own
 * zone would disagree with the board it sits on for several hours a day. One
 * clock, said once.
 */
export function absoluteOf(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "unknown";
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A timestamp metric (`last_touched`) stores epoch SECONDS. */
export function fromEpochSeconds(value: number): string {
  return new Date(value * 1000).toISOString();
}
