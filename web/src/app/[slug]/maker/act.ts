// One crew act from the page, as a fetch (openproduct-redesign OPR-3).
//
// The `/{slug}/manage/…` handlers answer a plain form with a 303 and a caller
// that sends `accept: application/json` with `{data}` or
// `{error: {code, message, fields}}`. The page's forms are real forms (they
// post and come back with `?notice=` when scripts are off); with scripts on
// they go through here, so a field error is shown beside its field without
// leaving the page.
//
// NO ID OF THE PRODUCT IS SENT. The handler resolves the workspace and the
// listing from the slug in its own address and the caller's session.

import { manageRoute } from "./model";

export type CrewActResult<T> =
  | { ok: true; data: T }
  | { ok: false; signedOut: boolean; message: string; fields: Record<string, string[]> };

const FAILED = "That did not go through. Try again in a moment";
const SIGNED_OUT = "Sign in again to do that";

function failure(message: string, fields: Record<string, string[]> = {}, signedOut = false) {
  return { ok: false as const, signedOut, message, fields };
}

async function answerOf<T>(res: Response): Promise<CrewActResult<T>> {
  if (res.status === 401) return failure(SIGNED_OUT, {}, true);
  const body = (await res.json().catch(() => null)) as
    | { data?: T; error?: { message?: string; fields?: Record<string, string[]> } }
    | null;
  if (res.ok && body && body.data !== undefined && body.data !== null) return { ok: true, data: body.data };
  if (body?.error) return failure(body.error.message ?? FAILED, body.error.fields ?? {});
  return failure(FAILED);
}

/** `POST /{slug}/manage/{route}` with these fields. */
export async function crewWrite<T>(
  slug: string,
  route: "profile" | "milestones" | "posts" | "seats",
  fields: Readonly<Record<string, unknown>>,
  fetchImpl: typeof fetch = fetch,
): Promise<CrewActResult<T>> {
  try {
    const res = await fetchImpl(manageRoute(slug, route), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(fields),
    });
    return await answerOf<T>(res);
  } catch {
    return failure(FAILED);
  }
}

/** `GET /{slug}/manage/{route}` — crew only, never cached. */
export async function crewRead<T>(
  slug: string,
  route: "milestones" | "needs-you" | "posts",
  fetchImpl: typeof fetch = fetch,
): Promise<CrewActResult<T>> {
  try {
    const res = await fetchImpl(manageRoute(slug, route), {
      headers: { accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    return await answerOf<T>(res);
  } catch {
    return failure(FAILED);
  }
}

/** The first sentence core wrote about a field, or null. */
export function fieldError(fields: Record<string, string[]>, name: string): string | null {
  return fields[name]?.[0] ?? null;
}
