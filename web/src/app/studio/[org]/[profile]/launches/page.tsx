import { LAUNCH_REFUSALS, cooldownNote } from "@openproduct/contracts";

import { BTN_OUTLINE, BTN_PRIMARY, FIELD, LABEL, NOTICE } from "../../../../ui/design";
import { FailurePanel } from "../../../../ui/failure";
import { StudioSection } from "../../../frame";
import { StudioLive } from "../../../live-save";
import { noticeFrom, LAUNCH_VOCABULARY } from "../../../notices";
import { fetchLaunches } from "../../../studio-api";
import { CompletenessPanel } from "../completeness-panel";
import { CancelLink, EditorColumns, FORM_FOOT, stepHrefs } from "../editor";
import { loadListing } from "../listing-shell";
import { LaunchRow, LaunchesCard, ScheduledBox, localValue } from "../sections";

/**
 * The launch scheduler (openproduct-commons LC0), in XP3's studio frame —
 * drawn as the editor with its Launches card open (openproduct redesign).
 *
 * PROGRESSIVE ENHANCEMENT, no client JS — the editor's discipline (OX5b). The
 * session token never reaches the browser; every act posts to the sibling
 * `actions` route which reads the session server-side.
 *
 * WHAT THIS PAGE REFUSES TO DO IS RE-IMPLEMENT THE RULES. It renders what the
 * API's eligibility read told it and what the API's refusal said. The
 * temptation is to grey the form out when a cooldown is running, computed here
 * — and that is precisely how a form and an API come to disagree. The
 * contract's `checkLaunchable` is the one answer; this page shows it.
 *
 * TWO READS, TOGETHER (OPP15): the profile the hero draws and the launches
 * this card draws leave beside each other and the page waits once.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ org: string; profile: string }>;
  searchParams: Promise<{ notice?: string; refused?: string; error?: string }>;
}

export default async function LaunchesPage(props: PageProps) {
  const { org, profile: profileId } = await props.params;
  const page = `/studio/${encodeURIComponent(org)}/${encodeURIComponent(profileId)}/launches`;
  const search = await props.searchParams;

  const loaded = await loadListing(org, profileId, search, page, (token) => fetchLaunches(token, org, profileId));
  if (loaded.kind === "failed") return loaded.element;
  const { profile } = loaded.listing;
  const hrefs = stepHrefs(org, profileId);

  const result = loaded.also;
  if (result.kind === "unauthorized" || result.kind === "refused") {
    return (
      <FailurePanel
        kind="missing"
        what="There is no listing here that you maintain. It may have been removed, the address may be wrong, or it may belong to somebody else."
        actions={[{ label: "Your listings", href: "/studio" }]}
      />
    );
  }
  if (result.kind === "unavailable") {
    return (
      <FailurePanel
        kind="unavailable"
        what="This listing's launches could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: page },
          { label: "Your listings", href: "/studio" },
        ]}
      />
    );
  }

  const { launches, eligibility, policy } = result.data;
  // This surface's own words: a launch refusal is a token from the
  // contract's closed set, looked up rather than read from the address.
  const notice = noticeFrom(search, LAUNCH_VOCABULARY);

  const scheduled = launches.find((l) => l.state === "scheduled");
  const missed = launches.filter((l) => l.state === "missed");
  const past = launches.filter((l) => l.state === "live" || l.state === "cancelled");
  const action = `${page}/actions`;

  return (
    <StudioLive vocabulary={LAUNCH_VOCABULARY} notice={notice} flush>
      <EditorColumns rail={<CompletenessPanel org={org} profileId={profileId} subject={profile} />}>
        <LaunchesCard
          read={result.data}
          published={eligibility.isPublished}
          hrefs={hrefs}
          editing={
            <>
              {/* THE ONE BLOCKER THAT STOPS EVERYTHING, said before the form
                  rather than after somebody fills it in. A draft has nothing
                  to announce, and the remedy is a different panel. */}
              {!eligibility.isPublished ? (
                <p className={`m-0 mt-2 ${NOTICE}`}>
                  {LAUNCH_REFUSALS["not-published"].says}
                </p>
              ) : null}

              {scheduled ? (
                <ScheduledBox launch={scheduled}>
                  <form method="post" action={action} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="intent" value="reschedule" />
                    <input type="hidden" name="launchId" value={scheduled.id} />
                    <MomentField defaultValue={localValue(scheduled.scheduledFor)} label="Move it to" compact />
                    <button type="submit" className={`${BTN_OUTLINE} h-[30px] px-2.5 text-[13px]`}>
                      Move
                    </button>
                  </form>
                  <form method="post" action={action}>
                    <input type="hidden" name="intent" value="cancel" />
                    <input type="hidden" name="launchId" value={scheduled.id} />
                    <button type="submit" className={QUIET}>
                      Cancel this launch
                    </button>
                  </form>
                </ScheduledBox>
              ) : eligibility.isPublished ? (
                <>
                  <form method="post" action={action} className="mt-3 flex flex-wrap items-end gap-2.5">
                    <input type="hidden" name="intent" value="schedule" />
                    <label className="block w-[120px]">
                      <span className={LABEL}>Version</span>
                      <input name="versionLabel" required maxLength={40} placeholder="1.0" className={FIELD} />
                    </label>
                    <MomentField label="Launch at" />
                    <button type="submit" className={PRIMARY}>
                      Schedule
                    </button>
                    <CancelLink href={hrefs.overview} />
                  </form>
                  <p className="m-0 mt-1.5 max-w-[70ch] text-[13px] leading-[1.5] text-muted-foreground">
                    {cooldownNote(policy)}
                    {eligibility.consumedVersions.length > 0 ? (
                      <> Already launched: {eligibility.consumedVersions.join(", ")}.</>
                    ) : null}
                  </p>
                </>
              ) : null}

              {missed.length > 0 ? (
                <StudioSection title="Missed">
                  <ul className="m-0 list-none p-0">
                    {missed.map((launch) => (
                      <LaunchRow key={launch.id} launch={launch}>
                        <form method="post" action={action} className="mt-2 flex flex-wrap items-end gap-2.5">
                          <input type="hidden" name="intent" value="reschedule" />
                          <input type="hidden" name="launchId" value={launch.id} />
                          <MomentField label="Try again at" />
                          <button type="submit" className={BTN_OUTLINE}>
                            Reschedule
                          </button>
                        </form>
                      </LaunchRow>
                    ))}
                  </ul>
                </StudioSection>
              ) : null}

              {past.length > 0 ? (
                <StudioSection title="History">
                  <ul className="m-0 list-none p-0">
                    {past.map((launch) => (
                      <LaunchRow key={launch.id} launch={launch} />
                    ))}
                  </ul>
                </StudioSection>
              ) : null}
            </>
          }
        />
      </EditorColumns>
    </StudioLive>
  );
}

/**
 * The moment, and the ZONE SAID OUT LOUD.
 *
 * A `datetime-local` input carries no zone, so a maker who types 9am gets 9am
 * wherever the server thinks it is — UTC. An input that looks precise and
 * means something else is worse than one that asks for the zone, so this one
 * says which zone it is taking. LC1's digest and LC3's board both order by
 * this, and being an hour out on a launch is being out on the day.
 */
function MomentField({ label, defaultValue, compact = false }: { label: string; defaultValue?: string; compact?: boolean }) {
  return (
    <label className="block">
      <span className={compact ? "sr-only" : LABEL}>
        {label} <span className="font-normal text-muted-foreground">(UTC)</span>
      </span>
      <input
        type="datetime-local"
        name="scheduledFor"
        required
        {...(defaultValue ? { defaultValue } : {})}
        className={INPUT}
      />
    </label>
  );
}

/** The design's field, at its own width rather than the column's — these
 *  forms lay their controls out in a row. */
const INPUT = FIELD.replace(" w-full", "");
const PRIMARY = BTN_PRIMARY;
const QUIET = "text-[13px] text-muted-foreground underline underline-offset-4";
void FORM_FOOT;
