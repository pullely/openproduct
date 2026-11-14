import Link from "next/link";

import { TAB, TAB_OFF, TAB_ON } from "../ui/design";

/**
 * The authenticated half's sub-navigation (openproduct-home OH2). Static
 * markup — the pages behind it each read the session themselves.
 *
 * THE DESIGN'S SHAPE: a row of 32px chips, 4px apart, the current one on
 * `--secondary` and the rest in `--muted` ink. It sits at the top of the
 * 768px column every one of these pages shares (`ME_MAIN`), 28px above the
 * page's title.
 *
 * The fifth chip is an anchor into the profile page (LC5's digest control
 * lives there), so it is never the active one: it is a way in, not a page.
 */
export function MeNav({
  active,
}: {
  active: "profile" | "applications" | "saved" | "notifications";
}) {
  const item = (key: typeof active | null, href: string, label: string) => (
    <Link
      href={href}
      {...(key === active ? { "aria-current": "page" as const } : {})}
      className={`tap-h ${TAB} px-0 no-underline ${key === active ? TAB_ON : TAB_OFF}`}
    >
      {label}
    </Link>
  );
  return (
    // ONE KIND OF TAB (CP-R2): your pages are views of you, so they are the
    // underline strip every list's sorts use, not chips.
    <nav aria-label="Your pages" className="flex flex-wrap items-center gap-x-6 border-b border-line">
      {item("profile", "/me", "Profile")}
      {item("applications", "/me/applications", "Applications")}
      {item("saved", "/me/saved", "Saved")}
      {/* NF0 — the inbox. No badge HERE: this nav renders on the server on a
          personal page that already knows, and a second count would be a
          second number to keep in step. The badge lives in the shell, where
          it arrives after paint from the overlay. */}
      {/* OPR1 — the inbox's address is `/activity` (the old one redirects),
          which is also where the header's bell goes. */}
      {item("notifications", "/activity", "Notifications")}
      {item(null, "/me#digest", "Digest")}
    </nav>
  );
}

/** The column every `/me/*` page stands in: 768px, `48px 24px 72px`. */
export const ME_MAIN =
  "mx-auto box-border w-full max-w-[768px] px-6 pb-[104px] pt-[80px] max-sm:px-4 max-sm:pb-[72px] max-sm:pt-12";

/** The title, 28px under the nav. */
export const ME_TITLE_GAP = "mt-7";

/** The one line under a `/me/*` title: 13.5px/1.6 in `--muted`, 8px below. */
export const ME_LEDE = "m-0 mt-2 text-[13.5px] leading-[1.6] text-muted-foreground";

/** A padded card on these pages: 12px radius, hairline, `20px 24px`. */
export const ME_CARD = "rounded-[12px] border border-border bg-card px-6 py-5 max-sm:px-4";

/** The widths of the five chips, for the skeletons that stand in for them. */
export const ME_NAV_WIDTHS = [68, 106, 66, 118, 68];
