// IN1 — a listing's overview (openproduct-worldclass), drawn as the design's
// editor (openproduct redesign).
//
// This page WAS the editor: one document holding six sections, of which the
// first was really two. IN1 split it into addressable steps. The design puts
// it back on one page — a hero card, five section cards, a rail — and this
// page draws exactly that, with every card in its read state and a pencil on
// each that goes to the step which edits it. The steps keep their addresses;
// the eye gets one page (`editor.tsx` says why).
//
// WHAT THIS PAGE DELIBERATELY DOES NOT DRAW IS A SCORE. The rail's meter is a
// count of filled fields beside a list of the empty ones — a fact about a
// form, not a judgement about somebody's work (IN3, WC-E).
//
// A HALF-FINISHED LISTING IS NOT PUBLICLY REACHABLE, and that was already
// true rather than built here: a listing is `draft` until the publish act,
// which the API refuses until its own gates pass and answers with the
// blockers the frame renders. The pill in the head says which of the two
// states this listing is in.
//
// AND A DRAFT SURVIVES A CLOSED TAB because it was never in the tab: every
// field is stored by the API on save. There is no client-side draft to lose.
//
// FOUR READS, TOGETHER (OPP15). The cards need the media rows, the launches
// and the threads as well as the profile; they leave in one `Promise.all`
// beside the profile read and the page waits once. A card whose read failed
// says so inside itself rather than failing the page.

import { AppLink } from "../../../ui/link";

import {
  LISTING_STEPS,
  hasObservation,
  importedStack,
  importedValue,
  listingForumPath,
  listingStepPath,
} from "@openproduct/contracts";

import { consoleOrigin } from "../../../../lib/platform";
import { publicApiBase } from "../../../public-api";
import { BTN_OUTLINE, BTN_PRIMARY, LABEL, NOTICE_WARN, TEXTAREA } from "../../../ui/design";
import { BTN_GHOST, RAIL_PANEL, } from "../../frame";
import { StudioLive } from "../../live-save";
import { LISTING_VOCABULARY } from "../../notices";
import { publishDisclosure, NEVER_PUBLIC } from "../../publish-disclosure";
import { LINK_WORKSPACE_LABEL, consoleWorkspacePickerUrl } from "../../workspace-picker";
import { fetchLaunches, fetchProfileThreads } from "../../studio-api";
import { CompletenessPanel } from "./completeness-panel";
import { EditorColumns, stepHrefs } from "./editor";
import { ImportPanel } from "./import-panel";
import { loadListing, readMedia } from "./listing-shell";
import { AboutCard, DiscussionsCard, LaunchesCard, MediaCard, PeopleCard } from "./sections";

export const dynamic = "force-dynamic";

export default async function StudioListingOverviewPage(props: {
  params: Promise<{ org: string; profile: string }>;
  searchParams: Promise<{ notice?: string; error?: string; blockers?: string }>;
}) {
  const { org, profile: profileId } = await props.params;
  const here = `/studio/${org}/${profileId}`;
  const loaded = await loadListing(org, profileId, await props.searchParams, here, (token) =>
    Promise.all([
      readMedia(token, org, profileId),
      fetchLaunches(token, org, profileId),
      fetchProfileThreads(token, org, profileId),
    ]),
  );
  if (loaded.kind === "failed") return loaded.element;
  const { profile, canReview, notice, blockers, action } = loaded.listing;
  const [mediaRead, launchesRead, threadsRead] = loaded.also;

  const consoleUrl = consoleOrigin();
  const linked = profile.workspaceLinkedAt != null;
  const published = profile.visibility === "public";
  const hrefs = stepHrefs(org, profileId);
  // LC0 — every step there is, from the vocabulary, so the scheduler stays
  // reachable from the editor by the address the contract gives it.
  const stepHref = Object.fromEntries(
    LISTING_STEPS.map((step) => [step.id, listingStepPath(org, profileId, step)]),
  );

  // IN2 — the four fields an import fills, each with where its value came
  // from, drawn in the rail beside the check that fills them.
  const imported = [
    importedValue("name", profile.slug, profile.repoName),
    importedValue("description", profile.tagline, profile.repoDescription),
    importedValue("licence", null, profile.repoLicence),
    importedStack(profile.stack, profile.repoTopics),
  ];

  return (
    <StudioLive vocabulary={LISTING_VOCABULARY} notice={notice} blockers={blockers} flush>
      {!linked ? (
        <div className={`mt-4 ${NOTICE_WARN}`}>
          <span className="font-medium">Not linked to its workspace.</span>{" "}
          A listing can only be linked to the workspace it was made in, and only when that is one of your
          openproduct workspaces.{" "}
          <a
            className="underline underline-offset-4"
            // The console's workspace picker (S13), opened on THIS listing's
            // workspace: it links it when it can, and says so when it cannot
            // (a private workspace never can — open a new build for the same
            // repository instead). It used to point at a per-workspace
            // console page that no longer exists.
            href={consoleWorkspacePickerUrl(consoleUrl, org)}
          >
            {LINK_WORKSPACE_LABEL}
          </a>
        </div>
      ) : null}

      <EditorColumns
        rail={
          <>
            {/* ── IN3 — what this listing still needs ── advice, and it says
                so; the only consequence it carries is the front-page floor,
                stated in the panel rather than discovered by a listing not
                appearing. */}
            <CompletenessPanel org={org} profileId={profileId} subject={profile} />

            {/* ── the curation gate ── an operator's act, on a draft or on a
                listing published under the unreviewed cap alike: the review
                is what lifts that cap, so it cannot live inside the draft
                panel. */}
            {canReview && !profile.reviewedAt ? (
              <section aria-labelledby="review-gate" className={RAIL_PANEL}>
                <h2 id="review-gate" className="m-0 text-[16px] font-semibold leading-[1.3] tracking-[-0.01em] text-foreground">
                  Review
                </h2>
                <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-muted-foreground">Not reviewed yet.</p>
                <form method="post" action={action} className="mt-3">
                  <input type="hidden" name="intent" value="review" />
                  <button type="submit" className={BTN_OUTLINE}>
                    Review for publication
                  </button>
                </form>
              </section>
            ) : null}

            {/* ── the publish act, and what it discloses ──
                The ONE place a publish is made (openproduct-studio OSD7): the
                head's "Publish…" is a link to `#publish`, so the disclosure
                is always read on the way. `scroll-mt` keeps the panel's
                heading clear of the sticky top bar when the anchor lands. */}
            {!published ? (
              <section id="publish" aria-labelledby="before-publish" className={`${RAIL_PANEL} scroll-mt-24`}>
                <h2 id="before-publish" className="m-0 text-[16px] font-semibold leading-[1.3] tracking-[-0.01em] text-foreground">
                  Before you publish
                </h2>
                {/* THE DISCLOSURE IS GENERATED from the projection contract
                    (OD6) so it cannot drift — every public field, in the
                    contract's order. It is long, so it opens on demand; the
                    count in the summary is the honest line. */}
                <details className="group mt-2">
                  <summary className="cursor-pointer list-none text-[13px] font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    <span className="mr-1.5 inline-block text-faint transition-transform group-open:rotate-90">›</span>
                    What becomes public
                    <span className="ml-1.5 font-normal text-muted-foreground">{publishDisclosure().length} fields</span>
                  </summary>
                  <ul className="m-0 mt-1.5 grid list-disc gap-1 pl-4 text-[13px] leading-[1.5] text-copy">
                    {publishDisclosure().map((line) => (
                      <li key={line.key}>{line.label}</li>
                    ))}
                  </ul>
                </details>
                <p className="m-0 mt-3 text-[13px] font-medium text-foreground">What never becomes public</p>
                <ul className="m-0 mt-1.5 grid list-disc gap-1 pl-4 text-[13px] leading-[1.5] text-muted-foreground">
                  {NEVER_PUBLIC.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {/* A publish changes the PAGE — the pill, this panel, the
                    launches card — so it keeps the `303` (OPP15). */}
                <form method="post" action={action} className="mt-3.5 grid gap-3">
                  <input type="hidden" name="intent" value="publish" />
                  <div>
                    <label htmlFor="components" className={LABEL}>
                      Components snapshot <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <textarea
                      id="components"
                      name="components"
                      rows={2}
                      placeholder={"api-worker | service\nweb | website"}
                      className={`${TEXTAREA} font-mono text-[13px]`}
                    />
                  </div>
                  <div>
                    <button type="submit" className={BTN_PRIMARY}>
                      Publish
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            <ImportPanel values={imported} checkedAt={profile.repoCheckedAt} observed={hasObservation(profile)}>
              {/* NOT a background act (OPP15): a check exists to put the
                  repository's own words into the fields — `authored ??
                  observed` — so the whole document coming back is the answer. */}
              <form method="post" action={action}>
                <input type="hidden" name="intent" value="repo-check" />
                <button type="submit" className={BTN_OUTLINE}>
                  Check repository
                </button>
              </form>
              <span className="text-[13px] leading-[1.5] text-muted-foreground">Fills a gap. Never overwrites what you wrote.</span>
            </ImportPanel>
          </>
        }
      >
        <AboutCard profile={profile} hrefs={hrefs} />
        <MediaCard
          media={mediaRead.kind === "ok" ? mediaRead.data.media : []}
          unreadable={mediaRead.kind !== "ok"}
          apiBase={publicApiBase()}
          action={action}
          hrefs={hrefs}
        />
        <PeopleCard profile={profile} hrefs={hrefs} />
        <LaunchesCard
          read={launchesRead.kind === "ok" ? launchesRead.data : null}
          published={published}
          hrefs={{ ...hrefs, launches: stepHref.schedule ?? hrefs.launches }}
        />
        <DiscussionsCard
          threads={threadsRead.kind === "ok" ? threadsRead.data.threads : null}
          action={`${hrefs.discussions}/actions`}
          forum={
            published ? (
              <AppLink
                prefetch="auto"
                href={listingForumPath(profile.slug)}
                className={`${BTN_GHOST} h-[30px] px-2.5 text-[13px] no-underline`}
              >
                Forum
              </AppLink>
            ) : undefined
          }
        />
      </EditorColumns>
    </StudioLive>
  );
}
