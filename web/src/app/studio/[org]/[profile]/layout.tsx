// The listing editor's frame, drawn ONCE (openproduct-studio OSD5).
//
// Every step used to be the whole editor: each page read the session and the
// profile, then rendered the head row, the hero card and the strip before the
// one card that differed. There was no layout under `studio/`, so a tab click
// threw all of it away and waited for every read before painting anything —
// the old page frozen under the progress bar.
//
// A layout persists across sibling navigations. The head, the hero and the
// strip live here and stay on screen while a tab click fetches only its step;
// each step's `loading.tsx` paints the card's skeleton under them at once.
// The strip learns which tab is current from the router (`step-strip.tsx`),
// because a layout is not re-rendered to be told.
//
// A save still refreshes this frame: every mutation ends in a 303 or in
// `router.refresh()`, and a refresh re-renders layouts too — so a new name
// or a publish lands in the hero without a second mechanism.

import type { ReactNode } from "react";

import { logoOf, thumbnailOf } from "@openproduct/contracts";

import { publicApiBase } from "../../../public-api";
import { EditorHead, ListingHero, stepHrefs } from "./editor";
import { loadListing, readMedia, StepStrip } from "./listing-shell";
import { LogoControl } from "./logo-control";

export const dynamic = "force-dynamic";

/** The editor's measure: 1180px, the design's editor width. */
const EDITOR_MAIN = "box-border mx-auto w-full max-w-[1180px] px-7 pb-[72px] pt-5 max-sm:px-4";

export default async function ListingLayout(props: {
  params: Promise<{ org: string; profile: string }>;
  children: ReactNode;
}) {
  const { org, profile: profileId } = await props.params;
  // No notice here — a layout sees no search params. The step under it reads
  // the same profile through the same `cache`, so this is one round trip.
  // The media rows leave beside the profile (OPP15's rule): the hero's tile
  // is the logo control, and it draws the logo it would replace (OSD4).
  const loaded = await loadListing(org, profileId, {}, `/studio/${org}/${profileId}`, (token) =>
    readMedia(token, org, profileId),
  );
  if (loaded.kind === "failed") return loaded.element;
  const { profile, action } = loaded.listing;
  const hrefs = stepHrefs(org, profileId);
  const media = loaded.also.kind === "ok" ? loaded.also.data.media : [];
  const logoRow = logoOf(media);
  const thumb = thumbnailOf(media);
  const logo = logoRow && thumb ? { ...thumb, id: logoRow.value.id } : null;

  return (
    <main className={EDITOR_MAIN}>
      <EditorHead
        back={{ href: "/studio", label: "Your listings" }}
        profile={profile}
        action={action}
        publishHref={`${hrefs.overview}#publish`}
      />

      <div className="mt-7">
        <ListingHero
          profile={profile}
          hrefs={hrefs}
          action={action}
          strip={<StepStrip org={org} profileId={profileId} />}
          tile={
            <LogoControl
              slug={profile.slug}
              logo={logo}
              action={action}
              mediaHref={hrefs.media}
              apiBase={publicApiBase()}
            />
          }
        />
      </div>

      {props.children}
    </main>
  );
}
