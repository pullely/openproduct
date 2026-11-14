// IN1 — the People step of a listing (openproduct-worldclass).
//
// Who is shown on the public page, and which roles are open. One step because
// they are one question asked twice — who is here, and who is wanted — and a
// maintainer editing one almost always looks at the other.
//
// DRAWN AS THE EDITOR WITH ITS PEOPLE CARD OPEN (openproduct redesign): the
// roster's rows with the label form under them, then the openings with a
// row each and the add form under those.
//
// Progressive enhancement, no client JS, the token never in the browser
// (OX5b): the form posts to the sibling `actions` route, which reads the
// session server-side. `from` tells that route which step to return to — a
// save that threw a maintainer back to the overview would make the steps
// worse than the one page they replaced.

import { BTN_OUTLINE, BTN_PRIMARY, FIELD, LABEL, TEXTAREA } from "../../../../ui/design";
import { BTN_GHOST, } from "../../../frame";
import { StudioLive } from "../../../live-save";
import { LISTING_VOCABULARY } from "../../../notices";
import { CompletenessPanel } from "../completeness-panel";
import { CARD_RULE, CancelLink, CardSubhead, EditorColumns, FORM_FOOT, stepHrefs } from "../editor";
import { loadListing } from "../listing-shell";
import { MaintainerRows, PeopleCard } from "../sections";

export const dynamic = "force-dynamic";

/** The design's row select: 32px, 13.5px, at its own width. */
const ROW_SELECT = `${FIELD.replace(" w-full", "").replace("h-[38px]", "h-[32px]")} w-[120px] text-[13px]`;
const ROW_INPUT = `${FIELD.replace("h-[38px]", "h-[32px]")} text-[13px]`;

export default async function ListingPeoplePage(props: {
  params: Promise<{ org: string; profile: string }>;
  searchParams: Promise<{ notice?: string; error?: string; why?: string; blockers?: string }>;
}) {
  const { org, profile: profileId } = await props.params;
  const loaded = await loadListing(org, profileId, await props.searchParams, `/studio/${org}/${profileId}/people`);
  if (loaded.kind === "failed") return loaded.element;
  const { profile, notice, blockers, action } = loaded.listing;
  const hrefs = stepHrefs(org, profileId);
  // Handles where there are handles, ids where there are not — never emails;
  // the API refuses one at the boundary and this never invents one. The label
  // is optional and rides after a pipe.
  //
  // openproduct-studio OSD7: a person with an ACTIVE handle is written as
  // `@handle`, which is what a maker can read and what core resolves back to
  // the same person on save (both sides use the active-holder rule). A person
  // without one keeps their id, so an old list round-trips untouched.
  const maintainerLines = profile.maintainers
    .map((m) => {
      const who = m.handle ? `@${m.handle}` : m.subjectId;
      return m.roleLabel ? `${who} | ${m.roleLabel}` : who;
    })
    .join("\n");

  return (
    <StudioLive vocabulary={LISTING_VOCABULARY} notice={notice} blockers={blockers} flush>
      <EditorColumns rail={<CompletenessPanel org={org} profileId={profileId} subject={profile} />}>
        <PeopleCard
          profile={profile}
          hrefs={hrefs}
          editing={
            <>
              <MaintainerRows maintainers={profile.maintainers} />
              {/* The published maintainers: what was typed, into what was
                  typed (OPP15, `data-live="stay"`). */}
              <form method="post" action={action} data-live="stay" className="mt-2 grid max-w-[70ch] gap-3">
                <input type="hidden" name="intent" value="maintainers" />
                <input type="hidden" name="from" value="people" />
                <div>
                  <label htmlFor="maintainers" className={LABEL}>
                    Who appears, one per line
                  </label>
                  <textarea
                    id="maintainers"
                    name="maintainers"
                    rows={4}
                    defaultValue={maintainerLines}
                    placeholder="@handle | maintainer"
                    className={`${TEXTAREA} font-mono text-[13px]`}
                  />
                  <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-muted-foreground">
                    <span className="font-mono">@handle | label</span> — the label is yours to write. The handle
                    is the name on their contributor page.
                  </p>
                </div>
                <div className={FORM_FOOT}>
                  <button type="submit" className={BTN_PRIMARY}>
                    Save maintainers
                  </button>
                  <CancelLink href={hrefs.overview} />
                </div>
              </form>

              {/* ── role openings ── */}
              <div className={CARD_RULE}>
                <CardSubhead>Where it needs people</CardSubhead>
                <ul className="m-0 mt-1 list-none p-0">
                  {profile.roleOpenings.map((opening) => (
                    <li key={opening.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-2.5">
                      {/* Editing an opening in place: what was typed, into what
                          was typed (OPP15). The form below that MAKES one reloads. */}
                      <form
                        method="post"
                        action={action}
                        data-live="stay"
                        className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="intent" value="opening-save" />
                        <input type="hidden" name="from" value="people" />
                        <input type="hidden" name="openingId" value={opening.id} />
                        <label className="sr-only" htmlFor={`t-${opening.id}`}>
                          Title
                        </label>
                        <input
                          id={`t-${opening.id}`}
                          name="title"
                          type="text"
                          required
                          maxLength={120}
                          defaultValue={opening.title}
                          className={`${ROW_INPUT} min-w-[180px] flex-1`}
                        />
                        <label className="sr-only" htmlFor={`s-${opening.id}`}>
                          Status of {opening.title}
                        </label>
                        <select id={`s-${opening.id}`} name="status" defaultValue={opening.status} className={ROW_SELECT}>
                          <option value="open">Open</option>
                          <option value="filled">Filled</option>
                          <option value="closed">Closed</option>
                        </select>
                        <button type="submit" className={`${BTN_OUTLINE} h-[32px] px-2.5 text-[13px]`}>
                          Save
                        </button>
                      </form>
                      <form method="post" action={action}>
                        <input type="hidden" name="intent" value="opening-delete" />
                        <input type="hidden" name="from" value="people" />
                        <input type="hidden" name="openingId" value={opening.id} />
                        <button type="submit" className="tap text-[13px] text-muted-foreground underline underline-offset-4">
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                {/* An ADD: it puts a row on this page, so the page comes back
                    with it (OPP15). A background post would leave the new
                    opening invisible beneath a box still holding the words
                    that made it. */}
                <form method="post" action={action} className="mt-2.5 flex flex-wrap items-end gap-2.5">
                  <input type="hidden" name="intent" value="opening-save" />
                  <input type="hidden" name="from" value="people" />
                  <div className="min-w-[200px] flex-1">
                    <label className={LABEL} htmlFor="new-title">
                      New opening
                    </label>
                    <input
                      id="new-title"
                      name="title"
                      type="text"
                      required
                      maxLength={120}
                      placeholder="Design lead"
                      className={FIELD}
                    />
                  </div>
                  <button type="submit" className={BTN_OUTLINE}>
                    Add
                  </button>
                  <CancelLink href={hrefs.overview} />
                </form>
              </div>
            </>
          }
        />
      </EditorColumns>
    </StudioLive>
  );
}

// `BTN_GHOST` is what `CancelLink` wears; imported here so the people step's
// own quiet controls sit on the same token if one is ever added.
void BTN_GHOST;
