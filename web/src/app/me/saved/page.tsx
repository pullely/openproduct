import { redirect } from "next/navigation";

import { readSession } from "../../auth/session-server";
import { meSectionHref, signInFor } from "../section";

/**
 * `/me/saved` — the address the saved list had (openproduct-home OH2).
 *
 * THE LIST IS A SECTION OF `/me` NOW (openproduct-redesign OPR1, board `Me`),
 * at `/me?section=saved`, and this address arrives there: a bookmark, a link
 * in an old digest and the account menu's own row all still land on the list.
 *
 * A PER-REQUEST DECISION, NOT A STATIC REDIRECT, which is why it may live in
 * a route module at all (`route-census.test.ts`: a route whose whole body is
 * a fixed redirect gets prerendered and ships a 200 with an empty body). It
 * reads the session like the page it stands in for: signed out, the visitor
 * goes to sign in and comes back to the SECTION; signed in, to the section.
 * Never cached, and nothing is rendered here.
 */
export const dynamic = "force-dynamic";

export default async function SavedMoved() {
  const to = meSectionHref("saved");
  const session = await readSession();
  if (!session) redirect(signInFor(to));
  redirect(to);
}
