// The intent that survives sign-in (openproduct-worldclass FR3).
//
// Six controls — upvote, save, follow, comment-vote and the two withdrawals —
// are posted by a `<form method="post">`, and every one of them already says
// the same thing in its header: *"the intent is the click, and making somebody
// declare their identity before expressing an intent loses the intent"*. Until
// this module, that sentence was half true. A signed-out visitor who upvoted
// was returned to the row they clicked, at the control's own fragment, with
// the vote NOT cast. They landed looking at the thing they had already pressed,
// unpressed, and had to press it again.
//
// So the bounce carries the act as well as the address. One record, written
// where the bounce happens (`act.ts`), read where the visitor comes back
// (`me/resume/route.ts`). Neither door is touched: the record rides the
// `return_to` that both doors already carry, which is why the platform round
// trip and the password modal both get this without knowing it exists.
//
// ─── IT CAN ONLY EVER ADD, AND THAT IS THE INVARIANT ──────────────────────
//
// There are four kinds here, not six. `unendorse` and `unsave` are missing,
// and `follow` and `comment-vote` record only their `on` direction, because a
// signed-out page renders the UNVOTED, UNSAVED, UNFOLLOWED state for everybody
// (I6) — the only act a signed-out visitor can post is the one that adds. A
// record that could subtract would be a replay that could withdraw an
// endorsement the visitor cast in another tab in the ten minutes since, which
// is a thing no reader would connect to anything they did. Refusing to write
// it costs nothing, because it cannot be reached.
//
// ─── AND IT IS ONLY WRITTEN FOR A SAME-ORIGIN POST ────────────────────────
//
// `SameSite=Lax` is what stops a cross-site form post from acting as somebody:
// the session cookie does not travel, so the act route sees no session and
// bounces. Replaying the bounce would hand that back — evil.com posts to
// `/me/endorse`, the visitor is bounced to sign-in, signs in for their own
// reasons, and casts a vote they never asked for. `sec-fetch-site` is the
// guard, and a REQUEST WITHOUT THE HEADER IS NOT RECORDED: an old browser
// keeps the behaviour this milestone replaces, which forgets the intent but
// has never once performed the wrong one.

import { FOLLOW_KINDS, FOLLOW_VALUE_RE } from "@openproduct/contracts";

import { sanitizeReturnTo } from "../auth/auth";

/** The record's own cookie. HttpOnly, single-use, and cleared by the replay. */
export const PENDING_COOKIE = "op_pending_act";

/**
 * Ten minutes — deliberately the same window `HANDSHAKE_MAX_AGE_SECONDS` gives
 * the OAuth handshake, because it is the same wait: a consent screen, or a
 * password and possibly a mailed code. An intent older than the sign-in it was
 * waiting for is not an intent any more.
 */
export const PENDING_MAX_AGE_SECONDS = 600;

/** Where the replay sends the visitor once it has acted. Not under `/auth/`,
 *  which `sanitizeReturnTo` refuses on purpose, and not a page. */
export const RESUME_PATH = "/me/resume";

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;
const POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One act, in the shape the replay can perform.
 *
 * `returnTo` is NOT in here. It rides the resume URL's own query, so a record
 * that expired or was never written still lands the visitor exactly where the
 * bounce always landed them — this milestone can lose the act it added, and
 * cannot lose the address that was there before it.
 */
export type PendingAct =
  | { act: "endorse"; slug: string }
  | { act: "save"; slug: string }
  | { act: "follow"; kind: string; value: string }
  | { act: "comment-vote"; postId: string };

/**
 * Did a page on this origin post this?
 *
 * `sec-fetch-site: same-origin` is sent by every browser that has the header,
 * on form posts included, and cannot be set by a page — it is the browser's
 * own statement about where the request came from. Absent means "cannot tell",
 * which here means no.
 *
 * The parameter is the SHAPE it reads rather than `NextRequest`, so the guard
 * can be exercised without a request object — the `ui/keys.ts` lesson, where a
 * type imported for one field pulled a whole runtime into the test lane.
 */
export function sameOriginPost(request: { headers: { get(name: string): string | null } }): boolean {
  return request.headers.get("sec-fetch-site") === "same-origin";
}

/** The record, as it is stored. JSON, then base64url — the cookie is HttpOnly
 *  and this is not encryption, only an encoding that cannot contain `;`. */
export function encodePending(act: PendingAct): string {
  return btoa(JSON.stringify(act)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The record, re-validated on the way back in.
 *
 * The cookie is HttpOnly, so this is defence in depth rather than a boundary —
 * and it is the same defence in depth `sanitizeReturnTo` applies to the
 * return cookie two files away. Every field is checked against the SAME
 * expression its own route checks, so a replay can never reach the gateway
 * with something the route would have refused.
 */
export function decodePending(raw: string | null | undefined): PendingAct | null {
  if (!raw || raw.length > 512) return null;
  let parsed: unknown;
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    parsed = JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  switch (record.act) {
    case "endorse":
    case "save":
      return typeof record.slug === "string" && SLUG_RE.test(record.slug)
        ? { act: record.act, slug: record.slug }
        : null;
    case "follow":
      return typeof record.kind === "string" &&
        (FOLLOW_KINDS as readonly string[]).includes(record.kind) &&
        typeof record.value === "string" &&
        FOLLOW_VALUE_RE.test(record.value)
        ? { act: "follow", kind: record.kind, value: record.value }
        : null;
    case "comment-vote":
      return typeof record.postId === "string" && POST_ID_RE.test(record.postId)
        ? { act: "comment-vote", postId: record.postId }
        : null;
    default:
      return null;
  }
}

/**
 * Where the sign-in door should send them back to.
 *
 * With a record: through the replay, carrying the original address in the
 * query. Without one: the original address, exactly as before FR3. The nesting
 * is real and the encoding is doubled, which is the price of putting the act
 * on a path both doors already understand rather than teaching each door a new
 * parameter.
 */
export function bounceTarget(returnTo: string, recorded: boolean): string {
  if (!recorded) return returnTo;
  return `${RESUME_PATH}?return_to=${encodeURIComponent(returnTo)}`;
}

/** The replay's destination, sanitized on read like every other one. */
export function resumeDestination(raw: string | null): string {
  return sanitizeReturnTo(raw) ?? "/";
}
