// A maker's page, with its tab (openproduct-launch MP0).
//
// PUBLIC, ANONYMOUS, ACTOR-FREE (OPC-1, I6). The same document for every
// reader; whether the visitor follows this person arrives after paint from the
// XP2 overlay, and nothing here knows who is asking. A maker page that
// rendered differently for the person whose name is on it would be two
// documents at one address.
//
// ONE DOCUMENT PER ADDRESS, and the tab is part of the address. The page needs
// the header, all three counts and one list; fetching those as three documents
// would put the page's read budget at three for a surface that is the most
// linked-to thing on the estate. So core assembles them and the web layer
// reads once — the same shape every other public page here has.
//
// THE 404 COMES BEFORE THE NAMESPACE. `getPublicContributor` folds four
// different refusals into one null (no such handle, a released one, somebody
// who never opted in, somebody whose standing lapsed) so this surface is not
// an oracle for "does this person have an account here". The subject id is
// resolved only AFTER that null has been answered — reversing the two would
// let a caller learn from timing what the status code refuses to say.

import {
  MAKER_HISTORY_LIMIT,
  MAKER_TAB_LIMIT,
  parseHandle,
  parseHistoryCursor,
  parseMakerTab,
  type MakerTab,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";
import { thumbnailsForSlugs } from "./media.js";
import { contributorProjection, listingSlugsOf } from "./public.js";

export interface MakerHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "getPublicContributor"
    | "getSubjectsForHandles"
    | "countFollowers"
    | "countMakerActivity"
    | "listMakerLaunches"
    | "listMakerUpvotes"
    | "listMakerComments"
    | "listMakerHistory"
    | "firstMakerLaunchDay"
    | "countMakerCleanVoteListings"
    // openproduct-studio OSD3 — the rows' logos, one read per page.
    | "listPublicMediaForSlugs"
  >;
}

export async function handleMakerTab(
  _env: Env,
  request: Request,
  requestId: string,
  handle: string,
  tabParam: string,
  deps: MakerHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const parsed = parseHandle(handle);
  // A malformed handle 404s rather than 400s: the shape of the string is not
  // information this surface owes anybody either.
  if (!parsed.ok) return errorResponse("not_found", "Not found", 404, requestId);

  const tab = parseMakerTab(tabParam);
  if (tab === null) return errorResponse("not_found", "Not found", 404, requestId);

  const record = await deps.repo.getPublicContributor(parsed.handle);
  if (!record) return errorResponse("not_found", "Not found", 404, requestId);

  const subjects = await deps.repo.getSubjectsForHandles([record.handle]);
  const subjectId = subjects.get(record.handle);
  if (!subjectId) {
    // A public profile whose handle no longer resolves to a holder. The
    // profile read said yes and the namespace said no, which is a state this
    // page cannot render honestly — and the same 404 every other refusal
    // gets, so it tells a caller nothing the others do not.
    return errorResponse("not_found", "Not found", 404, requestId);
  }

  // THREE READS AT ONCE, because none depends on another. The counts are read
  // TOGETHER with the list rather than derived from it: the header shows all
  // three on every tab, and a count that only existed for the tab in front of
  // you would be two of three numbers missing on two pages out of three.
  // PE1 — the history page's cursor: a moment in `before`, or nothing. A
  // malformed one is a 404, never a first page under a wrong address.
  const beforeParam = new URL(request.url).searchParams.get("before");
  const before = beforeParam === null ? null : parseHistoryCursor(beforeParam);
  if (beforeParam !== null && (before === null || tab !== "history")) {
    return errorResponse("not_found", "Not found", 404, requestId);
  }
  // PE2 — the marks' inputs travel, never the marks: the page derives them
  // with the contract's `makerMarks`, and a card cannot claim what the wire
  // did not carry.
  const [followerCounts, counts, listed, firstLaunchDay, cleanVoteListings, headerThumbnails] = await Promise.all([
    deps.repo.countFollowers("person", [subjectId]),
    deps.repo.countMakerActivity(subjectId),
    listFor(deps, subjectId, tab, before),
    deps.repo.firstMakerLaunchDay(subjectId),
    deps.repo.countMakerCleanVoteListings(subjectId),
    // openproduct-studio OSD3 — the header's listings' logos.
    thumbnailsForSlugs(deps.repo, listingSlugsOf(record)),
  ]);
  const contributor = contributorProjection(record, followerCounts.get(subjectId) ?? 0, headerThumbnails);

  return successResponse(
    {
      // THE SAME PROJECTION THE BARE PAGE SERVES, called rather than copied.
      // Two copies of a public projection is how a field somebody
      // deliberately kept off one surface arrives on the other — and this
      // page shows the header CG1 already publishes, not a second version of
      // a person.
      contributor,
      tab,
      marks: { firstLaunchDay, cleanVoteListings, maintains: contributor.maintains.length },
      // NO `followers` HERE. It is on the projection above, once. The design
      // draws it beside these three and the page reads it from where it
      // lives, because a second copy is a second number that can be wrong.
      counts,
      // THE ROWS OF ONE TAB, and the shape differs per tab on purpose: a
      // launch has a day and a rank, an upvote has the moment somebody made
      // it, and a commented listing has a count of what they said. Flattening
      // the three into one row type would mean two thirds of every row was
      // null, and a reader of this JSON could not tell an absent fact from an
      // inapplicable one (OPC-C).
      rows: listed.rows,
      // PE1 — the moment the next page is "before", or null when this is the
      // last. Present on every tab so the document has one shape (I2).
      nextCursor: listed.nextCursor,
      // I9 — a page carrying counts says when they were counted. These are
      // read on the request path rather than stored, so the moment is now.
      observedAt: new Date().toISOString(),
    },
    requestId,
    200,
  );
}

/** The one list this address asks for. A switch rather than three endpoints,
 *  because the three tabs are one page with one header. */
async function listFor(
  deps: MakerHandlerDeps,
  subjectId: string,
  tab: MakerTab,
  before: string | null,
): Promise<{ rows: readonly unknown[]; nextCursor: string | null }> {
  const listed = await rowsFor(deps, subjectId, tab, before);
  // openproduct-studio OSD3 — every tab's row draws the listing's tile, so
  // every tab's rows carry its logo: one batched read over the page's slugs,
  // after the list, which it never orders.
  const thumbnailFor = await thumbnailsForSlugs(deps.repo, listed.rows.map((row) => row.slug));
  return {
    rows: listed.rows.map((row) => ({ ...row, thumbnail: thumbnailFor(row.slug) })),
    nextCursor: listed.nextCursor,
  };
}

async function rowsFor(
  deps: MakerHandlerDeps,
  subjectId: string,
  tab: MakerTab,
  before: string | null,
): Promise<{ rows: readonly { slug: string }[]; nextCursor: string | null }> {
  if (tab === "history") {
    // One more than the page, so "is there an earlier page" is a fact read
    // rather than a count guessed; the extra row is not shown.
    const rows = await deps.repo.listMakerHistory(subjectId, MAKER_HISTORY_LIMIT + 1, before);
    const page = rows.slice(0, MAKER_HISTORY_LIMIT);
    const last = page[page.length - 1];
    return { rows: page, nextCursor: rows.length > MAKER_HISTORY_LIMIT && last ? last.at : null };
  }
  if (tab === "upvoted") return { rows: await deps.repo.listMakerUpvotes(subjectId, MAKER_TAB_LIMIT), nextCursor: null };
  if (tab === "comments") return { rows: await deps.repo.listMakerComments(subjectId, MAKER_TAB_LIMIT), nextCursor: null };
  return { rows: await deps.repo.listMakerLaunches(subjectId, MAKER_TAB_LIMIT), nextCursor: null };
}
