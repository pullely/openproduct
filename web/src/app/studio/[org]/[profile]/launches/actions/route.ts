// POST /studio/{org}/{profile}/launches/actions — the scheduler's form action
// (openproduct-commons LC0).
//
// The editor's `actions` route pattern, applied to a second surface, which is
// XP3's claim about the studio frame holding at the route layer too: one
// session read, one place the gateway is spoken to, one redirect discipline.
//
// THE REFUSAL RIDES BACK AS ITS REASON, not as a generic error. A launch
// refusal is a single stable token with a published sentence behind it, so
// the page can render the sentence rather than "that did not work" — which is
// the difference between a maker who knows to pick a different version and
// one who tries the same thing again.

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../../../../auth/auth";
import { studioAnswer } from "../../../../answer";
import {
  cancelLaunch,
  rescheduleLaunch,
  scheduleLaunch,
  type StudioResult,
} from "../../../../studio-api";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ org: string; profile: string }> },
): Promise<NextResponse> {
  const { org, profile } = await ctx.params;
  const page = `/studio/${encodeURIComponent(org)}/${encodeURIComponent(profile)}/launches`;
  const to = (suffix: string) => answer.back(`${page}${suffix}`);

  // OPP15 — the same act, answered as a `303` to a browser posting the form
  // and as that same address in JSON to the save island. One decision below,
  // two ways of carrying it; see `studio/answer.ts`.
  const answer = studioAnswer(request);

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return answer.signIn(page);
  const token = session.accessToken;

  const form = await request.formData().catch(() => null);
  const intent = text(form?.get("intent"));
  const launchId = text(form?.get("launchId"));

  switch (intent) {
    case "schedule": {
      const result = await scheduleLaunch(token, org, profile, {
        versionLabel: text(form?.get("versionLabel")),
        // A `datetime-local` input has no zone, so it arrives as a wall clock
        // and is interpreted in the SERVER's — which is UTC. The page says so
        // beside the field: a maker who thinks they scheduled 9am local and
        // gets 9am UTC has been misled by an input that looked precise.
        scheduledFor: momentOf(text(form?.get("scheduledFor"))),
      });
      if (result.kind === "ok") return to("?notice=scheduled");
      return refusal(result, answer.signIn, page, to);
    }

    case "reschedule": {
      const result = await rescheduleLaunch(token, org, profile, launchId, {
        scheduledFor: momentOf(text(form?.get("scheduledFor"))),
      });
      if (result.kind === "ok") return to("?notice=moved");
      return refusal(result, answer.signIn, page, to);
    }

    case "cancel": {
      const result = await cancelLaunch(token, org, profile, launchId);
      if (result.kind === "ok") return to("?notice=cancelled");
      return refusal(result, answer.signIn, page, to);
    }

    default:
      return to("?error=action_failed");
  }
}

/**
 * A refusal carries its REASON back in the URL; anything else is an error.
 *
 * The reason is a closed vocabulary from the contract, so the page maps it to
 * the same sentence the API used. Passing the message itself through the URL
 * would put server text on the address bar and let anyone with a link put
 * arbitrary words on somebody's studio screen.
 */
function refusal(
  result: StudioResult<unknown>,
  signIn: (returnTo: string) => NextResponse,
  page: string,
  to: (suffix: string) => NextResponse,
): NextResponse {
  if (result.kind === "unauthorized") return signIn(page);
  if (result.kind === "refused" && result.reason) {
    return to(`?refused=${encodeURIComponent(result.reason)}`);
  }
  return to("?error=action_failed");
}

/**
 * A `datetime-local` value into an instant.
 *
 * Empty stays empty and the API refuses it with its own sentence — this
 * function does not invent a moment, because a launch scheduled for a time
 * nobody chose is the exact surprise LC0 exists to prevent.
 */
function momentOf(value: string): string {
  if (value.length === 0) return "";
  // `datetime-local` gives `2026-09-01T09:00`, sometimes with seconds. Neither
  // carries a zone, so `Z` is appended explicitly rather than letting
  // `Date.parse` apply the runtime's — which on a worker is UTC and on a
  // developer's laptop is not, and a moment that means two things depending
  // on where the code ran is not a moment.
  const withSeconds = /T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
  const parsed = Date.parse(`${withSeconds}Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function text(value: FormDataEntryValue | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
