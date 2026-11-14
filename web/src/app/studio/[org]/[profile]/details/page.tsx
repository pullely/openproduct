// IN1 — the Details step of a listing (openproduct-worldclass).
//
// The listing's own words — the name, the sentence under it, the pitch, the
// install line and the two links — plus the repository check, which is the
// one act that turns a typed URL into an OBSERVED fact (OPC-2). They are one
// step because a maintainer filling in a repository URL wants to check it in
// the same breath.
//
// DRAWN AS THE EDITOR WITH ITS ABOUT CARD OPEN (openproduct redesign): the
// hero above, the form where the pitch is printed, the rail beside it with
// the check under the fields it fills.
//
// Progressive enhancement, no client JS, the token never in the browser
// (OX5b): the form posts to the sibling `actions` route, which reads the
// session server-side. `from` tells that route which step to return to — a
// save that threw a maintainer back to the overview would make the steps
// worse than the one page they replaced.

import {
  MAX_INSTALL_LINE,
  hasObservation,
  importedStack,
  importedValue,
} from "@openproduct/contracts";

import { BTN_OUTLINE, BTN_PRIMARY, FIELD, LABEL, TEXTAREA } from "../../../../ui/design";
import { StudioLive } from "../../../live-save";
import { LISTING_VOCABULARY } from "../../../notices";
import { CompletenessPanel } from "../completeness-panel";
import {
  CARD_FORM,
  CARD_RULE,
  CancelLink,
  CardSubhead,
  EditorColumns,
  FIELD_PAIR,
  FORM_FOOT,
  stepHrefs,
} from "../editor";
import { ImportPanel } from "../import-panel";
import { loadListing } from "../listing-shell";
import { AboutCard } from "../sections";
import { RepoUrlField } from "./repo-url-field";

export const dynamic = "force-dynamic";

export default async function ListingDetailsPage(props: {
  params: Promise<{ org: string; profile: string }>;
  searchParams: Promise<{ notice?: string; error?: string; blockers?: string }>;
}) {
  const { org, profile: profileId } = await props.params;
  const loaded = await loadListing(org, profileId, await props.searchParams, `/studio/${org}/${profileId}/details`);
  if (loaded.kind === "failed") return loaded.element;
  const { profile, notice, blockers, action } = loaded.listing;
  const hrefs = stepHrefs(org, profileId);

  // IN2 — the four fields an import fills, each with where its value came
  // from. `slug` is in practice always authored: a listing cannot exist
  // without an address, so there is never a gap for the repository's own name
  // to fill. It is shown anyway, because seeing that the repository calls
  // itself something else is exactly the sort of thing a maintainer wants to
  // know before they publish.
  const imported = [
    importedValue("name", profile.slug, profile.repoName),
    importedValue("description", profile.tagline, profile.repoDescription),
    importedValue("licence", null, profile.repoLicence),
    importedStack(profile.stack, profile.repoTopics),
  ];

  return (
    <StudioLive vocabulary={LISTING_VOCABULARY} notice={notice} blockers={blockers} flush>
      <EditorColumns
        rail={
          <>
            <CompletenessPanel org={org} profileId={profileId} subject={profile} />
            <ImportPanel values={imported} checkedAt={profile.repoCheckedAt} observed={hasObservation(profile)}>
              {/* NOT a background act (OPP15): a check exists to put the
                  repository's own words into the fields — `authored ??
                  observed` — so the whole document coming back is the answer,
                  as it always was. See `studio/live-save.tsx`. */}
              <form method="post" action={action}>
                <input type="hidden" name="intent" value="repo-check" />
                <input type="hidden" name="from" value="details" />
                <button type="submit" className={BTN_OUTLINE}>
                  Check repository
                </button>
              </form>
              <span className="text-[13px] leading-[1.5] text-muted-foreground">
                {profile.repoVisibility === "private"
                  ? "The last check read the repository as private. Make it public on GitHub, or clear the link."
                  : "Fills a gap. Never overwrites what you wrote."}
              </span>
            </ImportPanel>
          </>
        }
      >
        <AboutCard
          profile={profile}
          hrefs={hrefs}
          editing={
            // OPP15 — POSTS IN THE BACKGROUND (`data-live="stay"`). A save
            // here changes what the maintainer just typed into what they
            // typed, so the form is already showing the truth when the answer
            // lands and nothing on this page can be wrong if the re-render
            // behind it is lost.
            <form method="post" action={action} data-live="stay" className={CARD_FORM}>
              <input type="hidden" name="intent" value="update-details" />
              <input type="hidden" name="from" value="details" />
              <CardSubhead>Intro</CardSubhead>
              <div className={FIELD_PAIR}>
                <div>
                  <label htmlFor="slug" className={LABEL}>
                    Public address
                  </label>
                  <span className="flex h-[44px] items-center overflow-hidden rounded-[14px] border border-border bg-card focus-within:border-endorse focus-within:ring-[3px] focus-within:ring-endorse-soft">
                    <span className="pl-3 font-mono text-[13px] text-muted-foreground">openproduct.live/</span>
                    <input
                      id="slug"
                      name="slug"
                      type="text"
                      maxLength={64}
                      defaultValue={profile.slug}
                      className="h-full min-w-0 flex-1 border-0 bg-transparent pl-0.5 pr-3 text-nozoom text-foreground outline-none"
                    />
                  </span>
                </div>
                <div>
                  <label htmlFor="tagline" className={LABEL}>
                    Tagline
                  </label>
                  <input
                    id="tagline"
                    name="tagline"
                    type="text"
                    maxLength={200}
                    // IN2 — the observation FILLS A GAP and never overwrites:
                    // this is `authored ?? observed`, so a maintainer's own
                    // sentence always wins and the repository's only appears
                    // where there was nothing. Saving makes whatever is here
                    // theirs.
                    defaultValue={imported[1]!.value ?? ""}
                    placeholder="One line, said plainly."
                    className={FIELD}
                  />
                </div>
              </div>
              <div className={FIELD_PAIR}>
                <div>
                  <label htmlFor="repoUrl" className={LABEL}>
                    Repository URL
                  </label>
                  {/* OB6 — offers the repo typed on Open a build while none
                      is saved; the same input, so the save is unchanged. */}
                  <RepoUrlField saved={profile.repoUrl ?? null} />
                </div>
                <div>
                  <label htmlFor="liveUrl" className={LABEL}>
                    Live URL
                  </label>
                  <input
                    id="liveUrl"
                    name="liveUrl"
                    type="url"
                    defaultValue={profile.liveUrl ?? ""}
                    placeholder="https://…"
                    className={FIELD}
                  />
                </div>
              </div>
              <div className={CARD_RULE}>
                <CardSubhead>About</CardSubhead>
              </div>
              <div>
                <label htmlFor="pitch" className={LABEL}>
                  Pitch
                </label>
                <textarea
                  id="pitch"
                  name="pitch"
                  rows={8}
                  defaultValue={profile.pitch ?? ""}
                  placeholder="What it does, who it is for, and the decision you made that others did not."
                  className={TEXTAREA}
                />
              </div>
              {/* PV2 — the one field on this form a reader may RUN, so it is
                  the one that says what happens to it: a maintainer typed
                  this, and nothing here has run it. */}
              <div>
                <label htmlFor="installLine" className={LABEL}>
                  Install command
                </label>
                <input
                  id="installLine"
                  name="installLine"
                  type="text"
                  maxLength={MAX_INSTALL_LINE}
                  defaultValue={profile.installLine ?? ""}
                  placeholder="npx create-your-thing"
                  aria-describedby="install-note"
                  className={`${FIELD} font-mono text-[13px]`}
                />
                <p id="install-note" className="m-0 mt-1.5 text-[13px] leading-[1.5] text-muted-foreground">
                  One command. No pipes, chained commands or redirection.
                </p>
              </div>
              <div className={FORM_FOOT}>
                <button type="submit" className={BTN_PRIMARY}>
                  Save listing
                </button>
                <CancelLink href={hrefs.overview} />
              </div>
            </form>
          }
        />
      </EditorColumns>
    </StudioLive>
  );
}
