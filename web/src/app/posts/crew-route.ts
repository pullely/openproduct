// The transport half of a crew route (openproduct-redesign OPR-3).
//
// `crew-handler.ts` decides; this turns a request into the handler's input
// and its `CrewAnswer` into a response. Kept apart because this file imports
// `next/server` and the handler must not (the web test lane does not run
// Next), and kept in ONE place so the four `/{slug}/manage/…` route files
// cannot each grow their own idea of a redirect.
//
// THE SIGN-IN ANSWER IS `me/act.ts`'s, not a second one built here: a form
// gets the `303` through `/signin` and back, an enhanced caller an empty
// `401`. There is exactly one place that builds a sign-in redirect.

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../auth/auth";
import { actAnswer, wantsJson } from "../me/act";

import type { CrewAnswer, CrewCall } from "./crew-handler";
import type { Fields } from "./crew-forms";

const NO_STORE = { "cache-control": "no-store" } as const;

/** The same slug grammar the public read uses. */
const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

/** A form's fields (strings only — a file is not a field here), or a JSON
 *  body's members. Anything unreadable is no fields at all. */
export async function readFields(request: NextRequest): Promise<Fields> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body: unknown = await request.json().catch(() => null);
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Fields) : {};
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const fields: Record<string, string> = {};
  form.forEach((value, name) => {
    if (typeof value === "string") fields[name] = value;
  });
  return fields;
}

/** The handler's input for this request, or null for a slug that is not one. */
export async function crewCall(
  request: NextRequest,
  params: Promise<{ slug: string }>,
  options: { body: boolean },
): Promise<CrewCall | null> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return null;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  return {
    slug,
    token: session ? session.accessToken : null,
    fields: options.body ? await readFields(request) : {},
    json: wantsJson(request),
    search: request.nextUrl.search,
  };
}

/** A slug that could never be a product: the same 404 as "not yours". */
export function notFound(): NextResponse {
  return NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404, headers: NO_STORE });
}

export function respond(request: NextRequest, answer: CrewAnswer): NextResponse {
  if (answer.kind === "signin") return actAnswer(request, "signin", { returnTo: answer.returnTo });
  if (answer.kind === "json") {
    return answer.body === null
      ? new NextResponse(null, { status: answer.status, headers: NO_STORE })
      : NextResponse.json(answer.body, { status: answer.status, headers: NO_STORE });
  }
  // 303, like every act here: a POST answered with a redirect must become a
  // GET, or a reload re-submits it.
  const res = NextResponse.redirect(new URL(answer.to, request.url), 303);
  res.headers.set("cache-control", "no-store");
  return res;
}
