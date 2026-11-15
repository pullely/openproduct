// What `/me` reads about the products you are on the crew of
// (openproduct-redesign OPR-3; boards `Me`, `PhoneMe`).
//
// TWO THINGS OPR1 LEFT OUT, each from a read that exists now:
//
//   the stage     a published product's public document says which of the
//                 four stages it is at (SC-2), how many of its milestones shipped and
//                 which seats are open — the row under "Your products" says
//                 the same thing a visitor's page does, because it is the
//                 same read.
//   the drafts    each product's `needs-you` lists its unpublished posts; the
//                 Drafts section is those, across every product you are on.
//
// BOUNDED. A person on the crew of a great many products gets the first
// `MY_PRODUCT_READ_LIMIT` read; the rest of the rows are still drawn, with
// what the listing itself holds.
//
// PURE where it can be: what a row says is a function, so the test lane —
// which has no JSX — can hold it.

import {
  PRODUCT_STAGE_LABELS,
  POST_BLOCK_CATALOGUE,
  PRODUCT_POST_KIND_LABELS,
  isAuthoredProductPostKind,
  isProductStage,
  listingSettingsPath,
  postBlockValue,
  type CrewProductPost,
  type MilestoneCounts,
  type ProductStage,
  type PublicProfile,
} from "@openproduct/contracts";

import { HEADLINE_BLOCK } from "../posts/blocks";
import { fetchNeedsYou, type CrewFetch } from "../posts/crew-api";
import { isBuilt, milestoneProgress } from "../ui/stage";

import type { MyListing } from "./listings";

/** How many of your products one render reads the stage and the drafts of. */
export const MY_PRODUCT_READ_LIMIT = 12;

/** What a published product's row says beyond the listing's own fields. */
export interface MyProductStanding {
  readonly stage: ProductStage;
  readonly milestoneCounts: MilestoneCounts | null;
  readonly openSeats: number;
}

/** A product's standing, from its public document; null when there is none
 *  (a draft has no public page) or it could not be read. */
export function standingOf(
  profile: Pick<PublicProfile, "stage" | "milestoneCounts" | "roleOpenings"> | null,
): MyProductStanding | null {
  if (!profile || !isProductStage(profile.stage)) return null;
  return {
    stage: profile.stage,
    milestoneCounts: profile.milestoneCounts ?? null,
    openSeats: (profile.roleOpenings ?? []).filter((opening) => opening.status === "open").length,
  };
}

/**
 * The line under a product's name (board `Me`: "On stage · 3 of 4 milestones
 * · 2 open seats"). Each part is said only when it is true: no milestone
 * count for a product with none, no "0 open seats".
 */
export function standingLine(standing: MyProductStanding): string {
  const progress = isBuilt(standing.stage) ? milestoneProgress(standing.milestoneCounts) : null;
  return [
    PRODUCT_STAGE_LABELS[standing.stage],
    progress ? `${progress} milestones` : null,
    standing.openSeats > 0 ? `${standing.openSeats} open ${standing.openSeats === 1 ? "seat" : "seats"}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/**
 * Where "Manage" goes. THE PRODUCT'S OWN PAGE once it has one — the page is
 * the dashboard (design §2.5). A listing that is still a draft has no public
 * page, so it is managed where it is set up: its settings in the studio.
 */
export function manageHref(listing: Pick<MyListing, "slug" | "visibility" | "orgId" | "id">): string {
  return listing.visibility === "public" ? `/${listing.slug}` : listingSettingsPath(listing.orgId, listing.id);
}

/** One unpublished post, with the product it is for. */
export interface MyDraft {
  readonly slug: string;
  readonly post: CrewProductPost;
}

/** A draft's name on its row: the kind, and its headline when it has one —
 *  "New version 1.4.0". */
export function draftTitle(post: Pick<CrewProductPost, "kind" | "blocks">): { kind: string; headline: string | null } {
  const headline = postBlockValue(post.blocks, HEADLINE_BLOCK[post.kind])?.trim() ?? "";
  return { kind: PRODUCT_POST_KIND_LABELS[post.kind], headline: headline.length > 0 ? headline : null };
}

/** How far along a draft is: "1 of 2 required". Counted from the catalogue,
 *  the list the builder draws. */
export function draftProgress(post: Pick<CrewProductPost, "kind" | "blocks">): string {
  const required = POST_BLOCK_CATALOGUE[post.kind].filter((spec) => spec.required);
  const filled = required.filter((spec) => (postBlockValue(post.blocks, spec.id) ?? "").trim().length > 0).length;
  return `${filled} of ${required.length} required`;
}

/** The drafts the builder can open: an authored kind, still a draft. */
export function editableDrafts(slug: string, posts: readonly CrewProductPost[]): MyDraft[] {
  return posts
    .filter((post) => post.state === "draft" && isAuthoredProductPostKind(post.kind))
    .map((post) => ({ slug, post }));
}

/**
 * The drafts across the products this person is on the crew of, newest
 * first. Null when NO product's drafts could be read (the section then says
 * so); a product whose read failed among others contributes none.
 */
export async function fetchMyDrafts(
  token: string,
  listings: readonly MyListing[],
  fetchImpl?: CrewFetch,
): Promise<MyDraft[] | null> {
  const read = listings.slice(0, MY_PRODUCT_READ_LIMIT);
  if (read.length === 0) return [];
  const results = await Promise.all(
    read.map((listing) => fetchNeedsYou(token, { org: listing.orgId, profile: listing.id }, fetchImpl)),
  );
  if (results.every((result) => result.kind !== "ok")) return null;
  return results
    .flatMap((result, index) =>
      result.kind === "ok" ? editableDrafts(read[index]!.slug, result.data.needsYou?.drafts ?? []) : [],
    )
    .sort((a, b) => b.post.updatedAt.localeCompare(a.post.updatedAt));
}
