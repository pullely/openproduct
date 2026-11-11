// Snapshot diffs (openproduct-worldclass PV4).
//
// "What changed since last week", per listing — and a digest whose lead item
// is a change rather than a count.
//
// ─── WHY THIS IS THE HARDEST OF THE PROOF MILESTONES ─────────────────────
//
// Every other number on a listing is a fact about NOW. A diff is a claim
// about the past, and this product holds almost no past: `metrics` is
// append-only and can be read backwards, but the profile row is overwritten
// in place. There is no way to say what a tagline used to be, so the honest
// answer is to start writing it down — and to say nothing at all about the
// stretch before we did.
//
// THE FIRST SNAPSHOT PRODUCES NO DIFF, and that is the rule this module is
// most careful about. A diff computed against nothing would render every
// field as "changed", which is the worst possible first impression: a page
// announcing that a product rewrote its whole listing on the day we happened
// to start looking. `diffSnapshots` returns `null` — not an empty list — when
// there is nothing to compare, and the page renders no section.
//
// ─── AN AUTHORED CHANGE AND AN OBSERVED CHANGE ARE DIFFERENT EVENTS ──────
//
// This is the decision the whole module is shaped around, and it is OPC-2
// applied to time rather than to values.
//
//   "The maintainer rewrote the tagline" is somebody's ACT. It happened
//   because a person decided it, and the page says so in their voice.
//
//   "The licence changed from MIT to AGPL-3.0" is something we OBSERVED. No
//   act of ours and no act on this site — a repository moved and a later read
//   saw it. It carries the moment it was read, like every other observation.
//
// A page that rendered both the same way would say the product's maintainers
// changed their licence on openproduct, which nobody did. So a change carries
// its class, the page frames it accordingly, and no list mixes the two
// without labelling them.
//
// ─── WHAT A DIFF MAY NOT BECOME ──────────────────────────────────────────
//
// An ordering input. "Recently updated" is the most tempting sort in any
// directory and it is an engagement term wearing a timestamp: it rewards
// touching a listing rather than improving a product, and every maintainer
// who works out the rule starts editing their tagline weekly. OPC-4 asks that
// an ordering be explainable in one published sentence, and "listings whose
// maintainers edited them most recently" is explainable and still wrong.
// Nothing here is exported as a comparator, and no formula id names it.

import type { Provenance } from "./provenance.js";

/**
 * The fields a diff is taken over, and NOTHING ELSE.
 *
 * A closed list rather than "every key that differs", because the diffable
 * set is a product decision: `pitchDigest` changes whenever the pitch does and
 * would double every pitch edit; `publishedAt` never changes and would be
 * noise if it did; the metrics move constantly and are already rendered with
 * their own moments. What is left is what a reader would call a change.
 */
export const DIFFABLE_FIELDS = [
  "tagline",
  "pitch",
  "installLine",
  "category",
  "hosting",
  "pricing",
  "stack",
  "licence",
  "language",
  "openRoles",
] as const;
export type DiffableField = (typeof DIFFABLE_FIELDS)[number];

/**
 * Which class each field's change belongs to — the module's central table.
 *
 * `licence` and `language` are the only two OBSERVED entries, and both come
 * from the same repository read PV0 renders. Everything else is somebody
 * typing into the studio.
 *
 * `openRoles` is authored even though it is a number: a role is opened and
 * closed by a maintainer, and a count of their own acts is still their act.
 */
export const FIELD_CLASS: Record<DiffableField, "authored" | "observed"> = {
  tagline: "authored",
  pitch: "authored",
  installLine: "authored",
  category: "authored",
  hosting: "authored",
  pricing: "authored",
  stack: "authored",
  openRoles: "authored",
  licence: "observed",
  language: "observed",
};

/** What a field says, in a reader's words rather than the column's. */
export const FIELD_LABEL: Record<DiffableField, string> = {
  tagline: "The one-line description",
  pitch: "The pitch",
  installLine: "The install command",
  category: "The topic",
  hosting: "How it runs",
  pricing: "The pricing",
  stack: "The stack",
  licence: "The licence",
  language: "The main language",
  openRoles: "Open roles",
};

/** One listing's public shape at a moment, as the snapshot stores it. */
export interface Snapshot {
  readonly takenAt: string;
  readonly fields: Partial<Record<DiffableField, unknown>>;
}

/** One thing that changed. */
export interface Change {
  readonly field: DiffableField;
  readonly label: string;
  /**
   * Whether a person did this or we saw it.
   *
   * An `observed` change carries the moment of the READ that found it — the
   * snapshot's own `takenAt` — because that is when it became true for us,
   * and OPC-7 does not allow an observation to travel without one. An
   * `authored` change carries no moment: we know it happened between two
   * snapshots and pretending to a timestamp would be inventing precision.
   */
  readonly provenance: Provenance;
  /** Rendered, never raw: see `describe`. */
  readonly from: string;
  readonly to: string;
}

/** A field's value as one short readable string, or the dash for absence. */
export function describe(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "number") return String(value);
  const text = String(value).trim();
  if (text.length === 0) return "—";
  // A pitch is paragraphs. A diff line is one line, and "the pitch changed"
  // is the whole of what a reader needs — the pitch itself is on the page
  // above, in full, which is where they should read it.
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/** Two values, compared as a reader would. Order-insensitive for lists. */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    const left = [...a].map(String).sort();
    const right = [...b].map(String).sort();
    return left.length === right.length && left.every((v, i) => v === right[i]);
  }
  return (a ?? null) === (b ?? null);
}

/**
 * What changed between two snapshots, or `null` when there is nothing to say.
 *
 * `null` RATHER THAN `[]`, and the distinction is the point: an empty list
 * means "we compared and nothing moved", which is a real and useful answer,
 * while `null` means "there is no earlier snapshot" — and rendering the first
 * as the second would tell a reader a listing is unchanged when nobody has
 * ever looked.
 */
export function diffSnapshots(before: Snapshot | null, after: Snapshot): Change[] | null {
  if (!before) return null;
  const changes: Change[] = [];
  for (const field of DIFFABLE_FIELDS) {
    const from = before.fields[field];
    const to = after.fields[field];
    if (same(from, to)) continue;
    changes.push({
      field,
      label: FIELD_LABEL[field],
      provenance:
        FIELD_CLASS[field] === "observed"
          ? // The moment of the read that found it. `declared_repo`, because
            // that is the source PV0 established for this row: a public API
            // read from a URL a maintainer typed, with no App.
            { class: "observed", source: "declared_repo", observedAt: after.takenAt }
          : { class: "authored", by: "maintainer" },
      from: describe(from),
      to: describe(to),
    });
  }
  return changes;
}

/** The heading over a listing's diff. */
export const DIFF_HEADING = "What changed";

/**
 * Said when two snapshots exist and nothing moved between them.
 *
 * THE ONLY SENTENCE THIS MODULE PUBLISHES, and the absence of a second one is
 * deliberate. The obvious companion — "there is nothing to compare yet, this
 * is the first week we recorded" — is true, and it is furniture: it would sit
 * on every newly published listing, and on every listing at all for the first
 * week this table exists, telling a reader something about OUR recording
 * history rather than about the product they came for. The no-baseline state
 * is `null` from `diffSnapshots` and NO SECTION on the page — OPC-C's rule
 * that a panel whose data does not exist renders absent rather than as a zero.
 *
 * So the two states stay distinguishable where it matters (`null` vs `[]`)
 * and only the one a reader benefits from gets words.
 */
export const DIFF_NOTHING = "Nothing changed on this listing in the last week.";

/** How far apart two snapshots must be to be worth comparing. */
export const SNAPSHOT_INTERVAL_DAYS = 7;

// ---------------------------------------------------------------------------
// The digest's lead item
// ---------------------------------------------------------------------------

/** One change, attributed to the listing it happened on. */
export interface DigestChange extends Change {
  readonly slug: string;
}

/**
 * How many changes the digest leads with.
 *
 * Three, because the lead is a lead: a digest that opened with twenty would
 * have replaced one list nobody reads with another.
 */
export const DIGEST_CHANGE_LIMIT = 3;

/**
 * The digest's lead — PV4's second half, and the reason it is here rather
 * than in `digest.ts`.
 *
 * THE DIGEST LED WITH A COUNT, and PV4's done-when is that it should not. A
 * week's most-endorsed is a ranking of how much attention things got, which
 * is the thing every other directory leads with and the thing this one has
 * spent an epic arguing is not the interesting question. What changed is.
 *
 * ORDERED BY WHAT IT IS, NOT BY WHOSE IT IS. Observed changes come first —
 * a licence moving is a fact about the world and the rarest thing on this
 * list — then authored ones, then alphabetically by slug. No listing's
 * popularity, activity or recency enters it: this is a lead, not a
 * leaderboard, and there is deliberately NO formula id because it orders
 * nothing a reader is being sent to.
 */
export function digestLead(
  changes: readonly DigestChange[],
  limit: number = DIGEST_CHANGE_LIMIT,
): DigestChange[] {
  return [...changes]
    .sort(
      (a, b) =>
        Number(b.provenance.class === "observed") - Number(a.provenance.class === "observed") ||
        a.slug.localeCompare(b.slug) ||
        a.field.localeCompare(b.field),
    )
    .slice(0, Math.max(0, limit));
}

/** Said when a week held no changes at all. */
export const DIGEST_NO_CHANGES = "Nothing on any listing changed this week.";
