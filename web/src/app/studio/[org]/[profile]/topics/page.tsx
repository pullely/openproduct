// IN1 — the Topics and stack step of a listing (openproduct-worldclass).
//
// Where this listing sits in the catalogue, and what it is built with. Both are
// AUTHORED — a maintainer's own answer — which is why the licence is not here:
// that one is observed from the repository at publish, and a field for it would
// invite a claim where the product publishes a finding (OPC-7).
//
// DRAWN AS THE EDITOR WITH ITS OWN CARD OPEN (openproduct redesign): the
// hero's chips are what this form writes, so the card sits first under it.
//
// Progressive enhancement, no client JS, the token never in the browser
// (OX5b): the form posts to the sibling `actions` route, which reads the
// session server-side. `from` tells that route which step to return to — a
// save that threw a maintainer back to the overview would make the steps
// worse than the one page they replaced.

import { BTN_PRIMARY, FIELD, LABEL } from "../../../../ui/design";
import { StudioLive } from "../../../live-save";
import { LISTING_VOCABULARY } from "../../../notices";
import { CompletenessPanel } from "../completeness-panel";
import { CARD_FORM, CancelLink, EditorColumns, FORM_FOOT, SectionCard, stepHrefs } from "../editor";
import { loadListing } from "../listing-shell";

import {
  PROVENANCE_LABEL,
  PROVENANCE_NOTE,
  canonicaliseStack,
  facet,
  importedStack,
  labelOf,
} from "@openproduct/contracts";

export const dynamic = "force-dynamic";

export default async function ListingTopicsPage(props: {
  params: Promise<{ org: string; profile: string }>;
  searchParams: Promise<{ notice?: string; error?: string; blockers?: string }>;
}) {
  const { org, profile: profileId } = await props.params;
  const loaded = await loadListing(org, profileId, await props.searchParams, `/studio/${org}/${profileId}/topics`);
  if (loaded.kind === "failed") return loaded.element;
  const { profile, notice, blockers, action } = loaded.listing;
  const hrefs = stepHrefs(org, profileId);
  const unrecognisedStack = canonicaliseStack(profile.stack).unrecognised;
  // IN2 — the repository's own topics fill the stack only when nothing was
  // authored. A maintainer's list always wins; the observation waits.
  const stack = importedStack(profile.stack, profile.repoTopics);

  return (
    <StudioLive vocabulary={LISTING_VOCABULARY} notice={notice} blockers={blockers} flush>
      <EditorColumns rail={<CompletenessPanel org={org} profileId={profileId} subject={profile} />}>
        <SectionCard id="topics" title="Topics and stack">
          {/* Posts in the background (OPP15) — see the note on the Details
              form: a save here changes what was typed into what was typed. */}
          <form method="post" action={action} data-live="stay" className={CARD_FORM}>
            <input type="hidden" name="intent" value="update-topics" />
            <input type="hidden" name="from" value="topics" />
            <div>
              <label htmlFor="stack" className={LABEL}>
                Stack tags
              </label>
              <input
                id="stack"
                name="stack"
                type="text"
                defaultValue={stack.value ?? ""}
                placeholder="typescript, cloudflare"
                className={FIELD}
              />
              <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-muted-foreground">
                Comma-separated, at most 12.{" "}
                <span title={PROVENANCE_NOTE[stack.provenance]}>{PROVENANCE_LABEL[stack.provenance]}.</span>
                {stack.provenance === "authored" && stack.observed !== null && stack.observed !== stack.value ? (
                  <> Repository topics: <span className="text-foreground">{stack.observed}</span>.</>
                ) : null}
              </p>
              {/* THE CANONICALISATION PREVIEW (CT1) — the facet picker's whole
                  feedback loop. A maintainer writes anything; this says which of
                  it the catalog recognised, so "why is my product not under
                  TypeScript" is answered before it is asked rather than after.
                  Nothing is blocked: an unrecognised entry stays on the page in
                  their own words, and simply is not counted. */}
              {profile.stack.length > 0 ? (
                <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-muted-foreground">
                  Counted as{" "}
                  {profile.stackCanonical.length > 0 ? (
                    <span className="font-mono text-foreground">
                      {profile.stackCanonical.map((value) => labelOf("stack", value) ?? value).join(" · ")}
                    </span>
                  ) : (
                    <span className="text-foreground">nothing yet</span>
                  )}
                  {unrecognisedStack.length > 0 ? (
                    <>
                      {" "}— <span className="font-mono">{unrecognisedStack.join(", ")}</span> not in the filters.
                    </>
                  ) : (
                    "."
                  )}
                </p>
              ) : null}
            </div>

            {/* CT1 — the assigned facets (PP3 makes it three). Closed
                vocabularies, so a select rather than a text field: the values a
                reader can filter by and the values a maintainer can pick are one
                list. */}
            <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              {(
                [
                  ["category", "Category"],
                  ["hosting", "Hosting"],
                  ["pricing", "Pricing"],
                ] as const
              ).map(([facetId, label]) => (
                <div key={facetId}>
                  <label htmlFor={facetId} className={LABEL}>
                    {label}
                  </label>
                  <select id={facetId} name={facetId} defaultValue={profile[facetId] ?? ""} className={FIELD}>
                    {/* Not "Other": leaving it unanswered is a real answer, and a
                        default bucket would put this listing in a facet nobody
                        chose. */}
                    <option value="">Not stated</option>
                    {(facet(facetId)?.values ?? []).map((value) => (
                      <option key={value.value} value={value.value}>
                        {value.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className={FORM_FOOT}>
              <button type="submit" className={BTN_PRIMARY}>
                Save topics and stack
              </button>
              <CancelLink href={hrefs.overview} />
            </div>
          </form>
        </SectionCard>
      </EditorColumns>
    </StudioLive>
  );
}
