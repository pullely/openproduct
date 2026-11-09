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

/** The design's 404 column: 700px, `80px 28px 96px`; 16px gutters on a phone. */
const COLUMN = "mx-auto box-border w-full max-w-[700px] px-7 pb-24 pt-20 max-sm:px-4 max-sm:pt-12";

/** The accent button, 40px here: the one act on the page. */
const BTN_GO =
  "inline-flex h-[44px] items-center rounded-full bg-primary px-5 text-[15px] font-medium text-primary-foreground no-underline transition-opacity hover:opacity-90";

/** The quiet second way out: 40px, a `--border` hairline on `--card`. */
const BTN_ALSO =
  "inline-flex h-[44px] items-center rounded-full border border-border px-5 text-[15px] font-medium text-foreground no-underline transition-colors hover:border-faint";

export default function OpenproductNotFound() {
  return (
    <main className={COLUMN}>
      <h1 className={PAGE_TITLE}>No build lives at this address</h1>
      <p className="m-0 mt-4 max-w-[60ch] text-[17.5px] leading-[1.6] text-copy">
        It may have been unlisted, or the link may be mistyped. Every listed
        build is on Open builds.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className={BTN_GO}>
          Back to Open builds
        </Link>
        <Link href="/search" className={BTN_ALSO}>
          Search
        </Link>
      </div>
    </main>
  );
}
