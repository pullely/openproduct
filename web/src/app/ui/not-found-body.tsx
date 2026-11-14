import Link from "next/link";

import { PAGE_TITLE } from "./design";

// The site's not-found, as a body two callers draw (openproduct-redesign
// OPR-4): `app/not-found.tsx`, which is what an unknown address renders, and
// a private thread's page, which shows it to anybody who may not read the
// thread — so "not yours" and "not there" are the same page, word for word.

/** The 404's column (OPR1): the search page's 760px, `40px 24px 72px`;
 *  `10px 12px` gutters on a phone. */
const COLUMN =
  "mx-auto box-border flex w-full max-w-[760px] flex-col items-start gap-6 px-6 pb-[72px] pt-10 max-sm:gap-4 max-sm:px-3 max-sm:pb-6 max-sm:pt-6";

/** The one action back: the ink pill, 40px, 44px on a phone. */
const BTN_BACK =
  "inline-flex min-h-[40px] items-center rounded-full bg-primary px-[18px] text-[15px] font-semibold text-primary-foreground no-underline transition-opacity hover:opacity-90 max-sm:min-h-[44px]";

/**
 * ONE TITLE AND ONE WAY BACK (openproduct-redesign OPR1). The page used to
 * explain itself in a paragraph and offer two buttons; the title already
 * says what happened, the header above carries search on every page, and the
 * one useful next step is the feed.
 *
 * The title's words are the same for a private product, a missing one and a
 * mistyped address — the page cannot tell them apart and must not (the
 * resource-hiding 404).
 */
export function NotFoundBody() {
  return (
    <main className={COLUMN}>
      <h1 className={PAGE_TITLE}>No product lives at this address</h1>
      <Link href="/" className={BTN_BACK}>
        Back to the feed
      </Link>
    </main>
  );
}
