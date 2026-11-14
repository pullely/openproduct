import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "../auth/session-server";
import { initialsOf } from "../shell/shell";
import { BOARD_PAGE, BTN_SOFT, COVER_PERSON, NOTICE_WARN, PAGE_TITLE } from "../ui/design";
import { AppLink } from "../ui/link";
import { GLYPH_EDIT, GLYPH_OUT, Glyph } from "./glyph";
import { fetchMyListings } from "./listings";
import { fetchMe, fetchMyApplications, fetchSaved } from "./me-api";
import { ME_SECTIONS, MeSections } from "./nav";
import { meSectionHref, meSectionOf, signInFor, type MeSection } from "./section";
import { ProductsSection, SavedSection, SeatsSection, SectionUnavailable } from "./sections";
import { MeUnavailable } from "./unavailable";

/**
 * Your profile (openproduct-home OH2; rebuilt to the boards `Me` and
 * `PhoneMe` by openproduct-redesign OPR1).
 *
 * THE BOARD'S SHAPE: the profile card — the disc, your name as the page's
 * title, the line you wrote about yourself, the way to your public page and
 * the way to edit — then ONE page with a switcher between what you hold
 * here: your products, what you saved, the seats you asked for.
 *
 * WHAT MOVED. The form that was this page is `/me/settings` now, and the
 * card's Edit profile goes there. The saved list and the applications were
 * pages of their own (`/me/saved`, `/me/applications`); they are sections of
 * this one, at `/me?section=saved` and `/me?section=seats`, and the old
 * addresses arrive at them.
 *
 * A server component with an EXPLICIT session read — the authenticated half's
 * defining difference from the anonymous pages (design.md §1, I6 does not
 * apply: this page's whole content is one person's). Signed out is a
 * redirect to sign-in and back to the section asked for, never a 500. Never
 * cached: this is a per-person surface.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your profile" };

export default async function MePage(props: {
  searchParams: Promise<{ section?: string | string[]; error?: string }>;
}) {
  const params = await props.searchParams;
  const section = meSectionOf(params.section);
  const here = meSectionHref(section);

  const session = await readSession();
  if (!session) redirect(signInFor(here));

  // ALL FOUR IN ONE ROUND TRIP: the card, and the three lists the switcher
  // counts. Each list is read whichever section is showing, because the
  // switcher prints every section's count.
  const [me, listings, saved, applications] = await Promise.all([
    fetchMe(session.accessToken),
    fetchMyListings(session.accessToken),
    fetchSaved(session.accessToken),
    fetchMyApplications(session.accessToken),
  ]);
  // A dead token (expired mid-session, revoked from the console) reads as
  // signed out, whichever read reported it; a service failure renders as
  // one, never as a redirect loop.
  if (
    me.kind === "unauthorized" ||
    listings.kind === "unauthorized" ||
    saved.kind === "unauthorized" ||
    applications.kind === "unauthorized"
  ) {
    redirect(signInFor(here));
  }
  if (me.kind === "unavailable") return <MeUnavailable />;

  const authored = me.data.contributor;
  // What renders when nothing is authored yet: the OI display name, clearly
  // provisional. The authored name never comes from the platform (OD3's
  // maintainer-names reasoning) — this fallback is presentation, not storage.
  const shownName = authored?.displayName ?? session.displayName ?? null;
  const handle = authored?.handle ?? null;
  // The public page exists only when it is on AND has an address: a link to
  // it otherwise is a link to a 404.
  const publicHref = authored?.profilePublic === true && handle ? `/@${handle}` : null;

  // Each list, or null when its read failed — and an answer without the list
  // in it is a failed read, not an empty one (OD5).
  const myListings = listings.kind === "ok" ? listings.data.listings : null;
  const mySaved = saved.kind === "ok" && Array.isArray(saved.data.products) ? saved.data.products : null;
  const mySeats =
    applications.kind === "ok" && Array.isArray(applications.data.applications)
      ? applications.data.applications
      : null;
  // A list that could not be read has no count — a zero would be a claim.
  const counts: Record<MeSection, number | null> = {
    products: myListings?.length ?? null,
    saved: mySaved?.length ?? null,
    seats: mySeats?.length ?? null,
  };
  const title = ME_SECTIONS.find((s) => s.key === section)?.label ?? "";

  return (
    <main className={BOARD_PAGE}>
      {/* The profile card. A band and a 92px disc over its edge on a desktop;
          on a phone the board draws no band — the card carries the glow
          itself, and the disc sits beside the name. */}
      <section
        aria-label="Your profile"
        className="overflow-hidden rounded-[16px] bg-card max-sm:bg-[radial-gradient(360px_160px_at_100%_0%,oklch(var(--brand-amber-inverted)/0.24),transparent_70%)] max-sm:p-3.5"
      >
        <div aria-hidden="true" className={`${COVER_PERSON} max-sm:hidden`} />
        <div className="flex flex-wrap items-end justify-between gap-4 px-[30px] pb-6 max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5 max-sm:p-0">
          <div className="-mt-[46px] flex min-w-0 flex-col gap-2 max-sm:mt-0 max-sm:flex-row max-sm:items-center max-sm:gap-3">
            <span
              aria-hidden="true"
              className="grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full bg-primary text-[32px] font-semibold text-primary-foreground ring-[5px] ring-card max-sm:h-[52px] max-sm:w-[52px] max-sm:text-[18px] max-sm:ring-0"
            >
              {initialsOf(shownName)}
            </span>
            <div className="flex min-w-0 flex-col gap-2 max-sm:gap-0.5">
              <h1 className={`${PAGE_TITLE} [overflow-wrap:anywhere]`}>{shownName ?? "Your account"}</h1>
              {/* The board's headline. The profile has no headline of its
                  own: the line here is the start of what this person wrote
                  about themselves, and nothing when they wrote nothing. */}
              {authored?.bio ? (
                <p className="m-0 line-clamp-2 max-w-[60ch] text-copy">{authored.bio}</p>
              ) : null}
            </div>
          </div>
          <div
            className={`flex flex-wrap items-center gap-3.5 max-sm:grid max-sm:gap-2 ${
              publicHref ? "max-sm:grid-cols-2" : "max-sm:grid-cols-1"
            }`}
          >
            {publicHref ? (
              <AppLink
                href={publicHref}
                className="inline-flex min-h-[40px] items-center gap-1.5 text-[13px] font-semibold text-amber-ink no-underline hover:underline max-sm:min-h-[44px] max-sm:justify-center max-sm:rounded-full max-sm:bg-foreground/[0.06] max-sm:text-[15px] max-sm:text-foreground"
              >
                <span className="max-sm:hidden">View public profile</span>
                <span className="sm:hidden">Public profile</span>
                <Glyph d={GLYPH_OUT} size={13} />
              </AppLink>
            ) : null}
            <AppLink href="/me/settings" className={`${BTN_SOFT} px-5`}>
              <Glyph d={GLYPH_EDIT} size={14} />
              Edit profile
            </AppLink>
          </div>
        </div>
      </section>

      <div className="flex items-start gap-7 max-md:flex-col max-md:items-stretch max-md:gap-2.5">
        <div className="w-[260px] shrink-0 max-md:w-auto">
          <MeSections active={section} counts={counts} />
        </div>

        <section
          aria-labelledby="me-section-title"
          data-me-section={section}
          className="flex min-w-0 max-w-[760px] flex-1 flex-col gap-3.5 max-md:max-w-none max-sm:gap-2.5"
        >
          {/* The section's name: a heading beside the switcher on a desktop.
              On a phone the lit pill already says it, so it stays for the
              outline only. */}
          <h2
            id="me-section-title"
            className="m-0 mb-0.5 text-[20px] font-semibold tracking-[-0.015em] text-foreground max-md:sr-only"
          >
            {title}
          </h2>

          {section === "saved" && params.error === "save_failed" ? (
            <p role="status" className={`m-0 ${NOTICE_WARN}`}>
              That change was not saved. Try again in a moment.
            </p>
          ) : null}

          {section === "products" ? (
            myListings ? <ProductsSection listings={myListings} /> : <SectionUnavailable />
          ) : null}
          {section === "saved" ? (
            mySaved ? <SavedSection products={mySaved} /> : <SectionUnavailable />
          ) : null}
          {section === "seats" ? (
            mySeats ? <SeatsSection applications={mySeats} /> : <SectionUnavailable />
          ) : null}
        </section>
      </div>
    </main>
  );
}
