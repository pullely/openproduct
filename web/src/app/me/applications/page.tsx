import { redirect } from "next/navigation";

import { readSession } from "../../auth/session-server";
import { meSectionHref, signInFor } from "../section";

/**
 * `/me/applications` — the address the applications had (openproduct-home
 * OH2).
 *
 * THEY ARE THE SEATS SECTION OF `/me` NOW (openproduct-redesign OPR1, board
 * `Me`: a request to join is a seat you asked for), at `/me?section=seats`,
 * and this address arrives there.
 *
 * A PER-REQUEST DECISION, NOT A STATIC REDIRECT — see `me/saved/page.tsx`,
 * which is the same shape for the same reason: it reads the session, sends a
 * signed-out visitor to sign in and back to the SECTION, and is never cached.
 */
export const dynamic = "force-dynamic";

export default async function ApplicationsMoved() {
  const to = meSectionHref("seats");
  const session = await readSession();
  if (!session) redirect(signInFor(to));
  redirect(to);
}
