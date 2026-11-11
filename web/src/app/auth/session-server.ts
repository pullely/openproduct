// Server-side session read for the AUTHENTICATED half (openproduct-home OH2).
//
// The `/me` pages and the form-action route handlers read the session through
// this one helper; the anonymous pages never import it (pinned by the OH1
// source scan, which stays green because nothing outside `auth/` and `me/`
// references a cookie API).
import { cookies } from "next/headers";

import { SESSION_COOKIE, decodeSession, type OpenproductSession } from "./auth";

/** The live session, or null — never throws, never redirects (callers own
 *  their redirect so the destination stays visible at the call site). */
export async function readSession(): Promise<OpenproductSession | null> {
  const jar = await cookies();
  return decodeSession(jar.get(SESSION_COOKIE)?.value);
}
