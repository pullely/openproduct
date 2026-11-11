import type { Metadata } from "next";

import { sanitizeReturnTo } from "../auth/auth";

import { SignInCard } from "./sign-in-card";

/**
 * `/signin` — openproduct's own front door.
 *
 * ─── THE BUG THIS ROUTE IS THE FIX FOR ───────────────────────────────────
 *
 * Every act that needs a session — commenting, upvoting, saving, following,
 * reporting, starting a thread — reads the session in its route handler and
 * bounces a signed-out visitor through sign-in, keeping their intent in
 * `return_to` so they land back on the control they pressed. That part was
 * right. What was wrong was the destination: `/auth/start`, which is not a
 * door at all but the first step of the Orunbase OAuth handshake. Press
 * `Post` under a comment and the next screen was a consent card on another
 * host, asking you to hand an Orunbase account to an app you thought you were
 * already using — and offering no way to use the openproduct account you may
 * have had, because the form for that one only ever existed inside a modal
 * behind the top panel's `Sign in`.
 *
 * So the bounce lands HERE now, and this page is the same card the modal
 * holds: email and password, or `Continue with Orunbase`. Orunbase is a
 * choice on openproduct's door rather than the door itself, which is exactly
 * the shape `Continue with Google` has everywhere it appears.
 *
 * ─── WHAT THIS PAGE DOES NOT DO ──────────────────────────────────────────
 *
 * It does not read the session. A page that redirected an already-signed-in
 * visitor would need an actor to render, and every reason not to resolve one
 * on a cached document (I6) applies to the sign-in page as much as to the
 * launches — a signed-in visitor who lands here by pressing `back` sees the
 * card, uses the panel above it, and nothing about the document varied.
 *
 * It sends nothing anywhere either: the card posts to `/auth/password` on
 * this host, and `Continue with Orunbase` is an anchor to `/auth/start`.
 */
export const metadata: Metadata = {
  // The template appends `· openproduct`, so this must not (RE2). It did, and
  // the page served `Sign in · openproduct · openproduct` — at the one moment
  // a visitor is deciding whether this site is careful with their password.
  title: "Sign in",
  // Not a page a search engine should hold: it is a step, and the copy of it
  // that matters is always the one carrying somebody's `return_to`.
  robots: { index: false, follow: false },
};

export default async function SignInPage(props: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  // Sanitized HERE as well as at `/auth/start` and again at the callback: the
  // value reaches an anchor's `href` on this page, so a same-host relative
  // path is the only thing that may get that far.
  const returnTo = sanitizeReturnTo((await props.searchParams).return_to);

  return (
    <main className="mx-auto flex w-full max-w-[768px] justify-center px-6 pb-20 pt-16 max-sm:px-4">
      <SignInCard returnTo={returnTo} />
    </main>
  );
}
