import type { ContributorApplication, PublicProfileCard } from "@openproduct/contracts";

import { BTN_INK, BTN_SOFT_SMALL, FOCUS, NOTICE, SEAT_RING } from "../ui/design";
import { AppLink } from "../ui/link";
import { ProductTile } from "../ui/product-tile";
import { absoluteOf } from "../ui/time";
import { GLYPH_CLOCK, GLYPH_SAVED, Glyph } from "./glyph";
import type { MyListing } from "./listings";
import { ME_EMPTY, ME_LIST } from "./nav";

/**
 * The three sections of `/me`, each a list of the boards' flat cards
 * (openproduct-redesign OPR1, boards `Me` and `PhoneMe`).
 *
 * EVERY ROW SHOWS WHAT THE READ HOLDS AND NOTHING ELSE. The boards draw a
 * product's stage and milestones, a saved post's new version, a seat's role
 * title: none of those is in today's reads (they arrive with OPR2 and OPR3),
 * so none is drawn — no bar at zero, no placeholder title.
 */

/**
 * THE ROW IS THE TARGET, not the twenty pixels of its name: the name's link
 * is stretched over the whole card, and the row's own control sits above the
 * stretch (`ABOVE`) so it stays a control of its own. One link per row for a
 * keyboard, the whole card for a finger.
 */
const STRETCH = `after:absolute after:inset-0 after:rounded-[16px] after:content-[''] ${FOCUS}`;
const ABOVE = "relative z-[1]";

/** The row's name: 16px/600, the card title's 18px on a phone. */
const NAME = `text-[16px] font-semibold text-foreground no-underline hover:underline max-sm:text-card-title max-sm:tracking-[-0.015em] ${STRETCH}`;

/** The line under a name: 13px in `--muted`. */
const META = "text-[13px] text-muted-foreground";

/** A section whose read failed. Said, rather than drawn as an empty list:
 *  "nothing saved" over a service that was down is a false statement (OD5). */
export function SectionUnavailable() {
  return (
    <p role="status" className={`m-0 ${NOTICE}`}>
      This list could not be loaded right now. Reload in a moment.
    </p>
  );
}

/** What stands between a draft and publishing, when something does — the
 *  studio's own two words for it. */
function draftNote(listing: MyListing): string | null {
  if (listing.visibility === "public") return null;
  if (!listing.workspaceLinkedAt) return "needs workspace link";
  if (!listing.reviewedAt) return "awaiting review";
  return null;
}

/**
 * Your products: every listing this person maintains — the studio's own
 * read, so the two can never disagree about what is yours.
 *
 * MANAGE GOES TO THE STUDIO. That is where a maker manages a product today;
 * OPR2 moves managing onto the product page itself, and this link moves with
 * it. The name goes to the public page once there is one, and to the same
 * studio page while the listing is a draft nobody else can open.
 */
export function ProductsSection({ listings }: { listings: MyListing[] }) {
  if (listings.length === 0) return <p className={ME_EMPTY}>No products yet.</p>;
  return (
    <ul className={ME_LIST} data-me-products>
      {listings.map((listing) => {
        const manage = `/studio/${encodeURIComponent(listing.orgId)}/${encodeURIComponent(listing.id)}`;
        const published = listing.visibility === "public";
        const view = published ? `/${listing.slug}` : manage;
        // The state rides the meta line — nothing takes its own row for it.
        const meta = [published ? "Published" : "Draft", draftNote(listing), listing.tagline]
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(" · ");
        return (
          <li
            key={listing.id}
            className="relative flex flex-wrap items-center gap-3.5 rounded-[16px] bg-card p-[18px] max-sm:gap-3 max-sm:p-3.5"
          >
            <ProductTile slug={listing.slug} thumbnail={listing.thumbnail} size={52} />
            <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5 max-sm:flex-[1_1_0%]">
              <div className="flex flex-wrap items-center gap-x-2">
                <AppLink href={view} className={NAME}>
                  {listing.slug}
                </AppLink>
                <span className="font-mono text-mono-label uppercase text-amber-ink">Maker</span>
              </div>
              <span className={`${META} line-clamp-2`}>{meta}</span>
            </div>
            <AppLink href={manage} prefetch="auto" className={`${BTN_INK} ${ABOVE}`}>
              Manage
            </AppLink>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Saved: the visitor's private list (OPC-3). Only PUBLIC cards ever arrive —
 * the repository re-asserts visibility at read time, so a listing unpublished
 * after being saved simply disappears from here (and returns if re-published).
 *
 * UNSAVE IS A FORM, like every act on these pages: it posts to the route that
 * reads the session, and comes back to this section.
 */
export function SavedSection({ products }: { products: PublicProfileCard[] }) {
  if (products.length === 0) return <p className={ME_EMPTY}>Nothing saved.</p>;
  return (
    <ul className={ME_LIST} data-me-saved>
      {products.map((product) => (
        <li
          key={product.slug}
          className="relative flex items-center gap-3 rounded-[16px] bg-card p-[18px] max-sm:p-3.5"
        >
          <ProductTile slug={product.slug} thumbnail={product.thumbnail} size={44} />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppLink
              href={`/${product.slug}`}
              className={`font-semibold text-foreground no-underline hover:underline ${STRETCH}`}
            >
              {product.slug}
            </AppLink>
            {product.tagline ? <span className={`${META} line-clamp-2`}>{product.tagline}</span> : null}
          </div>
          <form
            method="post"
            action={`/me/unsave?slug=${encodeURIComponent(product.slug)}`}
            className={`shrink-0 ${ABOVE}`}
          >
            {/* A pill with its word on a desktop; a 44px disc on a phone,
                where the word stays as the control's name. */}
            <button
              type="submit"
              className={`${BTN_SOFT_SMALL} cursor-pointer border-0 max-sm:w-[44px] max-sm:px-0`}
            >
              <Glyph d={GLYPH_SAVED} size={13} className="max-sm:h-4 max-sm:w-4" />
              <span className="max-sm:sr-only">
                Unsave<span className="sr-only"> {product.slug}</span>
              </span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

/** The status, in the board's one word. A PROJECTION: it is a snapshot of
 *  the join request's answer, and the request is right (design.md §4). */
const SEAT_STATUS: Record<string, string> = {
  pending: "Requested",
  approved: "Approved",
  denied: "Not this time",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

/** The word's colour says the same thing as the word: teal while it waits
 *  (teal is seats), green for a yes, `--muted` for everything that ended. */
function seatStatusClass(status: string): string {
  if (status === "pending") return "font-semibold text-seat-ink";
  if (status === "approved") return "font-semibold text-success";
  return "font-semibold text-muted-foreground";
}

/**
 * Seats: the requests to join this person raised from listed products.
 *
 * THE BOARD'S TICKET — a notch cut into each side, a dashed ring, a dashed
 * rule — with what the read holds on it: the product, the status and the day.
 * The role's own title is not in this read, and today's flow has no act
 * that withdraws a request. Both are the board's, and neither is drawn
 * until the product can do it.
 */
export function SeatsSection({ applications }: { applications: ContributorApplication[] }) {
  if (applications.length === 0) return <p className={ME_EMPTY}>No seats requested.</p>;
  return (
    <ul className={ME_LIST} data-me-seats>
      {applications.map((application) => (
        <li
          key={application.id}
          className="relative flex flex-wrap items-center gap-4 rounded-[16px] bg-card px-[26px] py-4 max-sm:gap-3 max-sm:p-3.5"
        >
          {/* The ticket's two notches: the page's colour, cut into the card. */}
          <span
            aria-hidden="true"
            className="absolute -left-3 top-1/2 -mt-3 h-6 w-6 rounded-full bg-background max-sm:hidden"
          />
          <span
            aria-hidden="true"
            className="absolute -right-3 top-1/2 -mt-3 h-6 w-6 rounded-full bg-background max-sm:hidden"
          />
          <span
            aria-hidden="true"
            className={`${SEAT_RING} grid h-12 w-12 place-items-center border-2 text-seat max-sm:h-11 max-sm:w-11`}
          >
            <Glyph d={GLYPH_CLOCK} size={18} />
          </span>
          <div className="flex min-w-0 flex-[1_1_220px] flex-col border-l-2 border-dashed border-line pl-4 max-sm:flex-[1_1_0%] max-sm:gap-0.5 max-sm:border-l-0 max-sm:pl-0">
            {application.productSlug ? (
              <AppLink
                href={`/${application.productSlug}`}
                className={`text-card-title font-semibold tracking-[-0.015em] text-foreground no-underline hover:underline max-sm:leading-[1.2] ${STRETCH}`}
              >
                {application.productSlug}
              </AppLink>
            ) : (
              <span className="text-card-title font-semibold tracking-[-0.015em] text-muted-foreground">
                (listing removed)
              </span>
            )}
            <span className={META}>
              <span className={seatStatusClass(application.status)}>
                {SEAT_STATUS[application.status] ?? application.status}
              </span>
              {" · "}
              {absoluteOf(application.createdAt)}
            </span>
          </div>
          {application.status === "approved" ? (
            // OD-K — the approval's deep link, surfaced where the contributor
            // already looks. The console is reachable on this host
            // (host-rewrite passes /login through), so the path stays
            // host-relative.
            <AppLink href="/login" className={`${BTN_SOFT_SMALL} ${ABOVE}`}>
              Open your workspace
            </AppLink>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
