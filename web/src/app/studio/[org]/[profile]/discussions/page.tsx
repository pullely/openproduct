import { listingForumPath } from "@openproduct/contracts";

import { FailurePanel } from "../../../../ui/failure";
import { AppLink } from "../../../../ui/link";
import { BTN_GHOST, } from "../../../frame";
import { StudioLive } from "../../../live-save";
import { noticeFrom, DISCUSSION_VOCABULARY } from "../../../notices";
import { fetchProfileThreads } from "../../../studio-api";
import { CompletenessPanel } from "../completeness-panel";
import { EditorColumns } from "../editor";
import { loadListing } from "../listing-shell";
import { DiscussionsCard } from "../sections";

/**
 * The maintainer's view of their listing's discussions (CB1), in XP3's frame
 * — drawn as the editor with its Discussions card open (openproduct redesign).
 *
 * WHAT A MAINTAINER MAY DO HERE: lock a thread, unlock it, and mark a post as
 * the answer. That is the whole list, and the omission is the design.
 *
 * REMOVING A POST IS NOT HERE. Removal is a TS3 act — a ledger row, a reason,
 * an operator — not something a maintainer does to a reply they disliked on
 * their own product. A maintainer with a remove button on their own page can
 * quietly delete every criticism of their software, and the decision trail
 * this sub-epic exists to build would be a trail of only the good news.
 *
 * Locking is the maintainer's proportionate act: it ENDS a conversation
 * without retracting it, everything in the thread stays readable, and it is
 * visible on the page that it happened. Anything stronger goes through the
 * report queue like it would for anybody else. The rows are `sections.tsx`'s
 * `ThreadRow`, the same ones the overview draws.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ org: string; profile: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}

export default async function StudioDiscussionsPage(props: PageProps) {
  const { org, profile: profileId } = await props.params;
  const page = `/studio/${encodeURIComponent(org)}/${encodeURIComponent(profileId)}/discussions`;
  const search = await props.searchParams;

  const loaded = await loadListing(org, profileId, search, page, (token) => fetchProfileThreads(token, org, profileId));
  if (loaded.kind === "failed") return loaded.element;
  const { profile } = loaded.listing;

  const result = loaded.also;
  if (result.kind === "unauthorized" || result.kind === "refused") {
    return (
      <FailurePanel
        kind="missing"
        what="There is no listing here that you maintain."
        actions={[{ label: "Your listings", href: "/studio" }]}
      />
    );
  }
  if (result.kind === "unavailable") {
    return (
      <FailurePanel
        kind="unavailable"
        what="These discussions could not be loaded. It is not something you did."
        actions={[
          { label: "Try again", href: page },
          { label: "Your listings", href: "/studio" },
        ]}
      />
    );
  }

  const { threads } = result.data;

  return (
    <StudioLive vocabulary={DISCUSSION_VOCABULARY} notice={noticeFrom(search, DISCUSSION_VOCABULARY)} flush>
      <EditorColumns rail={<CompletenessPanel org={org} profileId={profileId} subject={profile} />}>
        <DiscussionsCard
          threads={threads}
          action={`${page}/actions`}
          forum={
            profile.visibility === "public" ? (
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
