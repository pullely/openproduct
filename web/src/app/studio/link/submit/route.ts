// POST /studio/link/submit (openproduct host) — the link form's action (OX5b).
//
// The server half of the S4 hand-off: reads the session, presents the grant
// to the gateway, and routes on the answer. Core is the authority on the
// grant (signature + freshness); this handler only DECODES its payload for
// the org path and the 409 recovery — a tampered blob simply fails at core.
//
// The one interesting branch is 409 "project already has a listing": the
// grant then becomes an ATTACH — find the listing among the caller's own
// maintained set and PUT the grant onto it (the workspace_link_required
// remedy). A listing maintained by someone else stays invisible (the
// resource-hiding rule): the caller is told to ask its maintainers, not shown
// that it exists in any detail.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../../auth/auth";
import {
  createListing,
  fetchMyListings,
  linkListing,
  readGrantPayload,
} from "../../studio-api";

/** What the page shows beside "could not be reached": the upstream's own
 *  sentence and its request id, so a maintainer can quote something and an
 *  operator can find the line. Both are already non-secret error-envelope
 *  fields; nothing else from the response travels. */
interface Unavailable {
  status?: number;
  code?: string;
  message?: string;
  requestId?: string;
}

function back(request: NextRequest, error: string, detail?: Unavailable): NextResponse {
  const url = new URL(`/studio/link?error=${error}`, request.url);
  if (detail?.requestId) url.searchParams.set("ref", detail.requestId);
  if (detail?.message) url.searchParams.set("why", detail.message.slice(0, 120));
  return NextResponse.redirect(url, 303);
}

/** The server-side record of a failed hop — the one place this flow's
 *  failures are visible after the fact. No token, no grant, no body. */
function logUnavailable(step: "create" | "list" | "link", detail: Unavailable): void {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "studio_link_submit_unavailable",
      step,
      status: detail.status ?? null,
      code: detail.code ?? null,
      message: detail.message ?? null,
      upstreamRequestId: detail.requestId ?? null,
    }),
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.redirect(new URL("/signin?return_to=%2Fstudio%2Flink", request.url), 303);
  }

  const form = await request.formData().catch(() => null);
  const grant = text(form?.get("grant"));
  const slug = text(form?.get("slug")).toLowerCase();
  const tagline = text(form?.get("tagline"));
  const pitch = text(form?.get("pitch"));

  const payload = grant ? readGrantPayload(grant) : null;
  if (!grant || !payload) return back(request, "grant_invalid");
  if (!slug) return back(request, "slug_taken");

  const created = await createListing(session.accessToken, payload.orgId, {
    grant,
    slug,
    ...(tagline ? { tagline } : {}),
    ...(pitch ? { pitch } : {}),
  });

  if (created.kind === "ok") {
    return NextResponse.redirect(
      new URL(
        `/studio/${encodeURIComponent(payload.orgId)}/${encodeURIComponent(created.data.profile.id)}?notice=created`,
        request.url,
      ),
      303,
    );
  }
  if (created.kind === "unauthorized") {
    return NextResponse.redirect(new URL("/signin?return_to=%2Fstudio%2Flink", request.url), 303);
  }
  if (created.kind === "unavailable") {
    logUnavailable("create", created);
    return back(request, "unavailable", created);
  }

  // A refusal with a remedy.
  if (created.status === 403) return back(request, "grant_expired");
  if (created.code === "conflict" && created.message.toLowerCase().includes("name")) {
    return back(request, "slug_taken");
  }
  if (created.status === 409) {
    // The project already has a listing — attach the grant to it, if it is
    // the caller's to touch.
    const mine = await fetchMyListings(session.accessToken);
    const existing =
      mine.kind === "ok"
        ? mine.data.listings.find((l) => l.projectId === payload.projectId && l.orgId === payload.orgId)
        : undefined;
    if (mine.kind === "unavailable") {
      logUnavailable("list", mine);
      return back(request, "unavailable", mine);
    }
    if (!existing) return back(request, "not_maintainer");
    const linked = await linkListing(session.accessToken, payload.orgId, existing.id, grant);
    if (linked.kind === "ok") {
      return NextResponse.redirect(
        new URL(
          `/studio/${encodeURIComponent(payload.orgId)}/${encodeURIComponent(existing.id)}?notice=linked`,
          request.url,
        ),
        303,
      );
    }
    if (linked.kind === "refused" && linked.status === 403) return back(request, "grant_expired");
    if (linked.kind === "unavailable") {
      logUnavailable("link", linked);
      return back(request, "unavailable", linked);
    }
    return back(request, "unavailable");
  }
  return back(request, "grant_invalid");
}

function text(value: FormDataEntryValue | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
