"use client";

import { AuthPanel } from "../shell/auth-modal";

/**
 * The client boundary for `/signin`, and nothing else.
 *
 * The card is `AuthPanel` — the same component the shell's modal renders, so
 * the page and the modal cannot drift into two sign-ins with two behaviours.
 * The page around it is a server component; this file exists only to cross
 * into the browser, and it draws the card with no dialog affordances because
 * a page is not something you dismiss. The card draws its own hairline; the
 * page around it is the design's centred 400px column.
 */
export function SignInCard({ returnTo }: { returnTo: string | null }) {
  return <AuthPanel returnTo={returnTo} />;
}
