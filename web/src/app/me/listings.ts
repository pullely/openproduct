// Your products — the listings this person maintains, read for `/me`
// (openproduct-redesign OPR1, board `Me`).
//
// THE STUDIO'S OWN READ, FROM THIS SIDE OF THE WALL. `GET /me/listings` is
// the read the studio's landing has always made (openproduct-independence
// OX5b): every listing this subject maintains, across workspaces. The
// profile's first section lists the same things, so it asks the same
// question — the two can never disagree about what is yours.
//
// IT IS A SECOND CALLER RATHER THAN AN IMPORT, and the reason is a rule the
// routes suite holds with a sweep: nothing outside `studio/` imports from
// `studio/`, because that graph (forms with a session read behind them) must
// not ride along onto another page. So this file asks the gateway itself,
// with `me-api.ts`'s own closed header set, and answers in `MeResult` — the
// two-way failure every `/me` page already reacts to: `unauthorized` reads
// as signed out, `unavailable` renders an error state.
//
// Only the fields the section draws are named. The studio's projection holds
// more; a field this page does not render is a field it has no opinion on.
import type { MediaThumbnail } from "@openproduct/contracts";

import { publicApiBase } from "../public-api";
import { meHeaders, type MeFetch, type MeResult } from "./me-api";

/** One listing this person maintains, as the profile's section draws it. */
export interface MyListing {
  id: string;
  orgId: string;
  slug: string;
  visibility: "private" | "public";
  tagline: string | null;
  reviewedAt: string | null;
  workspaceLinkedAt: string | null;
  /** The listing's logo, drafts included; null keeps the monogram. */
  thumbnail: MediaThumbnail | null;
}

/** Every listing the subject behind this token maintains. Personal, so it is
 *  never cached anywhere. */
export async function fetchMyListings(
  token: string,
  fetchImpl: MeFetch = fetch,
): Promise<MeResult<{ listings: MyListing[] }>> {
  try {
    const res = await fetchImpl(`${publicApiBase()}/v1/openproduct/me/listings`, {
      method: "GET",
      headers: meHeaders(token, false),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { kind: "unauthorized" };
    if (!res.ok) return { kind: "unavailable" };
    const data = ((await res.json()) as { data?: { listings?: MyListing[] } }).data;
    return data && Array.isArray(data.listings)
      ? { kind: "ok", data: { listings: data.listings } }
      : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
