import Link from "next/link";

import { PAGE_TITLE } from "./ui/design";

/**
 * The public plane's own not-found (launch polish, from the Chrome review).
 *
 * Before this file existed, an unknown slug on openproduct.live fell through
 * to the CONSOLE's 404 — the Orun mark, "doesn't match anything in the
 * console", and a "Back to workspaces" button that dropped an anonymous
 * visitor into the app shell. A public surface must answer in its own voice:
 * a private profile, a nonexistent one, and a mistyped address all land here,
 * byte-identical, with the one useful next step.
 */

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
export default function OpenproductNotFound() {
  return (
    <main className={COLUMN}>
      <h1 className={PAGE_TITLE}>No product lives at this address</h1>
      <Link href="/" className={BTN_BACK}>
        Back to the feed
      </Link>
    </main>
  );
}
