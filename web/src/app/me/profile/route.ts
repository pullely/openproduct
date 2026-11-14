// POST /me/profile (openproduct host) — the profile form's action (OH2, CG1).
//
// The form is on `/me/settings` since openproduct-redesign OPR1, and every
// outcome returns there; this address did not move, because a form posts to it.
//
// Progressive-enhancement form posts, no client JS: the handler reads the
// session, writes the authored fields through the authenticated client, and
// redirects back. Signed out lands on sign-in, exactly like the page itself.
//
// THREE WRITES, IN A FIXED ORDER, EACH ONLY WHEN IT CHANGES SOMETHING. The
// authored fields (name, bio, links, open-to-project) go first, because the
// public page cannot be turned on without a name or bio; the handle second,
// because the page cannot be turned on without an address; the visibility
// last. A refusal at any step STOPS there and says why — the steps before it
// are already saved, and the form re-reads them, so nothing is lost and the
// person sees exactly the one thing that was not accepted.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../auth/auth";
import { claimHandle, setProfileVisibility, updateMe, type MeWriteResult } from "../me-api";
import { SETTINGS_PATH, planProfileSave, redirectFor } from "./plan";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/signin?return_to=%2Fme%2Fsettings", request.url), 303);

  const form = await request.formData().catch(() => null);
  const plan = planProfileSave({
    displayName: text(form?.get("displayName")),
    bio: text(form?.get("bio")),
    githubUrl: text(form?.get("githubUrl")),
    siteUrl: text(form?.get("siteUrl")),
    openToProject: checked(form?.get("openToProject")),
    handle: text(form?.get("handle")),
    profilePublic: checked(form?.get("profilePublic")),
    currentHandle: text(form?.get("currentHandle")),
    currentPublic: String(form?.get("currentPublic") ?? "") === "true",
  });

  const token = session.accessToken;
  const outcome = await settle(updateMe(token, plan.authored));
  if (outcome) return NextResponse.redirect(new URL(outcome, request.url), 303);

  if (plan.handle !== undefined) {
    const handleOutcome = await settle(claimHandle(token, plan.handle));
    if (handleOutcome) return NextResponse.redirect(new URL(handleOutcome, request.url), 303);
  }

  if (plan.profilePublic !== undefined) {
    const visibilityOutcome = await settle(setProfileVisibility(token, plan.profilePublic));
    if (visibilityOutcome) return NextResponse.redirect(new URL(visibilityOutcome, request.url), 303);
  }

  return NextResponse.redirect(new URL(`${SETTINGS_PATH}?saved=1`, request.url), 303);
}

async function settle(write: Promise<MeWriteResult<unknown>>): Promise<string | null> {
  return redirectFor(await write);
}

function text(value: FormDataEntryValue | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** A checkbox posts `on` when ticked and nothing at all when not. */
function checked(value: FormDataEntryValue | null | undefined): boolean {
  return typeof value === "string" && value.length > 0;
}
