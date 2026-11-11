// IN1 — what every step of a listing shares (openproduct-worldclass).
//
// The editor was one page: one session read, one profile fetch, one notice
// vocabulary, one set of blockers, one frame. Splitting it into addressable
// steps must not turn that into four copies — a second page that read the
// notice vocabulary slightly differently would be a maintainer told two
// different things about one save.
//
// So the loader and the strip live here, and a step page is what is left: its
// own heading and its own form.

import { redirect } from "next/navigation";
import { cache } from "react";

import { listingBasePath, type MaintainerProfile } from "@openproduct/contracts";

import { readSession } from "../../../auth/session-server";
import { LISTING_VOCABULARY, noticeFrom } from "../../notices";
import { FailurePanel } from "../../../ui/failure";
import { type StudioNotice } from "../../frame";
import { fetchMedia, fetchProfile } from "../../studio-api";
import { blockerCopy } from "../../publish-disclosure";

export { StepStrip } from "./step-strip";

/**
 * ONE PROFILE READ PER REQUEST (openproduct-studio OSD5). The listing's layout
 * and the step under it both need the profile — the layout for the head and
 * the hero, the step for its cards — and on a full load both render in the
 * same request. `cache` makes that one gateway round trip, not two. On a tab
 * click only the step renders, so it is one read either way.
 */
const readProfile = cache(fetchProfile);

/** The media rows, the same way: the layout draws the logo from them and the
 *  overview and the media step list them (openproduct-studio OSD4). */
export const readMedia = cache(fetchMedia);

export interface StepSearch {
  notice?: string;
  error?: string;
  /** PV2 — the specific reason behind a known error code. Rendered only
   *  beside a code this vocabulary holds; see `notice` below. */
  why?: string;
  blockers?: string;
}

export interface LoadedListing {
  readonly profile: MaintainerProfile;
  readonly canReview: boolean;
  readonly notice: StudioNotice | undefined;
  readonly blockers: { title: string; remedy: string }[];
  readonly action: string;
  readonly org: string;
  readonly profileId: string;
}

/** A step's form, at the design's measure: a 70ch column, 16px between
 *  fields, 28px under the strip. */
export const STEP_FORM = "mt-7 grid max-w-[70ch] gap-4";

/** A step's section — the same column, the same gap above it. */
export const STEP_SECTION = "mt-7 max-w-[70ch]";

/** The line under a step's heading: 13px/1.55 in `--muted`, 8px below. */
export const STEP_NOTE = "m-0 mt-2 text-[13px] leading-[1.55] text-muted-foreground";

/**
 * The read every step makes, and the three failures it can end in.
 *
 * Returns the failure ELEMENT rather than throwing, because two of the three
 * are not errors: a listing that is not yours renders XP3's hiding 404, and a
 * service that is down renders a panel with a way back. Only the unauthorized
 * case leaves — through `redirect`, which does not return.
 *
 * ─── `also`, AND WHY IT IS A PARAMETER RATHER THAN A SECOND AWAIT ─────────
 *
 * OPP15. A step that needs a second document — the media step needs its rows
 * — used to read the session again and await that document AFTER this one
 * returned. Two reads, one after the other, each a hop to a gateway in front
 * of a database in Singapore: the page cost two round trips of latency to
 * render one screen, and the second read never depended on the first.
 *
 * Handing the read in means both leave together and the page waits once. The
 * shape is OPP7's, which made the sidebar one round trip for the same reason
 * and wrote down the rule this follows: a page costs the LATENCY of its
 * slowest read, not the sum of its reads, unless somebody writes it as a
 * sum.
 */
export async function loadListing<T = never>(
  org: string,
  profileId: string,
  search: StepSearch,
  /** The step's own address, so sign-in and "try again" return HERE. */
  here: string,
  /** A second read this step needs, issued BESIDE the profile rather than
   *  after it. It gets the same token; its failure is the step's to render,
   *  which is why the result comes back whole rather than unwrapped. */
  also?: (token: string) => Promise<T>,
): Promise<
  | { kind: "ok"; listing: LoadedListing; also: T }
  | { kind: "failed"; element: React.ReactElement }
> {
  const returnTo = `/signin?return_to=${encodeURIComponent(here)}`;
  const session = await readSession();
  if (!session) redirect(returnTo);

  const [result, alongside] = await Promise.all([
    readProfile(session.accessToken, org, profileId),
    also ? also(session.accessToken) : (undefined as T),
  ]);
  if (result.kind === "unauthorized") redirect(returnTo);
  if (result.kind === "refused") {
    // XP3 — the resource-hiding 404. The sentence still refuses to distinguish
    // "no such listing" from "not yours": telling somebody a listing exists
    // but belongs to another maintainer answers a question they were not
    // entitled to ask.
    return {
      kind: "failed",
      element: (
        <FailurePanel
          kind="missing"
          what="There is no listing here that you maintain. It may have been removed, the address may be wrong, or it may belong to somebody else."
          actions={[{ label: "Your listings", href: "/studio" }]}
        />
      ),
    };
  }
  if (result.kind === "unavailable") {
    return {
      kind: "failed",
      element: (
        <FailurePanel
          kind="unavailable"
          what="This listing could not be loaded. It is not something you did, and trying again in a moment usually works."
          actions={[
            { label: "Try again", href: here },
            { label: "Your listings", href: "/studio" },
          ]}
        />
      ),
    };
  }

  // ONE notice, from one vocabulary — the same reading the save island does
  // for the same act (OPP15). The rules it encodes (a refusal beats a
  // success; `why` is appended only to a code the vocabulary knows) live in
  // `studio/notices.ts` now, next to the words.
  const notice = noticeFrom(search, LISTING_VOCABULARY);
  const blockers = (search.blockers ?? "")
    .split(",")
    .filter((b) => b.length > 0)
    .map((b) => {
      const copy = blockerCopy(b);
      return { title: copy.title, remedy: copy.remedy };
    });

  return {
    kind: "ok",
    also: alongside as T,
    listing: {
      profile: result.data.profile,
      canReview: result.data.capabilities?.canReview === true,
      notice,
      blockers,
      action: `${listingBasePath(org, profileId)}/actions`,
      org,
      profileId,
    },
  };
}

/** The crumbs every step carries: listings → this listing → this step. */
export function stepCrumbs(org: string, profileId: string, slug: string, label?: string) {
  const base = [{ label: "Listings", href: "/studio" }];
  return label
    ? [...base, { label: slug, href: listingBasePath(org, profileId) }, { label }]
    : [...base, { label: slug }];
}
