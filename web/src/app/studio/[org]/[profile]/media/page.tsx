// MD2 — the Media step of a listing (openproduct-worldclass).
//
// WHAT A MAINTAINER CAN PUT HERE, AND WHAT THEY CANNOT. One hero and up to
// eight gallery images — the authored kinds. Never a screenshot: that kind is
// OBSERVED, the sweep captures it from the listing's live address (MD4), and
// a door for uploading one would be a maker choosing their own observation
// (WC-3).
//
// DRAWN AS THE EDITOR WITH ITS MEDIA CARD OPEN (openproduct redesign): the
// rows with their Remove, and the upload form under them.
//
// Progressive enhancement, no client JS, the token never in the browser
// (OX5b): the form posts multipart to the sibling `actions` route, which
// reads the session server-side and relays the bytes to the gateway. The
// gateway sniffs, stores and asks core for the row (MD1); its refusals come
// back as the notice, in the gateway's own words.

import {
  GALLERY_MAX,
  MEDIA_ALT_MAX,
  MEDIA_MAX_BYTES,
  MEDIA_MIN_HEIGHT,
  MEDIA_MIN_WIDTH,
  LOGO_MIN_SIDE,
  galleryOf,
  heroOf,
  logoOf,
  type MediaFact,
} from "@openproduct/contracts";

import { nextGalleryPosition } from "../../../../[slug]/media";
import { publicApiBase } from "../../../../public-api";
import { BTN_PRIMARY, FIELD, LABEL } from "../../../../ui/design";
import { StudioLive } from "../../../live-save";
import { LISTING_VOCABULARY } from "../../../notices";
import { CompletenessPanel } from "../completeness-panel";
import { CARD_FORM, CancelLink, EditorColumns, FIELD_PAIR, FORM_FOOT, stepHrefs } from "../editor";
import { loadListing, readMedia } from "../listing-shell";
import { MediaCard } from "../sections";
import { MediaIsland } from "./media-island";

export const dynamic = "force-dynamic";

export default async function ListingMediaPage(props: {
  params: Promise<{ org: string; profile: string }>;
  searchParams: Promise<{ notice?: string; error?: string; why?: string; blockers?: string }>;
}) {
  const { org, profile: profileId } = await props.params;
  const here = `/studio/${org}/${profileId}/media`;
  // BOTH READS AT ONCE (OPP15). The rows do not depend on the profile, and
  // awaiting them afterwards cost this step a second round trip to Singapore
  // for nothing — the one page in the studio that was slower than the rest,
  // and the only one that read the session twice to be so.
  //
  // The rows come through the maintainer door (draft or not). A read that
  // fails renders the form over an empty list with a sentence saying so,
  // rather than a failure panel: the maintainer can still upload.
  const loaded = await loadListing(org, profileId, await props.searchParams, here, (token) =>
    readMedia(token, org, profileId),
  );
  if (loaded.kind === "failed") return loaded.element;
  const { profile, notice, blockers, action } = loaded.listing;
  const hrefs = stepHrefs(org, profileId);

  const rows = loaded.also;
  const media: readonly MediaFact[] = rows.kind === "ok" ? rows.data.media : [];
  const hero = heroOf(media);
  const logo = logoOf(media);
  const galleryFull = galleryOf(media).length >= GALLERY_MAX;

  return (
    <StudioLive vocabulary={LISTING_VOCABULARY} notice={notice} blockers={blockers} flush>
      <EditorColumns rail={<CompletenessPanel org={org} profileId={profileId} subject={profile} />}>
        {/* OSD6 — the island takes the card over once it hydrates; until then,
            and without script, the server's card and form below are the page. */}
        <MediaIsland media={media} action={action} apiBase={publicApiBase()}>
          <MediaCard
            media={media}
            unreadable={rows.kind !== "ok"}
            apiBase={publicApiBase()}
            action={action}
            hrefs={hrefs}
            from="media"
            editing={
              // An upload puts a row on this page, so the page comes back with
              // it (OPP15): no `data-live`.
              <form id="upload" method="post" action={action} encType="multipart/form-data" className={CARD_FORM}>
                <input type="hidden" name="intent" value="upload-media" />
                <input type="hidden" name="from" value="media" />
                <input type="hidden" name="position" value={String(nextGalleryPosition(media))} />
                <div className={FIELD_PAIR}>
                  <div>
                    <label htmlFor="kind" className={LABEL}>
                      Where it goes
                    </label>
                    <select id="kind" name="kind" defaultValue={!logo ? "logo" : hero ? "gallery" : "hero"} className={FIELD}>
                      <option value="logo">{logo ? "Logo — replaces the current one" : "Logo"}</option>
                      <option value="hero">{hero ? "Hero — replaces the current one" : "Hero"}</option>
                      <option value="gallery" disabled={galleryFull}>
                        {galleryFull
                          ? `Gallery — full (${GALLERY_MAX} of ${GALLERY_MAX})`
                          : `Gallery — position ${nextGalleryPosition(media) + 1}`}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="file" className={LABEL}>
                      The file
                    </label>
                    <input
                      id="file"
                      name="file"
                      type="file"
                      required
                      accept="image/png,image/jpeg,image/webp"
                      aria-describedby="file-note"
                      className="block w-full pt-1.5 text-[13px]"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="alt" className={LABEL}>
                    What the image shows
                  </label>
                  <input
                    id="alt"
                    name="alt"
                    type="text"
                    required
                    maxLength={MEDIA_ALT_MAX}
                    placeholder="The dashboard, with a week of merges charted"
                    aria-describedby="file-note"
                    className={FIELD}
                  />
                  <p id="file-note" className="m-0 mt-1.5 text-[13px] leading-[1.5] text-muted-foreground">
                    One sentence describing the picture. PNG, JPEG or WebP, up to{" "}
                    {Math.round(MEDIA_MAX_BYTES / 1024 / 1024)} MB. A logo is square and at least {LOGO_MIN_SIDE}×
                    {LOGO_MIN_SIDE}; a hero or gallery image is at least {MEDIA_MIN_WIDTH}×{MEDIA_MIN_HEIGHT} pixels.
                  </p>
                </div>
                <div className={FORM_FOOT}>
                  <button type="submit" className={BTN_PRIMARY}>
                    Add image
                  </button>
                  <CancelLink href={hrefs.overview} />
                </div>
              </form>
            }
          />
        </MediaIsland>
      </EditorColumns>
    </StudioLive>
  );
}
