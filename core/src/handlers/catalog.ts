// The public catalog API v1 (openproduct-commons CT2).
//
// The same four safety properties OD3's public read has, because it is the
// same branch: no actor is resolved, the repository's `*Public*` methods
// filter visibility in SQL, this isolate holds no privileged binding, and the
// response is an AUTHORED projection with a pinned key set.
//
// WHAT CT2 ADDS is the fifth thing OPC-9 asks for: every field carries where
// it came from. The website can afford to know out of band that `licence` was
// observed and `tagline` was written; a machine reading this cannot.
//
// COMPOSED FIELD BY FIELD, from the projection's own list. Never a spread —
// the denylist failure OD3's key-set test exists to prevent, and the reason
// widening this file is a reviewable act rather than an inference.

import {
  BOARD_FORMULA,
  FACETS,
  FORMULAS,
  PAGE_SIZE_MAX,
  decodeCursor,
  encodeCursor,
  pageSize,
  authored,
  authoredMedia,
  derived,
  diffSnapshots,
  metricState,
  observed,
  observedScreenshot,
  openingsFacetValues,
  type CatalogCard,
  type CatalogFacetGroup,
  type CatalogProduct,
  type Fact,
  type Formula,
  type FormulaId,
  type MediaFact,
  type MetricName,
} from "@openproduct/contracts";
import type {
  CataloguePage,
  MetricRecord,
  OpenproductRepository,
  ProductMediaRecord,
  ProfileRecord,
} from "@openproduct/db";

import type { Env } from "../env.js";
import { orgPublicId } from "../ids.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { readCardsPage, type CardsPage, type CardsPageRepo } from "./cards-page.js";
import { launchHistoryOf, placementOf } from "./public.js";
import { snapshotBaseline, snapshotDay, snapshotFields } from "./snapshots.js";

export interface CatalogHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listPublicCards"
    | "listPublicCardsPage"
    // OS5 — the materialised catalogue, read first; the live join is what a
    // page falls back to while the catalogue has never been computed.
    | "listCataloguePage"
    | "countPublishedWindows"
    | "getPublicProfile"
    | "listPublicRoleOpenings"
    // UV1 — I8 says the API returns everything the website shows, and the
    // product page shows a placement. Same two reads the website's own
    // projection makes.
    | "listLaunchesForProfile"
    | "readBoardRanks"
    | "listFeedLaunches"
    | "listPublicMaintainers"
    | "latestMetrics"
    // PP1 — the follower count on the product document.
    | "countFollowers"
    | "latestMetricsForSlugs"
    // MD0 — the media plane, on both reads.
    | "listPublicMedia"
    | "listPublicMediaForSlugs"
    // PV4 — I8 again: the website shows what changed, so the API answers for
    // it. The product read only; a card carries no history.
    | "latestSnapshotBefore"
  >;
  now?: () => Date;
}

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Everything a maintainer wrote is authored, in their voice. */
const BY_MAINTAINER = "maintainer" as const;

/**
 * Turn the latest metric rows into wire facts, DROPPING the ones a surface
 * may not render.
 *
 * This is where OPC-C and OPC-7 meet the wire: a metric that is withdrawn or
 * unobserved is ABSENT from the object, not present with a zero. A consumer
 * that iterates `metrics` therefore sees only what was actually read, and a
 * consumer that asks for a missing key gets `undefined` — which is a much
 * harder thing to accidentally render as "0" than a `0` would be.
 */
function metricFacts(rows: MetricRecord[], now: number): Record<string, Fact<number>> {
  const out: Record<string, Fact<number>> = {};
  for (const row of rows) {
    const state = metricState(row.metric as MetricName, row.observedAt, now);
    if (state === "withdrawn" || state === "unobserved") continue;
    const key = `${row.metric}.${row.window}`;
    // EN2 — NOT EVERY METRIC IS AN OBSERVATION, and the difference is exactly
    // what OPC-2 asks this wrapper to carry. `merges.7d` is something we
    // watched happen on a repository. `endorsements.total` is something WE
    // COMPUTED from our own rows, by a rule published at `/docs/formulas` —
    // and calling it `observed` would tell a machine reader that somebody
    // measured it, which is false, and would leave the number with no formula
    // to resolve to, which is invariant I7.
    //
    // The test is whether the key names a published formula. That works
    // because the metric keys for openproduct's own counts were chosen to BE
    // formula ids; nothing has to be kept in step by hand.
    const formula = FORMULAS[key as FormulaId] as Formula | undefined;
    out[key] = formula
      ? derived(row.value, key as FormulaId, [row.metric], row.observedAt)
      : observed(row.value, row.source, row.observedAt);
  }
  return out;
}

/**
 * The media rows as wire facts — MD0, and WC-3 at the one point it could be
 * lost.
 *
 * THE BRANCH IS ON THE KIND AND THERE IS NO DEFAULT. `hero` and `gallery` go
 * through `authoredMedia`, which can only produce an authored fact; a
 * `screenshot` goes through `observedScreenshot`, which cannot be built
 * without the moment it was captured. Neither constructor accepts the other's
 * asset type, so the two paths cannot be crossed by an edit here — the way
 * they WOULD be crossed is a shared builder taking `kind` and a nullable
 * date, which is exactly the shape this refuses.
 *
 * A screenshot row with no `observedAt` is DROPPED rather than published with
 * a substituted time. The database refuses to store one (1820's provenance
 * CHECK), so reaching this branch means the constraint is gone — and the safe
 * answer to "we have a capture and do not know when" is not to show it. That
 * is OPC-7 at its strongest point: an undated screenshot is the exact
 * artefact the whole frame exists to prevent.
 */
function mediaFacts(rows: readonly ProductMediaRecord[]): MediaFact[] {
  const out: MediaFact[] = [];
  for (const row of rows) {
    const base = {
      id: row.id,
      ref: row.storageRef,
      alt: row.alt,
      width: row.width,
      height: row.height,
      position: row.position,
    };
    if (row.kind === "screenshot") {
      if (row.observedAt === null) continue;
      out.push(observedScreenshot({ ...base, kind: "screenshot" }, row.observedAt));
    } else {
      out.push(authoredMedia({ ...base, kind: row.kind }));
    }
  }
  return out;
}

/**
 * An observed value, or an observed absence.
 *
 * `null` HERE MEANS "READ, AND IT ANSWERED NOTHING" — a repository declaring
 * no licence, or one GitHub could not classify. That is a finding, and it
 * carries the moment it was found. A listing whose repository has never been
 * read has no `observedAt`, and the fact falls back to the compute time so the
 * shape stays constructible; the website's own frame renders nothing at all
 * in that case, which is the stronger answer and the one a reader sees.
 */
function observedOrAbsent<T>(value: T | null, observedAt: string | null, computedAt: string) {
  return observed(value, "declared_repo", observedAt ?? computedAt);
}

function cardOf(
  row: {
    slug: string;
    tagline: string | null;
    stack: string[];
    stackCanonical: string[];
    category: string | null;
    hosting: string | null;
    pricing: string | null;
    licence: string | null;
    // PV0 — the rest of the observed row, and the moment behind all of it.
    language: string | null;
    lastCommitAt: string | null;
    openIssues: number | null;
    observedAt: string | null;
    roleOpeningCount: number;
    publishedAt: string | null;
    openCommitments: string[];
    hasLiveUrl: boolean;
    indexable: boolean;
    /** MD0 — the listing's media rows, in the repository's document order. */
    media: readonly ProductMediaRecord[];
  },
  metrics: MetricRecord[],
  now: number,
  computedAt: string,
): CatalogCard {
  return {
    slug: row.slug,
    tagline: authored(row.tagline, BY_MAINTAINER),
    stack: authored(row.stack, BY_MAINTAINER),
    // Derived from the authored list by a published rule, not written and not
    // measured — which is exactly the third class, and why three exist.
    stackCanonical: derived(row.stackCanonical, "facet.count", ["stack"], computedAt),
    category: authored(row.category, BY_MAINTAINER),
    hosting: authored(row.hosting, BY_MAINTAINER),
    // PP3 — the same class as the two above, and the chip says so.
    pricing: authored(row.pricing, BY_MAINTAINER),
    // PV0 CORRECTED TWO THINGS HERE, and both were wrong in the same
    // direction — the API was claiming a stronger observation than it had.
    //
    //   THE SOURCE was `linked_repo`, which promises a repository read
    //   through the platform's GitHub App. The gateway reads `api.github.com`
    //   over the PUBLIC API from a URL a maintainer typed, with no App and no
    //   custody of anything: that is `declared_repo`, and this file's own
    //   vocabulary already distinguished them.
    //
    //   THE MOMENT was `publishedAt` — the day the listing went public, which
    //   is not when the repository was read and drifts further from it every
    //   day the listing exists. `repoCheckedAt` is the moment, and it is the
    //   same one the website's frame shows.
    //
    // A NULL LICENCE IS STILL AN OBSERVATION, not an authored null: we read
    // the repository and it declares none. Saying `authored(null)` said a
    // maintainer left a field blank, which is a different sentence.
    licence: observedOrAbsent(row.licence, row.observedAt, computedAt),
    language: observedOrAbsent(row.language, row.observedAt, computedAt),
    lastCommitAt: observedOrAbsent(row.lastCommitAt, row.observedAt, computedAt),
    openIssues: observedOrAbsent(row.openIssues, row.observedAt, computedAt),
    openRoles: derived(row.roleOpeningCount, "openings.open", ["role_openings"], computedAt),
    // DS1 — the facet values, so a machine filters by the same vocabulary the
    // rail does. Derived from the AUTHORED commitment lines by a published
    // rule; what the vocabulary does not recognise stays the maintainer's
    // words and never becomes a facet (CT-1).
    openingCommitments: derived(
      [...openingsFacetValues(row.openCommitments)],
      "openings.open",
      ["role_openings.commitment"],
      computedAt,
    ),
    // Authored: a maintainer told us where it runs. Not observed — nothing
    // here has checked that the address answers.
    hasLiveUrl: authored(row.hasLiveUrl, BY_MAINTAINER),
    // TS1 — the ladder decided it, so it resolves to published prose rather
    // than to "we did something". Neither authored nor observed.
    indexable: derived(row.indexable, "listing.indexable", ["trust_levels", "reviewed_at"], computedAt),
    // MD0 — every row carries its own provenance, because a hero and a
    // capture do not share one. Empty until MD1 gives a maker somewhere to
    // put a picture; the key is here regardless, so a client parses one shape
    // rather than branching on a key that arrived later.
    media: mediaFacts(row.media),
    publishedAt: row.publishedAt,
    metrics: metricFacts(metrics, now),
  };
}

/**
 * THE CATALOG DOCUMENT — the one function that produces it.
 *
 * Extracted at DS0 so the search index can be built from the document rather
 * than from a query of its own (DS-1). That is the structural half of the
 * safety argument: the API and the index call the SAME function, so the index
 * cannot contain a field the API would not have returned, and no future edit
 * can make them diverge without changing this one body.
 */
export { endorsementsSinceOf, mergesSinceOf, readCardsPage, type CardsPage, type CardsPageRepo } from "./cards-page.js";

/** The cards of one page, as the catalogue API serializes them — from the
 *  page's own observations and media, whichever source they came from. */
export function catalogCardsOf(page: Pick<CardsPage, "cards" | "metrics" | "media">, nowMs: number): CatalogCard[] {
  const computedAt = new Date(nowMs).toISOString();
  const at = <T,>(map: ReadonlyMap<string, T[]>, slug: string): T[] =>
    map.get(slug.toLowerCase()) ?? map.get(slug) ?? [];
  return page.cards.map((card) =>
    cardOf({ ...card, media: at(page.media, card.slug) }, at(page.metrics, card.slug), nowMs, computedAt),
  );
}

/**
 * EVERY listed product, page by page, in the published order (OS1).
 *
 * The search rebuild's read. Until OS1 this was `listPublicCards()` — the
 * first hundred by publication — so the index held a hundred products and
 * the hundred-and-first was unsearchable with no published rule. Now it walks
 * the pages the API serves, bounded at fifty of them. Since OS5 each page is
 * one read of the materialised catalogue, computed earlier in the same tick
 * — so the index cannot hold a card the catalogue would not serve, and the
 * walk of five thousand listings is twenty-five statements rather than
 * seventy-five.
 */
export async function catalogCards(repo: CardsPageRepo, nowMs: number): Promise<CatalogCard[]> {
  const out: CatalogCard[] = [];
  let cursor: CataloguePage["next"] = null;
  for (let pages = 0; pages < 50; pages += 1) {
    const page = await readCardsPage(repo, { cursor, limit: PAGE_SIZE_MAX }, nowMs);
    out.push(...catalogCardsOf(page, nowMs));
    cursor = page.next;
    if (cursor === null) break;
  }
  return out;
}

/**
 * GET /v1/products?cursor=&limit= — one page of the catalogue (OS1).
 *
 * `next` is on every answer: a string for the page after this one, `null`
 * for the last page, never absent. `total` is a `count(*)` over every listed
 * row — a number about the catalogue, not about the page. A cursor that is
 * not one this catalogue issued is refused (422), never quietly served as a
 * first page under a wrong address. `computedAt` (OS5) is the moment the
 * catalogue these cards came from was materialised — null while the page is
 * served from the live join.
 */
export async function handleCatalogList(
  env: Env,
  requestId: string,
  url: URL,
  deps: CatalogHandlerDeps,
): Promise<Response> {
  const now = (deps.now ?? (() => new Date()))();
  void env;
  const raw = url.searchParams.get("cursor");
  const cursor = raw === null ? null : decodeCursor(raw);
  if (raw !== null && cursor === null) {
    return validationError(requestId, { cursor: ["Not a position this catalogue issued"] });
  }
  const limit = pageSize(url.searchParams.get("limit"));
  const page = await readCardsPage(deps.repo, { cursor, limit }, now.getTime());
  return successResponse(
    {
      products: catalogCardsOf(page, now.getTime()),
      next: page.next === null ? null : encodeCursor(page.next),
      total: page.windows.total,
      computedAt: page.computedAt,
    },
    requestId,
  );
}

export async function handleCatalogProduct(
  env: Env,
  requestId: string,
  slug: string,
  deps: CatalogHandlerDeps,
  publicRoleOpeningId: (uuid: string) => string,
): Promise<Response> {
  if (!SLUG_RE.test(slug)) return errorResponse("not_found", "Not found", 404, requestId);
  const profile: ProfileRecord | null = await deps.repo.getPublicProfile(slug);
  // Unknown, unpublished and unreachable answer identically on purpose.
  if (!profile) return errorResponse("not_found", "Not found", 404, requestId);

  const now = (deps.now ?? (() => new Date()))();
  const computedAt = now.toISOString();
  const [openings, maintainers, metrics, media, placement, baseline, followerCounts, launches] =
    await Promise.all([
    deps.repo.listPublicRoleOpenings(profile.id),
    deps.repo.listPublicMaintainers(profile.id),
    deps.repo.latestMetrics(profile.id),
    deps.repo.listPublicMedia(profile.id),
    // ONE FUNCTION, imported rather than copied. The website's projection and
    // this one answer the same question about the same listing, and two
    // implementations of "where did it place" would drift the first time
    // either was tuned.
    placementOf(deps.repo, profile.id, now.getTime()),
    // PV4 — the diff's baseline. ONE FUNCTION, imported rather than copied,
    // for the same reason the placement is: the website's projection and this
    // one answer the same question about the same listing.
    snapshotBaseline(deps.repo, profile.id, snapshotDay(now)),
    deps.repo.countFollowers("listing", [profile.slug]),
    // PP5 — the history. ONE FUNCTION, imported, for the reason above.
    launchHistoryOf(deps.repo, profile.id),
  ]);

  const open = openings.filter((o) => o.status === "open");
  const card = cardOf(
    {
      slug: profile.slug,
      tagline: profile.tagline,
      stack: profile.stack,
      stackCanonical: profile.stackCanonical,
      category: profile.category,
      hosting: profile.hosting,
      pricing: profile.pricing,
      licence: profile.repoLicence,
      language: profile.repoLanguage,
      lastCommitAt: profile.repoPushedAt,
      openIssues: profile.repoOpenIssues,
      observedAt: profile.repoCheckedAt,
      roleOpeningCount: open.length,
      // The product read has the openings themselves, so it derives the facet
      // from the same rows the page renders rather than from a second query.
      openCommitments: open.map((o) => o.commitment).filter((c): c is string => c !== null),
      hasLiveUrl: profile.liveUrl !== null,
      indexable: profile.indexable,
      media,
      publishedAt: profile.publishedAt,
    },
    metrics,
    now.getTime(),
    computedAt,
  );

  const product: CatalogProduct = {
    ...card,
    // PP1 — `derived` by a published rule, and a NUMBER: the API carries the
    // count the page shows and nothing that could become a list.
    followers: derived(followerCounts.get(profile.slug) ?? 0, "followers.count", ["follows"], computedAt),
    pitch: authored(profile.pitchBody, BY_MAINTAINER),
    pitchDigest: profile.pitchDigest,
    // PV2 — `authored`, ALWAYS, and this is the one field here where the
    // wrapper earns its keep for a machine. An agent that reads this catalog
    // and runs what it finds is entitled to know that nobody measured this
    // and nothing verified it; `observed` on a shell command would say the
    // opposite of what is true.
    installLine: authored(profile.installLine, BY_MAINTAINER),
    // PV3 — `derived`, and the formula id is what makes it answerable. A
    // machine reading `true` here needs the rule that produced it, and
    // `votes.clean` resolves to published prose saying what the thresholds
    // are, that it orders nothing, and that a `false` is not a finding.
    cleanVotes: derived(
      profile.cleanVotes,
      "votes.clean",
      ["endorsements", "endorsement_integrity"],
      computedAt,
    ),
    // PV4 — NOT WRAPPED IN A `Fact`, and that is the point rather than an
    // omission. Every OTHER field here is one value with one provenance; a
    // diff is a LIST whose entries have DIFFERENT provenance — a licence
    // moving is observed, a tagline rewrite is authored — and a wrapper
    // around the list would have to pick one class for all of them and would
    // pick the wrong one for half. So each `Change` carries its own, which is
    // the same shape the page renders from.
    //
    // NULL, NOT ABSENT, like `launch` below: an API's key set is a contract a
    // client parses, and `null` says "no earlier snapshot" where `[]` says
    // "compared, nothing moved".
    changes: diffSnapshots(baseline, {
      takenAt: computedAt,
      fields: snapshotFields(profile, open.length),
    }),
    repoUrl: authored(profile.repoUrl, BY_MAINTAINER),
    liveUrl: authored(profile.liveUrl, BY_MAINTAINER),
    // OPR5 (seam S12) — the console ref of the attested public workspace,
    // exactly as the website's projection carries it; null without a grant.
    workspaceRef: profile.linkGrant ? orgPublicId(profile.orgId) : null,
    // A snapshot taken by the act of publishing — authored, and the page says
    // when. Null means the maintainer chose to publish none, which is the
    // default (OH4).
    components: profile.components
      ? authored(
          profile.components.map((c) => ({ name: c.name, kind: c.kind })),
          BY_MAINTAINER,
        )
      : null,
    maintainers: maintainers.map((m) => ({
      // Maintainer-authored, NOT a platform identity claim (OD3). The API
      // says so in the provenance rather than leaving a reader to assume.
      displayName: authored(m.displayName, BY_MAINTAINER),
      roleLabel: authored(m.roleLabel, BY_MAINTAINER),
    })),
    openings: open.map((o) => ({
      id: publicRoleOpeningId(o.id),
      title: authored(o.title, BY_MAINTAINER),
      description: authored(o.description, BY_MAINTAINER),
      commitment: authored(o.commitment, BY_MAINTAINER),
      applyRef: o.joinLinkRef,
    })),
    // UV1 — DERIVED, carrying the board's own formula id. The same sentence
    // at `/docs/formulas` explains this number wherever it appears, which is
    // what stops the API and the page from being two claims (OL-2a, OPC-4).
    //
    // NULL, NOT ABSENT, unlike on the website's projection. An API's key set
    // is a contract a client parses; a key that came and went would make
    // every consumer branch on its presence.
    launch: derived(
      placement,
      BOARD_FORMULA,
      ["launches", "metrics"],
      placement ? `${placement.day}T00:00:00.000Z` : computedAt,
    ),
    // PP5 — the history, read from the same board rows under the same
    // formula. `[]` is a true sentence about a listing that never launched.
    launches: derived(launches, BOARD_FORMULA, ["launches", "metrics"], computedAt),
  };

  void env;
  return successResponse({ product }, requestId);
}

/** The taxonomy, so a client can build its own navigation rather than
 *  hard-coding ours — and so the docs page has one source for it. */
export function handleCatalogFacets(requestId: string): Response {
  const groups: CatalogFacetGroup[] = FACETS.map((group) => ({
    id: group.id,
    label: group.label,
    kind: group.kind,
    cardinality: group.cardinality,
    description: group.description,
    values: group.values.map((v) => ({ value: v.value, label: v.label })),
  }));
  return successResponse({ facets: groups }, requestId);
}
