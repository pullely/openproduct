// New personal token (openproduct-mcp MC1). The token goes to the page in a
// one-minute cookie on the page's own path (see `new-token.ts`), never in a URL.

import { NextResponse, type NextRequest } from "next/server";

import { isAgentScope, normaliseScopes, type PersonalTokenLifetime } from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../../../../auth/auth";
import { mintPersonalToken } from "../../../agents-api";
import { sameOriginPost } from "../../../pending";
import { signInFor } from "../../../section";
import { NEW_TOKEN_PATH, newTokenCookie } from "../new-token";

function lifetimeOf(value: FormDataEntryValue | null): PersonalTokenLifetime {
  if (value === "never") return null;
  if (value === "30") return 30;
  if (value === "365") return 365;
  return 90;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sameOriginPost(request)) return new NextResponse("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL(signInFor(NEW_TOKEN_PATH), request.url), 303);
  const form = await request.formData();
  const result = await mintPersonalToken(session.accessToken, {
    name: String(form.get("name") ?? "").trim(),
    scopes: normaliseScopes(form.getAll("scope").filter((v): v is string => typeof v === "string" && isAgentScope(v))),
    days: lifetimeOf(form.get("days")),
    listingIds: null,
  });
  if (result.kind === "unauthorized") return NextResponse.redirect(new URL(signInFor(NEW_TOKEN_PATH), request.url), 303);
  if (result.kind !== "ok") {
    return NextResponse.redirect(new URL(`${NEW_TOKEN_PATH}?error=mint#new-token`, request.url), 303);
  }
  const response = NextResponse.redirect(new URL(`${NEW_TOKEN_PATH}?minted=1#new-token`, request.url), 303);
  response.cookies.set(newTokenCookie(result.data.token));
  response.headers.set("cache-control", "no-store");
  return response;
}
