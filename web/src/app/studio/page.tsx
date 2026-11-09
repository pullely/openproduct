import { AppLink } from "../ui/link";
import { NO_ACTS } from "./notices";
import { redirect } from "next/navigation";

import { readSession } from "../auth/session-server";
import { consoleOrigin } from "../../lib/platform";
import { BTN_OUTLINE } from "../ui/design";
import { FailurePanel } from "../ui/failure";
import { ProductTile } from "../ui/product-tile";
import { BTN_GHOST, GLYPH_PENCIL, Glyph, StatusChip, StudioFrame, StudioPanel } from "./frame";
import { fetchMyListings, type StudioListing } from "./studio-api";
import { LINK_WORKSPACE_LABEL, consoleWorkspacePickerUrl } from "./workspace-picker";

/**
 * The maintainer studio's landing (openproduct-independence OX5b): every
 * listing this subject maintains, across workspaces — answered from
 * openproduct's own `listing_maintainers`, which is why this page can live
 * here at all. A server component with an explicit session read, exactly like
 * /me (design.md §1); never cached.
 *
 * THE DESIGN'S LIST: one card, a row per listing — the 44px tile, the name
 * with its status pill and the line under it, and on the right a quiet
 * `View` for a published one and an outlined `Edit` for all of them.
 */
export const dynamic = "force-dynamic";

const RETURN_TO = "/signin?return_to=%2Fstudio";

/** What stands between a draft and publishing, when something does. */
function draftNote(listing: StudioListing): string | null {
  if (listing.visibility === "public") return null;
  if (!listing.workspaceLinkedAt) return "needs workspace link";
  if (!listing.reviewedAt) return "awaiting review";
  return null;
}

export default async function StudioPage() {
  const session = await readSession();
  if (!session) redirect(RETURN_TO);

  const result = await fetchMyListings(session.accessToken);
  if (result.kind === "unauthorized") redirect(RETURN_TO);

  const consoleUrl = consoleOrigin();
  const pickerUrl = consoleWorkspacePickerUrl(consoleUrl);

  // XP3 — the two stops, through the same component the public routes use. A
  // maintainer who cannot load their listings is in the same position as a
  // visitor who cannot load a page: they need to know whether waiting helps,
  // and they need somewhere to go that is not a retry.
  if (result.kind === "unavailable" || result.kind === "refused") {
    return (
      <FailurePanel
        kind="unavailable"
        what="Your listings could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: "/studio" },
          ...(consoleUrl ? [{ label: "Open the console", href: `${consoleUrl}/orgs` }] : []),
        ]}
      />
    );
  }

  return (
    <StudioFrame
      vocabulary={NO_ACTS}
      crumbs={[{ label: "Listings" }]}
      title="Your listings"
      status={
        <>
          {/*
            AC2c — THE SUBJECT ID CAME OUT, and it is a small improvement
            wearing a security fix's clothes.

            It was read straight off the cookie, which makes it the one field
            in this app that was rendered without anything having resolved it
            — the exact pattern `cookie-is-not-authority.test.ts` watches for.
            Harmless here (a forger paints their own header in their own
            browser) but it is the shape that stops being harmless the moment
            somebody uses it for a decision.

            And it was `usr_0123456789abcdef…` on the screen: an opaque id
            that answers "who am I signed in as" with a string no human can
            check. The honest version of that line is the one that does not
            claim to.
          */}
          Signed in ·{" "}
          <a className="underline underline-offset-4" href="/auth/signout">
            Sign out
          </a>
        </>
      }
    >
      {result.data.listings.length === 0 ? (
        // openproduct-studio OSD7 — THE EMPTY STATE IS THE FIRST STEP: say
        // where a listing comes from. It is bound to an openproduct workspace,
        // either one the maker already has (the console's picker, S13) or a
        // new one Open a build makes (S10), and comes back here to be filled.
        <StudioPanel title="No listings yet.">
          <p className="m-0">
            A listing is bound to one of your openproduct workspaces.{" "}
            <a className="underline underline-offset-4" href={pickerUrl}>
              Link a workspace you already have
            </a>
            , or{" "}
            <AppLink className="underline underline-offset-4" href="/submit">
              open a build
            </AppLink>{" "}
            to start a new one. It appears here as a draft to fill in and publish.
          </p>
          <div className="mt-4">
            <a href={pickerUrl} className={`${BTN_OUTLINE} no-underline`}>
              {LINK_WORKSPACE_LABEL}
            </a>
          </div>
        </StudioPanel>
      ) : (
        <>
          <ul className="m-0 grid list-none gap-[14px] p-0" data-studio-tiles>
            {result.data.listings.map((listing) => {
              const href = `/studio/${encodeURIComponent(listing.orgId)}/${encodeURIComponent(listing.id)}`;
              const published = listing.visibility === "public";
              const note = draftNote(listing);
              return (
                <li
                  key={listing.id}
                  className="flex flex-wrap items-center gap-x-[18px] gap-y-3 rounded-[20px] border border-border bg-card px-7 py-5 max-sm:px-4 max-sm:py-4"
                >
                  <AppLink prefetch="auto" href={href} tabIndex={-1} aria-hidden="true" className="shrink-0">
                    <ProductTile slug={listing.slug} thumbnail={listing.thumbnail} size={72} phoneSize={52} />
                  </AppLink>
                  <div className="min-w-[200px] flex-1 max-sm:min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AppLink
                        prefetch="auto"
                        href={href}
                        className="text-[19px] font-semibold leading-[1.25] tracking-[-0.015em] text-foreground no-underline hover:text-copy"
                      >
                        {listing.slug}
                      </AppLink>
                      <StatusChip published={published} />
                      {note ? <span className="text-[13px] text-muted-foreground">{note}</span> : null}
                    </div>
                    {listing.tagline ? (
                      <p className="m-0 mt-1 text-[15px] leading-[1.5] text-copy">{listing.tagline}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {published ? (
                      <AppLink prefetch="auto" href={`/${listing.slug}`} className={`${BTN_GHOST} no-underline`}>
                        View
                      </AppLink>
                    ) : null}
                    <AppLink prefetch="auto" href={href} className={`${BTN_OUTLINE} gap-2 no-underline`}>
                      <Glyph d={GLYPH_PENCIL} />
                      Edit
                    </AppLink>
                  </div>
                </li>
              );
            })}
          </ul>
          {/* The two doors to a new listing: link an openproduct workspace
              the maker already has (the console's picker, S13), or open a
              build, which makes a new one (S10). */}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href={pickerUrl} className={`${BTN_OUTLINE} no-underline`}>
              {LINK_WORKSPACE_LABEL}
            </a>
            <p className="m-0 text-[13px] leading-[1.55] text-muted-foreground">
              Pick one of your openproduct workspaces, or{" "}
              <AppLink className="underline underline-offset-4 hover:text-foreground" href="/submit">
                open a build
              </AppLink>{" "}
              to start a new one.
            </p>
          </div>
        </>
      )}
    </StudioFrame>
  );
}
