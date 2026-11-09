// Follows (openproduct-launch FL0).
//
// ONE ACT, TWO TARGETS. Following a topic and following a person both mean
// "put this in my notifications"; the migration's own comment argues at length
// why that is one table rather than two, and this file is the same argument in
// types: one kind union, one path shape, one control, one overlay key.
//
// ─── WHAT A FOLLOW IS NOT ─────────────────────────────────────────────────
//
// It is NOT an endorsement. An endorsement is a public claim about a product's
// worth that moves a number other people are shown; a follow is a private
// subscription that moves a number only about how many people subscribed. The
// integrity model does not touch a follow — nothing discounts it, nothing
// restates it, and nobody is ever accused of following dishonestly.
//
// It is NOT a social graph. There is no read anywhere that answers "who
// follows this person", and the schema is indexed so that a follower COUNT is
// cheap and a follower LIST is a scan. A public follower list turns a private
// subscription into something anyone can crawl.
//
// ─── THE COUNT IS HONEST AT ZERO, AND ONLY NOW ────────────────────────────
//
// TP0 shipped topic pages with NO follower count at all, because nothing
// observed a follow and "0 followers" would have been a claim rather than a
// measurement (OPC-C). This milestone is what makes the zero honest: from
// here, a topic with no followers has been counted and found empty, which is
// a fact worth rendering.

import { topicPath } from "./topics.js";

/** What can be followed. A closed union: a third kind is a product decision
 *  that costs a migration, matching the schema's CHECK. */
/** FL0 — topic, person. PP1 — listing, targeted by slug; the count is public, the list is not. */
export type FollowKind = "topic" | "person" | "listing";

export const FOLLOW_KINDS = ["topic", "person", "listing"] as const;

/** One thing a person follows, or could. */
export interface FollowTarget {
  readonly kind: FollowKind;
  /** A canonical CT1 category value for `topic`; a HANDLE for `person`.
   *
   *  THE PERSON'S TARGET IS THEIR HANDLE ON THE WIRE AND THEIR SUBJECT ID IN
   *  THE TABLE, and the translation happens in core. A handle is the public
   *  address (CG0) and the only name a page has; a subject id is an internal
   *  identifier that no public surface should be teaching a browser to send. */
  readonly value: string;
}

/**
 * The overlay's key for one target — how a page asks "am I following this".
 *
 * `topic:dev-tools`, `person:ada`. ONE STRING RATHER THAN TWO ARRAYS, because
 * the overlay's answer is bounded by the ids the page asked about (XP2) and a
 * page can hold both kinds at once. Two arrays would be two bounds to keep in
 * step and two chances to leak one kind's ids into the other's answer.
 */
export function followKey(target: FollowTarget): string {
  return `${target.kind}:${target.value}`;
}

/** The inverse. Returns null for anything that is not a key this file wrote —
 *  the overlay's ids come from whatever a page rendered, so a malformed one
 *  costs that one answer rather than the visitor's whole personalisation. */
export function parseFollowKey(raw: string): FollowTarget | null {
  const at = raw.indexOf(":");
  if (at <= 0) return null;
  const kind = raw.slice(0, at);
  const value = raw.slice(at + 1);
  if (!(FOLLOW_KINDS as readonly string[]).includes(kind)) return null;
  if (!FOLLOW_VALUE_RE.test(value)) return null;
  return { kind: kind as FollowKind, value };
}

/**
 * The grammar both a topic value and a handle satisfy.
 *
 * Deliberately ONE expression rather than two: it is the outer bound the
 * gateway and the overlay parser check, and the REAL validation is core
 * resolving the target — a topic against the CT1 vocabulary, a handle against
 * a public profile. A value that passes this and resolves to nothing is a 404,
 * not a row.
 */
export const FOLLOW_VALUE_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Where a followed thing lives, so a notification and a count can link to
 *  it from one function. */
export function followHref(target: FollowTarget): string {
  if (target.kind === "topic") return topicPath(target.value);
  if (target.kind === "listing") return `/${target.value}`;
  return `/@${target.value}`;
}

// ---------------------------------------------------------------------------
// The control's copy
// ---------------------------------------------------------------------------

export const FOLLOW_LABEL = "Follow";
export const FOLLOWING_LABEL = "Following";

/**
 * What the control's title says, and it says what the act DOES rather than
 * what it is called.
 *
 * The likeliest misunderstanding of a Follow button on this estate is that it
 * is public — that the thing followed, or anyone else, can see who followed
 * it. It cannot, and the sentence says so where somebody is looking at the
 * button rather than three pages away in a policy.
 */
export const FOLLOW_MEANING =
  "Only you can see what you follow. The topic, person or listing sees a count, never a list.";

/** The count's own title, for the same reason EN2 gave its total one: a
 *  number with no sentence is a number a reader has to guess the meaning of. */
export const FOLLOWER_COUNT_TITLE =
  "People following this. Nobody can see who they are, including you.";

/** `1 follower` / `12 followers`. Zero IS rendered from FL0 onward — it is a
 *  measured emptiness now, not an absent measurement. */
export function followerLine(count: number): string {
  return `${count} ${count === 1 ? "follower" : "followers"}`;
}

// ---------------------------------------------------------------------------
// The write path
// ---------------------------------------------------------------------------

/** `/me/follows/topic/dev-tools` — the address of one follow, for both the
 *  form's action and the API's route. Built here so the write path and the
 *  gateway's rule cannot disagree about its shape. */
export function followPath(target: FollowTarget): string {
  return `/me/follows/${target.kind}/${encodeURIComponent(target.value)}`;
}

/**
 * How many targets one overlay request may ask about.
 *
 * The largest page that carries follow state is the topic index — one card per
 * category value in use — and the vocabulary is smaller than this. Chosen to
 * bound the query rather than to constrain a page.
 */
export const FOLLOW_MAX_KEYS = 64;

/** Parse the overlay's `follows` parameter: comma-separated keys, deduped,
 *  capped. Silently drops what it cannot read, for XP2's reason — the ids come
 *  from whatever the page rendered, and one malformed key should cost one
 *  answer rather than the whole overlay. */
export function parseFollowKeys(raw: string | null): FollowTarget[] {
  if (!raw) return [];
  const out: FollowTarget[] = [];
  const seen = new Set<string>();
  for (const piece of raw.split(",")) {
    const target = parseFollowKey(piece.trim());
    if (!target) continue;
    const key = followKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
    if (out.length >= FOLLOW_MAX_KEYS) break;
  }
  return out;
}
