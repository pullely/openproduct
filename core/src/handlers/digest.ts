// The week, published (openproduct-commons LC1).
//
// ONE PUBLIC READ, ANONYMOUS AND CACHEABLE like every other (OPC-1). The
// digest resolves no actor, and it must not: a page whose content depended on
// who asked could not be one document at one address, which is the whole of
// what makes an archive worth keeping.
//
// FOUR READS OF ONE INSTANT. The launches, the changes, the endorsements and
// the note are fetched together and stamped with a single `observedAt` (I9),
// because every figure on the page comes from the same moment and a per-row
// timestamp would invite a reader to think otherwise.
//
// A WEEK STILL IN PROGRESS IS NOT PUBLISHED. "What happened this week" and
// "what has happened so far this week" are different claims under the same
// heading, and two readers quoting week 34's digest a day apart would be
// quoting different documents.

import {
  DIGEST_CHANGE_LIMIT,
  DIGEST_ENDORSED_LIMIT,
  DIGEST_KEYS,
  DIGEST_LAUNCH_LIMIT,
  diffSnapshots,
  digestLead,
  digestMaxAge,
  parseWeekId,
  weekOf,
  weekWindow,
  type Digest,
  type DigestChange,
  type Snapshot,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";

export interface DigestHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listLaunchesInWindow"
    | "listMostEndorsedInWindow"
    | "getDigestNote"
    | "listDigestWeeks"
    | "listSnapshotPairsInWindow"
  >;
  now?: () => number;
}

/**
 * GET one week's digest.
 *
 * THE CANONICAL SPELLING IS ENFORCED HERE rather than by a redirect, because
 * this is the API: a client asking for `2026-w4` gets a 404 and learns the
 * grammar, where a redirect would quietly teach it that two spellings work.
 * The WEB route redirects, because a person typing a URL deserves the page.
 */
export async function handleDigest(
  _env: Env,
  requestId: string,
  weekParam: string,
  deps: DigestHandlerDeps,
): Promise<Response> {
  const parsed = parseWeekId(weekParam);
  if (!parsed.ok || !parsed.canonical) {
    return errorResponse("not_found", "Not found", 404, requestId);
  }

  const now = deps.now?.() ?? Date.now();
  const { start, end } = weekWindow(parsed.week);
  if (Date.parse(end) > now) {
    // A week that has not finished has no digest yet. 404 rather than an empty
    // 200: an empty digest is a real answer about a week that HELD nothing,
    // and conflating it with "this week is not over" would make the empty-week
    // page mean two things.
    return errorResponse("not_found", "Not found", 404, requestId);
  }

  const [launches, endorsed, note, pairs] = await Promise.all([
    deps.repo.listLaunchesInWindow(start, end, DIGEST_LAUNCH_LIMIT),
    deps.repo.listMostEndorsedInWindow(start, end, DIGEST_ENDORSED_LIMIT),
    deps.repo.getDigestNote(parsed.week.id),
    // PV4 — the fourth read of the same instant. Days rather than moments,
    // because that is the grain the snapshot table stores.
    deps.repo.listSnapshotPairsInWindow(start.slice(0, 10), end.slice(0, 10)),
  ]);

  // PV4 — THE LEAD IS A CHANGE, NOT A COUNT.
  //
  // Every pair here already HAS a baseline: the query drops a listing with no
  // snapshot before the week rather than rendering it as all-new, which is
  // the first-snapshot rule applied to the digest instead of to a page. So
  // `diffSnapshots` cannot answer null below, and the `?? []` is a type guard
  // rather than a case.
  const changed: DigestChange[] = digestLead(
    pairs.flatMap((pair) => {
      const before: Snapshot = { takenAt: start, fields: pair.from as Snapshot["fields"] };
      const after: Snapshot = { takenAt: pair.toAt, fields: pair.to as Snapshot["fields"] };
      return (diffSnapshots(before, after) ?? []).map((change) => ({ ...change, slug: pair.slug }));
    }),
    DIGEST_CHANGE_LIMIT,
  );

  // Field by field from the pinned key set (OD3). A digest is a public
  // document and a silent widening is a disclosure.
  void DIGEST_KEYS;
  const digest: Digest = {
    week: parsed.week,
    launches: launches.map((l) => ({
      slug: l.slug,
      tagline: l.tagline,
      versionLabel: l.versionLabel,
      launchedAt: l.launchedAt,
    })),
    changed,
    endorsed: endorsed.map((e) => ({
      slug: e.slug,
      tagline: e.tagline,
      endorsements: e.endorsements,
    })),
    note: note
      ? {
          body: note.body,
          // A note with no resolvable author is NOT rendered. The byline is
          // the whole of what makes an editorial note defensible (LC-4), and a
          // note whose author has since taken their profile down is an
          // unsigned opinion on a public page — which is the thing the
          // required column exists to prevent. Dropping it is the honest
          // failure; rendering it anonymously is not.
          byHandle: note.byHandle ?? "",
          writtenAt: note.writtenAt,
        }
      : null,
    observedAt: new Date(now).toISOString(),
  };
  const withAuthor = digest.note && digest.note.byHandle.length > 0 ? digest : { ...digest, note: null };

  const isCurrent = weekOf(now).id === parsed.week.id;
  return successResponse({ digest: withAuthor }, requestId, 200, {
    "cache-control": `public, max-age=${digestMaxAge(isCurrent)}`,
  });
}

/** GET the weeks that held something — what the index and the feed enumerate. */
export async function handleDigestWeeks(
  _env: Env,
  requestId: string,
  deps: DigestHandlerDeps,
): Promise<Response> {
  const weeks = await deps.repo.listDigestWeeks();
  const now = deps.now?.() ?? Date.now();
  const current = weekOf(now).id;
  // THE CURRENT WEEK IS NOT LISTED, for the same reason it has no digest: it
  // is not over. A feed that carried it would republish the same entry every
  // time something launched, which is how a reader learns to ignore a feed.
  return successResponse({ weeks: weeks.filter((w) => w !== current) }, requestId, 200);
}
