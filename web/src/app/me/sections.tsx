import { makerPath, type ContributorApplication, type MeFollowing, type PublicProfileCard } from "@openproduct/contracts";

import { composeDraftPath } from "../[slug]/new/compose";
import { initialsOf } from "../shell/shell";

import { BTN_INK, BTN_SOFT, BTN_SOFT_SMALL, FOCUS, NOTICE, SEAT_RING } from "../ui/design";
import { AppLink } from "../ui/link";
import { ProductTile } from "../ui/product-tile";
import { absoluteOf } from "../ui/time";
import { LINK_WORKSPACE_LABEL } from "../ui/workspace-picker";
import { MilestoneSegments } from "../ui/stage-mark";
import { stageWord } from "../ui/stage";

import { GLYPH_CLOCK, GLYPH_EDIT, GLYPH_SAVED, Glyph } from "./glyph";
import type { MyListing } from "./listings";
import { ME_EMPTY, ME_LIST } from "./nav";
import { draftProgress, draftTitle, manageHref, standingLine, type MyDraft, type MyProductStanding } from "./products";

/**
 * The five sections of `/me`, each a list of the boards' flat cards
 * (openproduct-redesign OPR1 and OPR-3, boards `Me` and `PhoneMe`).
 *
 * EVERY ROW SHOWS WHAT THE READ HOLDS AND NOTHING ELSE. A product's stage,
 * its milestones and its open seats are drawn from its public document, and
 * only for a product that has one; a saved post's new version and a seat's
 * role title are not in any read, so neither is drawn — no bar at zero, no
 * placeholder title.
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
 * THE ROW SAYS WHERE THE PRODUCT STANDS (OPR-3): its stage, how many of its
 * milestones shipped — with the bar — and how many seats it has open, read
 * from the product's own public document (`standings`, by slug). A draft has
 * no public page and so no standing: its row says Draft, and what stands
 * between it and publishing.
 *
 * MANAGE GOES TO THE PRODUCT'S PAGE (`manageHref`): the page is the
 * dashboard. A draft, which has no page yet, goes to its settings.
 *
 * THE TWO DOORS TO A NEW PRODUCT sit under the list, as they did under the
 * studio's (this section is what `/studio` was): link a workspace you
 * already have — the console's picker — or open a build, which makes one.
 */
export function ProductsSection({
  listings,
  standings = {},
  pickerUrl,
}: {
  listings: MyListing[];
  standings?: Readonly<Record<string, MyProductStanding | null>>;
  /** The console's workspace picker (seam edge S13). */
  pickerUrl?: string;
}) {
  const doors = (
    <div className="flex flex-wrap items-center gap-2.5" data-me-product-doors>
      {pickerUrl ? (
        <a href={pickerUrl} className={`${BTN_SOFT} ${FOCUS}`}>
          {LINK_WORKSPACE_LABEL}
        </a>
      ) : null}
      <AppLink href="/submit" className={`${BTN_SOFT} ${FOCUS}`}>
        Open a build
      </AppLink>
    </div>
  );
  if (listings.length === 0) {
    return (
      <>
        <p className={ME_EMPTY}>No products yet.</p>
        {doors}
      </>
    );
  }
  return (
    <>
    <ul className={ME_LIST} data-me-products>
      {listings.map((listing) => {
        const manage = manageHref(listing);
        const published = listing.visibility === "public";
        const standing = published ? (standings[listing.slug] ?? null) : null;
        // The state rides the meta line — nothing takes its own row for it.
        const meta = (
          standing
            ? [standingLine(standing)]
            : [published ? "Published" : "Draft", draftNote(listing), listing.tagline]
        )
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(" · ");
        return (
          <li
            key={listing.id}
            data-me-product-stage={standing?.stage}
            className="relative flex flex-wrap items-center gap-3.5 rounded-[16px] bg-card p-[18px] max-sm:gap-3 max-sm:p-3.5"
          >
            <ProductTile slug={listing.slug} thumbnail={listing.thumbnail} size={52} />
            <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5 max-sm:flex-[1_1_0%]">
              <div className="flex flex-wrap items-center gap-x-2">
                <AppLink href={manage} className={NAME}>
                  {listing.slug}
                </AppLink>
                <span className="font-mono text-mono-label uppercase text-amber-ink">Maker</span>
              </div>
              <span className={`${META} line-clamp-2`}>{meta}</span>
              {standing?.stage === "shipping" ? (
                <MilestoneSegments counts={standing.milestoneCounts} className="max-w-[240px] pt-1.5" />
              ) : null}
            </div>
            <AppLink href={manage} prefetch="auto" className={`${BTN_INK} ${ABOVE}`}>
              Manage
            </AppLink>
          </li>
        );
      })}
    </ul>
    {doors}
    </>
  );
}

/**
 * Following: the products and the people this person follows (board `Me`) —
 * one card, a row each: the tile (a disc for a person), the name, what it is,
 * and Unfollow.
 *
 * UNFOLLOW IS A FORM, like every act on these pages: it posts to the route
 * that reads the session and comes back to this section.
 */
export function FollowingSection({ following }: { following: MeFollowing }) {
  if (following.products.length === 0 && following.people.length === 0) {
    return <p className={ME_EMPTY}>You don’t follow anything yet.</p>;
  }
  const back = encodeURIComponent("/me?section=following");
  const row = "flex items-center gap-3 px-3 py-2.5";
  const unfollow = `${BTN_SOFT_SMALL} cursor-pointer border-0`;
  return (
    <ul className="m-0 list-none rounded-[16px] bg-card px-2 py-1.5" data-me-following>
      {following.products.map((product) => (
        <li key={`product:${product.slug}`} className={row}>
          <ProductTile slug={product.slug} thumbnail={product.logo} size={40} />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppLink href={`/${product.slug}`} className={`self-start font-semibold text-foreground no-underline hover:underline ${FOCUS}`}>
              {product.name}
            </AppLink>
            <span className={META}>Product · {stageWord(product.stage)}</span>
          </div>
          <form method="post" action={`/me/follow?kind=listing&value=${encodeURIComponent(product.slug)}&on=0&return_to=${back}`} className="shrink-0">
            <button type="submit" className={unfollow}>
              Unfollow<span className="sr-only"> {product.name}</span>
            </button>
          </form>
        </li>
      ))}
      {following.people.map((person) => {
        const name = person.displayName ?? `@${person.handle}`;
        return (
          <li key={`person:${person.handle}`} className={row}>
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-[13px] font-semibold text-foreground"
            >
              {initialsOf(person.displayName ?? person.handle)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <AppLink href={makerPath(person.handle)} className={`self-start font-semibold text-foreground no-underline hover:underline ${FOCUS}`}>
                {name}
              </AppLink>
              <span className={META}>Person</span>
            </div>
            <form method="post" action={`/me/follow?kind=person&value=${encodeURIComponent(person.handle)}&on=0&return_to=${back}`} className="shrink-0">
              <button type="submit" className={unfollow}>
                Unfollow<span className="sr-only"> {name}</span>
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Drafts: the posts that are written and not out, across the products this
 * person is on the crew of (board `Me`). Each says what it is, which product
 * it is for and how many of its required blocks are filled; Continue opens
 * it in the builder.
 */
export function DraftsSection({ drafts }: { drafts: MyDraft[] }) {
  if (drafts.length === 0) return <p className={ME_EMPTY}>No drafts.</p>;
  return (
    <ul className={ME_LIST} data-me-drafts>
      {drafts.map(({ slug, post }) => {
        const title = draftTitle(post);
        return (
          <li
            key={post.id}
            className="relative flex flex-wrap items-center gap-3.5 rounded-[16px] bg-card p-[18px] max-sm:gap-3 max-sm:p-3.5"
          >
            <span aria-hidden="true" className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[12px] bg-idea-soft text-idea">
              <Glyph d={GLYPH_EDIT} size={18} />
            </span>
            <div className="flex min-w-0 flex-[1_1_220px] flex-col max-sm:flex-[1_1_0%]">
              <span className="font-semibold text-foreground [overflow-wrap:anywhere]">
                {title.kind}
                {title.headline ? <span className="font-normal text-copy"> {title.headline}</span> : null}
              </span>
              <span className={META}>
                for {slug} · {draftProgress(post)}
              </span>
            </div>
            <AppLink href={composeDraftPath(slug, post.id)} className={`${BTN_INK} ${ABOVE}`}>
              Continue<span className="sr-only"> {title.kind} for {slug}</span>
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
