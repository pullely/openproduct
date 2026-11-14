// The openproduct repository (saas-openproduct OD0).
//
// Two read families, and the difference between them is the epic's central
// safety property rather than a style choice:
//
//   listPublicCards / getPublicProfile / listPublic*  — filter
//     `visibility = 'public'` INSIDE the method. There is no public-read
//     function in this file that can return a private row, so a future
//     handler bug cannot leak one (design.md §5). They take no org id and no
//     actor, because the public plane has no principal at all.
//
//   listProfilesForOrg / getProfileForOrg / list*     — org-scoped and
//     unfiltered, because a maintainer must see their own draft.
//
// Explicit column lists throughout. No `SELECT *`, ever (design.md §4 rule 1):
// a star would re-derive the public shape from whatever the table happens to
// hold, which is the denylist failure this epic is built to avoid.

import { LAUNCH_THREAD_TAG, MOST_ACTIVE_FOLD, canonicaliseStack } from "@openproduct/contracts";

import type { SqlExecutor, SqlRow } from "./executor.js";
import type { Uuid } from "./ids.js";
import { SWEEP_LEDGER_PHASES } from "./types.js";
import {
  OPENPRODUCT_SUBJECT_REGISTRY,
  exportColumns,
  redactedColumnsOf,
  subjectEntryKey,
  tombstoneSql,
  type SubjectColumn,
} from "./subject-registry.js";
import type {
  ActivityEventRecord,
  AppendActivityInput,
  AppendAuditInput,
  DueSourceRecord,
  MediaKindName,
  CataloguePage,
  CataloguePageInput,
  CatalogueRebuildInput,
  CatalogueRebuildReport,
  MetricRecord,
  ProductMediaRecord,
  PublicCardsPage,
  PublicCardsPageInput,
  DueCaptureRecord,
  ScreenshotCaptureRecord,
  SignalSourceName,
  SignalSourceRecord,
  WriteMetricInput,
  AppealRecord,
  AppendModerationActInput,
  CreateAppealInput,
  ResolveAppealInput,
  CreateReportInput,
  ModerationActRecord,
  BoardLaunchRecord,
  CollectionRow,
  FlagRecord,
  LaunchEndorsementRecord,
  QueuedReportRecord,
  ReportRecord,
  PostRecord,
  ThreadRecord,
  ModerationStateName,
  TrustLevelName,
  TrustLevelRecord,
  ApplicationRecord,
  AuditEntryRecord,
  ContributorRecord,
  ListingRole,
  StoredLinkGrant,
  CreateProfileInput,
  MaintainerInput,
  OpenproductRepository,
  ProfileCardRecord,
  ProfileRecord,
  LaunchRecord,
  PublicMaintainerRecord,
  PublishedMaintainerRecord,
  EndorsementRecord,
  HandleRecord,
  RepoObservation,
  RoleOpeningRecord,
  UpdateProfileInput,
  UpsertRoleOpeningInput,
  FollowKindName,
  RosterEdgeRecord,
  RosterMemberRecord,
  SubjectRosterRecord,
  InsertMediaInput,
  SubjectErasure,
  SubjectExport,
  SweepLedgerPhase,
  SweepPhaseStateRecord,
} from "./types.js";

/** EN0 — one endorsement row. */
type EndorsementRowSql = {
  profile_id: string;
  subject_id: string;
  state: string;
  created_at: string | Date;
  withdrawn_at: string | Date | null;
  [key: string]: unknown;
};

function endorsementOf(row: EndorsementRowSql): EndorsementRecord {
  return {
    profileId: row.profile_id,
    subjectId: row.subject_id,
    state: row.state === "pending" ? "pending" : "confirmed",
    createdAt: iso(row.created_at)!,
    withdrawnAt: iso(row.withdrawn_at),
  };
}

/** CG0 — a handle row. */
type HandleRowSql = {
  handle: string;
  subject_id: string | null;
  reserved_for: string | null;
  claimed_at: string | Date | null;
  released_at: string | Date | null;
  [key: string]: unknown;
};

function handleOf(row: HandleRowSql): HandleRecord {
  return {
    handle: row.handle,
    subjectId: row.subject_id,
    reservedFor: row.reserved_for,
    claimedAt: iso(row.claimed_at),
    releasedAt: iso(row.released_at),
  };
}

/** DS0 — the search index's SQL row shape, and its JSONB tolerance. */
type SearchIndexRowSql = {
  kind: string;
  entity_id: string;
  title: string;
  summary: string | null;
  terms: string[] | null;
  facets: unknown;
  [key: string]: unknown;
};

/** CG3 — one `product_people` row as the driver returns it. */
interface RosterEdgeRowSql extends SqlRow {
  profile_id: string;
  subject_id: string;
  state: string;
  origin: string;
  role_label: string | null;
  invited_by: string;
  invited_at: string | Date;
  confirmed_at: string | Date | null;
  retired_at: string | Date | null;
}

function rosterEdgeOf(row: RosterEdgeRowSql): RosterEdgeRecord {
  return {
    profileId: row.profile_id,
    subjectId: row.subject_id,
    state: row.state as RosterEdgeRecord["state"],
    origin: row.origin as RosterEdgeRecord["origin"],
    roleLabel: row.role_label,
    invitedBy: row.invited_by,
    invitedAt: iso(row.invited_at)!,
    confirmedAt: iso(row.confirmed_at),
    retiredAt: iso(row.retired_at),
  };
}

/** The same JSONB-or-string problem as `parseFacets`, for a plain array of
 *  slugs. Anything that is not a string is dropped rather than coerced: a
 *  `null` in this list would render as an empty product link. */
/**
 * A Postgres array literal — `{a,"b c",NULL}` — as the driver hands it back.
 *
 * Under `fetch_types: false` postgres.js cannot parse a `text[]` column, so
 * every `array_agg` and every `TEXT[]` column arrives as the literal's text
 * (openproduct-worldclass-v2 LI1: the driver harness is where this was first
 * seen, because pglite parses arrays natively and never showed it). One
 * parser, the inverse of `toPgArrayLiteral`: quoted elements with backslash
 * escapes, bare elements, `NULL` dropped, nested braces not supported because
 * nothing here reads a nested array.
 */
export function parsePgTextArray(literal: string): string[] {
  const text = literal.trim();
  if (!text.startsWith("{") || !text.endsWith("}")) return [];
  const body = text.slice(1, -1);
  if (body.length === 0) return [];
  const out: string[] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] === '"') {
      let value = "";
      i += 1;
      while (i < body.length && body[i] !== '"') {
        if (body[i] === "\\" && i + 1 < body.length) {
          value += body[i + 1];
          i += 2;
        } else {
          value += body[i];
          i += 1;
        }
      }
      i += 1; // the closing quote
      out.push(value);
    } else {
      let end = body.indexOf(",", i);
      if (end === -1) end = body.length;
      const raw = body.slice(i, end).trim();
      if (raw !== "NULL") out.push(raw);
      i = end;
    }
    if (body[i] === ",") i += 1;
  }
  return out;
}

/** A list of strings, whichever of the three shapes the driver produced:
 *  a parsed array (pglite), a JSON string (`jsonb_agg`), or a Postgres array
 *  literal (`array_agg`, `TEXT[]` — LI1). */
function parseStringList(value: unknown): string[] {
  let parsed: unknown = value;
  if (typeof value === "string" && value.length > 0) {
    if (value.startsWith("{")) return parsePgTextArray(value);
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is string => typeof entry === "string");
}

function parseSlugList(value: unknown): string[] {
  return parseStringList(value);
}

/** JSONB comes back parsed on some paths and as a string on others (the
 *  workers client runs `fetch_types:false`). Both handled here, once. */
function parseFacets(value: unknown): Record<string, string[]> {
  let parsed: unknown = value;
  if (typeof value === "string" && value.length > 0) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (Array.isArray(raw)) out[key] = raw.map((v) => String(v));
  }
  return out;
}

/** Every column of a profile, in one place, named once. */
const PROFILE_COLUMNS = `
  id, org_id, project_id, slug, visibility, tagline,
  pitch_body, pitch_digest, repo_url, live_url, install_line, stack,
  stack_canonical, category, hosting, pricing,
  repo_visibility, repo_licence, repo_checked_at,
  repo_name, repo_description, repo_topics,
  repo_language, repo_pushed_at, repo_open_issues,
  reviewed_at, reviewed_by, published_at, indexable, clean_votes, components, link_grant,
  moderation_state, moderated_at, moderation_act_id,
  created_by, updated_by, created_at, updated_at
`;

const ROLE_OPENING_COLUMNS = `
  id, profile_id, title, description, commitment, status, join_link_ref, sort_order
`;

type ProfileRow = {
  id: string;
  org_id: string;
  project_id: string;
  slug: string;
  visibility: string;
  tagline: string | null;
  pitch_body: string | null;
  install_line: string | null;
  clean_votes: boolean;
  pitch_digest: string | null;
  repo_url: string | null;
  live_url: string | null;
  stack: unknown;
  stack_canonical?: unknown;
  category?: string | null;
  hosting?: string | null;
  pricing?: string | null;
  repo_visibility: string | null;
  repo_licence: string | null;
  repo_checked_at: string | Date | null;
  // IN2 — optional, because a row read against a database that has not yet
  // applied 1780 has no such columns. `undefined` there is "not observed",
  // which is what the three of them mean anyway.
  repo_name?: string | null;
  repo_description?: string | null;
  repo_topics?: unknown;
  // PV0 — optional for the same reason: a row read before 1810 has no such
  // columns, and `undefined` there means "not observed".
  repo_language?: string | null;
  repo_pushed_at?: string | Date | null;
  repo_open_issues?: number | null;
  reviewed_at: string | Date | null;
  reviewed_by: string | null;
  published_at: string | Date | null;
  indexable?: boolean | null;
  components?: unknown;
  link_grant?: unknown;
  moderation_state?: string | null;
  moderated_at?: string | Date | null;
  moderation_act_id?: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

/**
 * The seven singleton state rows, one per materialisation phase (LI0, then OS2, then OS5). Three
 * predate this and name their floor differently (`built_at` for the index,
 * `swept_at` for the rest); two were created by 1860 so the board and digest
 * cuts have somewhere to say they ran. `ownsRunAt` is whether THIS ledger
 * stamps the floor on success — only for the two phases with no other writer.
 */
const SWEEP_STATE_TABLES: Record<
  SweepLedgerPhase,
  {
    table: string;
    ranAt: "GREATEST(built_at, checked_at)" | "swept_at" | "computed_at";
    ownsRunAt: boolean;
  }
> = {
  // OS5 — the catalogue phase stamps its own moment (`rebuildCatalogue`), so
  // the ledger only says whether its last failure is over. Created by 1925
  // with LI0's error columns from birth.
  catalogue: { table: "openproduct.catalog_state", ranAt: "computed_at", ownsRunAt: false },
  // OPN-11 — the index's last run is the later of its last BUILD and its last
  // CLEAN CHECK. `built_at` alone moves only when something changed, so on a
  // quiet catalogue it froze and `/health` called a phase stale that ran on
  // every tick. GREATEST skips a NULL, so a never-checked index reads as
  // built and a never-built one as never run.
  searchIndex: {
    table: "openproduct.search_index_state",
    ranAt: "GREATEST(built_at, checked_at)",
    ownsRunAt: false,
  },
  integrity: { table: "openproduct.integrity_sweep_state", ranAt: "swept_at", ownsRunAt: false },
  defence: { table: "openproduct.defence_sweep_state", ranAt: "swept_at", ownsRunAt: false },
  board: { table: "openproduct.board_sweep_state", ranAt: "swept_at", ownsRunAt: true },
  digest: { table: "openproduct.digest_sweep_state", ranAt: "swept_at", ownsRunAt: true },
  // OS2 — the snapshot phase stamps its own floor (`markSnapshotSwept`), so
  // the ledger only says whether its last failure is over. Created by 1895
  // with LI0's error columns from birth.
  snapshots: { table: "openproduct.snapshot_sweep_state", ranAt: "swept_at", ownsRunAt: false },
};

function iso(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * `stack` is JSONB, not TEXT[] — the workers' postgres client runs
 * `fetch_types:false`, so a real array comes back as a string on some paths
 * and as a parsed value on others. Both are handled here rather than at four
 * call sites.
 */
/** OH4 — parse the components snapshot, tolerating both JSONB encodings the
 *  fetch_types:false client produces (object or string), and refusing any
 *  entry that is not exactly {name, kind}. */
function componentsOf(value: unknown): Array<{ name: string; kind: string | null }> | null {
  let parsed: unknown = value;
  if (typeof value === "string" && value.length > 0) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  const out: Array<{ name: string; kind: string | null }> = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string") continue;
    out.push({ name: e.name, kind: typeof e.kind === "string" ? e.kind : null });
  }
  return out.length > 0 ? out : null;
}

function stackOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function linkGrantOf(raw: unknown): StoredLinkGrant | null {
  const value = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== "object") return null;
  const g = value as Record<string, unknown>;
  if (
    typeof g.doorRef !== "string" ||
    typeof g.grantedBy !== "string" ||
    typeof g.grantedAt !== "string" ||
    g.workspaceVisibility !== "public"
  ) {
    return null;
  }
  return {
    doorRef: g.doorRef,
    grantedBy: g.grantedBy,
    grantedAt: g.grantedAt,
    workspaceVisibility: "public",
  };
}

/**
 * Narrow the column to the union, defaulting to `visible`.
 *
 * Deliberately NOT `row.moderation_state as ModerationStateName`: this value
 * decides whether a page renders a listing or a tombstone, and a typo in a
 * migration or a hand-run UPDATE would otherwise become a state nothing
 * handles. An unrecognised value reads as `visible` — the failure that shows
 * a listing that should be hidden is worse than the one that hides a listing
 * that should show, but this column is CHECK-constrained in the database, so
 * the only way here is a value the constraint allows and this file has not
 * learned yet. Failing open keeps that a rendering bug rather than an outage.
 */
function moderationStateOf(value: string | null | undefined): ModerationStateName {
  return value === "delisted" || value === "removed" ? value : "visible";
}

function profileOf(row: ProfileRow): ProfileRecord {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    slug: row.slug,
    visibility: row.visibility === "public" ? "public" : "private",
    tagline: row.tagline,
    pitchBody: row.pitch_body,
    pitchDigest: row.pitch_digest,
    repoUrl: row.repo_url,
    liveUrl: row.live_url,
    // PV2 — the maintainer's own words, beside the pitch rather than with the
    // `repo_*` family. Never observed, never derived.
    installLine: row.install_line,
    // PV3 — a boolean and never a count. `false` covers both "too few upvotes
    // to check" and "checked and did not clear", and nothing here can tell
    // them apart, which is the point.
    cleanVotes: row.clean_votes === true,
    stack: stackOf(row.stack),
    stackCanonical: stackOf(row.stack_canonical),
    category: row.category ?? null,
    hosting: row.hosting ?? null,
    pricing: row.pricing ?? null,
    repoVisibility:
      row.repo_visibility === "public" ? "public" : row.repo_visibility === "private" ? "private" : null,
    repoLicence: row.repo_licence,
    repoCheckedAt: iso(row.repo_checked_at),
    // IN2. `repoTopics` is `null` when nothing has been observed and `[]`
    // when the repository was read and declared none — the difference between
    // "not measured" and "measured as empty" (OPC-C), which `stackOf` would
    // flatten to `[]` and so is not used here.
    repoName: row.repo_name ?? null,
    repoDescription: row.repo_description ?? null,
    repoTopics: row.repo_topics == null ? null : stackOf(row.repo_topics),
    repoLanguage: row.repo_language ?? null,
    repoPushedAt: iso(row.repo_pushed_at ?? null),
    // A count, or `null` for "not observed". Not `0` — the difference between
    // a repository with no open issues and one nobody has read is exactly
    // what an observed frame must not blur (OPC-C).
    repoOpenIssues: typeof row.repo_open_issues === "number" ? row.repo_open_issues : null,
    reviewedAt: iso(row.reviewed_at),
    reviewedBy: row.reviewed_by,
    publishedAt: iso(row.published_at),
    // Absent only on a row read before migration 1370; those were all cleared
    // under OD's rules, so TRUE is the honest default rather than a guess.
    indexable: row.indexable !== false,
    components: componentsOf(row.components),
    linkGrant: linkGrantOf(row.link_grant),
    // TS3. Absent only on a row read before migration 1440, and every such
    // row is `visible` by construction: until 1440 there was nowhere to
    // record an act, so nothing had been acted on.
    moderationState: moderationStateOf(row.moderation_state),
    moderatedAt: iso(row.moderated_at ?? null),
    moderationActId: row.moderation_act_id ?? null,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

type RoleOpeningRow = {
  id: string;
  profile_id: string;
  title: string;
  description: string | null;
  commitment: string | null;
  status: string;
  join_link_ref: string | null;
  sort_order: number | string;
};

function roleOpeningOf(row: RoleOpeningRow): RoleOpeningRecord {
  const status = row.status === "filled" ? "filled" : row.status === "closed" ? "closed" : "open";
  return {
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    description: row.description,
    commitment: row.commitment,
    status,
    joinLinkRef: row.join_link_ref,
    sortOrder: Number(row.sort_order),
  };
}

type MaintainerRow = {
  profile_id: string;
  subject_id: string;
  display_name: string | null;
  role_label: string | null;
  sort_order: number | string;
};

function maintainerOf(row: MaintainerRow): PublishedMaintainerRecord {
  return {
    profileId: row.profile_id,
    subjectId: row.subject_id,
    displayName: row.display_name,
    roleLabel: row.role_label,
    sortOrder: Number(row.sort_order),
  };
}

/** Directory reads are bounded: an unbounded public list is a free full scan. */
const DEFAULT_CARD_LIMIT = 100;
const MAX_CARD_LIMIT = 200;
/** OS5 — what a null publication orders as, on both sides of the keyset. */
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

// ─── openproduct-home (OH0) row shapes ───

type ContributorRow = {
  subject_id: string;
  display_name: string | null;
  bio: string | null;
  profile_public?: boolean | null;
  open_to_project?: boolean | null;
  github_url?: string | null;
  site_url?: string | null;
  published_at?: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

/** CG1 — one row of the public profile read. */
type PublicContributorRowSql = {
  handle: string;
  display_name: string | null;
  bio: string | null;
  github_url: string | null;
  site_url: string | null;
  open_to_project: boolean | null;
  published_at: string | Date | null;
  maintains: unknown;
  contributes_to: unknown;
  [key: string]: unknown;
}

/**
 * The LEFT JOIN that resolves a person's handle FOR LINKING (CG4).
 *
 * WRITTEN ONCE AND CALLED THREE TIMES, because the property it carries is a
 * biconditional and a biconditional is exactly the kind of thing that survives
 * in one query and quietly rots in the copy: a handle is present here IF AND
 * ONLY IF `/@handle` resolves. A caller can then render a link on presence
 * alone and never has to know why one is missing (XP-5).
 *
 * BOTH GATES, the same two `getPublicContributor` applies:
 *
 *   1. their own act   `profile_public`, and a `published_at` to prove it
 *   2. standing        an owner or maintainer role on a PUBLIC listing
 *
 * The second is the one it would be natural to forget, and forgetting it is
 * how a 404 ends up under somebody's name on the most read page in the estate.
 * Being on a roster is NOT standing: a credited designer with no edit access
 * has a consented place on a product and no profile page of their own.
 *
 * `subjectCol` is a COLUMN REFERENCE from the calling query, never a value —
 * there is no caller-supplied string on this path.
 */
/**
 * LISTED — public AND not acted on (TS3).
 *
 * Two independent facts, and from here on the word "listed" means both. A
 * maintainer decides `visibility`; the estate decides `moderation_state`; a
 * listing reaches an amplification surface only when both agree.
 *
 * Every read that PUTS A LISTING IN FRONT OF SOMEBODY who did not ask for it
 * by name uses this — the directory, search, the digest and its feeds, the
 * launch board, contributor stats, the overlay's counts. Three kinds of read
 * deliberately do NOT, and the exceptions are the whole of TS-3:
 *
 *   1. `getPublicProfile` — the single listing, asked for by slug. It must
 *      still return a delisted or removed row, because its page renders a
 *      TOMBSTONE rather than a 404. Filtering here would make removal silent,
 *      which is the one thing TS-3 forbids.
 *   2. The sub-reads of a listing already resolved that way (its roles, its
 *      maintainers, its metrics). A delisted listing's page renders in full;
 *      the handler decides what a removed one shows, not the SQL.
 *   3. The maintainer's own studio reads. Somebody must be able to see what
 *      happened to their own listing, and a removal that vanishes from the
 *      author's view is a removal they cannot appeal.
 */
/**
 * OS5 — the digest's baseline is looked for this many days before the
 * window, not in the whole history. OS2 records every listed listing once a
 * day, so the eve's row is the baseline for every listing the sweep reached;
 * a week of lookback covers a sweep that missed days. OS0's baseline measured
 * the unbounded pass at 6.5 s over a year of snapshots — it walked 1.8
 * million index entries to answer a question that is at most one day old.
 */
export const SNAPSHOT_BASELINE_LOOKBACK_DAYS = 7;

/**
 * OS5 — a timestamp as `to_jsonb` renders it (`2026-09-09T12:00:00+00:00`,
 * with microseconds when the row has them) back to the ISO form every other
 * read returns, so a card read from the materialised catalogue is
 * byte-identical to the same card read from the live join. A value the
 * engine cannot parse is returned as it came rather than invented.
 */
function jsonInstant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const at = Date.parse(text);
  return Number.isNaN(at) ? text : new Date(at).toISOString();
}

/** OS5 — one row of `catalog_cards` joined to its singleton, as `listCataloguePage` reads it. */
interface CatalogueRow extends SqlRow {
  computed_at: string | Date | null;
  today_count: number | string | null;
  week_count: number | string | null;
  month_count: number | string | null;
  total_count: number | string | null;
  slug: string | null;
  ordering_merges: number | string | null;
  record: unknown;
  metrics: unknown;
  media: unknown;
}

/** A JSON value that should be an object, parsed if the driver left it as text. */
function jsonObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function jsonArray(value: unknown): Record<string, unknown>[] {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
}

/**
 * OB3 — `sort.most-active`'s folded key, as SQL computes it: exactly
 * `ranking.ts` `mostActiveKeyOf`, so the catalogue's order and the
 * comparator's cannot disagree. NULL when the changes are not observed (the
 * order puts those last, never as zero); a missing upvote count is zero by
 * the published rule ("ranked on its changes alone").
 */
function mostActiveKeySql(merges: string, upvotes: string): string {
  return `CASE WHEN ${merges} IS NULL THEN NULL
               ELSE (${merges} + 1) * (COALESCE(${upvotes}, 0) + 1) * ${MOST_ACTIVE_FOLD}
                    + LEAST(${merges}, ${MOST_ACTIVE_FOLD - 1}) END`;
}

/** OB3 — the latest `endorsements.7d` still inside its freshness, by index. */
function latestUpvotesLateral(profileCol: string, sinceParam: string): string {
  return `LEFT JOIN LATERAL (
             SELECT m.value AS upvotes
               FROM openproduct.metrics m
              WHERE m.profile_id = ${profileCol} AND m.metric = 'endorsements' AND m.window_key = '7d'
                AND m.observed_at >= ${sinceParam}::timestamptz
              ORDER BY m.observed_at DESC
              LIMIT 1
           ) lu ON TRUE`;
}

function listed(alias: string): string {
  const a = alias ? `${alias}.` : "";
  return `${a}visibility = 'public' AND ${a}moderation_state = 'visible'`;
}

function handleJoinFor(subjectCol: string): string {
  return `LEFT JOIN openproduct.contributors hc
             ON hc.subject_id = ${subjectCol}
            AND hc.profile_public
            AND hc.published_at IS NOT NULL
           LEFT JOIN openproduct.handles h
             ON h.subject_id = ${subjectCol}
            AND h.released_at IS NULL
            AND hc.subject_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM openproduct.listing_maintainers hlm
                JOIN openproduct.profiles hp ON hp.id = hlm.profile_id
               WHERE hlm.subject_id = ${subjectCol} AND ${listed("hp")}
            )`;
}

/** LC4 — one collection row, as SQL hands it back. */
interface CollectionRowSql extends SqlRow {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  curator_subject_id: string;
  state: string;
  published_at: string | Date | null;
  retired_at: string | Date | null;
}

function collectionOf(row: CollectionRowSql): CollectionRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    blurb: row.blurb,
    curatorSubjectId: row.curator_subject_id,
    state: row.state,
    publishedAt: iso(row.published_at),
    retiredAt: iso(row.retired_at),
  };
}

/** LC0 — one launch row, as SQL hands it back. */
interface LaunchRowSql extends SqlRow {
  id: string;
  profile_id: string;
  state: string;
  version_label: string;
  scheduled_for: string | Date;
  launched_at: string | Date | null;
  cancelled_at: string | Date | null;
  missed_at: string | Date | null;
  scheduled_by: string;
  /** LC3 fills this; LC0 created the column and left it null. Optional here
   *  because the older SELECTs in this file do not name it. */
  board_rank_at?: string | Date | null;
}

function launchOf(row: LaunchRowSql): LaunchRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    state: row.state as LaunchRecord["state"],
    versionLabel: row.version_label,
    // THROUGH `iso`, like every timestamp this repository returns. The studio
    // renders these and the contract promises strings; a raw driver `Date`
    // reaching a `.slice` is the bug CG2's sitemap already paid for once.
    scheduledFor: iso(row.scheduled_for)!,
    launchedAt: iso(row.launched_at),
    cancelledAt: iso(row.cancelled_at),
    missedAt: iso(row.missed_at),
    scheduledBy: row.scheduled_by,
    boardRankAt: iso(row.board_rank_at ?? null),
  };
}

/** JSONB comes back parsed on some paths and as a string on others. */
function maintainsOf(value: unknown): Array<{ slug: string; tagline: string | null }> {
  let parsed: unknown = value;
  if (typeof value === "string" && value.length > 0) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: Array<{ slug: string; tagline: string | null }> = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.slug !== "string") continue;
    out.push({ slug: e.slug, tagline: typeof e.tagline === "string" ? e.tagline : null });
  }
  return out;
}

type ApplicationRow = {
  id: string;
  subject_id: string;
  profile_id: string;
  role_opening_id: string;
  jr_request_ref: string | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
  product_slug?: string | null;
  product_tagline?: string | null;
}

function contributorOf(row: ContributorRow): ContributorRecord {
  return {
    subjectId: row.subject_id,
    displayName: row.display_name,
    bio: row.bio,
    // CG1 — a row read before 1380 has none of these, and the honest default
    // for every one of them is the private, un-advertised state.
    profilePublic: row.profile_public === true,
    openToProject: row.open_to_project === true,
    githubUrl: row.github_url ?? null,
    siteUrl: row.site_url ?? null,
    publishedAt: iso(row.published_at ?? null),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function applicationOf(row: ApplicationRow): ApplicationRecord {
  return {
    id: row.id,
    subjectId: row.subject_id,
    profileId: row.profile_id,
    roleOpeningId: row.role_opening_id,
    jrRequestRef: row.jr_request_ref,
    status: row.status as ApplicationRecord["status"],
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    ...("product_slug" in row
      ? { productSlug: row.product_slug ?? null, productTagline: row.product_tagline ?? null }
      : {}),
  };
}


// ─── openproduct-commons TS0 — row mappers ───

interface ReportRow {
  [key: string]: unknown;
  id: string;
  subject_kind: string;
  subject_ref: string;
  reporter_subject_id: string;
  reason: string;
  detail: string | null;
  state: string;
  resolved_at: string | Date | null;
  resolved_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface ModerationActRow {
  [key: string]: unknown;
  id: string;
  subject_kind: string;
  subject_ref: string;
  act: string;
  actor_id: string;
  reason: string;
  report_id: string | null;
  occurred_at: string | Date;
}

function trustRow(row: {
  subject_id: string;
  level: string;
  set_by: string;
  reason: string | null;
  set_at: string | Date;
}): TrustLevelRecord {
  return {
    subjectId: row.subject_id,
    level: row.level as TrustLevelName,
    setBy: row.set_by,
    reason: row.reason,
    setAt: iso(row.set_at)!,
  };
}

function reportRow(row: ReportRow): ReportRecord {
  return {
    id: row.id,
    subjectKind: row.subject_kind,
    subjectRef: row.subject_ref,
    reporterSubjectId: row.reporter_subject_id,
    reason: row.reason,
    detail: row.detail,
    state: row.state,
    resolvedAt: iso(row.resolved_at),
    resolvedBy: row.resolved_by,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

type FlagRow = {
  id: string;
  kind: string;
  subject_kind: string;
  subject_ref: string;
  state: string;
  evidence: string;
  consequence: string;
  raised_at: string | Date;
  resolved_at: string | Date | null;
  resolved_by: string | null;
};

function flagRow(row: FlagRow): FlagRecord {
  return {
    id: row.id,
    kind: row.kind,
    subjectKind: row.subject_kind,
    subjectRef: row.subject_ref,
    state: row.state,
    evidence: row.evidence,
    consequence: row.consequence,
    raisedAt: iso(row.raised_at)!,
    resolvedAt: iso(row.resolved_at),
    resolvedBy: row.resolved_by,
  };
}

interface AppealRow {
  [key: string]: unknown;
  id: string;
  act_id: string;
  subject_kind: string;
  subject_ref: string;
  appellant_subject_id: string;
  says: string;
  state: string;
  outcome_act_id: string | null;
  reversal_act_id: string | null;
  filed_at: string | Date;
  decided_at: string | Date | null;
  decided_by: string | null;
}

const APPEAL_COLUMNS = `id, act_id, subject_kind, subject_ref, appellant_subject_id, says,
                        state, outcome_act_id, reversal_act_id, filed_at, decided_at, decided_by`;

function appealRow(row: AppealRow): AppealRecord {
  return {
    id: row.id,
    actId: row.act_id,
    subjectKind: row.subject_kind,
    subjectRef: row.subject_ref,
    appellantSubjectId: row.appellant_subject_id,
    says: row.says,
    state: row.state as AppealRecord["state"],
    outcomeActId: row.outcome_act_id,
    reversalActId: row.reversal_act_id,
    filedAt: iso(row.filed_at)!,
    decidedAt: iso(row.decided_at),
    decidedBy: row.decided_by,
  };
}

function actRow(row: ModerationActRow): ModerationActRecord {
  return {
    id: row.id,
    subjectKind: row.subject_kind,
    subjectRef: row.subject_ref,
    act: row.act,
    actorId: row.actor_id,
    reason: row.reason,
    reportId: row.report_id,
    occurredAt: iso(row.occurred_at)!,
  };
}


/**
 * The directory card's columns and its mapper, in one place.
 *
 * TWO reads produce cards — the directory and the contributor's saved list —
 * and before CT1 each carried its own copy of the SELECT and the mapping.
 * Widening the card meant editing both, and forgetting one would have shipped
 * two different public shapes behind one type. Named columns, never `p.*`:
 * the exact-key-set test is only worth anything while the SELECT is as
 * literal as the projection it feeds.
 */
const CARD_COLUMNS = `
  p.slug, p.tagline, p.stack, p.stack_canonical, p.category, p.hosting, p.pricing,
  p.repo_licence, p.published_at,
  -- PV0 — the rest of the observed row and its moment. On the CARD as well as
  -- the profile, because the catalog API answers both from one shape (WC-9),
  -- and a shape that carried these on the detail and not the list would make
  -- a machine ask twice for the same four values.
  p.repo_language, p.repo_pushed_at, p.repo_open_issues, p.repo_checked_at,
  (SELECT COUNT(*) FROM openproduct.role_openings o
    WHERE o.profile_id = p.id AND o.status = 'open') AS role_opening_count,
  -- DS1 — the AUTHORED commitment lines of the open roles, so the rail's
  -- \`openings\` facet is derived from the openings themselves rather than
  -- from a count. A contributor choosing where to spend an evening is asking
  -- what the commitment IS, not how many roles exist.
  --
  -- The lines come back verbatim; the contract folds them to facet values and
  -- keeps what it does not recognise out of the counts (CT-1).
  COALESCE((SELECT array_agg(o2.commitment ORDER BY o2.sort_order, o2.id)
              FROM openproduct.role_openings o2
             WHERE o2.profile_id = p.id AND o2.status = 'open'
               AND o2.commitment IS NOT NULL), '{}') AS open_commitments,
  -- DS1 — whether there is something running to try. A BOOLEAN, not the URL:
  -- the card is a list row and does not link out, so carrying the address
  -- would be widening the public projection for a filter's benefit.
  (p.live_url IS NOT NULL) AS has_live_url,
  -- TS1 — the sitemap is built from this read, and a sitemap that advertises
  -- a page the page itself marks noindex gives a crawler two contradictory
  -- instructions about one URL.
  p.indexable
`;

type CardRow = {
  [key: string]: unknown;
  slug: string;
  tagline: string | null;
  stack: unknown;
  stack_canonical: unknown;
  category: string | null;
  hosting: string | null;
  pricing?: string | null;
  repo_licence: string | null;
  repo_language?: string | null;
  repo_pushed_at?: string | Date | null;
  repo_open_issues?: number | null;
  repo_checked_at?: string | Date | null;
  role_opening_count: number | string;
  open_commitments: string[] | null;
  has_live_url: boolean | null;
  indexable?: boolean | null;
  published_at: string | Date | null;
};

function cardOf(row: CardRow): ProfileCardRecord {
  return {
    slug: row.slug,
    tagline: row.tagline,
    stack: stackOf(row.stack),
    stackCanonical: stackOf(row.stack_canonical),
    category: row.category,
    hosting: row.hosting,
    pricing: row.pricing ?? null,
    // The licence the App OBSERVED at publish, not a claim a maintainer
    // typed (OD-F).
    licence: row.repo_licence,
    // PV0 — the observed row travels with the card.
    language: row.repo_language ?? null,
    lastCommitAt: iso(row.repo_pushed_at ?? null),
    openIssues: typeof row.repo_open_issues === "number" ? row.repo_open_issues : null,
    observedAt: iso(row.repo_checked_at ?? null),
    roleOpeningCount: Number(row.role_opening_count),
    openCommitments: parseStringList(row.open_commitments),
    hasLiveUrl: row.has_live_url === true,
    indexable: row.indexable !== false,
    publishedAt: iso(row.published_at),
  };
}


// ─── openproduct-commons SN1 — row mappers ───

interface SourceRow {
  [key: string]: unknown;
  profile_id: string;
  source: string;
  locator: string | null;
  last_success_at: string | Date | null;
  failure_count: number | string;
  last_error: string | null;
  withdrawn_at: string | Date | null;
}

interface MetricRow {
  [key: string]: unknown;
  profile_id: string;
  metric: string;
  window_key: string;
  value: number | string;
  source: string;
  observed_at: string | Date;
}

interface ActivityRow {
  [key: string]: unknown;
  id: string;
  profile_id: string;
  kind: string;
  summary: string;
  actor_subject_id: string | null;
  source: string;
  occurred_at: string | Date;
}

/** MD0 — the media plane's row shape. */
interface MediaRow {
  [key: string]: unknown;
  id: string;
  kind: string;
  storage_ref: string;
  alt_text: string;
  width: number;
  height: number;
  position: number;
  observed_at: string | Date | null;
}

/** Explicit, like every other column list here. No `SELECT *`, ever. */
const MEDIA_COLUMNS =
  "m.id, m.kind, m.storage_ref, m.alt_text, m.width, m.height, m.position, m.observed_at";

/**
 * DOCUMENT ORDER: the hero, then the gallery in the maker's order, then the
 * capture.
 *
 * The order is decided HERE rather than by a renderer, because two surfaces
 * ordering a listing's images differently is two answers to one question —
 * the same reason OL-2a keeps ranking out of the web layer. `CASE` rather
 * than alphabetical: 'gallery' < 'hero' < 'screenshot' would put the gallery
 * first, which is not the document.
 */
const MEDIA_ORDER =
  "CASE m.kind WHEN 'logo' THEN 0 WHEN 'hero' THEN 1 WHEN 'gallery' THEN 2 ELSE 3 END, m.position ASC, m.id ASC";

function mediaOf(row: MediaRow): ProductMediaRecord {
  return {
    id: row.id,
    kind: row.kind as MediaKindName,
    storageRef: row.storage_ref,
    alt: row.alt_text,
    width: Number(row.width),
    height: Number(row.height),
    position: Number(row.position),
    observedAt: iso(row.observed_at),
  };
}

interface CaptureRow extends SqlRow {
  profile_id: string;
  target: string;
  attempted_at: string | Date;
  captured_at: string | Date | null;
  failure_count: number | string;
  last_error: string | null;
  withdrawn_at: string | Date | null;
}

const CAPTURE_COLUMNS =
  "profile_id, target, attempted_at, captured_at, failure_count, last_error, withdrawn_at";

function captureOf(row: CaptureRow): ScreenshotCaptureRecord {
  return {
    profileId: row.profile_id,
    target: row.target,
    attemptedAt: iso(row.attempted_at) ?? "",
    capturedAt: iso(row.captured_at),
    failureCount: Number(row.failure_count),
    lastError: row.last_error,
    withdrawnAt: iso(row.withdrawn_at),
  };
}

function sourceOf(row: SourceRow): SignalSourceRecord {
  return {
    profileId: row.profile_id,
    source: row.source as SignalSourceName,
    locator: row.locator,
    lastSuccessAt: iso(row.last_success_at),
    failureCount: Number(row.failure_count),
    lastError: row.last_error,
    withdrawnAt: iso(row.withdrawn_at),
  };
}

function metricOf(row: MetricRow): MetricRecord {
  return {
    profileId: row.profile_id,
    metric: row.metric,
    window: row.window_key,
    value: Number(row.value),
    source: row.source as SignalSourceName,
    observedAt: iso(row.observed_at)!,
  };
}

type ThreadRow = {
  id: string;
  tag: string;
  title: string;
  state: string;
  created_at: string | Date | null;
  last_post_at: string | Date | null;
  author_subject_id: string;
  author_handle: string | null;
  author_name: string | null;
  post_count: number | string;
  profile_id?: string;
  answer_post_id?: string | null;
};

type PostRow = {
  id: string;
  author_subject_id: string;
  body: string;
  moderation_state: string;
  created_at: string | Date | null;
  edited_at: string | Date | null;
  author_handle: string | null;
  author_name: string | null;
  is_answer: boolean | null;
  // CV1 — optional, because a row read against a database that has not yet
  // applied 1790 has no such column. Absent means top-level, which is what
  // every post was before it.
  parent_post_id?: string | null;
  // PP0 — optional for the same reason: a row read before 1880 has no tag.
  tag?: string | null;
};

function threadOf(row: ThreadRow): ThreadRecord {
  return {
    id: row.id,
    tag: row.tag,
    title: row.title,
    state: row.state as ThreadRecord["state"],
    authorSubjectId: row.author_subject_id,
    authorHandle: row.author_handle,
    authorName: row.author_name,
    createdAt: iso(row.created_at)!,
    lastPostAt: iso(row.last_post_at),
    postCount: Number(row.post_count ?? 0),
    profileId: row.profile_id ?? null,
    answerPostId: row.answer_post_id ?? null,
  };
}

function postOf(row: PostRow): PostRecord {
  return {
    id: row.id,
    authorSubjectId: row.author_subject_id,
    // Already emptied in SQL for a removed post — see `listPosts`.
    body: row.body,
    state: row.moderation_state === "removed" ? "removed" : "visible",
    authorHandle: row.author_handle,
    authorName: row.author_name,
    createdAt: iso(row.created_at)!,
    editedAt: iso(row.edited_at),
    isAnswer: row.is_answer === true,
    parentPostId: row.parent_post_id ?? null,
    tag: (row.tag ?? null) as PostRecord["tag"],
  };
}

export function createOpenproductRepository(sql: SqlExecutor): OpenproductRepository {
  async function profileRow(text: string, params: unknown[]): Promise<ProfileRecord | null> {
    const res = await sql.execute<ProfileRow>(text, params);
    const row = res.rows[0];
    return row ? profileOf(row) : null;
  }

  /**
   * DS0 — mark the search index stale, from inside the repository.
   *
   * HERE RATHER THAN IN THE HANDLERS, on purpose. A handler that forgets to
   * mark dirty leaves a listing findable after it was unpublished, which is
   * the single worst bug this subsystem can have — and "every caller
   * remembers" is precisely the assumption DS-1 refuses to make everywhere
   * else. The write that changes the document is the write that marks it.
   *
   * NOT called on a metric write: the index holds no metric (see
   * `buildProductIndex`), so a refreshed number cannot change it. DS2's
   * activity tiebreak reads metrics at query time for the same reason — an
   * index rebuilt every time a number moved would rebuild continuously and
   * still be one sweep behind.
   *
   * COALESCE, not assignment: the floor is measured from the last BUILD, and
   * overwriting `dirty_at` on every write would make a steady stream of edits
   * look permanently just-dirtied.
   */
  async function touchIndex(): Promise<void> {
    await sql.execute(
      `UPDATE openproduct.search_index_state SET dirty_at = COALESCE(dirty_at, now())`,
    );
  }

  return {
    // ---------------------------------------------------------------------
    // Public reads. `visibility = 'public'` is in the SQL, not the caller.
    // ---------------------------------------------------------------------

    async listPublicCards(limit = DEFAULT_CARD_LIMIT): Promise<ProfileCardRecord[]> {
      const bounded = Math.min(Math.max(1, Math.trunc(limit)), MAX_CARD_LIMIT);
      const res = await sql.execute<CardRow>(
        `SELECT ${CARD_COLUMNS}
           FROM openproduct.profiles p
          WHERE ${listed("p")}
          ORDER BY p.published_at DESC NULLS LAST, p.slug ASC
          LIMIT $1`,
        [bounded],
      );
      return res.rows.map(cardOf);
    },

    async listPublicCardsPage(input: PublicCardsPageInput): Promise<PublicCardsPage> {
      const limit = Math.min(Math.max(1, Math.trunc(input.limit)), MAX_CARD_LIMIT);
      // The position, as SQL compares it. `published_at` is coalesced to the
      // epoch on both sides so a null instant orders last and compares
      // equal to itself; the slug is compared under "C" so the boundary is
      // the comparator's (ranking.ts `bySlug`, by code unit) and not the
      // session's locale.
      const later =
        `(COALESCE(p.published_at, 'epoch'::timestamptz) < COALESCE($5::timestamptz, 'epoch'::timestamptz)
          OR (COALESCE(p.published_at, 'epoch'::timestamptz) = COALESCE($5::timestamptz, 'epoch'::timestamptz)
              AND p.slug COLLATE "C" > $6::text COLLATE "C"))`;
      // Every parameter is typed in the text and referenced in both branches:
      // a bound parameter the text never mentions has no type, and the engine
      // refuses the statement rather than guess one.
      const after =
        input.cursor === null
          ? "TRUE"
          : input.cursor.activity === null
            ? `($4::bigint IS NULL AND k.activity IS NULL AND ${later})`
            : `(k.activity IS NULL OR k.activity < $4::bigint OR (k.activity = $4::bigint AND ${later}))`;
      // OB3 — `$3` is the upvotes' freshness floor, referenced in the text
      // whether or not a cursor follows, so the engine can type it.
      const params: unknown[] = [input.mergesSince, limit + 1, input.endorsementsSince];
      if (input.cursor !== null) params.push(input.cursor.activity, input.cursor.publishedAt, input.cursor.slug);
      const res = await sql.execute<CardRow & { ordering_activity: number | string | null }>(
        // THE LATEST MERGES PER LISTING, BY INDEX: one probe of
        // (profile_id, metric, window_key, observed_at DESC) per listed row,
        // rather than the page-wide hash `latestMetricsForSlugs` makes. The
        // sort is over every listed row and cannot be indexed — the ordering
        // key is a metric — which is the cost OS5 removes; a page of it is
        // milliseconds at the corpus size (OS0).
        `SELECT ${CARD_COLUMNS}, k.activity AS ordering_activity
           FROM openproduct.profiles p
           LEFT JOIN LATERAL (
             SELECT m.value AS merges
               FROM openproduct.metrics m
              WHERE m.profile_id = p.id AND m.metric = 'merges' AND m.window_key = '7d'
                AND m.observed_at >= $1::timestamptz
              ORDER BY m.observed_at DESC
              LIMIT 1
           ) lm ON TRUE
           ${latestUpvotesLateral("p.id", "$3")}
           CROSS JOIN LATERAL (SELECT ${mostActiveKeySql("lm.merges", "lu.upvotes")} AS activity) k
          WHERE ${listed("p")}
            AND ${after}
          ORDER BY k.activity DESC NULLS LAST,
                   COALESCE(p.published_at, 'epoch'::timestamptz) DESC,
                   p.slug COLLATE "C" ASC
          LIMIT $2`,
        params,
      );
      const rows = res.rows.slice(0, limit);
      const more = res.rows.length > limit;
      const last = rows[rows.length - 1];
      return {
        cards: rows.map(cardOf),
        next:
          more && last
            ? {
                activity: last.ordering_activity === null ? null : Number(last.ordering_activity),
                publishedAt: iso(last.published_at),
                slug: last.slug,
              }
            : null,
      };
    },

    async listCataloguePage(input: CataloguePageInput): Promise<CataloguePage> {
      // OS5 — ONE READ. The singleton on the left so the moment and the
      // census come back even when the page is empty (a cursor past the end,
      // or a catalogue nobody has computed); the page on the right is a
      // range on the order index and nothing else. The keyset predicate is
      // the live read's, on the stored ordering columns; `ordering_published_at`
      // is NOT NULL (coalesced to the epoch at write), so the cursor's null
      // publication is the epoch here too.
      const limit = Math.min(Math.max(1, Math.trunc(input.limit)), MAX_CARD_LIMIT);
      const later =
        `(c.ordering_published_at < $3::timestamptz
          OR (c.ordering_published_at = $3::timestamptz AND c.slug COLLATE "C" > $4::text COLLATE "C"))`;
      const after =
        input.cursor === null
          ? "TRUE"
          : input.cursor.activity === null
            ? `($2::bigint IS NULL AND c.ordering_merges IS NULL AND ${later})`
            : `(c.ordering_merges IS NULL OR c.ordering_merges < $2::bigint OR (c.ordering_merges = $2::bigint AND ${later}))`;
      const params: unknown[] = [limit + 1];
      if (input.cursor !== null) {
        params.push(input.cursor.activity, input.cursor.publishedAt ?? EPOCH_ISO, input.cursor.slug);
      }
      const res = await sql.execute<CatalogueRow>(
        `SELECT s.computed_at, s.today_count, s.week_count, s.month_count, s.total_count,
                c.slug, c.ordering_merges, c.record, c.metrics, c.media
           FROM openproduct.catalog_state s
           LEFT JOIN LATERAL (
             SELECT c.slug, c.ordering_merges, c.ordering_published_at, c.record, c.metrics, c.media
               FROM openproduct.catalog_cards c
              WHERE ${after}
              ORDER BY c.ordering_merges DESC NULLS LAST, c.ordering_published_at DESC, c.slug COLLATE "C" ASC
              LIMIT $1
           ) c ON TRUE
          WHERE s.singleton`,
        params,
      );
      const head = res.rows[0];
      const computedAt = iso(head?.computed_at ?? null);
      const windows = {
        today: Number(head?.today_count ?? 0),
        week: Number(head?.week_count ?? 0),
        month: Number(head?.month_count ?? 0),
        total: Number(head?.total_count ?? 0),
      };
      // Never computed: nothing to serve from here, whatever the table holds.
      if (computedAt === null) {
        return { computedAt: null, cards: [], metrics: new Map(), media: new Map(), next: null, windows };
      }
      const present = res.rows.filter((row) => row.slug !== null);
      const rows = present.slice(0, limit);
      const more = present.length > limit;
      const cards: ProfileCardRecord[] = [];
      const metrics = new Map<string, MetricRecord[]>();
      const media = new Map<string, ProductMediaRecord[]>();
      for (const row of rows) {
        const record = jsonObject(row.record);
        const card = cardOf({
          ...(record as CardRow),
          published_at: jsonInstant(record.published_at),
          repo_pushed_at: jsonInstant(record.repo_pushed_at),
          repo_checked_at: jsonInstant(record.repo_checked_at),
        });
        cards.push(card);
        const metricRows = jsonArray(row.metrics).map((m) =>
          metricOf({ ...(m as unknown as MetricRow), observed_at: jsonInstant(m.observed_at) ?? "" }),
        );
        if (metricRows.length > 0) metrics.set(card.slug, metricRows);
        const mediaRows = jsonArray(row.media).map((m) =>
          mediaOf({ ...(m as unknown as MediaRow), observed_at: jsonInstant(m.observed_at) }),
        );
        if (mediaRows.length > 0) media.set(card.slug, mediaRows);
      }
      const last = rows[rows.length - 1];
      const lastCard = cards[cards.length - 1];
      return {
        computedAt,
        cards,
        metrics,
        media,
        next:
          more && last && lastCard
            ? {
                activity: last.ordering_merges === null ? null : Number(last.ordering_merges),
                publishedAt: lastCard.publishedAt,
                slug: lastCard.slug,
              }
            : null,
        windows,
      };
    },

    async rebuildCatalogue(input: CatalogueRebuildInput): Promise<CatalogueRebuildReport> {
      // OS5 — THE CATALOGUE PHASE'S WRITE: three statements, none of which
      // round-trips a row through the worker, each safe on its own (the
      // executor this package is given has no transaction, and none is
      // needed — a reader between two of them sees rows that are each
      // consistent, ordered by a moment a few milliseconds apart):
      //
      //   1. UPSERT every listed profile's row — the card's own columns as
      //      `to_jsonb` of the same column list the live read selects, the
      //      latest observation per (metric, window), the media in document
      //      order, and the two ordering keys — REWRITING ONLY ROWS WHOSE
      //      CONTENT CHANGED (the `WHERE` on `DO UPDATE`). A quiet tick
      //      writes nothing, and the table does not churn under a
      //      ten-minute cron.
      //   2. DELETE the rows whose listing is no longer listed. Not `DELETE
      //      then INSERT`: a reader between the two would see an empty
      //      catalogue for a moment, which is exactly the "warming up"
      //      answer this table exists to never give.
      //   3. STAMP the singleton with the moment and the census — the four
      //      trailing windows and the row count — so `countPublishedWindows`'
      //      scan of every listed row comes off the request path too.
      //
      // The freshness rule is the caller's (`mergesSince`), as it is for the
      // live read: "not observed" here must be exactly "not observed" on
      // the card.
      //
      // OB3 — `ordering_merges` keeps its OS5 name and now holds
      // `sort.most-active`'s folded key (`mostActiveKeySql`), not the bare
      // merges count. Renaming the column would be a migration racing a
      // deploy for a word; the index over it is the same index either way.
      {
        const written = await sql.execute(
          `INSERT INTO openproduct.catalog_cards
             (profile_id, slug, ordering_merges, ordering_published_at, record, metrics, media, computed_at)
           SELECT p.id,
                  p.slug,
                  ${mostActiveKeySql("lm.merges", "lu.upvotes")},
                  COALESCE(p.published_at, 'epoch'::timestamptz),
                  (SELECT to_jsonb(c) FROM (SELECT ${CARD_COLUMNS}) c),
                  COALESCE((SELECT jsonb_agg(to_jsonb(lmr) ORDER BY lmr.metric, lmr.window_key)
                              FROM (SELECT DISTINCT ON (m.metric, m.window_key)
                                           m.profile_id, m.metric, m.window_key, m.value, m.source, m.observed_at
                                      FROM openproduct.metrics m
                                     WHERE m.profile_id = p.id
                                     ORDER BY m.metric, m.window_key, m.observed_at DESC) lmr),
                           '[]'::jsonb),
                  COALESCE((SELECT jsonb_agg(to_jsonb(md) - 'ord' ORDER BY md.ord)
                              FROM (SELECT ${MEDIA_COLUMNS}, row_number() OVER (ORDER BY ${MEDIA_ORDER}) AS ord
                                      FROM openproduct.product_media m
                                     WHERE m.profile_id = p.id) md),
                           '[]'::jsonb),
                  $2::timestamptz
             FROM openproduct.profiles p
             LEFT JOIN LATERAL (
               SELECT m.value AS merges
                 FROM openproduct.metrics m
                WHERE m.profile_id = p.id AND m.metric = 'merges' AND m.window_key = '7d'
                  AND m.observed_at >= $1::timestamptz
                ORDER BY m.observed_at DESC
                LIMIT 1
             ) lm ON TRUE
             ${latestUpvotesLateral("p.id", "$3")}
            WHERE ${listed("p")}
           ON CONFLICT (profile_id) DO UPDATE
             SET slug = EXCLUDED.slug,
                 ordering_merges = EXCLUDED.ordering_merges,
                 ordering_published_at = EXCLUDED.ordering_published_at,
                 record = EXCLUDED.record,
                 metrics = EXCLUDED.metrics,
                 media = EXCLUDED.media,
                 computed_at = EXCLUDED.computed_at
           WHERE (catalog_cards.slug, catalog_cards.ordering_merges, catalog_cards.ordering_published_at,
                  catalog_cards.record, catalog_cards.metrics, catalog_cards.media)
                 IS DISTINCT FROM
                 (EXCLUDED.slug, EXCLUDED.ordering_merges, EXCLUDED.ordering_published_at,
                  EXCLUDED.record, EXCLUDED.metrics, EXCLUDED.media)`,
          [input.mergesSince, input.now, input.endorsementsSince],
        );
        const removed = await sql.execute(
          `DELETE FROM openproduct.catalog_cards c
            WHERE NOT EXISTS (SELECT 1 FROM openproduct.profiles p
                               WHERE p.id = c.profile_id AND ${listed("p")})`,
          [],
        );
        const stamped = await sql.execute<{ card_count: number | string }>(
          `WITH w AS (
             SELECT count(*) FILTER (WHERE published_at >= $1::timestamptz - INTERVAL '1 day')   AS today,
                    count(*) FILTER (WHERE published_at >= $1::timestamptz - INTERVAL '7 days')  AS week,
                    count(*) FILTER (WHERE published_at >= $1::timestamptz - INTERVAL '30 days') AS month,
                    count(*) AS total
               FROM openproduct.profiles
              WHERE ${listed("")} AND published_at IS NOT NULL
           ),
           n AS (SELECT count(*) AS cards FROM openproduct.catalog_cards)
           INSERT INTO openproduct.catalog_state
             (singleton, computed_at, card_count, today_count, week_count, month_count, total_count)
           SELECT TRUE, $1::timestamptz, n.cards, w.today, w.week, w.month, w.total FROM w, n
           ON CONFLICT (singleton) DO UPDATE
             SET computed_at = EXCLUDED.computed_at,
                 card_count = EXCLUDED.card_count,
                 today_count = EXCLUDED.today_count,
                 week_count = EXCLUDED.week_count,
                 month_count = EXCLUDED.month_count,
                 total_count = EXCLUDED.total_count
           RETURNING card_count`,
          [input.now],
        );
        return {
          computedAt: input.now,
          cards: Number(stamped.rows[0]?.card_count ?? 0),
          written: written.rowCount,
          removed: removed.rowCount,
        };
      }
    },

    async getPublicProfile(slug: string): Promise<ProfileRecord | null> {
      return profileRow(
        `SELECT ${PROFILE_COLUMNS} FROM openproduct.profiles
          WHERE lower(slug) = lower($1) AND visibility = 'public'`,
        [slug],
      );
    },

    // Scoped by profile id, and that id can only have come from
    // getPublicProfile — which cannot return a private row. Still, the join
    // back to profiles re-asserts public here rather than trusting the caller.
    async listPublicRoleOpenings(profileId: string): Promise<RoleOpeningRecord[]> {
      const res = await sql.execute<RoleOpeningRow>(
        `SELECT ${ROLE_OPENING_COLUMNS.split("\n").map((l) => l.trim()).join(" ")}
           FROM openproduct.role_openings o
          WHERE o.profile_id = $1
            AND EXISTS (SELECT 1 FROM openproduct.profiles p
                         WHERE p.id = o.profile_id AND p.visibility = 'public')
          ORDER BY o.sort_order ASC, o.created_at ASC`,
        [profileId],
      );
      return res.rows.map(roleOpeningOf);
    },

    async listPublicMaintainers(profileId: string): Promise<PublicMaintainerRecord[]> {
      // CG3 — RECONCILED WITH CONSENT. This read used to return the
      // maintainer's publication list alone, which meant a maintainer typing
      // a name put a stranger on a public page. It now requires a CONFIRMED
      // `product_people` edge as well (OPC-5).
      //
      // Changed HERE rather than at each surface, deliberately: the product
      // page, the API and anything built later all read this one projection,
      // and a per-surface filter would be a rule four places have to
      // remember. The join is the enforcement.
      //
      // The publication list keeps its ordering and its labels — it is still
      // the maintainer's list, and CG3 reconciles the two rather than merging
      // them.
      //
      // CG4 — AND IT NOW CARRIES A HANDLE, through the shared join, so the
      // product page can link a name to a page that exists and render plain
      // text otherwise (XP-5). The display name still comes from the
      // MAINTAINER'S list rather than from the contributor row: this is their
      // credits section, written in their voice, and CG1's own name is what
      // the profile page shows.
      const res = await sql.execute<{
        subject_id: string;
        display_name: string | null;
        role_label: string | null;
        handle: string | null;
      }>(
        `SELECT m.subject_id, m.display_name, m.role_label, h.handle
           FROM openproduct.published_maintainers m
           JOIN openproduct.product_people pp
             ON pp.profile_id = m.profile_id
            AND pp.subject_id = m.subject_id
            AND pp.state = 'confirmed'
           ${handleJoinFor("m.subject_id")}
          WHERE m.profile_id = $1
            AND EXISTS (SELECT 1 FROM openproduct.profiles p
                         WHERE p.id = m.profile_id AND p.visibility = 'public')
          ORDER BY m.sort_order ASC, m.created_at ASC`,
        [profileId],
      );
      return res.rows.map((row) => ({
        subjectId: row.subject_id,
        displayName: row.display_name,
        roleLabel: row.role_label,
        handle: row.handle,
      }));
    },

    // ---- MD0: the media plane's public reads ----
    //
    // READ ONLY, and that is the milestone rather than an omission. MD0 lands
    // the model; MD1 owns the upload path and is gated on WC-C. There is no
    // write method here because there is nowhere for the bytes to go, and a
    // write path built against a store nobody has chosen would be the
    // dormant machinery DQ1 refused for its own reason: it makes a rule look
    // enforced without being.

    // ─── MD1 — the maintainer's own media rows ───────────────────────────
    //
    // NOT `listed()`-gated, unlike `listPublicMedia`: a maker edits a draft's
    // gallery before it is public, and a read that hid their own rows from
    // them would make the studio's media step unusable until publish. The
    // authorisation is the handler's (`authorizeFor`), not this query's —
    // the same split every other maintainer read makes.
    async listMediaForProfile(profileId: string): Promise<ProductMediaRecord[]> {
      const res = await sql.execute<MediaRow>(
        `SELECT ${MEDIA_COLUMNS} FROM openproduct.product_media m
          WHERE m.profile_id = $1
          ORDER BY ${MEDIA_ORDER}`,
        [profileId],
      );
      return res.rows.map(mediaOf);
    },

    async insertMedia(input: InsertMediaInput): Promise<ProductMediaRecord> {
      // One INSERT and the column decides the rest: the slot index, the
      // gallery trigger, the non-blank alt, the positive dimensions, the
      // kind/observed_at pairing. A handler that checked those first was
      // being kind; this is what makes the kindness unnecessary.
      const res = await sql.execute<MediaRow>(
        `INSERT INTO openproduct.product_media
           (id, profile_id, kind, storage_ref, alt_text, width, height, position, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${MEDIA_COLUMNS.replaceAll("m.", "")}`,
        [
          input.id,
          input.profileId,
          input.kind,
          input.storageRef,
          input.alt,
          input.width,
          input.height,
          input.position,
          input.observedAt ?? null,
        ],
      );
      return mediaOf(res.rows[0]!);
    },

    async deleteMedia(profileId: string, id: string): Promise<ProductMediaRecord | null> {
      // Scoped by profile as well as id, so a maintainer of one listing
      // cannot remove another listing's row by guessing its uuid. The row is
      // returned so the audit line can say what kind it was.
      const res = await sql.execute<MediaRow>(
        `DELETE FROM openproduct.product_media m
          WHERE m.id = $1 AND m.profile_id = $2
          RETURNING ${MEDIA_COLUMNS.replaceAll("m.", "")}`,
        [id, profileId],
      );
      const row = res.rows[0];
      return row ? mediaOf(row) : null;
    },

    async replaceAuthoredSingleton(
      input: InsertMediaInput & { kind: "logo" | "hero" },
    ): Promise<ProductMediaRecord> {
      // openproduct-studio OSD4 — REPLACE IN ONE STEP. A maker changing their
      // logo used to be told to remove the old one first: two acts, and a
      // listing with no face between them. The slot index is the conflict
      // target, as it is for `replaceScreenshot`; unlike a retake, a new
      // upload is a new row, so the id moves too and nothing holding the old
      // id can mistake the new picture for the one it referenced.
      const res = await sql.execute<MediaRow>(
        `INSERT INTO openproduct.product_media
           (id, profile_id, kind, storage_ref, alt_text, width, height, position, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, NULL)
         ON CONFLICT (profile_id, kind, position) DO UPDATE
            SET id          = EXCLUDED.id,
                storage_ref = EXCLUDED.storage_ref,
                alt_text    = EXCLUDED.alt_text,
                width       = EXCLUDED.width,
                height      = EXCLUDED.height,
                created_at  = now()
         RETURNING ${MEDIA_COLUMNS.replaceAll("m.", "")}`,
        [input.id, input.profileId, input.kind, input.storageRef, input.alt, input.width, input.height],
      );
      return mediaOf(res.rows[0]!);
    },

    async updateMediaAlt(profileId: string, id: string, alt: string): Promise<ProductMediaRecord | null> {
      // openproduct-studio OSD6. Before this a maker who mistyped the words
      // under a picture had to remove it and upload it again. The alt CHECK
      // still refuses a blank.
      const res = await sql.execute<MediaRow>(
        `UPDATE openproduct.product_media m
            SET alt_text = $3
          WHERE m.id = $1 AND m.profile_id = $2 AND m.kind IN ('logo', 'hero', 'gallery')
          RETURNING ${MEDIA_COLUMNS.replaceAll("m.", "")}`,
        [id, profileId, alt],
      );
      const row = res.rows[0];
      return row ? mediaOf(row) : null;
    },

    async reorderGallery(profileId: string, ids: readonly string[]): Promise<ProductMediaRecord[]> {
      // openproduct-studio OSD6 — TWO STATEMENTS, EACH COLLISION-FREE. The
      // slot index (profile_id, kind, position) is checked row by row, so a
      // single UPDATE that swaps two positions can collide with itself, and
      // the executor has no transaction to defer it inside. So the gallery is
      // first lifted clear of 0..7 (every row +100, into slots nothing
      // holds), then written to its final order. Were the second statement to
      // fail, every row is still a valid gallery row in its old relative
      // order, only numbered from 100 — which the next reorder repairs.
      await sql.execute(
        `UPDATE openproduct.product_media
            SET position = position + 100
          WHERE profile_id = $1 AND kind = 'gallery' AND position < 100`,
        [profileId],
      );
      const res = await sql.execute<MediaRow>(
        `UPDATE openproduct.product_media m
            SET position = o.ord - 1
           FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
          WHERE m.id = o.id AND m.profile_id = $1 AND m.kind = 'gallery'
          RETURNING ${MEDIA_COLUMNS}`,
        [profileId, ids],
      );
      return res.rows.map(mediaOf).sort((a, b) => a.position - b.position);
    },

    async listPublicMedia(profileId: string): Promise<ProductMediaRecord[]> {
      const res = await sql.execute<MediaRow>(
        `SELECT ${MEDIA_COLUMNS}
           FROM openproduct.product_media m
          WHERE m.profile_id = $1
            -- A public child read re-asserts the parent's visibility rather
            -- than trusting the caller to have arrived through a public read.
            AND EXISTS (SELECT 1 FROM openproduct.profiles p
                         WHERE p.id = m.profile_id AND ${listed("p")})
          ORDER BY ${MEDIA_ORDER}`,
        [profileId],
      );
      return res.rows.map(mediaOf);
    },

    async listPublicMediaForSlugs(slugs: string[]): Promise<Map<string, ProductMediaRecord[]>> {
      const out = new Map<string, ProductMediaRecord[]>();
      if (slugs.length === 0) return out;
      const res = await sql.execute<MediaRow & { slug: string }>(
        // ONE query for the whole directory page, not one per card — the
        // shape `latestMetricsForSlugs` established, for the same reason.
        `SELECT p.slug, ${MEDIA_COLUMNS}
           FROM openproduct.product_media m
           JOIN openproduct.profiles p ON p.id = m.profile_id
          WHERE ${listed("p")} AND lower(p.slug) = ANY($1::text[])
          ORDER BY p.slug, ${MEDIA_ORDER}`,
        [slugs.map((s) => s.toLowerCase())],
      );
      for (const row of res.rows) {
        const list = out.get(row.slug) ?? [];
        list.push(mediaOf(row));
        out.set(row.slug, list);
      }
      return out;
    },

    async listMediaForProfiles(profileIds: string[]): Promise<Map<string, ProductMediaRecord[]>> {
      const out = new Map<string, ProductMediaRecord[]>();
      if (profileIds.length === 0) return out;
      const res = await sql.execute<MediaRow & { profile_id: string }>(
        // openproduct-studio OSD3 — one query for the studio list, not one per
        // listing (the `listPublicMediaForSlugs` shape, without the listed()
        // gate: a maintainer's draft has a face too).
        `SELECT m.profile_id, ${MEDIA_COLUMNS}
           FROM openproduct.product_media m
          WHERE m.profile_id = ANY($1::uuid[])
          ORDER BY m.profile_id, ${MEDIA_ORDER}`,
        [profileIds],
      );
      for (const row of res.rows) {
        const key = String(row.profile_id);
        const list = out.get(key) ?? [];
        list.push(mediaOf(row));
        out.set(key, list);
      }
      return out;
    },

    async refreshCatalogueMedia(profileId: string): Promise<boolean> {
      // openproduct-studio OSD3 (risk R2) — the SAME media aggregate
      // `rebuildCatalogue` writes, for one row. Only the media column moves:
      // the ordering keys, the card and the census stay the sweep's, so this
      // cannot reorder the home list between sweeps.
      const res = await sql.execute(
        `UPDATE openproduct.catalog_cards c
            SET media = fresh.media
           FROM (SELECT COALESCE((SELECT jsonb_agg(to_jsonb(md) - 'ord' ORDER BY md.ord)
                                    FROM (SELECT ${MEDIA_COLUMNS}, row_number() OVER (ORDER BY ${MEDIA_ORDER}) AS ord
                                            FROM openproduct.product_media m
                                           WHERE m.profile_id = $1::uuid) md),
                                 '[]'::jsonb) AS media) fresh
          WHERE c.profile_id = $1::uuid
            AND c.media IS DISTINCT FROM fresh.media`,
        [profileId],
      );
      return res.rowCount > 0;
    },

    // ---- MD4 — observed screenshots: the queue and the ledger ----

    async listDueCaptures(refreshBeforeIso: string, limit = 5): Promise<DueCaptureRecord[]> {
      const res = await sql.execute<{
        profile_id: string;
        slug: string;
        target: string;
        observed_at: string | Date | null;
        failure_count: number | string;
      }>(
        // A ledger row for a DIFFERENT address does not apply: it neither
        // withdraws the listing nor orders it — the listing reads as never
        // tried, which is how a maker un-withdraws a capture by changing the
        // thing that was wrong.
        `SELECT p.id AS profile_id, p.slug, p.live_url AS target, m.observed_at,
                COALESCE(CASE WHEN c.target = p.live_url THEN c.failure_count END, 0) AS failure_count
           FROM openproduct.profiles p
           LEFT JOIN openproduct.product_media m
             ON m.profile_id = p.id AND m.kind = 'screenshot'
           LEFT JOIN openproduct.screenshot_captures c
             ON c.profile_id = p.id
          WHERE ${listed("p")}
            AND p.live_url IS NOT NULL AND length(btrim(p.live_url)) > 0
            AND (m.id IS NULL OR m.observed_at < $1)
            AND (c.profile_id IS NULL OR c.target <> p.live_url OR c.withdrawn_at IS NULL)
          ORDER BY (CASE WHEN c.target = p.live_url THEN c.attempted_at END) ASC NULLS FIRST,
                   m.observed_at ASC NULLS FIRST,
                   p.slug ASC
          LIMIT $2`,
        [refreshBeforeIso, Math.min(Math.max(1, limit), 100)],
      );
      return res.rows.map((row) => ({
        profileId: row.profile_id,
        slug: row.slug,
        target: row.target,
        observedAt: iso(row.observed_at),
        failureCount: Number(row.failure_count),
      }));
    },

    async replaceScreenshot(input: InsertMediaInput): Promise<ProductMediaRecord> {
      const res = await sql.execute<MediaRow>(
        // The slot index (profile_id, kind, position) is the conflict target:
        // there is one screenshot slot, and a retake writes into it. The row
        // keeps its id, so a reference somebody holds to "the capture" still
        // resolves; what changes is the picture and its moment.
        `INSERT INTO openproduct.product_media
           (id, profile_id, kind, storage_ref, alt_text, width, height, position, observed_at)
         VALUES ($1, $2, 'screenshot', $3, $4, $5, $6, 0, $7)
         ON CONFLICT (profile_id, kind, position) DO UPDATE
            SET storage_ref = EXCLUDED.storage_ref,
                alt_text    = EXCLUDED.alt_text,
                width       = EXCLUDED.width,
                height      = EXCLUDED.height,
                observed_at = EXCLUDED.observed_at
         RETURNING ${MEDIA_COLUMNS.replaceAll("m.", "")}`,
        [
          input.id,
          input.profileId,
          input.storageRef,
          input.alt,
          input.width,
          input.height,
          input.observedAt ?? null,
        ],
      );
      return mediaOf(res.rows[0]!);
    },

    async recordCaptureSuccess(
      profileId: Uuid,
      target: string,
      at: string,
    ): Promise<ScreenshotCaptureRecord> {
      const res = await sql.execute<CaptureRow>(
        `INSERT INTO openproduct.screenshot_captures AS c
           (profile_id, target, attempted_at, captured_at, failure_count, last_error, withdrawn_at)
         VALUES ($1, $2, $3, $3, 0, NULL, NULL)
         ON CONFLICT (profile_id) DO UPDATE
            SET target        = EXCLUDED.target,
                attempted_at  = EXCLUDED.attempted_at,
                captured_at   = EXCLUDED.captured_at,
                failure_count = 0,
                last_error    = NULL,
                withdrawn_at  = NULL
         RETURNING ${CAPTURE_COLUMNS}`,
        [profileId, target, at],
      );
      return captureOf(res.rows[0]!);
    },

    async recordCaptureFailure(
      profileId: Uuid,
      target: string,
      error: string,
      at: string,
      withdrawAfter: number,
    ): Promise<ScreenshotCaptureRecord> {
      const res = await sql.execute<CaptureRow>(
        // A different address starts a new run at one; the same address
        // continues the run. `captured_at` is deliberately not touched: the
        // last time a picture came back is still the last time it did.
        `INSERT INTO openproduct.screenshot_captures AS c
           (profile_id, target, attempted_at, captured_at, failure_count, last_error, withdrawn_at)
         VALUES ($1, $2, $3::timestamptz, NULL, 1, $4,
                 CASE WHEN 1 >= $5::integer THEN $3::timestamptz ELSE NULL END)
         ON CONFLICT (profile_id) DO UPDATE
            SET target        = EXCLUDED.target,
                attempted_at  = EXCLUDED.attempted_at,
                failure_count = CASE WHEN c.target = EXCLUDED.target THEN c.failure_count + 1 ELSE 1 END,
                last_error    = EXCLUDED.last_error,
                withdrawn_at  = CASE
                                  WHEN (CASE WHEN c.target = EXCLUDED.target THEN c.failure_count + 1 ELSE 1 END) >= $5::integer
                                  THEN EXCLUDED.attempted_at
                                  ELSE NULL
                                END
         RETURNING ${CAPTURE_COLUMNS}`,
        [profileId, target, at, error, withdrawAfter],
      );
      return captureOf(res.rows[0]!);
    },

    // ---------------------------------------------------------------------
    // Authenticated reads. Org-scoped, drafts included.
    // ---------------------------------------------------------------------

    async listProfilesForOrg(orgId: Uuid): Promise<ProfileRecord[]> {
      const res = await sql.execute<ProfileRow>(
        `SELECT ${PROFILE_COLUMNS} FROM openproduct.profiles
          WHERE org_id = $1 ORDER BY created_at DESC`,
        [orgId],
      );
      return res.rows.map(profileOf);
    },

    async getProfileForOrg(orgId: Uuid, profileId: Uuid): Promise<ProfileRecord | null> {
      return profileRow(
        `SELECT ${PROFILE_COLUMNS} FROM openproduct.profiles WHERE org_id = $1 AND id = $2`,
        [orgId, profileId],
      );
    },

    async getProfileByProject(orgId: Uuid, projectId: Uuid): Promise<ProfileRecord | null> {
      return profileRow(
        `SELECT ${PROFILE_COLUMNS} FROM openproduct.profiles WHERE org_id = $1 AND project_id = $2`,
        [orgId, projectId],
      );
    },

    async listRoleOpenings(profileId: Uuid): Promise<RoleOpeningRecord[]> {
      const res = await sql.execute<RoleOpeningRow>(
        `SELECT id, profile_id, title, description, commitment, status, join_link_ref, sort_order
           FROM openproduct.role_openings WHERE profile_id = $1
          ORDER BY sort_order ASC, created_at ASC`,
        [profileId],
      );
      return res.rows.map(roleOpeningOf);
    },

    async listMaintainers(profileId: Uuid): Promise<PublishedMaintainerRecord[]> {
      const res = await sql.execute<MaintainerRow>(
        `SELECT profile_id, subject_id, display_name, role_label, sort_order
           FROM openproduct.published_maintainers WHERE profile_id = $1
          ORDER BY sort_order ASC, created_at ASC`,
        [profileId],
      );
      return res.rows.map(maintainerOf);
    },

    async listMaintainerHandles(profileId: Uuid): Promise<Map<string, string>> {
      // openproduct-studio OSD7 — ACTIVE handles, the rule
      // `getSubjectsForHandles` resolves by, so a pre-filled `@handle` line
      // round-trips to the same person. A released row has no holder.
      const res = await sql.execute<{ subject_id: string; handle: string }>(
        `SELECT m.subject_id, h.handle
           FROM openproduct.published_maintainers m
           JOIN openproduct.handles h
             ON h.subject_id = m.subject_id
            AND h.released_at IS NULL
          WHERE m.profile_id = $1`,
        [profileId],
      );
      const out = new Map<string, string>();
      for (const row of res.rows) out.set(row.subject_id, row.handle);
      return out;
    },

    // ---------------------------------------------------------------------
    // Writes.
    // ---------------------------------------------------------------------

    async createProfile(input: CreateProfileInput): Promise<ProfileRecord> {
      const created = await profileRow(
        `INSERT INTO openproduct.profiles
           (id, org_id, project_id, slug, tagline, pitch_body, pitch_digest,
            repo_url, live_url, stack, stack_canonical, link_grant, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::jsonb, $11::text::jsonb, $12::text::jsonb, $13)
         RETURNING ${PROFILE_COLUMNS}`,
        [
          input.id,
          input.orgId,
          input.projectId,
          input.slug,
          input.tagline ?? null,
          input.pitchBody ?? null,
          input.pitchDigest ?? null,
          input.repoUrl ?? null,
          input.liveUrl ?? null,
          JSON.stringify(input.stack ?? []),
          // Derived here, from the authored list, for the same reason the
          // update does it: one input, two columns, never out of step.
          JSON.stringify(canonicaliseStack(input.stack ?? []).canonical),
          input.linkGrant ? JSON.stringify(input.linkGrant) : null,
          input.createdBy,
        ],
      );
      // INSERT ... RETURNING always yields a row or throws.
      //
      // OX4: the creator is the listing's first OWNER. Two statements rather
      // than one transaction (the per-request executor is non-transactional);
      // the failure window leaves an ownerless listing an operator can
      // repair, which the 1290 backfill's posture already accepts.
      await sql.execute(
        `INSERT INTO openproduct.listing_maintainers (profile_id, subject_id, role, added_by)
         VALUES ($1, $2, 'owner', $2)
         ON CONFLICT (profile_id, subject_id) DO NOTHING`,
        [input.id, input.createdBy],
      );
      return created!;
    },

    async getListingRole(profileId: Uuid, subjectId: string): Promise<ListingRole | null> {
      const res = await sql.execute<{ role: string }>(
        `SELECT role FROM openproduct.listing_maintainers
          WHERE profile_id = $1 AND subject_id = $2`,
        [profileId, subjectId],
      );
      const role = res.rows[0]?.role;
      return role === "owner" || role === "maintainer" ? role : null;
    },

    async listMaintainedProfileIds(orgId: Uuid, subjectId: string): Promise<string[]> {
      const res = await sql.execute<{ profile_id: string }>(
        `SELECT lm.profile_id
           FROM openproduct.listing_maintainers lm
           JOIN openproduct.profiles p ON p.id = lm.profile_id
          WHERE p.org_id = $1 AND lm.subject_id = $2`,
        [orgId, subjectId],
      );
      return res.rows.map((row) => row.profile_id);
    },

    async addListingMaintainer(
      profileId: Uuid,
      subjectId: string,
      role: ListingRole,
      addedBy: string,
    ): Promise<void> {
      await sql.execute(
        `INSERT INTO openproduct.listing_maintainers (profile_id, subject_id, role, added_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (profile_id, subject_id) DO UPDATE SET role = EXCLUDED.role`,
        [profileId, subjectId, role, addedBy],
      );
    },

    async listProfilesMaintainedBy(subjectId: string): Promise<ProfileRecord[]> {
      const res = await sql.execute<ProfileRow>(
        `SELECT ${PROFILE_COLUMNS.replaceAll(/^\s+|\s+$/g, "").split(",").map((c) => `p.${c.trim()}`).join(", ")}
           FROM openproduct.profiles p
           JOIN openproduct.listing_maintainers lm ON lm.profile_id = p.id
          WHERE lm.subject_id = $1
          ORDER BY p.updated_at DESC`,
        [subjectId],
      );
      return res.rows.map(profileOf);
    },

    async setProfileLinkGrant(profileId: Uuid, grant: StoredLinkGrant): Promise<ProfileRecord | null> {
      return profileRow(
        `UPDATE openproduct.profiles SET link_grant = $2::text::jsonb, updated_at = now()
          WHERE id = $1
         RETURNING ${PROFILE_COLUMNS}`,
        [profileId, JSON.stringify(grant)],
      );
    },

    async revokeWorkspaceEligibility(orgId: Uuid): Promise<string[]> {
      // One statement, both consequences: no grant to publish against, and no
      // page still serving. A private workspace with a live listing is the
      // drift the visibility_narrowed event exists to prevent.
      const res = await sql.execute<{ id: string }>(
        `UPDATE openproduct.profiles
            SET link_grant = NULL, visibility = 'private', updated_at = now()
          WHERE org_id = $1 AND (link_grant IS NOT NULL OR visibility = 'public')
         RETURNING id`,
        [orgId],
      );
      return res.rows.map((row) => row.id);
    },


    // ---- trust and safety (openproduct-commons TS0) ----

    async getTrustLevel(subjectId: string): Promise<TrustLevelRecord | null> {
      const res = await sql.execute<{
        subject_id: string;
        level: string;
        set_by: string;
        reason: string | null;
        set_at: string | Date;
      }>(
        `SELECT subject_id, level, set_by, reason, set_at
           FROM openproduct.trust_levels WHERE subject_id = $1`,
        [subjectId],
      );
      const row = res.rows[0];
      // Null, never a synthesised `new` row: absence is the answer, and the
      // caller applies DEFAULT_TRUST_LEVEL. Writing a row for every subject
      // who signs in would make this table a shadow user directory.
      return row ? trustRow(row) : null;
    },

    async setTrustLevel(
      subjectId: string,
      level: TrustLevelName,
      setBy: string,
      reason: string | null,
    ): Promise<TrustLevelRecord> {
      const res = await sql.execute<{
        subject_id: string;
        level: string;
        set_by: string;
        reason: string | null;
        set_at: string | Date;
      }>(
        `INSERT INTO openproduct.trust_levels (subject_id, level, set_by, reason, set_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (subject_id) DO UPDATE
            SET level = EXCLUDED.level,
                set_by = EXCLUDED.set_by,
                reason = EXCLUDED.reason,
                set_at = now()
         RETURNING subject_id, level, set_by, reason, set_at`,
        [subjectId, level, setBy, reason],
      );
      return trustRow(res.rows[0]!);
    },

    async createReport(input: CreateReportInput): Promise<ReportRecord | null> {
      // ON CONFLICT DO NOTHING against the partial unique index: the same
      // reporter naming the same subject while their first report is still
      // unresolved is the same person again, not a second signal. Returning
      // null (rather than throwing) lets the handler answer 200 — a reporter
      // must not learn from an error code whether they already reported this.
      const res = await sql.execute<ReportRow>(
        `INSERT INTO openproduct.reports
           (id, subject_kind, subject_ref, reporter_subject_id, reason, detail)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING id, subject_kind, subject_ref, reporter_subject_id, reason, detail,
                   state, resolved_at, resolved_by, created_at, updated_at`,
        [
          input.id,
          input.subjectKind,
          input.subjectRef,
          input.reporterSubjectId,
          input.reason,
          input.detail ?? null,
        ],
      );
      const row = res.rows[0];
      return row ? reportRow(row) : null;
    },

    async listOpenReports(limit = 50): Promise<QueuedReportRecord[]> {
      const res = await sql.execute<ReportRow & { also_reported: string | number }>(
        `SELECT r.id, r.subject_kind, r.subject_ref, r.reporter_subject_id, r.reason, r.detail,
                r.state, r.resolved_at, r.resolved_by, r.created_at, r.updated_at,
                (SELECT count(*) FROM openproduct.reports o
                  WHERE o.subject_kind = r.subject_kind
                    AND o.subject_ref = r.subject_ref
                    AND o.state IN ('open','triaged')
                    AND o.id <> r.id) AS also_reported
           FROM openproduct.reports r
          WHERE r.state IN ('open','triaged')
          ORDER BY r.created_at ASC
          LIMIT $1`,
        [Math.min(Math.max(1, limit), 200)],
      );
      return res.rows.map((row) => ({ ...reportRow(row), alsoReported: Number(row.also_reported) }));
    },

    async listReportsForSubject(
      subjectKind: string,
      subjectRef: string,
      limit = 50,
    ): Promise<ReportRecord[]> {
      const res = await sql.execute<ReportRow>(
        `SELECT id, subject_kind, subject_ref, reporter_subject_id, reason, detail,
                state, resolved_at, resolved_by, created_at, updated_at
           FROM openproduct.reports
          WHERE subject_kind = $1 AND subject_ref = $2
          ORDER BY created_at DESC
          LIMIT $3`,
        [subjectKind, subjectRef, Math.min(Math.max(1, limit), 200)],
      );
      return res.rows.map(reportRow);
    },

    async triageReport(id: Uuid, at: string): Promise<ReportRecord | null> {
      const res = await sql.execute<ReportRow>(
        `UPDATE openproduct.reports
            SET state = 'triaged', updated_at = $2
          WHERE id = $1 AND state = 'open'
         RETURNING id, subject_kind, subject_ref, reporter_subject_id, reason, detail,
                   state, resolved_at, resolved_by, created_at, updated_at`,
        [id, at],
      );
      const row = res.rows[0];
      return row ? reportRow(row) : null;
    },

    async resolveReport(
      id: Uuid,
      state: "actioned" | "declined",
      resolvedBy: string,
      at: string,
    ): Promise<ReportRecord | null> {
      // Terminal, and only from a live state: re-resolving a resolved report
      // would rewrite who closed it and when, which is the one thing the
      // appeal path needs to be able to trust.
      const res = await sql.execute<ReportRow>(
        `UPDATE openproduct.reports
            SET state = $2, resolved_by = $3, resolved_at = $4, updated_at = $4
          WHERE id = $1 AND state IN ('open','triaged')
         RETURNING id, subject_kind, subject_ref, reporter_subject_id, reason, detail,
                   state, resolved_at, resolved_by, created_at, updated_at`,
        [id, state, resolvedBy, at],
      );
      const row = res.rows[0];
      return row ? reportRow(row) : null;
    },

    /**
     * Set a listing's moderation state, and only from a state the act is
     * legal from (TS3).
     *
     * THE ORDER OF THE TWO WRITES IS THE GUARANTEE. The per-request executor
     * is non-transactional (see `createProfile`), so core appends the ledger
     * row FIRST and calls this second, passing the act id it got back. The
     * two failure windows are not symmetric, and the asymmetry is the whole
     * reason for that ordering:
     *
     *   ledger written, state not  →  we recorded an act we did not carry
     *                                 out. Visible in the ledger, repairable,
     *                                 and it over-reports us in TS5's
     *                                 transparency numbers, which is the
     *                                 direction an estate should err.
     *   state written, ledger not  →  a listing removed with no appealable
     *                                 record of who did it or why. TS-4 says
     *                                 every act is appealable; this state
     *                                 makes that false and nothing can
     *                                 reconstruct it.
     *
     * So the recoverable failure is the one we take.
     *
     * `legalFrom` is passed rather than assumed: the contract owns the
     * transition table (a removal is undone by restoring it, a delisting by
     * relisting it — never the other way round), and encoding it a second
     * time here is how the two come to disagree. A row whose state has moved
     * since the triager loaded the page matches nothing and returns null,
     * which is a lost-update check for free.
     */
    async setListingModerationState(input) {
      const res = await sql.execute<ProfileRow>(
        `UPDATE openproduct.profiles
            SET moderation_state  = $2,
                moderated_at      = CASE WHEN $2 = 'visible' THEN NULL ELSE $3::timestamptz END,
                moderation_act_id = CASE WHEN $2 = 'visible' THEN NULL ELSE $4::uuid END,
                updated_at        = $3::timestamptz
          WHERE lower(slug) = lower($1)
            AND moderation_state = ANY($5::text[])
         RETURNING ${PROFILE_COLUMNS}`,
        [input.slug, input.state, input.at, input.actId, input.legalFrom],
      );
      const row = res.rows[0];
      if (!row) return null;
      // The document changed: a delisted listing leaves the index, and a
      // relisted one comes back. Marked here for the same reason every other
      // write marks here — a handler that forgets leaves a removed listing
      // findable, which on this surface is the worst bug available.
      await touchIndex();
      return profileOf(row);
    },

    async appendModerationAct(input: AppendModerationActInput): Promise<ModerationActRecord> {
      const res = await sql.execute<ModerationActRow>(
        `INSERT INTO openproduct.moderation_acts
           (id, subject_kind, subject_ref, act, actor_id, reason, report_id, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, subject_kind, subject_ref, act, actor_id, reason, report_id, occurred_at`,
        [
          input.id,
          input.subjectKind,
          input.subjectRef,
          input.act,
          input.actorId,
          input.reason,
          input.reportId ?? null,
          input.occurredAt,
        ],
      );
      return actRow(res.rows[0]!);
    },

    async listModerationActsForSubject(
      subjectKind: string,
      subjectRef: string,
      limit = 50,
    ): Promise<ModerationActRecord[]> {
      const res = await sql.execute<ModerationActRow>(
        `SELECT id, subject_kind, subject_ref, act, actor_id, reason, report_id, occurred_at
           FROM openproduct.moderation_acts
          WHERE subject_kind = $1 AND subject_ref = $2
          ORDER BY occurred_at DESC
          LIMIT $3`,
        [subjectKind, subjectRef, Math.min(Math.max(1, limit), 200)],
      );
      return res.rows.map(actRow);
    },

    async getModerationAct(id: Uuid): Promise<ModerationActRecord | null> {
      const res = await sql.execute<ModerationActRow>(
        `SELECT id, subject_kind, subject_ref, act, actor_id, reason, report_id, occurred_at
           FROM openproduct.moderation_acts
          WHERE id = $1`,
        [id],
      );
      const row = res.rows[0];
      return row ? actRow(row) : null;
    },

    async listModerationActsForSubjects(
      subjectKind: string,
      subjectRefs: readonly string[],
      limit = 200,
    ): Promise<ModerationActRecord[]> {
      // An empty set is an empty answer WITHOUT a round trip. `= ANY('{}')`
      // is valid SQL that matches nothing, but the caller here is the "what
      // was done to my listings" read and the common case is somebody who
      // maintains nothing — asking the database to confirm that on every page
      // load is a query per visit for a guaranteed empty result.
      if (subjectRefs.length === 0) return [];
      const res = await sql.execute<ModerationActRow>(
        `SELECT id, subject_kind, subject_ref, act, actor_id, reason, report_id, occurred_at
           FROM openproduct.moderation_acts
          WHERE subject_kind = $1
            AND subject_ref = ANY($2::text[])
          ORDER BY occurred_at DESC
          LIMIT $3`,
        [subjectKind, [...subjectRefs], Math.min(Math.max(1, limit), 500)],
      );
      return res.rows.map(actRow);
    },

    async createAppeal(input: CreateAppealInput): Promise<AppealRecord | null> {
      // TWO RULES, TWO GUARDS, AND THE INDEX IS NEITHER OF THEM.
      //
      //   one per person per act, EVER   including after a refusal. This
      //       cannot be an index: one covering decided rows would also stop a
      //       second maintainer of the same listing appealing an act nobody
      //       has appealed.
      //   one OPEN per act, by anybody   two maintainers of one listing
      //       arguing the same decision separately is two people asking one
      //       question, and the second would be read against a decision the
      //       first had already moved.
      //
      // BOTH ARE `NOT EXISTS` IN THIS STATEMENT, and 1510's partial unique
      // index sits behind them as a concurrency backstop rather than as the
      // thing callers meet. That ordering was a correction: with only the
      // first guard here, a co-maintainer filing while an appeal was open
      // reached the index and the statement THREW — so a person doing an
      // ordinary thing got a 500 where they should have got a sentence.
      //
      // NOT EXISTS in the INSERT rather than a read-then-write, so two
      // requests racing cannot both pass a check and both insert. Null means
      // refused, and the handler turns it into a sentence.
      const res = await sql.execute<AppealRow>(
        `INSERT INTO openproduct.appeals
           (id, act_id, subject_kind, subject_ref, appellant_subject_id, says, filed_at)
         SELECT $1, $2, $3, $4, $5, $6, $7
          WHERE NOT EXISTS (
                  SELECT 1 FROM openproduct.appeals a
                   WHERE a.act_id = $2
                     AND (a.appellant_subject_id = $5 OR a.state = 'open')
                )
         RETURNING ${APPEAL_COLUMNS}`,
        [
          input.id,
          input.actId,
          input.subjectKind,
          input.subjectRef,
          input.appellantSubjectId,
          input.says,
          input.filedAt,
        ],
      );
      const row = res.rows[0];
      return row ? appealRow(row) : null;
    },

    async getAppeal(id: Uuid): Promise<AppealRecord | null> {
      const res = await sql.execute<AppealRow>(
        `SELECT ${APPEAL_COLUMNS} FROM openproduct.appeals WHERE id = $1`,
        [id],
      );
      const row = res.rows[0];
      return row ? appealRow(row) : null;
    },

    async hasAppealed(actId: Uuid, appellantSubjectId: string): Promise<boolean> {
      const res = await sql.execute<{ one: number }>(
        `SELECT 1 AS one FROM openproduct.appeals
          WHERE act_id = $1 AND appellant_subject_id = $2
          LIMIT 1`,
        [actId, appellantSubjectId],
      );
      return res.rows.length > 0;
    },

    async listAppealsByAppellant(
      appellantSubjectId: string,
      limit = 200,
    ): Promise<AppealRecord[]> {
      const res = await sql.execute<AppealRow>(
        `SELECT ${APPEAL_COLUMNS} FROM openproduct.appeals
          WHERE appellant_subject_id = $1
          ORDER BY filed_at DESC
          LIMIT $2`,
        [appellantSubjectId, Math.min(Math.max(1, limit), 500)],
      );
      return res.rows.map(appealRow);
    },

    async listOpenAppeals(limit = 100): Promise<AppealRecord[]> {
      // OLDEST FIRST, like every other queue here. An appeal queue worked
      // newest-first never reaches its tail, and the appeals at the tail are
      // from the people who have already been waiting longest.
      const res = await sql.execute<AppealRow>(
        `SELECT ${APPEAL_COLUMNS} FROM openproduct.appeals
          WHERE state = 'open'
          ORDER BY filed_at ASC
          LIMIT $1`,
        [Math.min(Math.max(1, limit), 200)],
      );
      return res.rows.map(appealRow);
    },

    async resolveAppeal(input: ResolveAppealInput): Promise<AppealRecord | null> {
      // Terminal, and only from `open`. Re-deciding a decided appeal would
      // rewrite who decided it and when — and the ledger row recording the
      // first decision is append-only, so the two would disagree forever with
      // no way to tell which was the real one.
      const res = await sql.execute<AppealRow>(
        `UPDATE openproduct.appeals
            SET state = $2,
                outcome_act_id = $3,
                reversal_act_id = $4,
                decided_by = $5,
                decided_at = $6
          WHERE id = $1 AND state = 'open'
         RETURNING ${APPEAL_COLUMNS}`,
        [
          input.id,
          input.state,
          input.outcomeActId,
          input.reversalActId,
          input.decidedBy,
          input.at,
        ],
      );
      const row = res.rows[0];
      return row ? appealRow(row) : null;
    },

    async countAppealsSince(since: string): Promise<Array<{ state: string; count: number }>> {
      const res = await sql.execute<{ state: string; count: string | number }>(
        `SELECT state, count(*) AS count
           FROM openproduct.appeals
          WHERE filed_at >= $1
          GROUP BY state
          ORDER BY state ASC`,
        [since],
      );
      return res.rows.map((row) => ({ state: row.state, count: Number(row.count) }));
    },

    async countAppealReversalsSince(since: string): Promise<number> {
      // Counted on `decided_at`, not `filed_at`, and the difference matters:
      // this figure sits beside "acts taken" in the window, and an appeal
      // filed in June and upheld in September reversed something in
      // SEPTEMBER. Dating it to the filing would credit the reversal to a
      // window in which nothing came back.
      const res = await sql.execute<{ n: string | number }>(
        `SELECT count(*) AS n
           FROM openproduct.appeals
          WHERE state = 'upheld'
            AND reversal_act_id IS NOT NULL
            AND decided_at >= $1`,
        [since],
      );
      return Number(res.rows[0]?.n ?? 0);
    },

    async countReportsSince(since: string): Promise<Array<{ state: string; count: number }>> {
      // BY STATE, so "received" and "actioned" are the same read rather than
      // two that can disagree. The open and triaged rows are in the answer on
      // purpose: a report queue with a growing tail is a fact about the
      // estate's capacity, and publishing only what we resolved would hide
      // exactly the failure a reader would want to know about.
      const res = await sql.execute<{ state: string; count: string | number }>(
        `SELECT state, count(*) AS count
           FROM openproduct.reports
          WHERE created_at >= $1
          GROUP BY state
          ORDER BY state ASC`,
        [since],
      );
      return res.rows.map((row) => ({ state: row.state, count: Number(row.count) }));
    },

    async countModerationActsSince(since: string): Promise<Array<{ act: string; count: number }>> {
      // TS5's transparency report is GENERATED from this, so the number we
      // publish and the acts we took cannot drift.
      const res = await sql.execute<{ act: string; count: string | number }>(
        `SELECT act, count(*) AS count
           FROM openproduct.moderation_acts
          WHERE occurred_at >= $1
          GROUP BY act
          ORDER BY act ASC`,
        [since],
      );
      return res.rows.map((row) => ({ act: row.act, count: Number(row.count) }));
    },


    // ---- the signal plane (openproduct-commons SN1) ----

    async upsertSignalSource(
      profileId: Uuid,
      source: SignalSourceName,
      locator: string | null,
    ): Promise<SignalSourceRecord> {
      const res = await sql.execute<SourceRow>(
        `INSERT INTO openproduct.signal_sources (profile_id, source, locator)
         VALUES ($1, $2, $3)
         ON CONFLICT (profile_id, source) DO UPDATE
            SET locator = EXCLUDED.locator,
                -- Re-declaring a source is how an operator un-withdraws one:
                -- the coordinates changed, so the reason we gave up may not
                -- hold any more. Explicit, and it clears the failure run.
                withdrawn_at = NULL,
                failure_count = 0,
                last_error = NULL,
                updated_at = now()
         RETURNING profile_id, source, locator, last_success_at, failure_count,
                   last_error, withdrawn_at`,
        [profileId, source, locator],
      );
      return sourceOf(res.rows[0]!);
    },

    async listDueSignalSources(beforeIso: string, limit = 50): Promise<DueSourceRecord[]> {
      const res = await sql.execute<SourceRow & { slug: string; repo_url: string | null }>(
        // NULLS FIRST: a source that has never been read is the most urgent
        // thing in the queue, not the least.
        `SELECT s.profile_id, s.source, s.locator, s.last_success_at, s.failure_count,
                s.last_error, s.withdrawn_at, p.slug, p.repo_url
           FROM openproduct.signal_sources s
           JOIN openproduct.profiles p ON p.id = s.profile_id
          WHERE s.withdrawn_at IS NULL
            AND ${listed("p")}
            AND (s.last_success_at IS NULL OR s.last_success_at < $1)
          ORDER BY s.last_success_at ASC NULLS FIRST
          LIMIT $2`,
        [beforeIso, Math.min(Math.max(1, limit), 500)],
      );
      return res.rows.map((row) => ({
        ...sourceOf(row),
        slug: row.slug,
        repoUrl: row.repo_url,
      }));
    },

    async seedDeclaredRepoSources(at: string): Promise<{ seeded: number; withdrawn: number }> {
      // ONE STATEMENT, so the seed and the withdrawal see the same snapshot
      // of `profiles` and a URL edited mid-sweep cannot be both.
      //
      // The sweep's own moment, bound rather than `now()`: this statement
      // opens with WITH, so OPP10's guard reads it as a read and holds it to
      // the no-volatile-function rule.
      //
      // The URL test is deliberately loose (host and two segments): the
      // gateway's `parseGithubRepo` is the strict reader, and a URL it cannot
      // read is charged as `repo_url_unreadable` until it is withdrawn — the
      // remedy in the maintainer's hands, and visible on /docs/checks.
      const res = await sql.execute<{ seeded: string | number; withdrawn: string | number }>(
        `WITH wanted AS (
           SELECT p.id AS profile_id, p.repo_url AS locator
             FROM openproduct.profiles p
            WHERE ${listed("p")}
              AND p.repo_url ~* '^https://github\.com/[^/?#]+/[^/?#]+/?$'
              AND NOT EXISTS (
                SELECT 1 FROM openproduct.signal_sources l
                 WHERE l.profile_id = p.id
                   AND l.source = 'linked_repo'
                   AND l.withdrawn_at IS NULL
              )
         ),
         seeded AS (
           INSERT INTO openproduct.signal_sources (profile_id, source, locator)
           SELECT profile_id, 'declared_repo', locator FROM wanted
           ON CONFLICT (profile_id, source) DO UPDATE
              SET locator = EXCLUDED.locator,
                  -- A new address is a new question: the run that withdrew
                  -- the old one says nothing about this one.
                  withdrawn_at = NULL,
                  failure_count = 0,
                  last_error = NULL,
                  last_success_at = NULL,
                  updated_at = $1
            WHERE openproduct.signal_sources.locator IS DISTINCT FROM EXCLUDED.locator
           RETURNING 1
         ),
         cleared AS (
           UPDATE openproduct.signal_sources s
              SET withdrawn_at = $1, last_error = 'repo_url_cleared', updated_at = $1
             FROM openproduct.profiles p
            WHERE p.id = s.profile_id
              AND s.source = 'declared_repo'
              AND s.withdrawn_at IS NULL
              AND (p.repo_url IS NULL OR p.repo_url !~* '^https://github\.com/')
           RETURNING 1
         )
         SELECT (SELECT count(*) FROM seeded) AS seeded,
                (SELECT count(*) FROM cleared) AS withdrawn`,
        [at],
      );
      const row = res.rows[0];
      return { seeded: Number(row?.seeded ?? 0), withdrawn: Number(row?.withdrawn ?? 0) };
    },

    async recordSignalSuccess(
      profileId: Uuid,
      source: SignalSourceName,
      at: string,
    ): Promise<void> {
      await sql.execute(
        `UPDATE openproduct.signal_sources
            SET last_success_at = $3, failure_count = 0, last_error = NULL, updated_at = now()
          WHERE profile_id = $1 AND source = $2`,
        [profileId, source, at],
      );
    },

    async recordSignalFailure(
      profileId: Uuid,
      source: SignalSourceName,
      error: string,
      at: string,
      withdrawAfter: number,
    ): Promise<SignalSourceRecord | null> {
      const res = await sql.execute<SourceRow>(
        // The withdrawal is decided in the same statement that increments the
        // run, so a source can never be one failure past its tolerance and
        // still be polled.
        `UPDATE openproduct.signal_sources
            SET failure_count = failure_count + 1,
                last_error = $3,
                withdrawn_at = CASE WHEN failure_count + 1 >= $5 THEN $4 ELSE withdrawn_at END,
                updated_at = now()
          WHERE profile_id = $1 AND source = $2
         RETURNING profile_id, source, locator, last_success_at, failure_count,
                   last_error, withdrawn_at`,
        [profileId, source, error.slice(0, 500), at, withdrawAfter],
      );
      const row = res.rows[0];
      return row ? sourceOf(row) : null;
    },

    async writeMetric(input: WriteMetricInput): Promise<void> {
      await sql.execute(
        `INSERT INTO openproduct.metrics
           (id, profile_id, metric, window_key, value, source, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.id,
          input.profileId,
          input.metric,
          input.window,
          Math.trunc(input.value),
          input.source,
          input.observedAt,
        ],
      );
    },

    async latestMetrics(profileId: string): Promise<MetricRecord[]> {
      const res = await sql.execute<MetricRow>(
        // DISTINCT ON is the whole read: latest row per (metric, window),
        // never an aggregate over the history. The history exists so a
        // restatement can be seen, not so the page has to fold it.
        `SELECT DISTINCT ON (metric, window_key)
                profile_id, metric, window_key, value, source, observed_at
           FROM openproduct.metrics
          WHERE profile_id = $1
          ORDER BY metric, window_key, observed_at DESC`,
        [profileId],
      );
      return res.rows.map(metricOf);
    },

    async latestMetricsForSlugs(slugs: string[]): Promise<Map<string, MetricRecord[]>> {
      const out = new Map<string, MetricRecord[]>();
      if (slugs.length === 0) return out;
      const res = await sql.execute<MetricRow & { slug: string }>(
        // ONE query for the whole directory page, not one per card: the
        // public document is assembled once per cache fill, and an N+1 there
        // is an N+1 against every cold edge.
        `SELECT DISTINCT ON (p.slug, m.metric, m.window_key)
                p.slug, m.profile_id, m.metric, m.window_key, m.value, m.source, m.observed_at
           FROM openproduct.metrics m
           JOIN openproduct.profiles p ON p.id = m.profile_id
          WHERE p.visibility = 'public' AND lower(p.slug) = ANY($1::text[])
          ORDER BY p.slug, m.metric, m.window_key, m.observed_at DESC`,
        [slugs.map((s) => s.toLowerCase())],
      );
      for (const row of res.rows) {
        const list = out.get(row.slug) ?? [];
        list.push(metricOf(row));
        out.set(row.slug, list);
      }
      return out;
    },

    async appendActivity(input: AppendActivityInput): Promise<void> {
      await sql.execute(
        `INSERT INTO openproduct.activity_events
           (id, profile_id, kind, summary, actor_subject_id, source, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.id,
          input.profileId,
          input.kind,
          input.summary.slice(0, 200),
          input.actorSubjectId ?? null,
          input.source,
          input.occurredAt,
        ],
      );
    },

    async listActivity(profileId: string, limit = 20): Promise<ActivityEventRecord[]> {
      const res = await sql.execute<ActivityRow>(
        `SELECT id, profile_id, kind, summary, actor_subject_id, source, occurred_at
           FROM openproduct.activity_events
          WHERE profile_id = $1
          ORDER BY occurred_at DESC
          LIMIT $2`,
        [profileId, Math.min(Math.max(1, limit), 100)],
      );
      return res.rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        kind: row.kind,
        summary: row.summary,
        actorSubjectId: row.actor_subject_id,
        source: row.source as SignalSourceName,
        occurredAt: iso(row.occurred_at)!,
      }));
    },

    async appendAudit(input: AppendAuditInput): Promise<void> {
      await sql.execute(
        `INSERT INTO openproduct.audit_log
           (id, org_id, profile_id, actor_type, actor_id, type, description, payload, request_id, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb, $9, $10)`,
        [
          input.id,
          input.orgId,
          input.profileId ?? null,
          input.actorType,
          input.actorId,
          input.type,
          input.description,
          input.payload === undefined || input.payload === null ? null : JSON.stringify(input.payload),
          input.requestId ?? null,
          input.occurredAt,
        ],
      );
    },

    async listAuditForProfile(profileId: Uuid, limit = 50): Promise<AuditEntryRecord[]> {
      const res = await sql.execute<{
        id: string;
        org_id: string;
        profile_id: string | null;
        actor_type: string;
        actor_id: string;
        type: string;
        description: string;
        payload: unknown;
        request_id: string | null;
        occurred_at: string | Date;
      }>(
        `SELECT id, org_id, profile_id, actor_type, actor_id, type, description, payload, request_id, occurred_at
           FROM openproduct.audit_log
          WHERE profile_id = $1
          ORDER BY occurred_at DESC
          LIMIT $2`,
        [profileId, Math.min(Math.max(1, limit), 200)],
      );
      return res.rows.map((row) => ({
        id: row.id,
        orgId: row.org_id,
        profileId: row.profile_id,
        actorType: row.actor_type,
        actorId: row.actor_id,
        type: row.type,
        description: row.description,
        payload:
          row.payload === null || row.payload === undefined
            ? null
            : typeof row.payload === "string"
              ? (JSON.parse(row.payload) as Record<string, unknown>)
              : (row.payload as Record<string, unknown>),
        requestId: row.request_id,
        occurredAt: iso(row.occurred_at)!,
      }));
    },

    async updateProfile(orgId: Uuid, profileId: Uuid, input: UpdateProfileInput): Promise<ProfileRecord | null> {
      // COALESCE-per-column rather than a built SQL string: the column list
      // stays literal and greppable, and a null means "unchanged" for the
      // fields where null is not itself a value. `tagline`, `repoUrl`,
      // `liveUrl` and the pitch are explicitly clearable, so they carry a
      // companion flag rather than relying on null.
      return profileRow(
        `UPDATE openproduct.profiles SET
           slug         = COALESCE($3, slug),
           tagline      = CASE WHEN $4::boolean THEN $5 ELSE tagline END,
           pitch_body   = CASE WHEN $6::boolean THEN $7 ELSE pitch_body END,
           pitch_digest = CASE WHEN $6::boolean THEN $8 ELSE pitch_digest END,
           repo_url     = CASE WHEN $9::boolean THEN $10 ELSE repo_url END,
           -- The observation belongs to the URL it observed. A changed or
           -- cleared link resets it, so a stale "private" reading cannot
           -- outlive the repository it was read from and block a listing
           -- that now names a different repository — or none, which
           -- publishes (2026-09-03). References to repo_url on the right
           -- are the OLD value, as SET semantics guarantee.
           repo_visibility = CASE WHEN $9::boolean AND $10::text IS DISTINCT FROM repo_url THEN NULL ELSE repo_visibility END,
           repo_licence    = CASE WHEN $9::boolean AND $10::text IS DISTINCT FROM repo_url THEN NULL ELSE repo_licence END,
           repo_checked_at = CASE WHEN $9::boolean AND $10::text IS DISTINCT FROM repo_url THEN NULL ELSE repo_checked_at END,
           live_url     = CASE WHEN $11::boolean THEN $12 ELSE live_url END,
           -- PV2 — explicitly clearable, like the tagline and the pitch: a
           -- maintainer who removes their install line is saying there is no
           -- longer one to give, which is not the same as never having said.
           install_line = CASE WHEN $20::boolean THEN $21 ELSE install_line END,
           stack        = COALESCE($13::text::jsonb, stack),
           -- CT1. stack_canonical moves WITH stack and never separately: the
           -- caller supplies the authored list, this derives the resolved
           -- subset, and the two can therefore never be set out of step.
           stack_canonical = COALESCE($14::text::jsonb, stack_canonical),
           -- Assigned facets are explicitly clearable, so they carry a
           -- companion flag: clearing says "we do not answer this", which is
           -- not the same as never having been asked.
           category     = CASE WHEN $15::boolean THEN $16 ELSE category END,
           hosting      = CASE WHEN $17::boolean THEN $18 ELSE hosting END,
           -- PP3 — the third assigned facet, same companion flag.
           pricing      = CASE WHEN $22::boolean THEN $23 ELSE pricing END,
           updated_by   = $19,
           updated_at   = now()
         WHERE org_id = $1 AND id = $2
         RETURNING ${PROFILE_COLUMNS}`,
        [
          orgId,
          profileId,
          input.slug ?? null,
          input.tagline !== undefined,
          input.tagline ?? null,
          input.pitchBody !== undefined,
          input.pitchBody ?? null,
          input.pitchDigest ?? null,
          input.repoUrl !== undefined,
          input.repoUrl ?? null,
          input.liveUrl !== undefined,
          input.liveUrl ?? null,
          input.stack ? JSON.stringify(input.stack) : null,
          input.stack ? JSON.stringify(canonicaliseStack(input.stack).canonical) : null,
          input.category !== undefined,
          input.category ?? null,
          input.hosting !== undefined,
          input.hosting ?? null,
          input.updatedBy,
          input.installLine !== undefined,
          input.installLine ?? null,
          input.pricing !== undefined,
          input.pricing ?? null,
        ],
      );
    },

    // Written by the authenticated publish path and the sweep. Not org-scoped:
    // the sweep runs as the platform, and the observation is a fact about a
    // repo rather than an act by a member.
    async recordRepoObservation(profileId: Uuid, observation: RepoObservation): Promise<ProfileRecord | null> {
      // IN2 — WRITTEN, NEVER COALESCED. A check that read a repository whose
      // description has been deleted must clear the one we hold: these
      // columns say what the repository says NOW, and a stale observation
      // presented as current is the failure OPC-2 exists to prevent.
      return profileRow(
        `UPDATE openproduct.profiles
            SET repo_visibility = $2, repo_licence = $3, repo_checked_at = $4,
                repo_name = $5, repo_description = $6, repo_topics = $7,
                repo_language = $8, repo_pushed_at = $9, repo_open_issues = $10
          WHERE id = $1
          RETURNING ${PROFILE_COLUMNS}`,
        [
          profileId,
          observation.repoVisibility,
          observation.repoLicence,
          observation.observedAt,
          observation.repoName ?? null,
          observation.repoDescription ?? null,
          observation.repoTopics ?? null,
          observation.repoLanguage ?? null,
          observation.repoPushedAt ?? null,
          observation.repoOpenIssues ?? null,
        ],
      );
    },

    // The curation gate (README §Curation). Idempotent: reviewing an
    // already-reviewed profile keeps the first reviewer and stamp, because
    // that is the one the audit trail refers to.
    async reviewProfile(profileId: Uuid, reviewedBy: string, at: string): Promise<ProfileRecord | null> {
      // TS1 — a review RAISES indexability. That is the whole remedy a `new`
      // maker is offered: their page is already live and readable, and a
      // human looking at it is what lets crawlers amplify it.
      //
      // `indexable` is set unconditionally rather than COALESCEd, because a
      // review is a decision about this listing and it supersedes whatever
      // the ladder decided at publish time. The two timestamps stay COALESCEd
      // so a second review does not rewrite who looked first.
      return profileRow(
        `UPDATE openproduct.profiles
            SET reviewed_at = COALESCE(reviewed_at, $3),
                reviewed_by = COALESCE(reviewed_by, $2),
                indexable   = TRUE
          WHERE id = $1
          RETURNING ${PROFILE_COLUMNS}`,
        [profileId, reviewedBy, at],
      );
    },

    async countUnreviewedPublished(subjectId) {
      // Counted over LISTINGS THIS SUBJECT MAINTAINS rather than over
      // `created_by`, because the authority handover (1290) made maintainers
      // the fact of who holds a listing — and a cap keyed on creation is a cap
      // that transferring a listing walks straight around.
      const res = await sql.execute<{ n: string | number }>(
        `SELECT count(*) AS n
           FROM openproduct.profiles p
           JOIN openproduct.listing_maintainers lm ON lm.profile_id = p.id
          WHERE lm.subject_id = $1
            AND p.visibility = 'public'
            AND p.reviewed_at IS NULL`,
        [subjectId],
      );
      return Number(res.rows[0]?.n ?? 0);
    },

    // The preconditions are asserted in SQL as well as in the handler, so the
    // two can never disagree: a private repo or an unreviewed profile updates
    // zero rows and the caller gets null.
    async publishProfile(orgId, profileId, at, actor, options) {
      const components = options.components;
      const published = await profileRow(
        `UPDATE openproduct.profiles
            SET visibility   = 'public',
                published_at = COALESCE(published_at, $3),
                -- OH4: the snapshot is authored by the act of publishing —
                -- rewritten wholesale every time, null when nothing is chosen.
                components   = $5::text::jsonb,
                -- TS1: the ladder's decision, stored. Never recomputed at read
                -- time, so a later promotion or demotion cannot retroactively
                -- change what a published page was allowed to be.
                indexable    = $7,
                updated_by   = $4,
                updated_at   = now()
          WHERE org_id = $1 AND id = $2
            -- TS1 replaces OD's unconditional review gate. The predicate is
            -- still HERE as well as in the handler so the two cannot disagree
            -- and a race cannot slip past — but what it asserts is now the
            -- resolved decision rather than a blanket rule.
            AND (reviewed_at IS NOT NULL OR $6::boolean)
            -- A repository that read back PRIVATE refuses; none at all does
            -- not (a listing without a repository is a listing, 2026-09-03).
            -- NULL passes IS DISTINCT FROM; 'public' passes; 'private' fails.
            AND repo_visibility IS DISTINCT FROM 'private'
          RETURNING ${PROFILE_COLUMNS}`,
        [
          orgId,
          profileId,
          at,
          actor,
          components && components.length > 0 ? JSON.stringify(components) : null,
          options.allowWithoutReview,
          options.indexable,
        ],
      );
      if (published) await touchIndex();
      return published;
    },

    async unpublishProfile(orgId: Uuid, profileId: Uuid, actor: string): Promise<ProfileRecord | null> {
      const unpublished = await profileRow(
        `UPDATE openproduct.profiles
            SET visibility = 'private', updated_by = $3, updated_at = now()
          WHERE org_id = $1 AND id = $2
          RETURNING ${PROFILE_COLUMNS}`,
        [orgId, profileId, actor],
      );
      // Marked even though the row is now private: the index still HOLDS it,
      // and the rebuild is what removes it. This is the mark that matters
      // most — a listing findable after being unpublished is the failure the
      // whole de-index path exists to prevent.
      if (unpublished) await touchIndex();
      return unpublished;
    },

    async deleteProfile(orgId: Uuid, profileId: Uuid): Promise<boolean> {
      const res = await sql.execute(
        `DELETE FROM openproduct.profiles WHERE org_id = $1 AND id = $2`,
        [orgId, profileId],
      );
      return res.rowCount > 0;
    },

    // OD-G: the project went away while its profile was live. Unpublish rather
    // than delete — the row is the record of what was public and when.
    async unpublishByProject(projectId: Uuid): Promise<number> {
      const res = await sql.execute(
        `UPDATE openproduct.profiles
            SET visibility = 'private', updated_at = now()
          WHERE project_id = $1 AND visibility = 'public'`,
        [projectId],
      );
      return res.rowCount;
    },

    async upsertRoleOpening(input: UpsertRoleOpeningInput): Promise<RoleOpeningRecord> {
      const res = await sql.execute<RoleOpeningRow>(
        `INSERT INTO openproduct.role_openings
           (id, profile_id, title, description, commitment, status, sort_order)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'open'), COALESCE($7, 0))
         ON CONFLICT (id) DO UPDATE SET
           title       = EXCLUDED.title,
           description = EXCLUDED.description,
           commitment  = EXCLUDED.commitment,
           status      = EXCLUDED.status,
           sort_order  = EXCLUDED.sort_order,
           updated_at  = now()
         RETURNING id, profile_id, title, description, commitment, status, join_link_ref, sort_order`,
        [
          input.id,
          input.profileId,
          input.title,
          input.description ?? null,
          input.commitment ?? null,
          input.status ?? null,
          input.sortOrder ?? null,
        ],
      );
      return roleOpeningOf(res.rows[0]!);
    },

    async setRoleOpeningJoinLink(id: Uuid, joinLinkRef: string): Promise<RoleOpeningRecord | null> {
      const res = await sql.execute<RoleOpeningRow>(
        `UPDATE openproduct.role_openings
            SET join_link_ref = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, profile_id, title, description, commitment, status, join_link_ref, sort_order`,
        [id, joinLinkRef],
      );
      const row = res.rows[0];
      return row ? roleOpeningOf(row) : null;
    },

    async deleteRoleOpening(profileId: Uuid, id: Uuid): Promise<boolean> {
      const res = await sql.execute(
        `DELETE FROM openproduct.role_openings WHERE profile_id = $1 AND id = $2`,
        [profileId, id],
      );
      return res.rowCount > 0;
    },

    // Replace-the-set, because publication is a deliberate list rather than an
    // accumulation: removing someone must be as easy as adding them, and a
    // partial update would leave a person published that the maintainer
    // believes they removed.
    async setMaintainers(profileId: Uuid, maintainers: MaintainerInput[]): Promise<PublishedMaintainerRecord[]> {
      await sql.execute(`DELETE FROM openproduct.published_maintainers WHERE profile_id = $1`, [profileId]);
      for (const [index, m] of maintainers.entries()) {
        await sql.execute(
          `INSERT INTO openproduct.published_maintainers
             (profile_id, subject_id, display_name, role_label, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (profile_id, subject_id) DO UPDATE
             SET display_name = EXCLUDED.display_name,
                 role_label   = EXCLUDED.role_label,
                 sort_order   = EXCLUDED.sort_order`,
          [profileId, m.subjectId, m.displayName ?? null, m.roleLabel ?? null, m.sortOrder ?? index],
        );
      }
      const res = await sql.execute<MaintainerRow>(
        `SELECT profile_id, subject_id, display_name, role_label, sort_order
           FROM openproduct.published_maintainers WHERE profile_id = $1
          ORDER BY sort_order ASC, created_at ASC`,
        [profileId],
      );
      return res.rows.map(maintainerOf);
    },

    // ---- contributor home (OH0) ----

    async getContributor(subjectId) {
      const res = await sql.execute<ContributorRow>(
        `SELECT subject_id, display_name, bio, profile_public, open_to_project, github_url, site_url, published_at, created_at, updated_at
           FROM openproduct.contributors WHERE subject_id = $1`,
        [subjectId],
      );
      return res.rows[0] ? contributorOf(res.rows[0]) : null;
    },

    async upsertContributor(input) {
      // CG1 — the links and the pill are separately CLEARABLE, so each
      // carries a companion flag rather than relying on null meaning
      // "unchanged". Clearing a link is a thing people do, and making
      // somebody delete their profile to remove one would be absurd.
      const res = await sql.execute<ContributorRow>(
        `INSERT INTO openproduct.contributors
           (subject_id, display_name, bio, github_url, site_url, open_to_project)
         VALUES ($1, $2, $3, $5, $7, COALESCE($8, FALSE))
         ON CONFLICT (subject_id) DO UPDATE
           SET display_name    = EXCLUDED.display_name,
               bio             = EXCLUDED.bio,
               github_url      = CASE WHEN $4::boolean THEN $5 ELSE openproduct.contributors.github_url END,
               site_url        = CASE WHEN $6::boolean THEN $7 ELSE openproduct.contributors.site_url END,
               open_to_project = COALESCE($8, openproduct.contributors.open_to_project),
               updated_at      = now()
         RETURNING subject_id, display_name, bio, profile_public, open_to_project, github_url, site_url, published_at, created_at, updated_at`,
        [
          input.subjectId,
          input.displayName ?? null,
          input.bio ?? null,
          input.githubUrl !== undefined,
          input.githubUrl ?? null,
          input.siteUrl !== undefined,
          input.siteUrl ?? null,
          input.openToProject ?? null,
        ],
      );
      return contributorOf(res.rows[0]!);
    },

    async setProfileVisibility(subjectId, isPublic, at) {
      // `published_at` is stamped on the FIRST publish and never rewritten.
      // It is when the public surface began, and an appeal or a transparency
      // record needs that date to stay the date — re-stamping it on every
      // toggle would let somebody quietly reset their own history.
      const res = await sql.execute<ContributorRow>(
        `UPDATE openproduct.contributors
            SET profile_public = $2,
                published_at   = CASE WHEN $2 THEN COALESCE(published_at, $3) ELSE published_at END,
                updated_at     = now()
          WHERE subject_id = $1
         RETURNING subject_id, display_name, bio, profile_public, open_to_project, github_url, site_url, published_at, created_at, updated_at`,
        [subjectId, isPublic, at],
      );
      return res.rows[0] ? contributorOf(res.rows[0]) : null;
    },

    async listPublicContributorCards(limit) {
      // CG2 — the directory. Same three gates as the page and the sitemap
      // (opted in, live handle, standing), a narrower projection, and a
      // bound: this is the one public read whose row count grows with PEOPLE
      // rather than with listings.
      //
      // ORDERED BY WHEN THE PROFILE BECAME PUBLIC, most recent first, with
      // the handle as the tiebreak. NOT by anything about the person: any
      // ordering that ranked people would be a ranking of people, which is a
      // thing this product does not do and has nowhere to publish a formula
      // for (OPC-4). Newest-first at least means somebody who just opted in
      // is visible rather than buried behind an alphabet.
      const capped = Math.max(1, Math.min(Math.trunc(limit) || 0, 200));
      const res = await sql.execute<{
        handle: string;
        display_name: string | null;
        bio: string | null;
        open_to_project: boolean;
        published_at: string | Date | null;
        maintains: unknown;
        contributes_to: string | number;
        launched: boolean;
      }>(
        `SELECT h.handle, c.display_name, c.bio, c.open_to_project, c.published_at,
                -- PE3 — a live launch on a listed listing they maintain: a fact.
                EXISTS (
                  SELECT 1
                    FROM openproduct.launches l
                    JOIN openproduct.profiles pl ON pl.id = l.profile_id
                    JOIN openproduct.listing_maintainers lm3 ON lm3.profile_id = l.profile_id
                   WHERE lm3.subject_id = c.subject_id
                     AND l.state = 'live'
                     AND ${listed("pl")}
                ) AS launched,
                COALESCE((
                  SELECT jsonb_agg(p.slug ORDER BY p.published_at DESC NULLS LAST, p.slug)
                    FROM openproduct.listing_maintainers lm2
                    JOIN openproduct.profiles p ON p.id = lm2.profile_id
                   WHERE lm2.subject_id = c.subject_id AND ${listed("p")}
                ), '[]'::jsonb) AS maintains,
                -- CG4 — COUNTED here, named on the page. The card already
                -- carries one list of slugs; a second would turn a directory
                -- of people into a directory of products, which is the read
                -- CG2 deliberately narrowed away from.
                (
                  SELECT count(*)
                    FROM openproduct.product_people pp
                    JOIN openproduct.profiles p2 ON p2.id = pp.profile_id
                   WHERE pp.subject_id = c.subject_id
                     AND pp.state IN ('confirmed', 'retired')
                     AND pp.confirmed_at IS NOT NULL
                     AND ${listed("p2")}
                     AND NOT EXISTS (
                       SELECT 1 FROM openproduct.listing_maintainers lm4
                        WHERE lm4.profile_id = pp.profile_id
                          AND lm4.subject_id = pp.subject_id
                     )
                ) AS contributes_to
           FROM openproduct.handles h
           JOIN openproduct.contributors c ON c.subject_id = h.subject_id
          WHERE h.released_at IS NULL
            AND c.profile_public
            AND c.published_at IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM openproduct.listing_maintainers lm
                JOIN openproduct.profiles p2 ON p2.id = lm.profile_id
               WHERE lm.subject_id = c.subject_id AND ${listed("p2")}
            )
          ORDER BY c.published_at DESC, h.handle
          LIMIT $1`,
        [capped],
      );
      return res.rows.map((row) => ({
        handle: row.handle,
        displayName: row.display_name,
        bio: row.bio,
        openToProject: row.open_to_project,
        maintains: parseSlugList(row.maintains),
        // `count(*)` is a bigint, and node-postgres hands bigints back as
        // STRINGS rather than lose precision. `"0"` is truthy; a card that
        // trusted it would render every contributor as having contributed.
        contributesTo: Number(row.contributes_to ?? 0),
        launched: row.launched === true,
      }));
    },

    async listPublicContributorHandles() {
      // THE SAME TWO GATES as `getPublicContributor`, and the reason they are
      // written out again rather than shared: a "list" that used a looser
      // predicate would advertise pages the single read 404s, and a sitemap
      // full of 404s teaches a crawler to stop trusting the document. The
      // pglite test asserts the two agree by running them against the same
      // fixtures rather than by inspecting the SQL.
      const res = await sql.execute<{ handle: string; published_at: string | Date | null }>(
        `SELECT h.handle, c.published_at
           FROM openproduct.handles h
           JOIN openproduct.contributors c ON c.subject_id = h.subject_id
          WHERE h.released_at IS NULL
            AND c.profile_public
            AND c.published_at IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM openproduct.listing_maintainers lm
                JOIN openproduct.profiles p ON p.id = lm.profile_id
               WHERE lm.subject_id = c.subject_id AND ${listed("p")}
            )
          ORDER BY h.handle`,
        [],
      );
      // THROUGH `iso`, like every other timestamp this repository returns.
      // Postgres hands a `timestamptz` back as a `Date` on some clients and a
      // string on others, and the contract here promises a string: the
      // sitemap slices it to a date, and `Date.prototype.slice` does not
      // exist. A pglite test caught this by comparing the two reads' answers.
      return res.rows
        .map((row) => ({ handle: row.handle, publishedAt: iso(row.published_at) }))
        .filter((row): row is { handle: string; publishedAt: string } => row.publishedAt !== null);
    },

    async getPublicContributor(handle) {
      // BOTH GATES, IN ONE STATEMENT.
      //
      //   1. their own act      c.profile_public
      //   2. standing           at least one PUBLIC listing they maintain
      //
      // The second is a JOIN, not a column, because it is a fact about the
      // world that changes without anybody touching the contributor row:
      // unpublish your last listing and the page stops rendering; republish
      // and it returns. A denormalised flag would be a cache of this join,
      // and the bug it produces is a page that outlives its standing.
      //
      // The handle must also be LIVE — a released row has a subject_id but is
      // a tombstone, and resolving it would hand the old holder's links to
      // whoever reads them next.
      const res = await sql.execute<PublicContributorRowSql>(
        `SELECT h.handle,
                c.display_name, c.bio, c.github_url, c.site_url,
                c.open_to_project, c.published_at,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object('slug', p.slug, 'tagline', p.tagline)
                                   ORDER BY p.published_at DESC NULLS LAST, p.slug)
                    FROM openproduct.listing_maintainers lm2
                    JOIN openproduct.profiles p ON p.id = lm2.profile_id
                   WHERE lm2.subject_id = c.subject_id AND ${listed("p")}
                ), '[]'::jsonb) AS maintains,
                -- CG4 — the second stat, in the SAME statement. The obvious
                -- alternative was a second repository call from the handler,
                -- and it cannot be written: the public contributor record
                -- deliberately carries no subject id, so the handler has
                -- nothing to look the edges up BY. That absence is the point
                -- (I3), and computing here honours it instead of working
                -- around it.
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object('slug', p3.slug, 'tagline', p3.tagline)
                                   ORDER BY p3.published_at DESC NULLS LAST, p3.slug)
                    FROM openproduct.product_people pp
                    JOIN openproduct.profiles p3 ON p3.id = pp.profile_id
                   WHERE pp.subject_id = c.subject_id
                     AND pp.state IN ('confirmed', 'retired')
                     AND pp.confirmed_at IS NOT NULL
                     AND ${listed("p3")}
                     AND NOT EXISTS (
                       SELECT 1 FROM openproduct.listing_maintainers lm3
                        WHERE lm3.profile_id = pp.profile_id
                          AND lm3.subject_id = pp.subject_id
                     )
                ), '[]'::jsonb) AS contributes_to
           FROM openproduct.handles h
           JOIN openproduct.contributors c ON c.subject_id = h.subject_id
          WHERE lower(h.handle) = lower($1)
            AND h.released_at IS NULL
            AND c.profile_public
            AND EXISTS (
              SELECT 1 FROM openproduct.listing_maintainers lm
                JOIN openproduct.profiles p2 ON p2.id = lm.profile_id
               WHERE lm.subject_id = c.subject_id AND ${listed("p2")}
            )`,
        [handle],
      );
      const row = res.rows[0];
      if (!row || !row.published_at) return null;
      return {
        handle: row.handle,
        displayName: row.display_name,
        bio: row.bio,
        githubUrl: row.github_url,
        siteUrl: row.site_url,
        openToProject: row.open_to_project === true,
        publishedAt: iso(row.published_at)!,
        maintains: maintainsOf(row.maintains),
        contributesTo: maintainsOf(row.contributes_to),
      };
    },

    async recordApplication(input) {
      const res = await sql.execute<ApplicationRow>(
        `INSERT INTO openproduct.applications
           (id, subject_id, profile_id, role_opening_id, jr_request_ref)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (subject_id, role_opening_id) DO UPDATE
           SET jr_request_ref = EXCLUDED.jr_request_ref,
               status         = 'pending',
               updated_at     = now()
         RETURNING id, subject_id, profile_id, role_opening_id, jr_request_ref,
                   status, created_at, updated_at`,
        [input.id, input.subjectId, input.profileId, input.roleOpeningId, input.jrRequestRef ?? null],
      );
      return applicationOf(res.rows[0]!);
    },

    /**
     * How many people are waiting on a decision, per opening (CB2).
     *
     * WHAT THIS QUERY DOES NOT TOUCH is the point of it. There is no join to
     * `activity_events` here and there must never be one: OPC-F's attack is
     * exactly that join — a small pending count plus a visible recent arrival
     * identifies the person who arrived. Keeping the two apart in SQL means
     * the join cannot be made by accident by somebody adding a column.
     *
     * It returns RAW counts, and the flooring happens in core before anything
     * leaves the estate. Doing it here instead would put the policy in the
     * data layer, where the studio's own reads (which legitimately show a
     * maintainer their real queue) would have to work around it.
     *
     * `pending` is JR's own vocabulary, cached on this row by the seam sync —
     * CB-5: JR is the source of truth and this renders it, never mirrors it.
     */
    async countOpeningDemand(profileId) {
      const res = await sql.execute<{
        role_opening_id: string;
        pending: number | string;
        opened_at: string | Date | null;
      }>(
        `SELECT o.id AS role_opening_id,
                count(a.id) FILTER (WHERE a.status = 'pending') AS pending,
                o.created_at AS opened_at
           FROM openproduct.role_openings o
           LEFT JOIN openproduct.applications a ON a.role_opening_id = o.id
          WHERE o.profile_id = $1
          GROUP BY o.id, o.created_at`,
        [profileId],
      );
      return res.rows.map((row) => ({
        roleOpeningId: row.role_opening_id,
        pending: Number(row.pending ?? 0),
        openedAt: iso(row.opened_at)!,
      }));
    },

    // ─── CB4: notifications ────────────────────────────────────────────────

    /**
     * Everybody in a thread, derived from the posts (CB4).
     *
     * PARTICIPATION IS THE SUBSCRIPTION. There is no subscriptions table to
     * keep in step with this, because the posts ARE the list — a second store
     * of who cares would be silently wrong the first time it disagreed.
     *
     * A REMOVED POST STILL MAKES YOU A PARTICIPANT: your reply being taken
     * down does not take you out of a conversation you were in, and being
     * dropped from it silently is a second punishment nobody decided on.
     */
    async listThreadParticipants(threadId) {
      const res = await sql.execute<{ subject_id: string }>(
        `SELECT author_subject_id AS subject_id FROM openproduct.threads WHERE id = $1
         UNION
         SELECT author_subject_id AS subject_id FROM openproduct.posts WHERE thread_id = $1`,
        [threadId],
      );
      return res.rows.map((r) => r.subject_id);
    },

    /** Who has said stop, for this thread and for everything. */
    async listMutes(threadId, subjectIds) {
      if (subjectIds.length === 0) return { thread: [], global: [] };
      const [thread, global] = await Promise.all([
        sql.execute<{ subject_id: string }>(
          `SELECT subject_id FROM openproduct.thread_mutes
            WHERE thread_id = $1 AND subject_id = ANY($2::text[])`,
          [threadId, subjectIds],
        ),
        sql.execute<{ subject_id: string }>(
          // Absence of a row means NOTIFY (the trust_levels posture), so only
          // rows that say `muted` count.
          `SELECT subject_id FROM openproduct.notification_prefs
            WHERE muted AND subject_id = ANY($1::text[])`,
          [subjectIds],
        ),
      ]);
      return {
        thread: thread.rows.map((r) => r.subject_id),
        global: global.rows.map((r) => r.subject_id),
      };
    },

    /**
     * Queue one notification. ON CONFLICT DO NOTHING against the unique
     * (subject_id, event_ref): that index is what makes "once per event per
     * person" true, so a retry or a redelivered seam event lands here and
     * stops rather than sending a second copy.
     */
    async queueNotification(input) {
      const res = await sql.execute<{ id: string }>(
        `INSERT INTO openproduct.notification_outbox
           (id, subject_id, kind, thread_id, event_ref)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (subject_id, event_ref) DO NOTHING
         RETURNING id`,
        [input.id, input.subjectId, input.kind, input.threadId ?? null, input.eventRef],
      );
      return res.rows.length > 0;
    },

    // ─── the digest by email (openproduct-commons LC5) ───

    async getDigestStanding(subjectId) {
      const res = await sql.execute<{
        subscribed_at: string | Date;
        unsubscribed_at: string | Date | null;
      }>(
        `SELECT subscribed_at, unsubscribed_at
           FROM openproduct.digest_subscriptions WHERE subject_id = $1`,
        [subjectId],
      );
      const row = res.rows[0];
      // ABSENCE MEANS SILENCE, and it means "never asked" rather than "left"
      // — the control says different things to those two people.
      if (!row) return { standing: "never", since: null };
      return row.unsubscribed_at === null
        ? { standing: "subscribed", since: iso(row.subscribed_at) }
        : { standing: "unsubscribed", since: iso(row.subscribed_at) };
    },

    async setDigestSubscription(subjectId, subscribed, at) {
      // UPSERT, so re-subscribing REUSES the row. `subscribed_at` is only
      // moved when somebody is actually starting again, so it keeps meaning
      // "when they first said yes" for anybody who never left.
      await sql.execute(
        `INSERT INTO openproduct.digest_subscriptions
           (subject_id, subscribed_at, unsubscribed_at, updated_at)
         VALUES ($1, $2, $3, $2)
         ON CONFLICT (subject_id) DO UPDATE
           SET unsubscribed_at = EXCLUDED.unsubscribed_at,
               subscribed_at   = CASE
                 WHEN EXCLUDED.unsubscribed_at IS NULL
                  AND openproduct.digest_subscriptions.unsubscribed_at IS NOT NULL
                 THEN EXCLUDED.subscribed_at
                 ELSE openproduct.digest_subscriptions.subscribed_at
               END,
               updated_at = EXCLUDED.updated_at`,
        [subjectId, at, subscribed ? null : at],
      );
    },

    async digestWeekQueued(eventRef) {
      const res = await sql.execute<{ one: number }>(
        `SELECT 1 AS one FROM openproduct.notification_outbox
          WHERE event_ref = $1 LIMIT 1`,
        [eventRef],
      );
      return res.rows.length > 0;
    },

    async listDigestSubscribers(limit) {
      const res = await sql.execute<{ subject_id: string }>(
        `SELECT subject_id FROM openproduct.digest_subscriptions
          WHERE unsubscribed_at IS NULL
          ORDER BY subject_id
          LIMIT $1`,
        [Math.min(Math.max(1, limit), 50_000)],
      );
      return res.rows.map((row) => row.subject_id);
    },

    async listPendingDigests(limit) {
      // THE SUBSCRIPTION IS RE-CHECKED HERE, not trusted from queue time.
      // That JOIN is the whole of "unsubscribing takes effect immediately,
      // including for a digest already queued" — without it the promise would
      // be true only for people who left before the weekly run, which is most
      // of them and not all of them, which is the worst kind of almost-true.
      //
      // The outbox is a QUEUE, not a promise.
      const res = await sql.execute<{ id: string; subject_id: string; event_ref: string }>(
        `SELECT o.id, o.subject_id, o.event_ref
           FROM openproduct.notification_outbox o
           JOIN openproduct.digest_subscriptions d
             ON d.subject_id = o.subject_id AND d.unsubscribed_at IS NULL
          WHERE o.kind = 'digest'
            AND o.delivered_at IS NULL
            AND o.attempts < $2
          ORDER BY o.created_at ASC
          LIMIT $1`,
        [Math.min(Math.max(1, limit), 50_000), 5],
      );
      return res.rows.map((row) => ({
        id: row.id,
        subjectId: row.subject_id,
        eventRef: row.event_ref,
      }));
    },

    async markDigestDelivered(ids, at) {
      if (ids.length === 0) return 0;
      const res = await sql.execute<{ id: string }>(
        `UPDATE openproduct.notification_outbox
            SET delivered_at = $2
          WHERE id = ANY($1::uuid[]) AND delivered_at IS NULL
         RETURNING id`,
        [[...ids], at],
      );
      return res.rows.length;
    },

    async recordDigestAttempt(ids) {
      if (ids.length === 0) return 0;
      // BOUNDED BY THE COLUMN, not by a caller counting: a permanently
      // failing row stops being read by `listPendingDigests` once it passes
      // the ceiling, rather than becoming a queue that only grows.
      const res = await sql.execute<{ id: string }>(
        `UPDATE openproduct.notification_outbox
            SET attempts = attempts + 1
          WHERE id = ANY($1::uuid[]) AND delivered_at IS NULL
         RETURNING id`,
        [[...ids]],
      );
      return res.rows.length;
    },

    async setThreadMute(subjectId, threadId, muted) {
      if (muted) {
        await sql.execute(
          `INSERT INTO openproduct.thread_mutes (subject_id, thread_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [subjectId, threadId],
        );
        return;
      }
      await sql.execute(
        `DELETE FROM openproduct.thread_mutes WHERE subject_id = $1 AND thread_id = $2`,
        [subjectId, threadId],
      );
    },

    /**
     * The global switch. A row appears only for somebody who has CHANGED the
     * default — writing one for every subject who signs in would make this a
     * shadow user directory, which openproduct does not keep (1330's rule).
     */
    async setNotificationPref(subjectId, muted) {
      await sql.execute(
        `INSERT INTO openproduct.notification_prefs (subject_id, muted, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (subject_id) DO UPDATE SET muted = EXCLUDED.muted, updated_at = now()`,
        [subjectId, muted],
      );
    },

    async getNotificationPref(subjectId) {
      const res = await sql.execute<{ muted: boolean }>(
        `SELECT muted FROM openproduct.notification_prefs WHERE subject_id = $1`,
        [subjectId],
      );
      // No row means notify.
      return res.rows[0]?.muted ?? false;
    },

    async isThreadMuted(subjectId, threadId) {
      const res = await sql.execute(
        `SELECT 1 FROM openproduct.thread_mutes WHERE subject_id = $1 AND thread_id = $2`,
        [subjectId, threadId],
      );
      return res.rows.length > 0;
    },

    async listApplicationsBySubject(subjectId) {
      // The join stays inside the schema (the FK guarantees it resolves) and
      // carries the product's PUBLIC identity only — slug and tagline, the
      // card fields, never the internal row.
      const res = await sql.execute<ApplicationRow>(
        `SELECT a.id, a.subject_id, a.profile_id, a.role_opening_id, a.jr_request_ref,
                a.status, a.created_at, a.updated_at,
                p.slug AS product_slug, p.tagline AS product_tagline
           FROM openproduct.applications a
           JOIN openproduct.profiles p ON p.id = a.profile_id
          WHERE a.subject_id = $1
          ORDER BY a.created_at DESC`,
        [subjectId],
      );
      return res.rows.map(applicationOf);
    },

    /**
     * The application behind a JR request ref, with the opening it was for.
     *
     * CB3 needs three things to write a `joined` row — the listing, the
     * person, and what they joined AS — and the seam event carries only the
     * ref. Read AFTER the status update so the row reflects the decision that
     * just landed.
     */
    async getApplicationByRequestRef(jrRequestRef) {
      const res = await sql.execute<{
        subject_id: string;
        profile_id: string;
        status: string;
        opening_title: string | null;
      }>(
        `SELECT a.subject_id, a.profile_id, a.status, o.title AS opening_title
           FROM openproduct.applications a
           LEFT JOIN openproduct.role_openings o ON o.id = a.role_opening_id
          WHERE a.jr_request_ref = $1
          LIMIT 1`,
        [jrRequestRef],
      );
      const row = res.rows[0];
      return row
        ? {
            subjectId: row.subject_id,
            profileId: row.profile_id,
            status: row.status,
            openingTitle: row.opening_title,
          }
        : null;
    },

    async setApplicationStatusByRequestRef(jrRequestRef, status) {
      const res = await sql.execute(
        `UPDATE openproduct.applications
            SET status = $2, updated_at = now()
          WHERE jr_request_ref = $1`,
        [jrRequestRef, status],
      );
      return res.rowCount;
    },

    async saveProduct(subjectId, profileId) {
      await sql.execute(
        `INSERT INTO openproduct.saved_products (subject_id, profile_id)
         VALUES ($1, $2)
         ON CONFLICT (subject_id, profile_id) DO NOTHING`,
        [subjectId, profileId],
      );
    },

    async unsaveProduct(subjectId, profileId) {
      const res = await sql.execute(
        `DELETE FROM openproduct.saved_products
          WHERE subject_id = $1 AND profile_id = $2`,
        [subjectId, profileId],
      );
      return res.rowCount > 0;
    },

    async getRoleOpeningByJoinLinkRef(joinLinkRef) {
      const res = await sql.execute<{ id: string; profile_id: string }>(
        `SELECT o.id, o.profile_id
           FROM openproduct.role_openings o
           JOIN openproduct.profiles p ON p.id = o.profile_id
          WHERE o.join_link_ref = $1 AND ${listed("p")}
          LIMIT 1`,
        [joinLinkRef],
      );
      const row = res.rows[0];
      return row ? { id: row.id, profileId: row.profile_id } : null;
    },

    async saveProductBySlug(subjectId, slug) {
      // Resolved THROUGH the visibility filter: a private or unknown slug
      // inserts nothing and answers false — this route cannot probe drafts.
      const res = await sql.execute(
        `INSERT INTO openproduct.saved_products (subject_id, profile_id)
         SELECT $1, p.id FROM openproduct.profiles p
          WHERE lower(p.slug) = lower($2) AND ${listed("p")}
         ON CONFLICT (subject_id, profile_id) DO UPDATE SET subject_id = EXCLUDED.subject_id`,
        [subjectId, slug],
      );
      return res.rowCount > 0;
    },

    async unsaveProductBySlug(subjectId, slug) {
      // No visibility filter: removing a bookmark discloses nothing, and a
      // bookmark whose listing went private must still be removable.
      const res = await sql.execute(
        `DELETE FROM openproduct.saved_products s
          USING openproduct.profiles p
          WHERE p.id = s.profile_id AND s.subject_id = $1 AND lower(p.slug) = lower($2)`,
        [subjectId, slug],
      );
      return res.rowCount > 0;
    },

    async listSavedPublicCards(subjectId) {
      // visibility = 'public' re-asserted here, not trusted from save time: a
      // listing unpublished after being saved must not leak through the
      // bookmark. The bookmark row survives (re-publish restores the card).
      const res = await sql.execute<CardRow>(
        `SELECT ${CARD_COLUMNS}
           FROM openproduct.saved_products s
           JOIN openproduct.profiles p ON p.id = s.profile_id
          WHERE s.subject_id = $1 AND ${listed("p")}
          ORDER BY s.created_at DESC`,
        [subjectId],
      );
      return res.rows.map(cardOf);
    },

    async overlayFor(subjectId, slugs) {
      // ONE statement, four answers. This read runs on every public page view
      // for every signed-in visitor — it is the highest-frequency query in
      // the product — so four round trips here would be four round trips per
      // page view, on a path that is explicitly allowed to fail and therefore
      // must never be the reason a page feels slow.
      //
      // The three counts are scalar subqueries rather than joins: joining
      // three unrelated one-to-many relations to count them is the classic
      // way to get each count multiplied by the cardinality of the others.
      //
      // The saved list is filtered by `visibility = 'public'` for the same
      // reason `listSavedPublicCards` is — a listing unpublished after being
      // saved must not be confirmed as existing by the overlay marking it.
      // And it is bounded by the queried slugs, so the response size is a
      // function of the page rather than of the account's history.
      const res = await sql.execute<{
        saved_slugs: string[] | null;
        endorsed_slugs: string[] | null;
        saved_count: string | number;
        request_count: string | number;
        listing_count: string | number;
      }>(
        `SELECT
           COALESCE((
             SELECT array_agg(p.slug ORDER BY p.slug)
               FROM openproduct.saved_products s
               JOIN openproduct.profiles p ON p.id = s.profile_id
              WHERE s.subject_id = $1
                AND ${listed("p")}
                AND lower(p.slug) = ANY($2::text[])
           ), '{}') AS saved_slugs,
           -- EN1 — the public act, from its OWN table. Two subqueries rather
           -- than one join: a save and an endorsement are two objects, and a
           -- query that returned them together would be the first step toward
           -- a surface that renders them together (OPC-3).
           COALESCE((
             SELECT array_agg(p.slug ORDER BY p.slug)
               FROM openproduct.endorsements en
               JOIN openproduct.profiles p ON p.id = en.profile_id
              WHERE en.subject_id = $1
                AND en.withdrawn_at IS NULL
                AND ${listed("p")}
                AND lower(p.slug) = ANY($2::text[])
           ), '{}') AS endorsed_slugs,
           (SELECT count(*) FROM openproduct.saved_products s2
             JOIN openproduct.profiles p2 ON p2.id = s2.profile_id
            WHERE s2.subject_id = $1 AND ${listed("p2")}) AS saved_count,
           (SELECT count(*) FROM openproduct.applications a
             WHERE a.subject_id = $1) AS request_count,
           (SELECT count(*) FROM openproduct.listing_maintainers lm
             WHERE lm.subject_id = $1) AS listing_count`,
        [subjectId, slugs.map((s) => s.toLowerCase())],
      );
      const row = res.rows[0];
      if (!row) {
        return { savedSlugs: [], endorsedSlugs: [], savedCount: 0, requestCount: 0, listingCount: 0 };
      }
      return {
        // LI1 — under the driver these are array LITERALS, not arrays.
        savedSlugs: parseStringList(row.saved_slugs),
        endorsedSlugs: parseStringList(row.endorsed_slugs),
        savedCount: Number(row.saved_count),
        requestCount: Number(row.request_count),
        listingCount: Number(row.listing_count),
      };
    },

    // ---------------------------------------------------------------------
    // The search index (openproduct-commons DS0).
    // ---------------------------------------------------------------------

    async replaceSearchIndex(kind, documents, builtAt) {
      // WHOLESALE, and in this order: delete what is gone, then upsert what
      // is present. An unpublished listing needs nobody to remember to remove
      // it — it is simply not in `documents`, and the DELETE takes it.
      //
      // The delete is scoped by `kind` so CG1's people index and this one do
      // not clear each other when either rebuilds alone.
      const ids = documents.map((d) => d.entityId);
      if (ids.length === 0) {
        const cleared = await sql.execute(`DELETE FROM openproduct.search_index WHERE kind = $1`, [
          kind,
        ]);
        await sql.execute(
          `UPDATE openproduct.search_index_state SET built_at = $1, dirty_at = NULL`,
          [builtAt],
        );
        return cleared.rowCount;
      }

      await sql.execute(
        `DELETE FROM openproduct.search_index
          WHERE kind = $1 AND entity_id <> ALL($2::text[])`,
        [kind, ids],
      );

      // ONE statement for the whole document set, expanded from a single JSONB
      // payload. A row-at-a-time loop would be one round trip per listing on
      // every rebuild — the cost the floor exists to bound, and paying it per
      // row would leave the floor as the only thing holding it up.
      //
      // `jsonb_to_recordset` rather than parallel `unnest` arrays, because
      // `terms` is an array PER ROW: `unnest` on a 2-D array flattens it
      // completely and hands back scalars, which is a type error at best and
      // a silently merged term list at worst.
      await sql.execute(
        `INSERT INTO openproduct.search_index
           (kind, entity_id, title, summary, terms, facets, built_at)
         SELECT $1, d.entity_id, d.title, d.summary, d.terms, d.facets, $3
           FROM jsonb_to_recordset($2::text::jsonb)
                AS d(entity_id text, title text, summary text, terms text[], facets jsonb)
         ON CONFLICT (kind, entity_id) DO UPDATE
            SET title = EXCLUDED.title,
                summary = EXCLUDED.summary,
                terms = EXCLUDED.terms,
                facets = EXCLUDED.facets,
                built_at = EXCLUDED.built_at`,
        [
          kind,
          JSON.stringify(
            documents.map((d) => ({
              entity_id: d.entityId,
              title: d.title,
              summary: d.summary,
              terms: d.terms,
              facets: d.facets,
            })),
          ),
          builtAt,
        ],
      );

      await sql.execute(`UPDATE openproduct.search_index_state SET built_at = $1, dirty_at = NULL`, [
        builtAt,
      ]);
      return documents.length;
    },

    async searchCandidates(terms, limit) {
      if (terms.length === 0) return [];
      // NO ORDER BY. The overlap operator narrows; it does not rank, and the
      // rank comes from a formula this program published (OPC-4). A LIMIT
      // without an ORDER BY looks like a bug and is the point: any bounded
      // subset is a valid candidate set, because the contract sorts it.
      const res = await sql.execute<SearchIndexRowSql>(
        `SELECT kind, entity_id, title, summary, terms, facets
           FROM openproduct.search_index
          WHERE terms && $1::text[]
          LIMIT $2`,
        [[...terms], Math.max(1, Math.trunc(limit))],
      );
      return res.rows.map((row) => ({
        kind: row.kind,
        entityId: row.entity_id,
        title: row.title,
        summary: row.summary,
        terms: parseStringList(row.terms),
        facets: parseFacets(row.facets),
      }));
    },

    async getSearchIndexState() {
      const res = await sql.execute<{
        built_at: string | Date | null;
        dirty_at: string | Date | null;
      }>(`SELECT built_at, dirty_at FROM openproduct.search_index_state LIMIT 1`);
      const row = res.rows[0];
      // No row means the migration's seed did not run, which is the same
      // practical state as "never built": build it.
      //
      // `iso()` ON BOTH, like every other timestamp this repository returns
      // (openproduct-worldclass RS5a). These two were the only ones handed
      // back RAW, which made the declared `string | null` a lie under any
      // driver that hydrates `timestamptz` into a `Date` — pglite does, and
      // the difference is invisible until something compares rather than
      // parses. `isDue` parses, so it never noticed; RS1's `/health` now
      // PUBLISHES this value, and a Date that JSON-serialises to the right
      // shape by luck is not the same as a contract that returns a string.
      return { builtAt: iso(row?.built_at ?? null), dirtyAt: iso(row?.dirty_at ?? null) };
    },

    async markSearchIndexDirty(at) {
      // COALESCE keeps the FIRST dirtying instant, not the latest. The floor
      // is measured from the last build, and overwriting `dirty_at` on every
      // subsequent write would make a steady stream of edits look permanently
      // "just dirtied" — which is exactly the busy minute this must survive.
      await sql.execute(
        `UPDATE openproduct.search_index_state SET dirty_at = COALESCE(dirty_at, $1)`,
        [at],
      );
    },

    async markSearchIndexChecked(at) {
      // OPN-11 — only while the index is STILL clean. A write that dirtied it
      // between the handler's read and this stamp means the index is no
      // longer current, and recording a check would say it was; the next
      // tick rebuilds and `built_at` moves instead. `built_at` is untouched:
      // it is the floor, and a check is not a build.
      await sql.execute(
        `UPDATE openproduct.search_index_state SET checked_at = $1
          WHERE singleton AND dirty_at IS NULL`,
        [at],
      );
    },

    // ---------------------------------------------------------------------
    // The endorsement (openproduct-commons EN0). DORMANT — nothing routes
    // here until EN1.
    //
    // NOTE WHAT IS ABSENT: not one statement below reads, writes or joins
    // `openproduct.saved_products`. A save is a private act and this is the
    // public one; they are two objects, and the day they share a query is the
    // day a promise made in 1250 quietly stops being true (EN-1, OPC-3).
    // ---------------------------------------------------------------------

    async getPublicProfileId(slug) {
      // THROUGH the visibility filter, like `saveProductBySlug`: a draft and
      // a listing that does not exist must answer identically, or this
      // becomes an existence oracle for other people's unpublished work.
      const res = await sql.execute<{ id: string }>(
        `SELECT id FROM openproduct.profiles
          WHERE lower(slug) = lower($1) AND ${listed("")}`,
        [slug],
      );
      return (res.rows[0]?.id ?? null) as Uuid | null;
    },

    async getProfileIdBySlug(slug) {
      const res = await sql.execute<{ id: string }>(
        `SELECT id FROM openproduct.profiles WHERE lower(slug) = lower($1)`,
        [slug],
      );
      return (res.rows[0]?.id ?? null) as Uuid | null;
    },

    async listEndorsementsForIntegrity(sinceIso, limit) {
      // LIVE endorsements only: a withdrawn one already counts for nothing,
      // and judging it would be spending the sweep's budget on a row that
      // cannot move a total.
      //
      // `subject_first_seen` is a window function over the WHOLE table rather
      // than over the slice — an account that has been endorsing for a year
      // is not new just because this window starts today.
      const capped = Math.max(1, Math.min(Math.trunc(limit) || 0, 100_000));
      const res = await sql.execute<{
        profile_id: string;
        subject_id: string;
        created_at: string | Date;
        subject_first_seen: string | Date;
      }>(
        `SELECT e.profile_id, e.subject_id, e.created_at,
                (SELECT min(e2.created_at)
                   FROM openproduct.endorsements e2
                  WHERE e2.subject_id = e.subject_id) AS subject_first_seen
           FROM openproduct.endorsements e
          WHERE e.withdrawn_at IS NULL
            AND e.created_at >= $1
          ORDER BY e.subject_id, e.created_at, e.profile_id
          LIMIT $2`,
        [sinceIso, capped],
      );
      return res.rows.map((row) => ({
        profileId: row.profile_id,
        subjectId: row.subject_id,
        createdAt: iso(row.created_at)!,
        subjectFirstSeenAt: iso(row.subject_first_seen)!,
      }));
    },

    // ─── CB1: discussions ──────────────────────────────────────────────────

    /**
     * A listing's threads, most recently active first.
     *
     * `listed()` on the JOIN, so a delisted or removed listing has no
     * discussions to read — the thread rows survive (TS-3: nothing vanishes)
     * but nothing amplifies them, which is what delisting means.
     *
     * The author's handle comes from the SAME biconditional CG4 built: a name
     * links if and only if `/@handle` resolves for that person. Duplicating
     * the rule here rather than reusing `handleJoinFor` would give the
     * discussion tab its own idea of when a name is a link, and XP-5's whole
     * point is that a dead link is worse than plain text.
     */
    async listThreads(profileId, tag = null, limit = 50) {
      const capped = Math.max(1, Math.min(Math.trunc(limit) || 0, 100));
      // DQ0b — the LAUNCH thread is excluded unless it is asked for by name.
      // It is not one of the listing's discussions; it is the product page's
      // own comment section, rendered flat beneath it. Leaving it in the list
      // would show the same conversation twice on one page, once as a card
      // linking away from the words already printed above it.
      const excludeLaunch = tag !== LAUNCH_THREAD_TAG;
      const res = await sql.execute<ThreadRow>(
        `SELECT t.id, t.tag, t.title, t.state, t.created_at, t.last_post_at,
                t.author_subject_id, h.handle AS author_handle, hc.display_name AS author_name,
                (SELECT count(*) FROM openproduct.posts p
                  WHERE p.thread_id = t.id AND p.moderation_state = 'visible') AS post_count
           FROM openproduct.threads t
           JOIN openproduct.profiles pr ON pr.id = t.profile_id
           ${handleJoinFor("t.author_subject_id")}
          WHERE t.profile_id = $1
            AND ${listed("pr")}
            AND t.state <> 'removed'
            AND ($2::text IS NULL OR t.tag = $2)
            AND ($4::boolean IS NOT TRUE OR t.tag <> '${LAUNCH_THREAD_TAG}')
          ORDER BY t.last_post_at DESC NULLS LAST, t.created_at DESC
          LIMIT $3`,
        [profileId, tag, capped, excludeLaunch],
      );
      return res.rows.map(threadOf);
    },

    async getLaunchThread(profileId) {
      // DQ0b — the one live launch thread for a listing, or null. The partial
      // unique index makes "the one" a fact rather than a hope; the ORDER BY
      // is belt and braces for a database where the index has not been applied
      // yet, so this read cannot return a random one of two.
      const res = await sql.execute<ThreadRow>(
        `SELECT t.id, t.tag, t.title, t.state, t.created_at, t.last_post_at,
                t.author_subject_id, h.handle AS author_handle, hc.display_name AS author_name,
                t.profile_id, t.answer_post_id,
                (SELECT count(*) FROM openproduct.posts p
                  WHERE p.thread_id = t.id AND p.moderation_state = 'visible') AS post_count
           FROM openproduct.threads t
           JOIN openproduct.profiles pr ON pr.id = t.profile_id
           ${handleJoinFor("t.author_subject_id")}
          WHERE t.profile_id = $1
            AND t.tag = '${LAUNCH_THREAD_TAG}'
            AND t.state <> 'removed'
            AND ${listed("pr")}
          ORDER BY t.created_at
          LIMIT 1`,
        [profileId],
      );
      return res.rows[0] ? threadOf(res.rows[0]) : null;
    },

    async ensureLaunchThread(input) {
      // TWO STATEMENTS, AND THE SECOND ONE IS THE RACE. Two people commenting
      // on a quiet listing within the same second is the ordinary case: the
      // insert below is guarded by the partial unique index, the loser writes
      // nothing, and the SELECT hands them the thread that exists — which is
      // the thread they wanted. A read-then-write would have given them one
      // each, after which the page shows one and the other is unreachable,
      // holding somebody's words.
      const inserted = await sql.execute<{ id: string }>(
        `INSERT INTO openproduct.threads
           (id, profile_id, tag, title, author_subject_id, last_post_at)
         VALUES ($1, $2, '${LAUNCH_THREAD_TAG}', $3, $4, NULL)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [input.id, input.profileId, input.title, input.authorSubjectId],
      );
      if (inserted.rows[0]) return { id: inserted.rows[0].id, created: true };

      const existing = await sql.execute<{ id: string }>(
        `SELECT id FROM openproduct.threads
          WHERE profile_id = $1 AND tag = '${LAUNCH_THREAD_TAG}' AND state <> 'removed'
          ORDER BY created_at
          LIMIT 1`,
        [input.profileId],
      );
      const id = existing.rows[0]?.id;
      return id ? { id, created: false } : null;
    },

    /** One thread, by id, with the same listed guard. */
    async getThread(id) {
      const res = await sql.execute<ThreadRow>(
        `SELECT t.id, t.tag, t.title, t.state, t.created_at, t.last_post_at,
                t.author_subject_id, h.handle AS author_handle, hc.display_name AS author_name,
                t.profile_id, t.answer_post_id,
                (SELECT count(*) FROM openproduct.posts p
                  WHERE p.thread_id = t.id AND p.moderation_state = 'visible') AS post_count
           FROM openproduct.threads t
           JOIN openproduct.profiles pr ON pr.id = t.profile_id
           ${handleJoinFor("t.author_subject_id")}
          WHERE t.id = $1 AND ${listed("pr")}`,
        [id],
      );
      const row = res.rows[0];
      return row ? threadOf(row) : null;
    },

    /**
     * A thread's posts, oldest first — a conversation is read in the order it
     * happened, unlike a moderation queue.
     *
     * REMOVED POSTS ARE RETURNED, carrying their state. TS-3 again: a reply
     * that vanishes makes the replies around it unreadable, and the reader
     * cannot tell moderation from a bug. The BODY is dropped here rather than
     * at the handler, so a removed post's text cannot reach a caller that
     * forgot to check.
     */
    async listForumThreads({ tag, order, limit }) {
      const capped = Math.max(1, Math.min(Math.trunc(limit) || 0, 100));
      const filter = tag && tag !== LAUNCH_THREAD_TAG ? tag : null;
      // FO1 — two PUBLISHED orders and no third. "Latest" is the thread's
      // own start; "replied" is the visible-post count the row shows, ties
      // by the latest reply. Neither reads a reader.
      const orderBy =
        order === "replied"
          ? "post_count DESC, t.last_post_at DESC NULLS LAST, t.created_at DESC, t.id DESC"
          : "t.created_at DESC, t.id DESC";
      const res = await sql.execute<ThreadRow & { slug: string }>(
        `SELECT * FROM (
           SELECT t.id, t.tag, t.title, t.state, t.created_at, t.last_post_at,
                  t.author_subject_id, h.handle AS author_handle, hc.display_name AS author_name,
                  t.profile_id, pr.slug,
                  (SELECT count(*) FROM openproduct.posts p
                     WHERE p.thread_id = t.id AND p.moderation_state = 'visible') AS post_count
             FROM openproduct.threads t
             JOIN openproduct.profiles pr ON pr.id = t.profile_id
             ${handleJoinFor("t.author_subject_id")}
            WHERE ${listed("pr")}
              AND t.state <> 'removed'
              AND t.tag <> '${LAUNCH_THREAD_TAG}'
              AND ($1::text IS NULL OR t.tag = $1)
         ) t
         ORDER BY ${orderBy}
         LIMIT $2`,
        [filter, capped],
      );
      return res.rows.map((row) => ({ ...threadOf(row), slug: row.slug }));
    },

    async listRecentlyRepliedThreads(limit) {
      const capped = Math.max(1, Math.min(limit, 20));
      const res = await sql.execute<{
        id: string;
        slug: string;
        title: string;
        tag: string;
        last_post_at: string | Date;
        post_count: string | number;
      }>(
        // HB3 — newest reply first, over LISTED listings only, counting
        // VISIBLE posts only: the same predicate the feed row's comment
        // count uses, so the two numbers cannot disagree.
        `SELECT t.id, pr.slug, t.title, t.tag, t.last_post_at,
                (SELECT count(*) FROM openproduct.posts p
                  WHERE p.thread_id = t.id AND p.moderation_state = 'visible') AS post_count
           FROM openproduct.threads t
           JOIN openproduct.profiles pr ON pr.id = t.profile_id
          WHERE ${listed("pr")}
            AND t.state <> 'removed'
            AND t.last_post_at IS NOT NULL
          ORDER BY t.last_post_at DESC, t.created_at DESC
          LIMIT $1`,
        [capped],
      );
      return res.rows
        .filter((row) => Number(row.post_count) > 0 && iso(row.last_post_at) !== null)
        .map((row) => ({
          threadId: row.id,
          slug: row.slug,
          title: row.title,
          tag: row.tag,
          lastPostAt: iso(row.last_post_at)!,
          postCount: Number(row.post_count),
        }));
    },

    async listPosts(threadId, limit = 200) {
      const capped = Math.max(1, Math.min(Math.trunc(limit) || 0, 500));
      const res = await sql.execute<PostRow>(
        `SELECT p.id, p.author_subject_id,
                CASE WHEN p.moderation_state = 'visible' THEN p.body ELSE '' END AS body,
                p.moderation_state, p.created_at, p.edited_at, p.parent_post_id, p.tag,
                h.handle AS author_handle, hc.display_name AS author_name,
                (t.answer_post_id = p.id) AS is_answer
           FROM openproduct.posts p
           JOIN openproduct.threads t ON t.id = p.thread_id
           ${handleJoinFor("p.author_subject_id")}
          WHERE p.thread_id = $1
          ORDER BY p.created_at ASC
          LIMIT $2`,
        [threadId, capped],
      );
      return res.rows.map(postOf);
    },

    async createThread(input) {
      const res = await sql.execute<{ id: string }>(
        // The thread starts at `at`, the same instant as its opening post
        // (FO1 "latest" orders by it). Leaving created_at to the column's
        // now() made two threads started back to back tie on a coarse clock
        // and sort either way.
        `INSERT INTO openproduct.threads
           (id, profile_id, tag, title, author_subject_id, last_post_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING id`,
        [input.id, input.profileId, input.tag, input.title, input.authorSubjectId, input.at],
      );
      return res.rows[0]?.id ?? null;
    },

    /**
     * A post, and the thread's `last_post_at` moved with it.
     *
     * TWO STATEMENTS, and the UPDATE is guarded on the thread still accepting
     * posts. That guard is where a locked thread is actually enforced: a
     * handler check alone races with a maintainer locking mid-request, and
     * the loser of that race is a post appearing in a thread somebody just
     * closed. Zero rows updated means the post does not happen.
     */
    async createPost(input) {
      const moved = await sql.execute<{ id: string }>(
        `UPDATE openproduct.threads
            SET last_post_at = $2, updated_at = $2
          WHERE id = $1 AND state IN ('open', 'answered')
         RETURNING id`,
        [input.threadId, input.at],
      );
      if (moved.rows.length === 0) return null;

      // CV1 — THE PARENT IS GUARDED IN SQL, not only in the handler. The
      // sub-select requires a parent that is in THIS thread and is itself
      // top-level, so a reply to a reply and a reply across threads both
      // insert nothing rather than being caught by a check that raced. A
      // top-level post passes `null` and the guard is vacuous.
      const res = await sql.execute<{ id: string }>(
        `INSERT INTO openproduct.posts (id, thread_id, author_subject_id, body, created_at, parent_post_id, tag)
         SELECT $1, $2, $3, $4, $5, $6::uuid, $7
          WHERE $6::uuid IS NULL
             OR EXISTS (
                  SELECT 1 FROM openproduct.posts parent
                   WHERE parent.id = $6::uuid
                     AND parent.thread_id = $2
                     AND parent.parent_post_id IS NULL
                )
         RETURNING id`,
        [input.id, input.threadId, input.authorSubjectId, input.body, input.at, input.parentPostId ?? null, input.tag ?? null],
      );
      return res.rows[0]?.id ?? null;
    },

    /**
     * Lock or unlock. Both are TS3 acts and arrive through its ledger; this
     * only moves the state, and only from a state the act is legal from.
     */
    async setThreadState(id, state, legalFrom) {
      const res = await sql.execute<{ id: string }>(
        `UPDATE openproduct.threads
            SET state = $2, updated_at = now(),
                -- Leaving a thread's answer set while removing it would keep
                -- a removed post named as the answer to a question nobody can
                -- read. Un-answering on removal is the honest half.
                answer_post_id = CASE WHEN $2 = 'answered' THEN answer_post_id ELSE NULL END
          WHERE id = $1 AND state = ANY($3::text[])
         RETURNING id`,
        [id, state, legalFrom],
      );
      return res.rows.length > 0;
    },

    /**
     * Mark a post as the answer — a MAINTAINER'S act, never inferred.
     *
     * Both halves in one statement, so the CHECK that ties `answered` to
     * `answer_post_id` can never be seen half-applied. The post must belong
     * to the thread and be visible: naming a removed post as the answer would
     * answer a question with something nobody can read.
     */
    async markAnswer(threadId, postId) {
      const res = await sql.execute<{ id: string }>(
        `UPDATE openproduct.threads t
            SET state = 'answered', answer_post_id = $2, updated_at = now()
          WHERE t.id = $1
            AND t.state IN ('open', 'answered')
            AND EXISTS (
              SELECT 1 FROM openproduct.posts p
               WHERE p.id = $2 AND p.thread_id = $1 AND p.moderation_state = 'visible'
            )
         RETURNING t.id`,
        [threadId, postId],
      );
      return res.rows.length > 0;
    },

    /** TS3's axis on a post. Same shape and same ordering as a listing's. */
    async setPostModerationState(id, state, at) {
      const res = await sql.execute<{ id: string }>(
        `UPDATE openproduct.posts
            SET moderation_state = $2,
                moderated_at     = CASE WHEN $2 = 'visible' THEN NULL ELSE $3::timestamptz END
          WHERE id = $1
         RETURNING id`,
        [id, state, at],
      );
      return res.rows.length > 0;
    },

    /** The thread a post is in, so an act on a post can find its listing. */
    async writeNotification(input) {
      // ONCE PER EVENT PER PERSON, and the unique index is what says so. A
      // retried sweep, a redelivered seam event and two workers racing all
      // land on `DO NOTHING` rather than on a duplicate in somebody's inbox.
      const res = await sql.execute<{ id: string }>(
        `INSERT INTO openproduct.notifications
           (id, subject_id, kind, event_key, actor, target_kind, target_ref, figure)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (subject_id, event_key) DO NOTHING
         RETURNING id`,
        [
          input.id,
          input.subjectId,
          input.kind,
          input.eventKey,
          input.actor ?? null,
          input.targetKind,
          input.targetRef,
          input.figure ?? null,
        ],
      );
      return res.rows.length > 0;
    },

    async listNotifications(subjectId, limit) {
      const capped = Math.min(Math.max(1, Math.trunc(limit) || 0), 100);
      // THE CURSOR IS JOINED, NOT COMPARED IN CODE. `unread` is a property of
      // this row against this reader's own mark, and computing it here means
      // the page cannot get it wrong by holding a stale cursor.
      //
      // NO ROW IS WRITTEN BY THIS READ. Per-row read state would make
      // rendering a page a write, on a page whose whole purpose is to be
      // looked at.
      const res = await sql.execute<{
        id: string;
        kind: string;
        actor: string | null;
        target_kind: string;
        target_ref: string;
        figure: string | number | null;
        created_at: string | Date;
        unread: boolean;
      }>(
        `SELECT n.id, n.kind, n.actor, n.target_kind, n.target_ref, n.figure, n.created_at,
                (r.read_at IS NULL OR n.created_at > r.read_at) AS unread
           FROM openproduct.notifications n
           LEFT JOIN openproduct.notification_reads r ON r.subject_id = n.subject_id
          WHERE n.subject_id = $1
          ORDER BY n.created_at DESC, n.id
          LIMIT $2`,
        [subjectId, capped],
      );
      return res.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        actor: row.actor,
        targetKind: row.target_kind,
        targetRef: row.target_ref,
        figure: row.figure === null ? null : Number(row.figure),
        createdAt: iso(row.created_at)!,
        unread: row.unread === true,
      }));
    },

    async countUnreadNotifications(subjectId) {
      // ONE COMPARISON, which is the whole reason read state is a cursor. A
      // per-row flag would make this a scan over a column something has to
      // keep in step.
      const res = await sql.execute<{ n: string | number }>(
        `SELECT count(*) AS n
           FROM openproduct.notifications n
           LEFT JOIN openproduct.notification_reads r ON r.subject_id = n.subject_id
          WHERE n.subject_id = $1
            AND (r.read_at IS NULL OR n.created_at > r.read_at)`,
        [subjectId],
      );
      return Number(res.rows[0]?.n ?? 0);
    },

    async markNotificationsRead(subjectId, at) {
      // THE CURSOR ONLY EVER MOVES FORWARD. A clock that went backwards — two
      // workers, a retried request — would otherwise un-read things somebody
      // has already seen, which is the one direction this must not go.
      await sql.execute(
        `INSERT INTO openproduct.notification_reads (subject_id, read_at)
         VALUES ($1, $2)
         ON CONFLICT (subject_id) DO UPDATE
            SET read_at = GREATEST(openproduct.notification_reads.read_at, EXCLUDED.read_at)`,
        [subjectId, at],
      );
    },

    // ─── AC1 — the credential store's four writes ────────────────────────
    //
    // NOTHING HERE TAKES AN ADDRESS, and nothing can: AC0's schema has no
    // column to put one in. What crosses this boundary is a challenge hash, a
    // hashed password and a subject id — and the address exists only inside
    // one gateway request, in a worker that has no database binding at all.

    async searchPublicContributors(needle, limit) {
      // SR0 — makers, matched LIVE rather than from the search index.
      //
      // THE FOUR CONDITIONS BELOW ARE CG2'S, COPIED WORD FOR WORD from
      // `listPublicContributorCards`, and that duplication is the point: they
      // are an eligibility decision about a PERSON, and the one thing that
      // must never happen is a surface where they are checked differently or
      // checked once and cached.
      //
      // The index would have been the obvious home for this and is the wrong
      // one. `handleRebuildSearchIndex` rebuilds when dirty and past a 60s
      // floor, driven by a sweep — so an entry is a minute stale at best and
      // indefinitely stale if the sweep is not running. For a PRODUCT that is
      // a dead link; for a PERSON it is "still findable after they turned
      // their profile off".
      //
      // MATCHED ON HANDLE, NAME AND BIO — the three things a public profile
      // already shows to anybody who opens it. Nothing here searches anything
      // a reader could not read on the page it links to.
      const capped = Math.min(Math.max(1, Math.trunc(limit) || 0), 50);
      const pattern = `%${needle.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      const res = await sql.execute<{
        handle: string;
        display_name: string | null;
        bio: string | null;
      }>(
        `SELECT h.handle, c.display_name, c.bio
           FROM openproduct.handles h
           JOIN openproduct.contributors c ON c.subject_id = h.subject_id
          WHERE h.released_at IS NULL
            AND c.profile_public
            AND c.published_at IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM openproduct.listing_maintainers lm
                JOIN openproduct.profiles p2 ON p2.id = lm.profile_id
               WHERE lm.subject_id = c.subject_id AND ${listed("p2")}
            )
            AND (
              h.handle ILIKE $1 ESCAPE '\\'
              OR coalesce(c.display_name, '') ILIKE $1 ESCAPE '\\'
              OR coalesce(c.bio, '') ILIKE $1 ESCAPE '\\'
            )
          -- A HANDLE MATCH FIRST, then a name, then a bio: somebody typing
          -- "ada" almost always means the person called that, not the three
          -- people who mention her in a sentence about themselves.
          ORDER BY (h.handle ILIKE $1 ESCAPE '\\') DESC,
                   (coalesce(c.display_name, '') ILIKE $1 ESCAPE '\\') DESC,
                   h.handle
          LIMIT $2`,
        [pattern, capped],
      );
      return res.rows.map((row) => ({
        handle: row.handle,
        displayName: row.display_name,
        bio: row.bio,
      }));
    },

    async issueCredentialToken(input) {
      // ONE PENDING SIGN-UP PER CHALLENGE. A retried request carries the same
      // challenge id, so it lands on the existing row rather than stacking a
      // second password behind the same piece of mail. The verifier is NOT
      // overwritten on conflict: the first password typed is the one waiting,
      // and a retry is a retry rather than a change of mind.
      const res = await sql.execute<{ token_hash: string }>(
        `INSERT INTO openproduct.credential_tokens
           (token_hash, purpose, subject_id, verifier, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (token_hash) DO NOTHING
         RETURNING token_hash`,
        [
          input.tokenHash,
          input.purpose,
          input.subjectId ?? null,
          input.verifier ?? null,
          input.at,
          input.expiresAt,
        ],
      );
      return res.rows.length > 0;
    },

    async consumeCredentialToken(tokenHash, purpose, at) {
      // EXACTLY ONCE, AND THE GUARD IS IN THE STATEMENT. Two clicks on the
      // same link, or two workers on the same request, race in the database:
      // the second updates no rows and gets null. A read-then-write here would
      // be the classic double-spend, on the one path where spending twice
      // means two people share an account.
      //
      // EXPIRY IS CHECKED HERE TOO rather than by the caller, for the same
      // reason: a caller that read the row, decided it was live, and then
      // updated it would have a window between the two.
      const res = await sql.execute<{
        purpose: string;
        subject_id: string | null;
        verifier: string | null;
      }>(
        `UPDATE openproduct.credential_tokens
            SET consumed_at = $3
          WHERE token_hash = $1
            AND purpose = $2
            AND consumed_at IS NULL
            AND expires_at > $3
        RETURNING purpose, subject_id, verifier`,
        [tokenHash, purpose, at],
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        purpose: row.purpose as typeof purpose,
        subjectId: row.subject_id,
        verifier: row.verifier,
      };
    },

    async writeCredential(input) {
      // UPSERT, and the conflict case is a real one rather than defensive
      // padding: somebody who signed up, forgot, and signed up again with a
      // new password lands here twice. The LAST verified password wins, which
      // is what somebody who just proved they can read the mail expects.
      //
      // `created_at` is preserved on conflict — when they first had a password
      // here is a different fact from when they last set one, and incident
      // response asks the first.
      await sql.execute(
        `INSERT INTO openproduct.credentials (subject_id, verifier, verified_at, created_at, updated_at)
         VALUES ($1, $2, $3, $3, $3)
         ON CONFLICT (subject_id) DO UPDATE
            SET verifier    = EXCLUDED.verifier,
                verified_at = EXCLUDED.verified_at,
                updated_at  = EXCLUDED.updated_at`,
        [input.subjectId, input.verifier, input.at],
      );
    },

    async getCredential(subjectId) {
      // AC2's read, shipped with AC1 because the write is meaningless without
      // something that can check it, and a write nothing reads is a write
      // nothing tests properly.
      const res = await sql.execute<{ verifier: string; verified_at: string | Date }>(
        `SELECT verifier, verified_at FROM openproduct.credentials WHERE subject_id = $1`,
        [subjectId],
      );
      const row = res.rows[0];
      return row ? { verifier: row.verifier, verifiedAt: iso(row.verified_at)! } : null;
    },

    async expireCredentialTokens(before) {
      // A SWEEP, because an unconsumed token is a hashed password sitting in a
      // table with nobody coming back for it. Bounded by the partial index on
      // (expires_at) WHERE consumed_at IS NULL.
      const res = await sql.execute<{ token_hash: string }>(
        `DELETE FROM openproduct.credential_tokens
          WHERE consumed_at IS NULL AND expires_at <= $1
        RETURNING token_hash`,
        [before],
      );
      return res.rows.length;
    },

    async issueAuthSession(input) {
      // NO CONFLICT CLAUSE, deliberately. The key is a hash of 32 random
      // bytes this app just generated: a collision means the RNG failed, and
      // an `ON CONFLICT DO NOTHING` would turn that into a session silently
      // shared between two people. Let it raise.
      await sql.execute(
        `INSERT INTO openproduct.auth_sessions (token_hash, subject_id, created_at, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [input.tokenHash, input.subjectId, input.at, input.expiresAt],
      );
    },

    async resolveAuthSession(tokenHash) {
      // THE ROW AS STORED, revoked and expired ones included. Filtering here
      // would put the liveness rule in SQL, where the second caller has to
      // remember to repeat it; `sessionUsable` in the contract is the one
      // place that decides, and it is the place a test can hold.
      const res = await sql.execute<{
        subject_id: string;
        expires_at: string | Date;
        revoked_at: string | Date | null;
      }>(
        `SELECT subject_id, expires_at, revoked_at
           FROM openproduct.auth_sessions
          WHERE token_hash = $1`,
        [tokenHash],
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        subjectId: row.subject_id,
        expiresAt: iso(row.expires_at)!,
        revokedAt: iso(row.revoked_at),
      };
    },

    async revokeAuthSession(tokenHash, at) {
      // IDEMPOTENT, AND THE FIRST TIMESTAMP WINS. Signing out twice does not
      // move when the session ended, because that is the fact somebody asks
      // for later and the second click is not new information.
      await sql.execute(
        `UPDATE openproduct.auth_sessions
            SET revoked_at = $2
          WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash, at],
      );
    },

    async revokeAuthSessionsForSubject(subjectId, at) {
      // Bounded by the partial index on (subject_id, expires_at) WHERE
      // revoked_at IS NULL, so it touches only what is still live.
      const res = await sql.execute<{ token_hash: string }>(
        `UPDATE openproduct.auth_sessions
            SET revoked_at = $2
          WHERE subject_id = $1 AND revoked_at IS NULL
        RETURNING token_hash`,
        [subjectId, at],
      );
      return res.rows.length;
    },

    async expireAuthSessions(before) {
      // EXPIRED ONLY. A revoked row is kept: its timestamp answers "when did
      // this end", and deleting it would trade that answer for a few bytes.
      const res = await sql.execute<{ token_hash: string }>(
        `DELETE FROM openproduct.auth_sessions
          WHERE revoked_at IS NULL AND expires_at <= $1
        RETURNING token_hash`,
        [before],
      );
      return res.rows.length;
    },

    async votePost(postId, subjectId, at) {
      // IDEMPOTENT AND ROW-REUSING, exactly as `endorse` is. The key is the
      // pair, so voting twice is voting once, and re-voting after a withdrawal
      // clears `withdrawn_at` on the SAME row — "voted, withdrew, voted again"
      // is one row with a history rather than three facts nobody can
      // reconcile.
      //
      // `created_at` is NOT rewritten on a re-vote: the row records when
      // somebody first said this, and re-stamping would let a withdraw/re-vote
      // cycle manufacture recency for anything that ever reads it.
      //
      // The SELF-VOTE is refused by a trigger, and this catches its exception
      // rather than checking first: a read-then-write would race with nothing
      // useful and would put the rule in two places.
      try {
        const res = await sql.execute<{ post_id: string }>(
          `INSERT INTO openproduct.post_votes (post_id, subject_id, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (post_id, subject_id) DO UPDATE
              SET withdrawn_at = NULL
           RETURNING post_id`,
          [postId, subjectId, at],
        );
        return res.rows.length > 0;
      } catch {
        // The trigger, a post that does not exist, or a post that was deleted
        // mid-request. All three mean "this vote did not happen", and the
        // caller answers them identically for the same reason every other
        // refusal on this surface does.
        return false;
      }
    },

    async withdrawPostVote(postId, subjectId, at) {
      // The row SURVIVES, with `withdrawn_at` set. See the migration: a public
      // number anything may have to restate needs a log rather than a presence
      // test, which is why this is an UPDATE and FL0's `unfollow` is a DELETE.
      const res = await sql.execute<{ post_id: string }>(
        `UPDATE openproduct.post_votes
            SET withdrawn_at = $3
          WHERE post_id = $1 AND subject_id = $2 AND withdrawn_at IS NULL
         RETURNING post_id`,
        [postId, subjectId, at],
      );
      return res.rows.length > 0;
    },

    async countPostVotes(postIds) {
      // MANY POSTS IN ONE READ. A thread of forty comments would otherwise be
      // forty counts, which is the N+1 `listRostersFor` and `countFollowers`
      // were both batched to avoid.
      //
      // A POST NOBODY VOTED ON IS ABSENT, not zero. The caller renders zero
      // either way, and an absent key cannot be mistaken for a measured
      // emptiness — the same shape `countFollowers` returns and for the same
      // reason (OPC-C).
      const ids = [...new Set(postIds)];
      if (ids.length === 0) return new Map<string, number>();
      const res = await sql.execute<{ post_id: string; n: string | number }>(
        `SELECT post_id, count(*) AS n
           FROM openproduct.post_votes
          WHERE post_id = ANY($1::uuid[])
            AND withdrawn_at IS NULL
          GROUP BY post_id`,
        [ids],
      );
      return new Map(res.rows.map((row) => [row.post_id, Number(row.n)]));
    },

    async listPostVotesBy(subjectId, postIds) {
      // The overlay's question, BOUNDED by the ids the page rendered. An
      // unbounded read would turn one page's personalisation into a listing of
      // everything this visitor has ever upvoted.
      const ids = [...new Set(postIds)];
      if (ids.length === 0) return [];
      const res = await sql.execute<{ post_id: string }>(
        `SELECT post_id FROM openproduct.post_votes
          WHERE subject_id = $1
            AND post_id = ANY($2::uuid[])
            AND withdrawn_at IS NULL`,
        [subjectId, ids],
      );
      return res.rows.map((row) => row.post_id);
    },

    async listTopicFollowers(topic, limit) {
      // NF0 — who to tell when something launches in a topic.
      //
      // `kind = 'topic'` IS A LITERAL IN THE SQL, not a parameter. FL0 built
      // one table for two kinds and promised that nothing on this estate
      // answers "who follows this" about a PERSON; a function taking a kind
      // would be the read that could, one careless call site later. This one
      // cannot be pointed at people, and the query says so in a line a
      // reviewer can check.
      const capped = Math.min(Math.max(1, Math.trunc(limit) || 0, 1), 5000);
      const res = await sql.execute<{ subject_id: string }>(
        `SELECT subject_id FROM openproduct.follows
          WHERE kind = 'topic' AND target = $1
          ORDER BY created_at
          LIMIT $2`,
        [topic, capped],
      );
      return res.rows.map((row) => row.subject_id);
    },

    // PP1 — the same read, one kind over.
    async listListingFollowers(slug, limit) {
      // NF0 — who to tell when something launches in a topic.
      //
      // `kind = 'listing'` IS A LITERAL IN THE SQL, not a parameter. FL0 built
      // one table for two kinds and promised that nothing on this estate
      // answers "who follows this" about a PERSON; a function taking a kind
      // would be the read that could, one careless call site later. This one
      // cannot be pointed at people, and the query says so in a line a
      // reviewer can check.
      const capped = Math.min(Math.max(1, Math.trunc(limit) || 0, 1), 5000);
      const res = await sql.execute<{ subject_id: string }>(
        `SELECT subject_id FROM openproduct.follows
          WHERE kind = 'listing' AND target = $1
          ORDER BY created_at
          LIMIT $2`,
        [slug, capped],
      );
      return res.rows.map((row) => row.subject_id);
    },

    async listMaintainerSubjects(profileId) {
      // NF0 — the people a listing's own news belongs to. `listing_maintainers`
      // is the same edge `maintains` reads on a maker page, so "whose launch
      // is this" and "whose page does it appear on" are one answer.
      const res = await sql.execute<{ subject_id: string }>(
        `SELECT DISTINCT subject_id FROM openproduct.listing_maintainers
          WHERE profile_id = $1`,
        [profileId],
      );
      return res.rows.map((row) => row.subject_id);
    },

    async getPostAuthor(postId) {
      // NF0 — who wrote it and which thread it is in, in one read. Unfiltered
      // for `getSlugForThread`'s reason: this feeds a row in somebody's own
      // inbox, and the page decides what a reader may see when they follow it.
      const res = await sql.execute<{ author_subject_id: string; thread_id: string }>(
        `SELECT author_subject_id, thread_id FROM openproduct.posts
          WHERE id = $1 AND moderation_state = 'visible'`,
        [postId],
      );
      const row = res.rows[0];
      return row ? { authorSubjectId: row.author_subject_id, threadId: row.thread_id } : null;
    },

    async getSlugForThread(threadId) {
      // NF0 — the listing a thread belongs to, for the sentence a notification
      // composes. `listed` is NOT applied: this is an internal lookup for a
      // row somebody will read on their own inbox, and a thread on a listing
      // that has since been delisted still happened to them. The PAGE decides
      // what a reader may see when the link is followed, which is where that
      // decision belongs.
      const res = await sql.execute<{ slug: string }>(
        `SELECT p.slug
           FROM openproduct.threads t
           JOIN openproduct.profiles p ON p.id = t.profile_id
          WHERE t.id = $1`,
        [threadId],
      );
      return res.rows[0]?.slug ?? null;
    },

    async getPostThreadId(postId) {
      const res = await sql.execute<{ thread_id: string }>(
        `SELECT thread_id FROM openproduct.posts WHERE id = $1`,
        [postId],
      );
      return res.rows[0]?.thread_id ?? null;
    },

    async restateIntegrity(input) {
      // ONE RESTATEMENT, TWO HALVES, and they must not be split: applying
      // without reversing leaves a broken-up ring discounted forever, and
      // reversing without applying lets a live ring count for a cycle.
      const touched = new Set<string>();

      // ─── apply ───
      let applied = 0;
      for (const finding of input.findings) {
        const res = await sql.execute<{ profile_id: string }>(
          `INSERT INTO openproduct.endorsement_integrity
             (profile_id, subject_id, reason, decided_by, decided_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (profile_id, subject_id) DO UPDATE
             SET reason      = EXCLUDED.reason,
                 decided_by  = EXCLUDED.decided_by,
                 decided_at  = EXCLUDED.decided_at,
                 -- Re-discounting after a reversal CLEARS the reversal rather
                 -- than stacking a second row: the pair is the key, and the
                 -- timestamps carry the story (EN0's shape).
                 reversed_at = NULL,
                 reversed_by = NULL
           WHERE openproduct.endorsement_integrity.reversed_at IS NOT NULL
              OR openproduct.endorsement_integrity.reason <> EXCLUDED.reason
           RETURNING profile_id`,
          [finding.profileId, finding.subjectId, finding.reason, input.decidedBy, input.at],
        );
        if (res.rows.length > 0) {
          applied += 1;
          touched.add(finding.profileId);
        }
      }

      // ─── reverse, BOUNDED TO THE WINDOW *AND TO THIS SWEEP'S REASONS* ───
      //
      // Anything live-discounted whose endorsement falls inside the window
      // the sweep actually looked at, which carries a reason this sweep is
      // responsible for, and which the sweep no longer names.
      //
      // Without the WINDOW bound a short sweep would silently restore every
      // historical discount it simply did not read.
      //
      // Without the REASON bound two sweeps would fight. TS4 writes `cohort`
      // discounts to endorsements at least three days old, which is inside
      // EN3's seven-day window, so EN3's next run would reverse every one of
      // them as a discount it did not name — and TS4 would re-apply them six
      // hours later, forever, over a number the estate publishes.
      const keep = input.findings.map((f) => `${f.profileId}|${f.subjectId}`);
      const reversedRes = await sql.execute<{ profile_id: string }>(
        `UPDATE openproduct.endorsement_integrity ei
            SET reversed_at = $2, reversed_by = $3
           FROM openproduct.endorsements e
          WHERE e.profile_id = ei.profile_id
            AND e.subject_id = ei.subject_id
            AND ei.reversed_at IS NULL
            AND e.created_at >= $1
            AND ei.reason = ANY($5::text[])
            AND NOT (ei.profile_id::text || '|' || ei.subject_id = ANY($4::text[]))
          RETURNING ei.profile_id`,
        [input.windowStart, input.at, input.decidedBy, keep, [...input.reasons]],
      );
      for (const row of reversedRes.rows) touched.add(row.profile_id);

      return {
        applied,
        reversed: reversedRes.rows.length,
        touchedProfileIds: [...touched].sort(),
      };
    },

    async discountCohort(input) {
      // ON CONFLICT DO NOTHING, never DO UPDATE. An endorsement already
      // discounted for another reason keeps that reason: `ring` outranks
      // `cohort` in EN3's own ordering, and rewriting it here would make two
      // sweeps describe the same endorsement two ways on alternating runs.
      //
      // There is no reversal half. A cohort that turns out to be real is
      // undone by a human, through the flag this discount was raised
      // alongside — which is the point of raising one.
      let applied = 0;
      for (const subjectId of input.subjectIds) {
        const res = await sql.execute<{ profile_id: string }>(
          `INSERT INTO openproduct.endorsement_integrity
             (profile_id, subject_id, reason, decided_by, decided_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (profile_id, subject_id) DO NOTHING
           RETURNING profile_id`,
          [input.profileId, subjectId, input.reason, input.decidedBy, input.at],
        );
        if (res.rows.length > 0) applied += 1;
      }
      return applied;
    },

    async integrityDisclosure(sinceIso) {
      // EN-4 — BY REASON, and by nothing else. Grouping by listing would let
      // anybody compute which products we discounted and by how much, which
      // is an accusation about a specific product's supporters made in public
      // by arithmetic. Grouping by subject is the same accusation aimed at a
      // person.
      const res = await sql.execute<{ reason: string; discounted: string | number }>(
        `SELECT ei.reason, count(*) AS discounted
           FROM openproduct.endorsement_integrity ei
          WHERE ei.reversed_at IS NULL
            AND ei.decided_at >= $1
          GROUP BY ei.reason
          ORDER BY ei.reason`,
        [sinceIso],
      );
      return res.rows.map((row) => ({ reason: row.reason, discounted: Number(row.discounted) }));
    },

    // ─── the two-sided roster (openproduct-commons CG3) ───

    async listRoster(profileId) {
      // RECONCILED, NOT MERGED. The INNER JOIN is the reconciliation: a row
      // reaches the public roster only if the maintainer published them AND
      // they confirmed. Either half alone is exactly the failure the other
      // half exists to prevent — an unconsented name, or a name the
      // maintainer removed still showing.
      //
      // `state = 'confirmed'` is in SQL rather than in a filter above it, so
      // there is no code path that could return a pending edge to a caller
      // who forgot to check.
      const res = await sql.execute<{
        subject_id: string;
        role_label: string | null;
        handle: string | null;
        display_name: string | null;
        since: string | Date;
      }>(
        `SELECT pp.subject_id,
                COALESCE(pm.role_label, pp.role_label) AS role_label,
                h.handle,
                c.display_name,
                COALESCE(pp.confirmed_at, pp.invited_at) AS since
           FROM openproduct.product_people pp
           JOIN openproduct.published_maintainers pm
             ON pm.profile_id = pp.profile_id AND pm.subject_id = pp.subject_id
           -- CG1 — the display name comes from a PUBLIC profile only. This
           -- roster shows a person's OWN name, unlike the product page's
           -- credits, which show what the maintainer wrote.
           LEFT JOIN openproduct.contributors c
             ON c.subject_id = pp.subject_id AND c.profile_public
           -- CG4 — the handle through the shared join, so this read and the
           -- product page's cannot disagree about whether a name is a link.
           ${handleJoinFor("pp.subject_id")}
          WHERE pp.profile_id = $1
            AND pp.state = 'confirmed'
          ORDER BY pm.sort_order, pp.subject_id`,
        [profileId],
      );
      return res.rows.map((row) => ({
        subjectId: row.subject_id,
        // The MAINTAINER'S label wins where they wrote one: it is the
        // publication list's field and always has been. The edge's own label
        // is what the invitation carried, and survives as a fallback.
        roleLabel: row.role_label,
        handle: row.handle,
        displayName: row.display_name,
        since: iso(row.since)!,
      }));
    },

    async listRostersFor(profileIds) {
      // THE SAME RECONCILIATION AS `listRoster`, batched — the INNER JOIN on
      // the publication list and `state = 'confirmed'` are both here, in SQL,
      // for the reason that read gives: there must be no code path that can
      // return an unconfirmed or unpublished edge to a caller who forgot to
      // check. A batched read with a looser predicate would be a second
      // answer to "who is publicly on this product".
      const ids = [...new Set(profileIds)];
      const out = new Map<string, RosterMemberRecord[]>();
      if (ids.length === 0) return out;
      const res = await sql.execute<{
        profile_id: string;
        subject_id: string;
        role_label: string | null;
        handle: string | null;
        display_name: string | null;
        since: string | Date;
      }>(
        `SELECT pp.profile_id, pp.subject_id,
                COALESCE(pm.role_label, pp.role_label) AS role_label,
                h.handle,
                c.display_name,
                COALESCE(pp.confirmed_at, pp.invited_at) AS since
           FROM openproduct.product_people pp
           JOIN openproduct.published_maintainers pm
             ON pm.profile_id = pp.profile_id AND pm.subject_id = pp.subject_id
           LEFT JOIN openproduct.contributors c
             ON c.subject_id = pp.subject_id AND c.profile_public
           ${handleJoinFor("pp.subject_id")}
          WHERE pp.profile_id = ANY($1::uuid[])
            AND pp.state = 'confirmed'
          ORDER BY pp.profile_id, pm.sort_order, pp.subject_id`,
        [ids],
      );
      for (const row of res.rows) {
        const list = out.get(row.profile_id) ?? [];
        list.push({
          subjectId: row.subject_id,
          roleLabel: row.role_label,
          handle: row.handle,
          displayName: row.display_name,
          since: iso(row.since)!,
        });
        out.set(row.profile_id, list);
      }
      return out;
    },

    async follow(subjectId, kind, target) {
      // IDEMPOTENT BY THE PRIMARY KEY, not by a read-then-write. Following
      // twice is following once, and `ON CONFLICT DO NOTHING` says so in one
      // round trip that cannot race with itself.
      //
      // NOBODY FOLLOWS THEMSELVES, refused HERE as well as by the schema's
      // CHECK — and the duplication is deliberate rather than sloppy. A maker
      // opening their own page finds the button there, so this is a request a
      // person can honestly make and deserves an answer rather than a 500;
      // refusing it in code means the handler never has to parse a driver's
      // constraint-violation error, which is the one thing in this file that
      // would differ between pglite and Hyperdrive. The CHECK stays as the
      // guarantee at rest: this returns an ANSWER, the constraint keeps a
      // PROMISE, and a future write path that forgets the first still cannot
      // break the second.
      if (kind === "person" && target === subjectId) return false;
      await sql.execute(
        `INSERT INTO openproduct.follows (subject_id, kind, target)
         VALUES ($1, $2, $3)
         ON CONFLICT (subject_id, kind, target) DO NOTHING`,
        [subjectId, kind, target],
      );
      return true;
    },

    async unfollow(subjectId, kind, target) {
      // DELETES. The migration argues it at length: a follow has no
      // restatement, so a tombstone would be a durable private record that
      // this person once followed that person — kept by us, asked for by
      // nobody, and the kind of row that leaks through a join.
      const res = await sql.execute(
        `DELETE FROM openproduct.follows
          WHERE subject_id = $1 AND kind = $2 AND target = $3`,
        [subjectId, kind, target],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async countFollowers(kind, targets) {
      // A COUNT AND NEVER A LIST. `subject_id` is not selected, not grouped by
      // and not returned — the shape of this query is the privacy rule, and a
      // reviewer can see it in five lines rather than trusting a comment.
      const wanted = [...new Set(targets)];
      const out = new Map<string, number>();
      if (wanted.length === 0) return out;
      const res = await sql.execute<{ target: string; n: string | number }>(
        `SELECT target, count(*) AS n
           FROM openproduct.follows
          WHERE kind = $1 AND target = ANY($2::text[])
          GROUP BY target`,
        [kind, wanted],
      );
      for (const row of res.rows) out.set(row.target, Number(row.n));
      return out;
    },

    async listFollowed(subjectId, targets) {
      // BOUNDED BY WHAT THE PAGE ASKED. An unbounded "everything you follow"
      // would turn one page's personalisation into a listing of the visitor's
      // whole subscription history — the rule XP2's overlay already applies to
      // saves and endorsements.
      if (targets.length === 0) return [];
      const kinds = targets.map((t) => t.kind);
      const values = targets.map((t) => t.target);
      const res = await sql.execute<{ kind: string; target: string }>(
        `SELECT f.kind, f.target
           FROM openproduct.follows f
           JOIN unnest($2::text[], $3::text[]) AS asked(kind, target)
             ON asked.kind = f.kind AND asked.target = f.target
          WHERE f.subject_id = $1`,
        [subjectId, kinds, values],
      );
      return res.rows.map((row) => ({
        kind: row.kind as FollowKindName,
        target: row.target,
      }));
    },

    async listRosterForSubject(subjectId) {
      const res = await sql.execute<{
        slug: string;
        tagline: string | null;
        role_label: string | null;
        state: string;
        origin: string;
        invited_at: string | Date;
        confirmed_at: string | Date | null;
        visibility: string;
      }>(
        `SELECT p.slug, p.tagline, pp.role_label, pp.state, pp.origin,
                pp.invited_at, pp.confirmed_at, p.visibility
           FROM openproduct.product_people pp
           JOIN openproduct.profiles p ON p.id = pp.profile_id
          WHERE pp.subject_id = $1
            AND pp.state IN ('pending', 'confirmed')
          ORDER BY pp.invited_at DESC, p.slug`,
        [subjectId],
      );

      const confirmed: SubjectRosterRecord["confirmed"] = [];
      const invitations: SubjectRosterRecord["invitations"] = [];
      const grandfathered: string[] = [];
      for (const row of res.rows) {
        if (row.state === "pending") {
          // A pending invitation is shown WHATEVER the listing's visibility:
          // a person asked to join a draft still needs to be able to answer,
          // and refusing to show it would mean an invitation they can neither
          // see nor decline.
          invitations.push({
            slug: row.slug,
            tagline: row.tagline,
            roleLabel: row.role_label,
            invitedAt: iso(row.invited_at)!,
          });
          continue;
        }
        confirmed.push({
          slug: row.slug,
          tagline: row.tagline,
          roleLabel: row.role_label,
          since: iso(row.confirmed_at ?? row.invited_at)!,
        });
        // OPC-G — only where the listing is actually PUBLIC. Telling somebody
        // "you are listed and never agreed" about a draft nobody can see
        // would be an alarm about nothing.
        if (row.origin === "grandfathered" && row.visibility === "public") {
          grandfathered.push(row.slug);
        }
      }
      return { confirmed, invitations, grandfathered };
    },

    async getRosterEdge(profileId, subjectId) {
      const res = await sql.execute<RosterEdgeRowSql>(
        `SELECT profile_id, subject_id, state, origin, role_label,
                invited_by, invited_at, confirmed_at, retired_at
           FROM openproduct.product_people
          WHERE profile_id = $1 AND subject_id = $2`,
        [profileId, subjectId],
      );
      return res.rows[0] ? rosterEdgeOf(res.rows[0]) : null;
    },

    async inviteToRoster(input) {
      // ALWAYS `pending`. There is no path here that creates a confirmed
      // edge: a confirmed edge nobody confirmed is precisely the thing this
      // table exists to prevent, and the one exception — OPC-G's grandfather
      // — ran once, in a migration, and marked every row it wrote.
      //
      // Re-inviting somebody who declined works, and re-inviting somebody who
      // RETIRED re-opens the invitation rather than silently restoring them:
      // leaving and being asked back are different events.
      const res = await sql.execute<RosterEdgeRowSql>(
        `INSERT INTO openproduct.product_people
           (profile_id, subject_id, state, origin, role_label, invited_by, invited_at,
            confirmed_at, retired_at, retired_by)
         VALUES ($1, $2, 'pending', 'confirmed_by_subject', $3, $4, $5, NULL, NULL, NULL)
         ON CONFLICT (profile_id, subject_id) DO UPDATE
           SET state        = 'pending',
               origin       = 'confirmed_by_subject',
               role_label   = EXCLUDED.role_label,
               invited_by   = EXCLUDED.invited_by,
               invited_at   = EXCLUDED.invited_at,
               confirmed_at = NULL,
               retired_at   = NULL,
               retired_by   = NULL
           WHERE openproduct.product_people.state = 'retired'
         RETURNING profile_id, subject_id, state, origin, role_label,
                   invited_by, invited_at, confirmed_at, retired_at`,
        [input.profileId, input.subjectId, input.roleLabel, input.invitedBy, input.at],
      );
      if (res.rows[0]) return rosterEdgeOf(res.rows[0]);
      // The conflict target existed and was NOT retired — the invitation
      // already stands, or they already confirmed. Return what is there
      // rather than pretending to have written: re-inviting somebody who is
      // already on the roster must not reset their confirmation.
      const existing = await sql.execute<RosterEdgeRowSql>(
        `SELECT profile_id, subject_id, state, origin, role_label,
                invited_by, invited_at, confirmed_at, retired_at
           FROM openproduct.product_people
          WHERE profile_id = $1 AND subject_id = $2`,
        [input.profileId, input.subjectId],
      );
      return rosterEdgeOf(existing.rows[0]!);
    },

    async confirmRosterEdge(profileId, subjectId, at) {
      const res = await sql.execute<RosterEdgeRowSql>(
        `UPDATE openproduct.product_people
            SET state = 'confirmed', confirmed_at = $3,
                -- A confirmation always makes the origin real, including on a
                -- grandfathered row: somebody who was carried over and then
                -- said yes HAS consented, and the estate should stop counting
                -- them among the consents it assumed.
                origin = 'confirmed_by_subject'
          WHERE profile_id = $1 AND subject_id = $2 AND state = 'pending'
         RETURNING profile_id, subject_id, state, origin, role_label,
                   invited_by, invited_at, confirmed_at, retired_at`,
        [profileId, subjectId, at],
      );
      return res.rows[0] ? rosterEdgeOf(res.rows[0]) : null;
    },

    async declineRosterEdge(profileId, subjectId) {
      // DELETES. "I was never part of this" should leave no record that they
      // were asked — a `declined` row is a durable fact about a person that
      // serves nobody but a curious maintainer.
      const res = await sql.execute<{ profile_id: string }>(
        `DELETE FROM openproduct.product_people
          WHERE profile_id = $1 AND subject_id = $2 AND state = 'pending'
         RETURNING profile_id`,
        [profileId, subjectId],
      );
      return res.rows.length > 0;
    },

    async retireRosterEdge(profileId, subjectId, retiredBy, at) {
      const res = await sql.execute<RosterEdgeRowSql>(
        `UPDATE openproduct.product_people
            SET state = 'retired', retired_at = $3, retired_by = $4
          WHERE profile_id = $1 AND subject_id = $2
            AND state IN ('pending', 'confirmed')
         RETURNING profile_id, subject_id, state, origin, role_label,
                   invited_by, invited_at, confirmed_at, retired_at`,
        [profileId, subjectId, at, retiredBy],
      );
      return res.rows[0] ? rosterEdgeOf(res.rows[0]) : null;
    },

    async countRosterMemberships(subjectId) {
      // RETIRED COUNTS. Somebody who spent two years on a product did that
      // whether or not they are on it today, and a "contributes to" that fell
      // when somebody left would make the number a measure of current
      // attachment rather than of work done.
      //
      // Bounded to PUBLIC listings: a count that included drafts would let a
      // profile's stat reveal how many unpublished things somebody is on.
      const res = await sql.execute<{ n: string | number }>(
        `SELECT count(*) AS n
           FROM openproduct.product_people pp
           JOIN openproduct.profiles p ON p.id = pp.profile_id
          WHERE pp.subject_id = $1
            AND pp.state IN ('confirmed', 'retired')
            AND pp.confirmed_at IS NOT NULL
            AND ${listed("p")}`,
        [subjectId],
      );
      return Number(res.rows[0]?.n ?? 0);
    },

    // ---- launches (openproduct-commons LC0) ----

    async launchEligibility(profileId) {
      // ONE QUERY, FOUR FACTS, ONE INSTANT. Reading these separately would let
      // a cooldown be checked before a concurrent launch fires and a version
      // list after it, which passes a check against a state that never
      // existed. The unique indexes are the real backstop; this is what lets
      // the studio explain a refusal instead of surfacing a constraint error.
      const res = await sql.execute<{
        profile_id: string | null;
        slug: string | null;
        is_published: boolean;
        consumed: unknown;
        last_launched_at: string | Date | null;
        has_scheduled: boolean;
      }>(
        `SELECT p.id AS profile_id,
                p.slug,
                (p.visibility = 'public') AS is_published,
                COALESCE((
                  SELECT jsonb_agg(l.version_label)
                    FROM openproduct.launches l
                   WHERE l.profile_id = p.id AND l.state IN ('scheduled', 'live')
                ), '[]'::jsonb) AS consumed,
                (SELECT max(l2.launched_at)
                   FROM openproduct.launches l2
                  WHERE l2.profile_id = p.id AND l2.state = 'live') AS last_launched_at,
                EXISTS (
                  SELECT 1 FROM openproduct.launches l3
                   WHERE l3.profile_id = p.id AND l3.state = 'scheduled'
                ) AS has_scheduled
           FROM openproduct.profiles p
          WHERE p.id = $1`,
        [profileId],
      );
      const row = res.rows[0];
      if (!row) {
        // A listing that does not exist is not launchable, and says so with
        // the same shape rather than a null the caller has to remember to
        // check twice.
        return {
          profileId: null,
          slug: null,
          isPublished: false,
          consumedVersions: [],
          lastLaunchedAt: null,
          hasScheduled: false,
        };
      }
      return {
        profileId: row.profile_id,
        slug: row.slug,
        isPublished: row.is_published === true,
        consumedVersions: parseSlugList(row.consumed),
        lastLaunchedAt: iso(row.last_launched_at),
        hasScheduled: row.has_scheduled === true,
      };
    },

    async scheduleLaunch(input) {
      const res = await sql.execute<LaunchRowSql>(
        `INSERT INTO openproduct.launches
           (id, profile_id, state, version_label, scheduled_for, scheduled_by)
         VALUES ($1, $2, 'scheduled', $3, $4, $5)
         RETURNING id, profile_id, state, version_label, scheduled_for,
                   launched_at, cancelled_at, missed_at, scheduled_by, board_rank_at`,
        [input.id, input.profileId, input.versionLabel, input.scheduledFor, input.scheduledBy],
      );
      return launchOf(res.rows[0]!);
    },

    async rescheduleLaunch(id, scheduledFor) {
      // THE STATE FILTER IS IN THE WHERE CLAUSE, not in a read-then-write. A
      // launch that fired between the studio rendering its Move button and the
      // form posting must not move: it has been announced, and rewriting a
      // public record because a form was stale is the one outcome this table
      // exists to prevent.
      const res = await sql.execute<LaunchRowSql>(
        `UPDATE openproduct.launches
            SET scheduled_for = $2,
                state         = 'scheduled',
                missed_at     = NULL,
                updated_at    = now()
          WHERE id = $1 AND state IN ('scheduled', 'missed')
         RETURNING id, profile_id, state, version_label, scheduled_for,
                   launched_at, cancelled_at, missed_at, scheduled_by, board_rank_at`,
        [id, scheduledFor],
      );
      return res.rows[0] ? launchOf(res.rows[0]) : null;
    },

    async cancelLaunch(id, actor, at) {
      const res = await sql.execute<LaunchRowSql>(
        `UPDATE openproduct.launches
            SET state        = 'cancelled',
                cancelled_at = $3,
                cancelled_by = $2,
                missed_at    = NULL,
                updated_at   = now()
          WHERE id = $1 AND state IN ('scheduled', 'missed')
         RETURNING id, profile_id, state, version_label, scheduled_for,
                   launched_at, cancelled_at, missed_at, scheduled_by, board_rank_at`,
        [id, actor, at],
      );
      return res.rows[0] ? launchOf(res.rows[0]) : null;
    },

    async getLaunch(id) {
      const res = await sql.execute<LaunchRowSql>(
        `SELECT id, profile_id, state, version_label, scheduled_for,
                launched_at, cancelled_at, missed_at, scheduled_by, board_rank_at
           FROM openproduct.launches WHERE id = $1`,
        [id],
      );
      return res.rows[0] ? launchOf(res.rows[0]) : null;
    },

    async listLaunchesForProfile(profileId) {
      const res = await sql.execute<LaunchRowSql>(
        `SELECT id, profile_id, state, version_label, scheduled_for,
                launched_at, cancelled_at, missed_at, scheduled_by, board_rank_at
           FROM openproduct.launches
          WHERE profile_id = $1
          ORDER BY scheduled_for DESC`,
        [profileId],
      );
      return res.rows.map(launchOf);
    },

    async fireDueLaunches(now, limit = 200) {
      // TWO STATEMENTS, AND THE ORDER MATTERS: live first, then missed. Both
      // filter on the SAME `now`, so a launch cannot be caught by neither —
      // and the listed test is a JOIN evaluated inside each statement, so
      // a listing unpublished a millisecond ago is seen as unpublished.
      //
      // The second condition is the literal negation of the first (TS3 widened
      // both from `visibility` to `listed`, which is visibility AND moderation
      // state). Widening one and not the other would silently strand launches
      // in `scheduled` past their moment, which is the failure this pairing
      // exists to make impossible.
      //
      // `launched_at := scheduled_for`, NOT `now`. LC-2 tie-breaks the board
      // by earliest launch time; stamping the sweep's clock would order the
      // board by cron jitter, which is to say by nothing. `fired_at` keeps the
      // operational truth for whoever has to tell a late sweep from a late
      // launch.
      const capped = Math.max(1, Math.min(Math.trunc(limit) || 0, 500));
      // NF0 — the fired launches come back with their SLUG and TOPIC, not just
      // a count. A caller that has to announce them would otherwise re-read
      // the day to find out what it had just made live, and the two reads
      // could disagree about a launch that fired between them.
      const live = await sql.execute<{ id: string; slug: string; category: string | null }>(
        `UPDATE openproduct.launches l
            SET state       = 'live',
                launched_at = l.scheduled_for,
                fired_at    = $1,
                updated_at  = now()
          FROM openproduct.profiles p
         WHERE p.id = l.profile_id
           AND l.state = 'scheduled'
           AND l.scheduled_for <= $1
           AND ${listed("p")}
           AND l.id IN (
             SELECT id FROM openproduct.launches
              WHERE state = 'scheduled' AND scheduled_for <= $1
              ORDER BY scheduled_for LIMIT $2
           )
         RETURNING l.id, p.slug, p.category`,
        [now, capped],
      );
      const missed = await sql.execute<{ id: string }>(
        `UPDATE openproduct.launches l
            SET state      = 'missed',
                missed_at  = $1,
                fired_at   = $1,
                updated_at = now()
          FROM openproduct.profiles p
         WHERE p.id = l.profile_id
           AND l.state = 'scheduled'
           AND l.scheduled_for <= $1
           -- The EXACT negation of the live half, which is why it is written
           -- as one, and why TS3 could not add its term to only one of them:
           -- these two statements partition the due launches between them, so
           -- a condition added on one side and not the other leaves a launch
           -- caught by NEITHER, sitting scheduled after its moment has
           -- passed, forever. A delisted listing's launch therefore MISSES,
           -- which is also the right answer — it announces nothing, it says
           -- so, and the maintainer can see why.
           AND NOT (${listed("p")})
           AND l.id IN (
             SELECT id FROM openproduct.launches
              WHERE state = 'scheduled' AND scheduled_for <= $1
              ORDER BY scheduled_for LIMIT $2
           )
         RETURNING l.id`,
        [now, capped],
      );
      return {
        live: live.rows.length,
        missed: missed.rows.length,
        // NF0's fan-out reads this rather than re-reading the day.
        fired: live.rows.map((row) => ({ slug: row.slug, topic: row.category })),
      };
    },

    async countPublishedWindows(now) {
      // FOUR COUNTS, ONE SCAN, ONE INSTANT. `FILTER` rather than four
      // statements: separately counted windows can disagree with each other
      // across a concurrent publish, and the strip's whole claim is that the
      // number and the window belong together.
      //
      // The windows are TRAILING rather than calendar-aligned — "the last
      // 24 hours", not "since midnight". A calendar day makes the strip
      // depend on a timezone the reader cannot see, and a page that says
      // "today" differently to two people at the same moment is worse than
      // one that means a rolling window and says so.
      const res = await sql.execute<{
        today: string | number;
        week: string | number;
        month: string | number;
        total: string | number;
      }>(
        `SELECT
           count(*) FILTER (WHERE published_at >= $1::timestamptz - INTERVAL '1 day')   AS today,
           count(*) FILTER (WHERE published_at >= $1::timestamptz - INTERVAL '7 days')  AS week,
           count(*) FILTER (WHERE published_at >= $1::timestamptz - INTERVAL '30 days') AS month,
           count(*) AS total
           FROM openproduct.profiles
          WHERE ${listed("")} AND published_at IS NOT NULL`,
        [now],
      );
      const row = res.rows[0];
      return {
        today: Number(row?.today ?? 0),
        week: Number(row?.week ?? 0),
        month: Number(row?.month ?? 0),
        total: Number(row?.total ?? 0),
      };
    },

    // ---- the digest (openproduct-commons LC1) ----

    async listLaunchesInWindow(start, end, limit = 25) {
      // HALF-OPEN `[start, end)`. A closed range double-counts the instant two
      // weeks meet, and the one launch scheduled for exactly midnight Monday
      // would appear in both digests — which on an archive is two documents
      // disagreeing about the same fact.
      const capped = Math.max(1, Math.min(Math.trunc(limit) || 0, 200));
      const res = await sql.execute<{
        slug: string;
        tagline: string | null;
        version_label: string;
        launched_at: string | Date;
      }>(
        `SELECT p.slug, p.tagline, l.version_label, l.launched_at
           FROM openproduct.launches l
           JOIN openproduct.profiles p ON p.id = l.profile_id
          WHERE l.state = 'live'
            AND l.launched_at >= $1 AND l.launched_at < $2
            -- A LISTING UNPUBLISHED SINCE ITS LAUNCH IS NOT IN THE DIGEST.
            -- The launch happened and the row stays, but a digest is a page of
            -- links and a link to a 404 is worse than a shorter week.
            AND ${listed("p")}
          ORDER BY l.launched_at ASC, p.slug
          LIMIT $3`,
        [start, end, capped],
      );
      return res.rows.map((row) => ({
        slug: row.slug,
        tagline: row.tagline,
        versionLabel: row.version_label,
        launchedAt: iso(row.launched_at)!,
      }));
    },

    async listMostEndorsedInWindow(start, end, limit = 5) {
      // COUNTED OVER THE WEEK, not over a trailing window. `endorsements.7d`
      // answers "the last seven days as of the last sweep", which for an
      // archived week is the wrong seven days entirely — a digest for week 34
      // read in week 40 would report week 40's numbers under week 34's
      // heading.
      //
      // The integrity discount is the SAME LEFT JOIN `countEndorsements`
      // applies, so the digest and the product page cannot disagree about
      // whether an endorsement counted.
      const capped = Math.max(1, Math.min(Math.trunc(limit) || 0, 50));
      const res = await sql.execute<{
        slug: string;
        tagline: string | null;
        endorsements: string | number;
      }>(
        `SELECT p.slug, p.tagline, count(*) AS endorsements
           FROM openproduct.endorsements e
           JOIN openproduct.profiles p ON p.id = e.profile_id
           LEFT JOIN openproduct.endorsement_integrity i
             ON i.profile_id = e.profile_id AND i.subject_id = e.subject_id
            AND i.reversed_at IS NULL
          WHERE e.created_at >= $1 AND e.created_at < $2
            AND e.withdrawn_at IS NULL
            AND e.state = 'confirmed'
            AND i.profile_id IS NULL
            AND ${listed("p")}
          GROUP BY p.id, p.slug, p.tagline
          -- LC-2's tie-break, applied here too: earliest launch of the week
          -- first, so two listings on the same count are ordered by something
          -- a reader can verify rather than by whatever the planner returned.
          ORDER BY count(*) DESC,
                   COALESCE((SELECT min(l.launched_at) FROM openproduct.launches l
                              WHERE l.profile_id = p.id AND l.state = 'live'
                                AND l.launched_at >= $1 AND l.launched_at < $2),
                            'infinity'::timestamptz) ASC,
                   p.slug ASC
          LIMIT $3`,
        [start, end, capped],
      );
      return res.rows.map((row) => ({
        slug: row.slug,
        tagline: row.tagline,
        endorsements: Number(row.endorsements),
      }));
    },

    async getDigestNote(weekId) {
      // The author's HANDLE, through the same gates every other name on a
      // public surface goes through (CG4's shared join): present if and only
      // if `/@handle` resolves, so the page links or renders plain text and
      // never a dead link (XP-5).
      const res = await sql.execute<{
        week_id: string;
        body: string;
        handle: string | null;
        written_at: string | Date;
      }>(
        `SELECT n.week_id, n.body, h.handle, n.written_at
           FROM openproduct.digest_notes n
           ${handleJoinFor("n.author_subject_id")}
          WHERE n.week_id = $1`,
        [weekId],
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        weekId: row.week_id,
        body: row.body,
        byHandle: row.handle,
        writtenAt: iso(row.written_at)!,
      };
    },

    async listDigestWeeks(limit = 52) {
      // WEEKS THAT HELD SOMETHING. A digest exists for every week that ever
      // was, but an index listing four hundred empty weeks is an index nobody
      // reads — and the archive is still reachable by typing a URL, which is
      // the property that matters. Derived from the launches rather than
      // stored, so a week cannot be listed and then render empty.
      const capped = Math.max(1, Math.min(Math.trunc(limit) || 0, 520));
      const res = await sql.execute<{ week_id: string }>(
        `SELECT week_id FROM (
           SELECT to_char(l.launched_at, 'IYYY') || '-w' || to_char(l.launched_at, 'IW') AS week_id
             FROM openproduct.launches l
             JOIN openproduct.profiles p ON p.id = l.profile_id
            WHERE l.state = 'live' AND ${listed("p")}
           UNION
           SELECT n.week_id FROM openproduct.digest_notes n
         ) weeks
         ORDER BY week_id DESC
         LIMIT $1`,
        [capped],
      );
      return res.rows.map((row) => row.week_id);
    },

    async countGrandfathered() {
      const res = await sql.execute<{ n: string | number }>(
        `SELECT count(*) AS n
           FROM openproduct.product_people
          WHERE origin = 'grandfathered' AND state = 'confirmed'`,
        [],
      );
      return Number(res.rows[0]?.n ?? 0);
    },

    async getIntegritySweptAt() {
      const res = await sql.execute<{ swept_at: string | Date | null }>(
        `SELECT swept_at FROM openproduct.integrity_sweep_state WHERE singleton`,
        [],
      );
      return iso(res.rows[0]?.swept_at ?? null);
    },

    async markIntegritySwept(at) {
      // Upsert rather than update: a database restored without the seed row
      // would otherwise never record a sweep and would therefore sweep on
      // every tick forever — the exact failure the floor exists to prevent,
      // arriving through the floor's own absence.
      await sql.execute(
        `INSERT INTO openproduct.integrity_sweep_state (singleton, swept_at)
         VALUES (TRUE, $1)
         ON CONFLICT (singleton) DO UPDATE SET swept_at = EXCLUDED.swept_at`,
        [at],
      );
    },

    // ─── the flag queue (openproduct-commons TS4) ───

    async raiseFlag(input) {
      // ON CONFLICT DO NOTHING against the partial unique index over
      // (subject_kind, subject_ref, kind) WHERE state = 'open'. The sweep
      // re-raises everything it finds on every run, so this is the difference
      // between a queue and a log: a listing with an empty pitch would
      // otherwise file a fresh row every hour until somebody looked.
      //
      // A RESOLVED FLAG DOES NOT BLOCK A NEW ONE — the index is partial for
      // that reason. A listing flagged, dismissed, rewritten and flagged
      // again is a new observation, and suppressing it would make dismissal
      // permanent immunity.
      //
      // EXCEPT WHERE THE EVIDENCE IS FROZEN HISTORY (`once`, from the
      // contract's FLAG_RECURS). A cohort's accounts have already gone quiet
      // and a launch has already happened, so the pattern can never change:
      // re-raising after a dismissal would put the same question in front of
      // a person every six hours, forever. The NOT EXISTS below is that rule,
      // and it is in SQL rather than a read-then-write above it so that one
      // statement decides — this runs behind a six-hour floor, but a guard
      // split across two round trips is a guard a retry can slip through.
      const res = await sql.execute<FlagRow>(
        `INSERT INTO openproduct.flags
           (id, kind, subject_kind, subject_ref, state, evidence, consequence, raised_at)
         SELECT $1, $2, $3, $4, 'open', $5, $6, $7
          WHERE NOT ($8::boolean AND EXISTS (
                SELECT 1 FROM openproduct.flags f
                 WHERE f.subject_kind = $3 AND f.subject_ref = $4 AND f.kind = $2))
         ON CONFLICT DO NOTHING
         RETURNING id, kind, subject_kind, subject_ref, state, evidence, consequence,
                   raised_at, resolved_at, resolved_by`,
        [
          input.id,
          input.kind,
          input.subjectKind,
          input.subjectRef,
          input.evidence,
          input.consequence,
          input.at,
          input.once === true,
        ],
      );
      const row = res.rows[0];
      return row ? flagRow(row) : null;
    },

    async listOpenFlags(limit = 50) {
      const res = await sql.execute<FlagRow>(
        `SELECT id, kind, subject_kind, subject_ref, state, evidence, consequence,
                raised_at, resolved_at, resolved_by
           FROM openproduct.flags
          WHERE state = 'open'
          ORDER BY raised_at ASC
          LIMIT $1`,
        [Math.min(Math.max(1, limit), 200)],
      );
      return res.rows.map(flagRow);
    },

    async listFlagsForSubject(subjectKind, subjectRef, limit = 20) {
      const res = await sql.execute<FlagRow>(
        `SELECT id, kind, subject_kind, subject_ref, state, evidence, consequence,
                raised_at, resolved_at, resolved_by
           FROM openproduct.flags
          WHERE subject_kind = $1 AND subject_ref = $2
          ORDER BY raised_at DESC
          LIMIT $3`,
        [subjectKind, subjectRef, Math.min(Math.max(1, limit), 200)],
      );
      return res.rows.map(flagRow);
    },

    async resolveFlag(id, state, resolvedBy, at) {
      // Terminal, and only from open — for the same reason resolving a report
      // is: re-resolving would rewrite who closed it and when, and the
      // dismissal count is the estate's own false-positive measurement.
      const res = await sql.execute<FlagRow>(
        `UPDATE openproduct.flags
            SET state = $2, resolved_by = $3, resolved_at = $4
          WHERE id = $1 AND state = 'open'
         RETURNING id, kind, subject_kind, subject_ref, state, evidence, consequence,
                   raised_at, resolved_at, resolved_by`,
        [id, state, resolvedBy, at],
      );
      const row = res.rows[0];
      return row ? flagRow(row) : null;
    },

    async flagDisclosure(sinceIso) {
      // BY KIND AND OUTCOME, never by subject. The dismissal share of each
      // kind IS the production false-positive rate, which is the number TS4
      // is accountable to.
      const res = await sql.execute<{ kind: string; state: string; n: string | number }>(
        `SELECT kind, state, count(*) AS n
           FROM openproduct.flags
          WHERE raised_at >= $1
          GROUP BY kind, state
          ORDER BY kind, state`,
        [sinceIso],
      );
      return res.rows.map((row) => ({ kind: row.kind, state: row.state, count: Number(row.n) }));
    },

    // ─── what the defence sweep reads ───

    async listPitchesForDefence(limit) {
      // ONLY INDEXABLE ONES. De-indexing is this detector's only consequence,
      // so a listing already un-indexed has nothing left that could happen to
      // it — reading it again every hour would spend the sweep's budget
      // re-deciding a decided thing and re-flagging a maker who has already
      // had the only consequence there is.
      const res = await sql.execute<{
        id: string;
        slug: string;
        tagline: string | null;
        pitch_body: string | null;
      }>(
        `SELECT p.id, p.slug, p.tagline, p.pitch_body
           FROM openproduct.profiles p
          WHERE ${listed("p")}
            AND p.indexable = TRUE
            AND p.pitch_body IS NOT NULL
          ORDER BY p.published_at DESC NULLS LAST
          LIMIT $1`,
        [Math.min(Math.max(1, limit), 5000)],
      );
      return res.rows.map((row) => ({
        profileId: row.id,
        slug: row.slug,
        tagline: row.tagline,
        pitchBody: row.pitch_body,
      }));
    },

    async listActsForCohorts(sinceIso, limit) {
      // The same shape and the same posture as EN3's read, down to the scalar
      // subquery: the target is the listing, and `subject_first_seen_at` is
      // their first endorsement HERE over the WHOLE table rather than over
      // this slice (OPC-6 — an account endorsing for a year is not new
      // because the window starts today, and we do not know or ask how old
      // anybody's account is elsewhere).
      //
      // NOT FILTERED TO `confirmed`, and this is a trap worth naming. The
      // first version filtered it, matching `countEndorsements`, which would
      // have blinded the detector to its own target: a set of accounts made
      // that morning has not cleared TS1's eligibility ladder, so a purchased
      // brigade's endorsements are PENDING. Discounting a pending endorsement
      // is a no-op on the total — but the pattern is the evidence, and a
      // cohort flag a person can read is the point. EN3's read makes exactly
      // the same choice.
      const capped = Math.max(1, Math.min(Math.trunc(limit) || 0, 100_000));
      const res = await sql.execute<{
        subject_id: string;
        target_ref: string;
        acted_at: string | Date;
        subject_first_seen_at: string | Date;
      }>(
        `SELECT e.subject_id,
                e.profile_id::text AS target_ref,
                e.created_at AS acted_at,
                (SELECT min(e2.created_at)
                   FROM openproduct.endorsements e2
                  WHERE e2.subject_id = e.subject_id) AS subject_first_seen_at
           FROM openproduct.endorsements e
          WHERE e.withdrawn_at IS NULL
            AND e.created_at >= $1
          ORDER BY e.created_at ASC, e.subject_id, e.profile_id
          LIMIT $2`,
        [sinceIso, capped],
      );
      return res.rows.map((row) => ({
        subjectId: row.subject_id,
        targetRef: row.target_ref,
        actedAt: iso(row.acted_at)!,
        subjectFirstSeenAt: iso(row.subject_first_seen_at)!,
      }));
    },

    async listLaunchEndorsements(sinceIso) {
      const res = await sql.execute<{
        launch_id: string;
        profile_id: string;
        slug: string;
        launched_at: string | Date;
        subject_id: string | null;
        subject_first_seen_at: string | Date | null;
      }>(
        `SELECT l.id AS launch_id,
                l.profile_id,
                p.slug,
                l.launched_at,
                e.subject_id,
                first_seen.at AS subject_first_seen_at
           FROM openproduct.launches l
           JOIN openproduct.profiles p ON p.id = l.profile_id
           -- CONFIRMED ONLY HERE, unlike the cohort read above, and the two
           -- answers are different because the questions are. That one asks
           -- "what happened", so a pending endorsement is evidence. This one
           -- partitions what the BOARD RANKS, and the board ranks the counted
           -- total (EN2) — which is confirmed endorsements. A partition over a
           -- different set than the thing being partitioned would produce a
           -- share that describes nothing.
           LEFT JOIN openproduct.endorsements e
                  ON e.profile_id = l.profile_id
                 AND e.withdrawn_at IS NULL
                 AND e.state = 'confirmed'
           LEFT JOIN LATERAL (
                SELECT min(f.created_at) AS at
                  FROM openproduct.endorsements f
                 WHERE f.subject_id = e.subject_id
           ) first_seen ON TRUE
          WHERE l.state = 'live'
            AND l.launched_at >= $1
            AND ${listed("p")}
          ORDER BY l.launched_at DESC, e.subject_id ASC`,
        [sinceIso],
      );
      // A LEFT JOIN so a launch nobody endorsed still comes back — it is a
      // real and common state, and a launch that vanished from the sweep
      // because it had no endorsements would be indistinguishable from one
      // that was never read.
      const byLaunch = new Map<string, LaunchEndorsementRecord>();
      for (const row of res.rows) {
        let record = byLaunch.get(row.launch_id);
        if (!record) {
          record = {
            launchId: row.launch_id,
            profileId: row.profile_id,
            slug: row.slug,
            launchedAt: iso(row.launched_at)!,
            endorsements: [],
          };
          byLaunch.set(row.launch_id, record);
        }
        if (row.subject_id !== null && row.subject_first_seen_at !== null) {
          record.endorsements.push({
            subjectId: row.subject_id,
            subjectFirstSeenAt: iso(row.subject_first_seen_at)!,
          });
        }
      }
      return [...byLaunch.values()];
    },

    async listRingDiscountedProfiles(sinceIso) {
      // COUNTS PER LISTING, and the flag raised from this says a number and
      // never a subject id — EN-4 holds inside the moderation queue too.
      const res = await sql.execute<{ profile_id: string; slug: string; n: string | number }>(
        `SELECT ei.profile_id, p.slug, count(*) AS n
           FROM openproduct.endorsement_integrity ei
           JOIN openproduct.profiles p ON p.id = ei.profile_id
          WHERE ei.reversed_at IS NULL
            AND ei.reason = 'ring'
            AND ei.decided_at >= $1
          GROUP BY ei.profile_id, p.slug
          ORDER BY ei.profile_id`,
        [sinceIso],
      );
      return res.rows.map((row) => ({
        profileId: row.profile_id,
        slug: row.slug,
        discounted: Number(row.n),
      }));
    },

    async setListingIndexable(profileId, indexable) {
      // THE ONLY PATH BY WHICH AUTOMATION CHANGES ANYTHING A READER SEES, and
      // kept as its own method so that fact is greppable. 1370's CHECK still
      // holds above it: a public, indexable, unreviewed listing cannot exist,
      // so re-indexing something never reviewed is refused by the database
      // rather than by anybody remembering.
      //
      // TS5 ADDED THE SECOND HALF OF THE WHERE. Re-indexing is now reachable
      // from an upheld appeal, and 1370's CHECK would REJECT the statement —
      // not return no rows — for a public listing whose review was never
      // recorded. A constraint violation thrown out of an appeal decision
      // would abort the decision after its ledger row was already written,
      // which is the one failure shape this whole cluster is arranged to
      // avoid. Stating the CHECK's own condition here turns that into an
      // honest `false`, which is what the method already promises to return
      // when it changed nothing.
      const res = await sql.execute<{ id: string }>(
        `UPDATE openproduct.profiles
            SET indexable = $2
          WHERE id = $1 AND indexable <> $2
            AND ($2 = FALSE OR visibility = 'private' OR reviewed_at IS NOT NULL)
         RETURNING id`,
        [profileId, indexable],
      );
      return res.rows.length > 0;
    },

    async getDefenceSweptAt() {
      const res = await sql.execute<{ swept_at: string | Date | null }>(
        `SELECT swept_at FROM openproduct.defence_sweep_state WHERE singleton`,
        [],
      );
      return iso(res.rows[0]?.swept_at ?? null);
    },

    async markDefenceSwept(at) {
      // Upsert for the same reason EN3's is: a database restored without the
      // seed row would otherwise never record a sweep and would sweep on
      // every tick forever.
      await sql.execute(
        `INSERT INTO openproduct.defence_sweep_state (singleton, swept_at)
         VALUES (TRUE, $1)
         ON CONFLICT (singleton) DO UPDATE SET swept_at = EXCLUDED.swept_at`,
        [at],
      );
    },

    // ─── the sweep ledger (openproduct-worldclass-v2 LI0) ───

    async getSweepPhaseStates() {
      const entries = await Promise.all(
        SWEEP_LEDGER_PHASES.map(async (phase): Promise<[SweepLedgerPhase, SweepPhaseStateRecord]> => {
          const { table, ranAt } = SWEEP_STATE_TABLES[phase];
          const res = await sql.execute<{
            ran_at: string | Date | null;
            last_error: string | null;
            last_error_at: string | Date | null;
          }>(`SELECT ${ranAt} AS ran_at, last_error, last_error_at FROM ${table} WHERE singleton`, []);
          const row = res.rows[0];
          // No row means the seed did not run — the same practical state as
          // "never ran", and `/health` says so rather than throwing.
          return [
            phase,
            {
              lastRunAt: iso(row?.ran_at ?? null),
              lastError: row?.last_error ?? null,
              lastErrorAt: iso(row?.last_error_at ?? null),
            },
          ];
        }),
      );
      return Object.fromEntries(entries) as Record<SweepLedgerPhase, SweepPhaseStateRecord>;
    },

    async recordSweepOutcomes(outcomes, at) {
      let written = 0;
      for (const outcome of outcomes) {
        const { table, ownsRunAt } = SWEEP_STATE_TABLES[outcome.phase];
        if (outcome.ok) {
          if (ownsRunAt) {
            // Upsert, like EN3's and TS4's: a database restored without the
            // seed row must still be able to record a run.
            await sql.execute(
              `INSERT INTO ${table} (singleton, swept_at, last_error, last_error_at)
               VALUES (TRUE, $1, NULL, NULL)
               ON CONFLICT (singleton) DO UPDATE
                 SET swept_at = EXCLUDED.swept_at, last_error = NULL, last_error_at = NULL`,
              [at],
            );
          } else {
            // The phase's own handler stamped its floor (or declined within
            // it); this ledger only says the failure, if any, is over.
            await sql.execute(
              `UPDATE ${table} SET last_error = NULL, last_error_at = NULL
                WHERE singleton AND last_error IS NOT NULL`,
              [],
            );
          }
        } else {
          await sql.execute(
            `INSERT INTO ${table} (singleton, last_error, last_error_at)
             VALUES (TRUE, $1, $2)
             ON CONFLICT (singleton) DO UPDATE
               SET last_error = EXCLUDED.last_error, last_error_at = EXCLUDED.last_error_at`,
            [outcome.reason ?? "unknown", at],
          );
        }
        written += 1;
      }
      return written;
    },

    // ─── collections (openproduct-commons LC4) ───

    async curatorHandleFor(subjectId) {
      // CG4's BICONDITIONAL, ASKED RATHER THAN RE-IMPLEMENTED. A curator is
      // somebody whose handle resolves: public contributor profile, handle
      // not released, and a published listing behind it. A second idea of
      // "nameable" here is how a collection comes to carry a name that leads
      // nowhere, which is worse than carrying no name at all (XP-5).
      const res = await sql.execute<{ handle: string | null }>(
        `SELECT h.handle
           FROM (SELECT $1::text AS subject_id) s
           ${handleJoinFor("s.subject_id")}`,
        [subjectId],
      );
      return res.rows[0]?.handle ?? null;
    },

    async countLiveCollections(subjectId) {
      const res = await sql.execute<{ n: string | number }>(
        `SELECT count(*) AS n FROM openproduct.collections
          WHERE curator_subject_id = $1 AND state = 'published'`,
        [subjectId],
      );
      return Number(res.rows[0]?.n ?? 0);
    },

    async listOpenRoles(limit) {
      // WEIGHTED BY NOTHING (FL1). The order is `created_at DESC` and the only
      // filters are "the role is open" and "the listing is public" — no
      // endorsement count, no demand figure, no activity bucket. A role on a
      // quiet product is as findable as a role on a busy one, which is most of
      // what a directory of small open products is for.
      const res = await sql.execute<{
        id: string;
        title: string;
        slug: string;
        commitment: string | null;
        created_at: string | Date;
      }>(
        `SELECT r.id, r.title, p.slug, r.commitment, r.created_at
           FROM openproduct.role_openings r
           JOIN openproduct.profiles p ON p.id = r.profile_id
          WHERE r.status = 'open'
            AND ${listed("p")}
          ORDER BY r.created_at DESC, r.id
          LIMIT $1`,
        [Math.min(Math.max(1, limit), 50)],
      );
      return res.rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        commitment: row.commitment,
        createdAt: iso(row.created_at)!,
      }));
    },

    async countMakerActivity(subjectId) {
      // ONE READ, THREE SUBQUERIES, and each one applies the SAME visibility
      // filter its list applies. A counter computed under looser rules than
      // the tab beneath it is the defect this milestone is most likely to
      // ship: the number would be right about the database and wrong about
      // the page.
      const res = await sql.execute<{
        launched: string | number;
        upvotes_given: string | number;
        comments: string | number;
      }>(
        `SELECT
           (SELECT count(DISTINCT l.id)
              FROM openproduct.launches l
              JOIN openproduct.profiles p ON p.id = l.profile_id
              JOIN openproduct.listing_maintainers lm ON lm.profile_id = l.profile_id
             WHERE lm.subject_id = $1
               AND l.state = 'live'
               AND ${listed("p")}) AS launched,
           (SELECT count(*)
              FROM openproduct.endorsements e
              JOIN openproduct.profiles p ON p.id = e.profile_id
             WHERE e.subject_id = $1
               AND e.withdrawn_at IS NULL
               AND ${listed("p")}) AS upvotes_given,
           -- POSTS, not listings: the tab lists listings, and the tab's own
           -- label counts what the person WROTE. Somebody with forty comments
           -- across three products has said forty things.
           (SELECT count(*)
              FROM openproduct.posts po
              JOIN openproduct.threads th ON th.id = po.thread_id
              JOIN openproduct.profiles p ON p.id = th.profile_id
             WHERE po.author_subject_id = $1
               AND po.moderation_state = 'visible'
               AND th.state <> 'removed'
               AND ${listed("p")}) AS comments`,
        [subjectId],
      );
      const row = res.rows[0];
      return {
        launched: Number(row?.launched ?? 0),
        upvotesGiven: Number(row?.upvotes_given ?? 0),
        comments: Number(row?.comments ?? 0),
      };
    },

    async listMakerLaunches(subjectId, limit) {
      const capped = Math.min(Math.max(1, Math.trunc(limit) || 0), 100);
      // `board` is every counted launch on the days this person launched on —
      // the set the ordinal is measured against. Restricting it to those days
      // rather than to this person's launches is the whole point: a rank is a
      // position among EVERYBODY who launched that day.
      const res = await sql.execute<{
        launch_id: string;
        slug: string;
        tagline: string | null;
        version_label: string;
        launched_at: string | Date;
        day: string;
        counted: string | number | null;
        rank: string | number | null;
      }>(
        `WITH mine AS (
           SELECT DISTINCT l.id AS launch_id, l.profile_id, p.slug, p.tagline,
                  l.version_label, l.launched_at,
                  to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
             FROM openproduct.launches l
             JOIN openproduct.profiles p ON p.id = l.profile_id
             JOIN openproduct.listing_maintainers lm ON lm.profile_id = l.profile_id
            WHERE lm.subject_id = $1
              AND l.state = 'live'
              AND ${listed("p")}
         ),
         board AS (
           SELECT DISTINCT ON (l.id)
                  l.id AS launch_id, l.launched_at, p.slug,
                  to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                  m.value AS counted
             FROM openproduct.launches l
             JOIN openproduct.profiles p ON p.id = l.profile_id
             JOIN openproduct.metrics m
                    ON m.profile_id = l.profile_id
                   AND m.metric = 'launch'
                   AND m.window_key = to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
            WHERE l.state = 'live'
              AND ${listed("p")}
              AND to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
                    IN (SELECT day FROM mine)
            ORDER BY l.id, m.observed_at DESC
         )
         SELECT mine.launch_id, mine.slug, mine.tagline, mine.version_label,
                mine.launched_at, mine.day, b.counted,
                -- NO METRIC, NO ORDINAL. A day the sweep has not counted yet
                -- has no order to be in, and \`1\` would be a claim nobody made.
                CASE WHEN b.launch_id IS NULL THEN NULL ELSE (
                  SELECT count(*) + 1 FROM board b2
                   WHERE b2.day = mine.day
                     AND (b2.counted > b.counted
                       OR (b2.counted = b.counted
                         AND (b2.launched_at < mine.launched_at
                           OR (b2.launched_at = mine.launched_at AND b2.slug < mine.slug))))
                ) END AS rank
           FROM mine
           LEFT JOIN board b ON b.launch_id = mine.launch_id
          ORDER BY mine.launched_at DESC, mine.slug
          LIMIT $2`,
        [subjectId, capped],
      );
      return res.rows.map((row) => ({
        launchId: row.launch_id,
        slug: row.slug,
        tagline: row.tagline,
        versionLabel: row.version_label,
        launchedAt: iso(row.launched_at)!,
        day: row.day,
        rank: row.rank === null ? null : Number(row.rank),
        counted: row.counted === null ? 0 : Number(row.counted),
      }));
    },

    async listMakerUpvotes(subjectId, limit) {
      const capped = Math.min(Math.max(1, Math.trunc(limit) || 0), 100);
      // `withdrawn_at IS NULL` and nothing about `state`: a PENDING upvote
      // (TS1's trust floor) is an act this person took, with their name on it,
      // that does not move the listing's total yet. Hiding it would make the
      // page disagree with what they did; counting it into somebody else's
      // total would break the floor. It is listed, and `counting` says which.
      const res = await sql.execute<{
        slug: string;
        tagline: string | null;
        created_at: string | Date;
        state: string;
      }>(
        `SELECT p.slug, p.tagline, e.created_at, e.state
           FROM openproduct.endorsements e
           JOIN openproduct.profiles p ON p.id = e.profile_id
          WHERE e.subject_id = $1
            AND e.withdrawn_at IS NULL
            AND ${listed("p")}
          ORDER BY e.created_at DESC, p.slug
          LIMIT $2`,
        [subjectId, capped],
      );
      return res.rows.map((row) => ({
        slug: row.slug,
        tagline: row.tagline,
        at: iso(row.created_at)!,
        counting: row.state === "confirmed",
      }));
    },

    async listMakerComments(subjectId, limit) {
      const capped = Math.min(Math.max(1, Math.trunc(limit) || 0), 100);
      // GROUPED TO THE LISTING, which is what makes this a directory read
      // rather than a transcript. `thread_id` comes back only when every one
      // of their comments on that listing is in the same thread — otherwise
      // there is no single conversation to send a reader to, and the listing's
      // own discussion is the honest landing.
      const res = await sql.execute<{
        slug: string;
        tagline: string | null;
        comments: string | number;
        last_at: string | Date;
        thread_id: string | null;
      }>(
        `SELECT p.slug, p.tagline,
                count(*) AS comments,
                max(po.created_at) AS last_at,
                CASE WHEN count(DISTINCT po.thread_id) = 1
                     THEN min(po.thread_id::text) ELSE NULL END AS thread_id
           FROM openproduct.posts po
           JOIN openproduct.threads th ON th.id = po.thread_id
           JOIN openproduct.profiles p ON p.id = th.profile_id
          WHERE po.author_subject_id = $1
            AND po.moderation_state = 'visible'
            AND th.state <> 'removed'
            AND ${listed("p")}
          GROUP BY p.slug, p.tagline
          ORDER BY max(po.created_at) DESC, p.slug
          LIMIT $2`,
        [subjectId, capped],
      );
      return res.rows.map((row) => ({
        slug: row.slug,
        tagline: row.tagline,
        comments: Number(row.comments),
        lastAt: iso(row.last_at)!,
        threadId: row.thread_id,
      }));
    },

    // PE1 — the ledger beneath the counters: four kinds of act, one list,
    // newest first. Each branch carries the SAME filter its tab carries
    // (`listMakerLaunches`, `listMakerUpvotes`, `listMakerComments`), so a row
    // on the history page is a row on its tab and never a fourth opinion. The
    // cursor is a moment: everything strictly before it, which is stable
    // however many acts follow.
    async listMakerHistory(subjectId, limit, before) {
      const capped = Math.min(Math.max(1, Math.trunc(limit) || 0), 100);
      const res = await sql.execute<{
        kind: "launched" | "commented" | "endorsed" | "confirmed";
        at: string | Date;
        slug: string;
        tagline: string | null;
        detail: string | null;
        ref: string | null;
      }>(
        `WITH acts AS (
           SELECT 'launched'::text AS kind, l.launched_at AS at, p.slug, p.tagline,
                  l.version_label AS detail, NULL::text AS ref
             FROM openproduct.launches l
             JOIN openproduct.profiles p ON p.id = l.profile_id
             JOIN openproduct.listing_maintainers lm ON lm.profile_id = l.profile_id
            WHERE lm.subject_id = $1
              AND l.state = 'live'
              AND l.launched_at IS NOT NULL
              AND ${listed("p")}
           UNION ALL
           SELECT 'endorsed', e.created_at, p.slug, p.tagline, NULL, NULL
             FROM openproduct.endorsements e
             JOIN openproduct.profiles p ON p.id = e.profile_id
            WHERE e.subject_id = $1
              AND e.withdrawn_at IS NULL
              AND ${listed("p")}
           UNION ALL
           SELECT 'commented', po.created_at, p.slug, p.tagline, th.title, th.id::text
             FROM openproduct.posts po
             JOIN openproduct.threads th ON th.id = po.thread_id
             JOIN openproduct.profiles p ON p.id = th.profile_id
            WHERE po.author_subject_id = $1
              AND po.moderation_state = 'visible'
              AND th.state <> 'removed'
              AND ${listed("p")}
           UNION ALL
           SELECT 'confirmed', pp.confirmed_at, p.slug, p.tagline,
                  COALESCE(pm.role_label, pp.role_label), NULL
             FROM openproduct.product_people pp
             JOIN openproduct.profiles p ON p.id = pp.profile_id
             LEFT JOIN openproduct.published_maintainers pm
                    ON pm.profile_id = pp.profile_id AND pm.subject_id = pp.subject_id
            WHERE pp.subject_id = $1
              AND pp.confirmed_at IS NOT NULL
              AND ${listed("p")}
         )
         SELECT kind, at, slug, tagline, detail, ref
           FROM acts
          WHERE ($3::timestamptz IS NULL OR at < $3::timestamptz)
          ORDER BY at DESC, kind, slug
          LIMIT $2`,
        [subjectId, capped, before],
      );
      return res.rows.map((row) => ({
        kind: row.kind,
        at: iso(row.at)!,
        slug: row.slug,
        tagline: row.tagline,
        detail: row.detail,
        ref: row.ref,
      }));
    },

    // PE2 — the two reads the person's marks are made of. Both under the
    // same `listed` filter the tabs use: a listing that left the directory
    // takes its launches and its clean-vote mark with it.
    async firstMakerLaunchDay(subjectId) {
      const res = await sql.execute<{ day: string | null }>(
        `SELECT to_char(min(l.launched_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
           FROM openproduct.launches l
           JOIN openproduct.profiles p ON p.id = l.profile_id
           JOIN openproduct.listing_maintainers lm ON lm.profile_id = l.profile_id
          WHERE lm.subject_id = $1
            AND l.state = 'live'
            AND l.launched_at IS NOT NULL
            AND ${listed("p")}`,
        [subjectId],
      );
      return res.rows[0]?.day ?? null;
    },

    async countMakerCleanVoteListings(subjectId) {
      const res = await sql.execute<{ n: string | number }>(
        `SELECT count(*) AS n
           FROM openproduct.profiles p
           JOIN openproduct.listing_maintainers lm ON lm.profile_id = p.id
          WHERE lm.subject_id = $1
            AND p.clean_votes = true
            AND ${listed("p")}`,
        [subjectId],
      );
      return Number(res.rows[0]?.n ?? 0);
    },

    async listPublishedCollections(limit) {
      // THE COUNT IS THE VISIBLE COUNT. Counting `collection_items` would be
      // one fewer subquery and would make a card promise eight where the page
      // shows five — a number the page could have got right and did not.
      const res = await sql.execute<{
        slug: string;
        title: string;
        blurb: string | null;
        handle: string;
        published_at: string | Date;
        n: string | number;
      }>(
        `SELECT c.slug, c.title, c.blurb, h.handle, c.published_at,
                (SELECT count(*)
                   FROM openproduct.collection_items ci
                   JOIN openproduct.profiles p ON p.id = ci.profile_id
                  WHERE ci.collection_id = c.id AND ${listed("p")}) AS n
           FROM openproduct.collections c
           ${handleJoinFor("c.curator_subject_id")}
          WHERE c.state = 'published'
            -- A collection whose curator stopped resolving is not rendered.
            -- The judgement was only publishable while it was attributable.
            AND h.handle IS NOT NULL
          ORDER BY c.published_at DESC
          LIMIT $1`,
        [Math.min(Math.max(1, limit), 200)],
      );
      return res.rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        blurb: row.blurb,
        curatorHandle: row.handle,
        publishedAt: iso(row.published_at)!,
        count: Number(row.n),
      }));
    },

    async getPublicCollection(slug) {
      const head = await sql.execute<{
        id: string;
        slug: string;
        title: string;
        blurb: string | null;
        handle: string;
        published_at: string | Date;
      }>(
        `SELECT c.id, c.slug, c.title, c.blurb, h.handle, c.published_at
           FROM openproduct.collections c
           ${handleJoinFor("c.curator_subject_id")}
          WHERE lower(c.slug) = lower($1)
            AND c.state = 'published'
            AND h.handle IS NOT NULL`,
        [slug],
      );
      const row = head.rows[0];
      if (!row) return null;

      // THE ITEMS, THROUGH `listed()` — the same posture `listSavedPublicCards`
      // takes, and for the same reason: a listing unpublished after being
      // chosen must not leak through the collection. The ROW SURVIVES, so if
      // the listing comes back the item comes back in its old position.
      const items = await sql.execute<CardRow & { note: string | null }>(
        `SELECT ${CARD_COLUMNS}, ci.note
           FROM openproduct.collection_items ci
           JOIN openproduct.profiles p ON p.id = ci.profile_id
          WHERE ci.collection_id = $1 AND ${listed("p")}
          -- The curator's order, and the only order this surface has.
          ORDER BY ci.position ASC`,
        [row.id],
      );

      return {
        slug: row.slug,
        title: row.title,
        blurb: row.blurb,
        curatorHandle: row.handle,
        publishedAt: iso(row.published_at)!,
        items: items.rows.map((item) => ({ card: cardOf(item), note: item.note })),
      };
    },

    async listCollectionsForCurator(subjectId) {
      // BOTH COUNTS. A curator editing a draft needs to know an item is there
      // even while it is not public — telling them only the visible count
      // would make a listing that went private look like something they had
      // deleted.
      const res = await sql.execute<{
        id: string;
        slug: string;
        title: string;
        blurb: string | null;
        state: string;
        published_at: string | Date | null;
        held: string | number;
        visible: string | number;
      }>(
        `SELECT c.id, c.slug, c.title, c.blurb, c.state, c.published_at,
                (SELECT count(*) FROM openproduct.collection_items ci
                  WHERE ci.collection_id = c.id) AS held,
                (SELECT count(*) FROM openproduct.collection_items ci2
                   JOIN openproduct.profiles p ON p.id = ci2.profile_id
                  WHERE ci2.collection_id = c.id AND ${listed("p")}) AS visible
           FROM openproduct.collections c
          WHERE c.curator_subject_id = $1
          ORDER BY c.created_at DESC`,
        [subjectId],
      );
      return res.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        blurb: row.blurb,
        state: row.state,
        publishedAt: iso(row.published_at),
        held: Number(row.held),
        visible: Number(row.visible),
      }));
    },

    async getCuratorCollection(id, subjectId) {
      // SCOPED BY CURATOR IN THE WHERE, not checked above it: an ownership
      // test a caller can forget is an ownership test somebody will forget.
      const res = await sql.execute<{
        id: string;
        slug: string;
        title: string;
        blurb: string | null;
        state: string;
        published_at: string | Date | null;
        held: string | number;
        visible: string | number;
      }>(
        `SELECT c.id, c.slug, c.title, c.blurb, c.state, c.published_at,
                (SELECT count(*) FROM openproduct.collection_items ci
                  WHERE ci.collection_id = c.id) AS held,
                (SELECT count(*) FROM openproduct.collection_items ci2
                   JOIN openproduct.profiles p ON p.id = ci2.profile_id
                  WHERE ci2.collection_id = c.id AND ${listed("p")}) AS visible
           FROM openproduct.collections c
          WHERE c.id = $1 AND c.curator_subject_id = $2`,
        [id, subjectId],
      );
      const row = res.rows[0];
      return row
        ? {
            id: row.id,
            slug: row.slug,
            title: row.title,
            blurb: row.blurb,
            state: row.state,
            publishedAt: iso(row.published_at),
            held: Number(row.held),
            visible: Number(row.visible),
          }
        : null;
    },

    async createCollection(input) {
      // ON CONFLICT DO NOTHING against the slug index, so a taken address is
      // a null rather than a thrown error the caller has to classify by
      // reading a driver message.
      const res = await sql.execute<CollectionRowSql>(
        `INSERT INTO openproduct.collections
           (id, slug, title, blurb, curator_subject_id, state, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'draft', $6, $6)
         ON CONFLICT DO NOTHING
         RETURNING id, slug, title, blurb, curator_subject_id, state, published_at, retired_at`,
        [input.id, input.slug, input.title, input.blurb, input.curatorSubjectId, input.at],
      );
      const row = res.rows[0];
      return row ? collectionOf(row) : null;
    },

    async addCollectionItem(input) {
      // THE LISTING MUST BE PUBLICLY ADDABLE, checked in the INSERT's own
      // SELECT rather than in a read above it — a check split from the write
      // is a check a race can walk through, and this one decides whether a
      // private listing can be named on a public page.
      //
      // Appended at the end of the curator's order: `position` is one past
      // whatever is there, and the whole set is renumbered by `reorder` when
      // they move something.
      const res = await sql.execute<{ profile_id: string }>(
        `INSERT INTO openproduct.collection_items (collection_id, profile_id, position, note, added_at)
         SELECT $1, p.id,
                COALESCE((SELECT max(ci.position) + 1 FROM openproduct.collection_items ci
                           WHERE ci.collection_id = $1), 0),
                $3, $4
           FROM openproduct.profiles p
          WHERE lower(p.slug) = lower($2) AND ${listed("p")}
         ON CONFLICT DO NOTHING
         RETURNING profile_id`,
        [input.collectionId, input.slug, input.note, input.at],
      );
      return res.rows.length > 0;
    },

    async removeCollectionItem(collectionId, slug) {
      const res = await sql.execute<{ profile_id: string }>(
        `DELETE FROM openproduct.collection_items ci
          USING openproduct.profiles p
          WHERE ci.collection_id = $1
            AND p.id = ci.profile_id
            AND lower(p.slug) = lower($2)
         RETURNING ci.profile_id`,
        [collectionId, slug],
      );
      return res.rows.length > 0;
    },

    async reorderCollectionItems(collectionId, slugs, at) {
      // DENSE RENUMBERING from the order given. Sparse positions rot: after
      // enough moves two items collide and the order becomes whatever the
      // planner returned, which on the one surface whose entire point is the
      // curator's order is that surface failing at its only job.
      //
      // Bounded by MAX_COLLECTION_ITEMS, so "one statement per item" is at
      // most fifty statements on an act a person takes by hand.
      let moved = 0;
      for (const [index, slug] of slugs.entries()) {
        const res = await sql.execute<{ profile_id: string }>(
          `UPDATE openproduct.collection_items ci
              SET position = $3
             FROM openproduct.profiles p
            WHERE ci.collection_id = $1
              AND p.id = ci.profile_id
              AND lower(p.slug) = lower($2)
           RETURNING ci.profile_id`,
          [collectionId, slug, index],
        );
        if (res.rows.length > 0) moved += 1;
      }
      if (moved > 0) {
        await sql.execute(`UPDATE openproduct.collections SET updated_at = $2 WHERE id = $1`, [
          collectionId,
          at,
        ]);
      }
      return moved;
    },

    async setCollectionState(id, subjectId, state, at) {
      // SCOPED BY CURATOR, and only from a state the transition is legal
      // from: publish from draft, retire from published. A retired collection
      // keeps its `published_at`, so its history reads correctly, and its
      // address stays taken — a link somebody shared must not become
      // somebody else's page later.
      const res = await sql.execute<CollectionRowSql>(
        state === "published"
          ? `UPDATE openproduct.collections
                SET state = 'published', published_at = $3, updated_at = $3
              WHERE id = $1 AND curator_subject_id = $2 AND state = 'draft'
             RETURNING id, slug, title, blurb, curator_subject_id, state, published_at, retired_at`
          : `UPDATE openproduct.collections
                SET state = 'retired', retired_at = $3, updated_at = $3
              WHERE id = $1 AND curator_subject_id = $2 AND state = 'published'
             RETURNING id, slug, title, blurb, curator_subject_id, state, published_at, retired_at`,
        [id, subjectId, at],
      );
      const row = res.rows[0];
      return row ? collectionOf(row) : null;
    },

    // ─── the launch board (openproduct-commons LC3) ───

    async listLaunchesOnDay(startIso, endIso) {
      // RAW ENDORSEMENTS, NOT A COUNT. `boardEligible` (TS4) owns what
      // "existed before the launch" means, and re-expressing that rule in SQL
      // is how the published sentence and the actual order come to disagree.
      // So the database answers with facts and the contract decides.
      //
      // The integrity discount IS applied here, because that is not the
      // board's rule — it is EN3's, already true of every other surface, and
      // a board that counted discounted endorsements would disagree with the
      // listing's own page about the same number.
      const res = await sql.execute<{
        launch_id: string;
        profile_id: string;
        slug: string;
        tagline: string | null;
        version_label: string;
        launched_at: string | Date;
        subject_id: string | null;
        subject_first_seen_at: string | Date | null;
      }>(
        `SELECT l.id AS launch_id, l.profile_id, p.slug, p.tagline,
                l.version_label, l.launched_at,
                e.subject_id,
                (SELECT min(e2.created_at)
                   FROM openproduct.endorsements e2
                  WHERE e2.subject_id = e.subject_id) AS subject_first_seen_at
           FROM openproduct.launches l
           JOIN openproduct.profiles p ON p.id = l.profile_id
           LEFT JOIN openproduct.endorsements e
                  ON e.profile_id = l.profile_id
                 AND e.withdrawn_at IS NULL
                 AND e.state = 'confirmed'
                 -- DURING THE DAY, not a trailing window. LC1 made this
                 -- argument for the digest week and it is the same one: a
                 -- board for a past day read today must answer about the
                 -- hours it names.
                 AND e.created_at >= $1 AND e.created_at < $2
                 AND NOT EXISTS (
                       SELECT 1 FROM openproduct.endorsement_integrity i
                        WHERE i.profile_id = e.profile_id
                          AND i.subject_id = e.subject_id
                          AND i.reversed_at IS NULL)
          WHERE l.state = 'live'
            AND l.launched_at >= $1 AND l.launched_at < $2
            AND ${listed("p")}
          ORDER BY l.launched_at ASC, l.id, e.subject_id`,
        [startIso, endIso],
      );

      // A LEFT JOIN, so a launch nobody endorsed still ranks — with nothing,
      // which is a real position and a common one. A launch that vanished
      // because it had no endorsements would be indistinguishable from one
      // that never happened.
      const byLaunch = new Map<string, BoardLaunchRecord>();
      for (const row of res.rows) {
        let record = byLaunch.get(row.launch_id);
        if (!record) {
          record = {
            launchId: row.launch_id,
            profileId: row.profile_id,
            slug: row.slug,
            tagline: row.tagline,
            versionLabel: row.version_label,
            launchedAt: iso(row.launched_at)!,
            endorsements: [],
          };
          byLaunch.set(row.launch_id, record);
        }
        if (row.subject_id !== null && row.subject_first_seen_at !== null) {
          record.endorsements.push({
            subjectId: row.subject_id,
            subjectFirstSeenAt: iso(row.subject_first_seen_at)!,
          });
        }
      }
      return [...byLaunch.values()];
    },

    async listBoardDays(limit) {
      const res = await sql.execute<{ day: string; n: string | number }>(
        `SELECT to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                count(*) AS n
           FROM openproduct.launches l
           JOIN openproduct.profiles p ON p.id = l.profile_id
          WHERE l.state = 'live'
            AND ${listed("p")}
          GROUP BY 1
          ORDER BY 1 DESC
          LIMIT $1`,
        [Math.min(Math.max(1, limit), 400)],
      );
      return res.rows.map((row) => ({ day: row.day, launches: Number(row.n) }));
    },

    async writeBoardRanks(input) {
      // TWO METRIC ROWS PER LAUNCH: the counted figure decides the position,
      // the ineligible one is what makes that position accountable to a maker
      // comparing it against the total on their own page.
      //
      // The WINDOW IS THE DAY rather than a duration, which bends SN0's
      // convention on purpose (the contract's BOARD_METRIC says why): a board
      // is per-day and a settled day never changes, so the natural key is
      // WHICH BOARD, not how far back it looked. Keying by duration would
      // give one row per listing that tomorrow overwrites, and the archive
      // would be gone.
      let written = 0;
      for (const rank of input.ranks) {
        await sql.execute(
          `INSERT INTO openproduct.metrics
             (id, profile_id, metric, window_key, value, source, observed_at)
           VALUES ($1, $2, 'launch', $3, $4, 'operator', $5)`,
          [rank.countedId, rank.profileId, input.day, rank.counted, input.observedAt],
        );
        await sql.execute(
          `INSERT INTO openproduct.metrics
             (id, profile_id, metric, window_key, value, source, observed_at)
           VALUES ($1, $2, 'launch_ineligible', $3, $4, 'operator', $5)`,
          [rank.ineligibleId, rank.profileId, input.day, rank.ineligible, input.observedAt],
        );
        // LC0 carried `board_rank_at` for exactly this and nothing has
        // written it until now: an operator asking "has this day been ranked"
        // gets an answer from the launch rather than from a metric's absence.
        await sql.execute(
          `UPDATE openproduct.launches SET board_rank_at = $2 WHERE id = $1`,
          [rank.launchId, input.observedAt],
        );
        written += 1;
      }
      return written;
    },

    async readBoardRanks(day) {
      // The latest write for each launch on this day. `DISTINCT ON` rather
      // than a max-subquery so a recompute of an OPEN day supersedes its
      // predecessor cleanly; a settled day is written once and this reads the
      // one row there is.
      const res = await sql.execute<{
        launch_id: string;
        profile_id: string;
        slug: string;
        tagline: string | null;
        version_label: string;
        launched_at: string | Date;
        counted: string | number;
        ineligible: string | number | null;
        observed_at: string | Date;
      }>(
        `SELECT DISTINCT ON (l.id)
                l.id AS launch_id, l.profile_id, p.slug, p.tagline,
                l.version_label, l.launched_at,
                m.value AS counted,
                (SELECT mi.value FROM openproduct.metrics mi
                  WHERE mi.profile_id = l.profile_id
                    AND mi.metric = 'launch_ineligible'
                    AND mi.window_key = $1
                  ORDER BY mi.observed_at DESC LIMIT 1) AS ineligible,
                m.observed_at
           FROM openproduct.launches l
           JOIN openproduct.profiles p ON p.id = l.profile_id
           JOIN openproduct.metrics m
                  ON m.profile_id = l.profile_id
                 AND m.metric = 'launch'
                 AND m.window_key = $1
          WHERE l.state = 'live'
            -- OS4 — THE RANGE FIRST, so the live index serves the day. The
            -- day is the same UTC day the to_char below names; the range is
            -- what an index can be asked for, the to_char is what the board
            -- means, and both are kept so the meaning is not in a cast.
            AND l.launched_at >= ($1 || 'T00:00:00Z')::timestamptz
            AND l.launched_at <  ($1 || 'T00:00:00Z')::timestamptz + interval '1 day'
            AND to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') = $1
            AND ${listed("p")}
          ORDER BY l.id, m.observed_at DESC`,
        [day],
      );
      return res.rows.map((row) => ({
        launchId: row.launch_id,
        profileId: row.profile_id,
        slug: row.slug,
        tagline: row.tagline,
        versionLabel: row.version_label,
        launchedAt: iso(row.launched_at)!,
        counted: Number(row.counted),
        ineligible: Number(row.ineligible ?? 0),
        observedAt: iso(row.observed_at)!,
      }));
    },

    /**
     * OL2 — the feed's whole window in one round trip.
     *
     * WHAT THIS IS NOT: it is not `listLaunchesOnDay`. That one returns the
     * RAW endorsement rows for a day so the sweep can rank them, and running
     * it on the request path is the aggregate OL-2a exists to avoid. This
     * reads the sweep's OUTPUT — the `launch` metric it already wrote — and
     * the position falls out of ordering that number, not out of counting
     * anything.
     *
     * `rank` IS COMPUTED HERE rather than stored, and that is not a
     * contradiction of OL-2a: the ORDER is the board's, read from the metric
     * the sweep wrote; the ordinal is just where a row sits in it. The
     * tiebreaks are `rankBoard`'s, in the same sequence, because a feed that
     * ordered ties differently from the archive would put the same two
     * launches in two different orders on two pages.
     *
     * A LEFT JOIN on the metric, so a launch the sweep has not reached still
     * appears — with a null rank, which the row renders as an absent position
     * rather than as zero. A launch that vanished from the feed because a
     * cron was late would be the same failure LC0 wrote `missed` to avoid: a
     * launch that happened and that nothing on the estate admits happened.
     */
    async listFeedLaunches(dayIds) {
      const days = [...new Set(dayIds)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      if (days.length === 0) return [];
      const res = await sql.execute<
        CardRow & {
          launch_id: string;
          profile_id: string;
          version_label: string;
          launched_at: string | Date;
          day: string;
          counted: string | number | null;
          ineligible: string | number | null;
          comment_count: string | number | null;
        }
      >(
        `SELECT DISTINCT ON (l.id)
                l.id AS launch_id, l.profile_id, l.version_label, l.launched_at,
                to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                m.value AS counted,
                (SELECT mi.value FROM openproduct.metrics mi
                  WHERE mi.profile_id = l.profile_id
                    AND mi.metric = 'launch_ineligible'
                    AND mi.window_key = to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
                  ORDER BY mi.observed_at DESC LIMIT 1) AS ineligible,
                -- VISIBLE posts only, so the number beside a row and the
                -- discussion a reader finds under it are the same number.
                (SELECT count(*)
                   FROM openproduct.posts po
                   JOIN openproduct.threads th ON th.id = po.thread_id
                  WHERE th.profile_id = l.profile_id
                    AND th.state <> 'removed'
                    AND po.moderation_state = 'visible') AS comment_count,
                ${CARD_COLUMNS}
           FROM openproduct.launches l
           JOIN openproduct.profiles p ON p.id = l.profile_id
           LEFT JOIN openproduct.metrics m
                  ON m.profile_id = l.profile_id
                 AND m.metric = 'launch'
                 AND m.window_key = to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          WHERE l.state = 'live'
            -- OS4 — a bounding range over the window's days, so the live
            -- index serves the feed; the to_char membership then names the
            -- days exactly, as before.
            AND l.launched_at >= ($2 || 'T00:00:00Z')::timestamptz
            AND l.launched_at <  ($3 || 'T00:00:00Z')::timestamptz + interval '1 day'
            AND to_char(l.launched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') = ANY($1::text[])
            AND ${listed("p")}
          ORDER BY l.id, m.observed_at DESC`,
        [days, [...days].sort()[0], [...days].sort().at(-1)],
      );

      // THE ORDINAL, per day, from `rankBoard`'s own comparison. Rows with no
      // metric get no ordinal at all rather than being ranked among those
      // that have one.
      const byDay = new Map<string, typeof res.rows>();
      for (const row of res.rows) {
        const list = byDay.get(row.day) ?? [];
        list.push(row);
        byDay.set(row.day, list);
      }
      const rankOf = new Map<string, number>();
      for (const rows of byDay.values()) {
        rows
          .filter((row) => row.counted !== null)
          .sort(
            (a, b) =>
              Number(b.counted) - Number(a.counted) ||
              Date.parse(iso(a.launched_at)!) - Date.parse(iso(b.launched_at)!) ||
              a.slug.localeCompare(b.slug),
          )
          .forEach((row, index) => rankOf.set(row.launch_id, index + 1));
      }

      return res.rows.map((row) => {
        const card = cardOf(row);
        return {
          launchId: row.launch_id,
          profileId: row.profile_id,
          slug: card.slug,
          tagline: card.tagline,
          versionLabel: row.version_label,
          launchedAt: iso(row.launched_at)!,
          day: row.day,
          rank: rankOf.get(row.launch_id) ?? null,
          counted: row.counted === null ? 0 : Number(row.counted),
          ineligible: Number(row.ineligible ?? 0),
          licence: card.licence,
          category: card.category,
          stack: card.stackCanonical,
          roleOpeningCount: card.roleOpeningCount,
          commentCount: Number(row.comment_count ?? 0),
        };
      });
    },

    async getEndorsement(profileId, subjectId) {
      const res = await sql.execute<EndorsementRowSql>(
        `SELECT profile_id, subject_id, state, created_at, withdrawn_at FROM openproduct.endorsements
          WHERE profile_id = $1 AND subject_id = $2`,
        [profileId, subjectId],
      );
      return res.rows[0] ? endorsementOf(res.rows[0]) : null;
    },

    async endorse(profileId, subjectId, state, at) {
      // IDEMPOTENT AND ROW-REUSING. The key is the pair, so endorsing twice
      // is a no-op and re-endorsing after a withdrawal clears `withdrawn_at`
      // on the SAME row — "endorsed, withdrew, endorsed again" is one row
      // with a history rather than three facts nobody can reconcile.
      //
      // `created_at` is NOT rewritten on re-endorsement: the trailing-week
      // figure is about when somebody first said this, and re-stamping would
      // let a withdraw/re-endorse cycle manufacture recency.
      const res = await sql.execute<EndorsementRowSql>(
        `INSERT INTO openproduct.endorsements (profile_id, subject_id, state, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (profile_id, subject_id) DO UPDATE
            SET withdrawn_at = NULL,
                state        = EXCLUDED.state
         RETURNING profile_id, subject_id, state, created_at, withdrawn_at`,
        [profileId, subjectId, state, at],
      );
      return endorsementOf(res.rows[0]!);
    },

    async withdrawEndorsement(profileId, subjectId, at) {
      // NEVER a DELETE. EN3's integrity sweep has to be able to restate a
      // public total without erasing what it restated, and a deleted row
      // cannot be restated.
      const res = await sql.execute<EndorsementRowSql>(
        `UPDATE openproduct.endorsements
            SET withdrawn_at = $3
          WHERE profile_id = $1 AND subject_id = $2 AND withdrawn_at IS NULL
         RETURNING profile_id, subject_id, state, created_at, withdrawn_at`,
        [profileId, subjectId, at],
      );
      return res.rows[0] ? endorsementOf(res.rows[0]) : null;
    },

    async refreshEndorsementCounts(input: { now: string; republishBefore: string }): Promise<number> {
      // The count is `countEndorsements`' (confirmed, not withdrawn, not
      // discounted by a standing integrity decision; `recent` is the trailing
      // seven days), for every listed build in one scan. A metric row is
      // APPENDED, never updated (SN0's store), and only where it says
      // something the latest row does not: a moved count, or a quiet one
      // whose observation is about to leave its freshness window.
      //
      // Opens with INSERT, so OPP10's read guard does not hold it to the
      // no-volatile rule `gen_random_uuid()` would break: this is a write.
      const res = await sql.execute(
        `INSERT INTO openproduct.metrics (id, profile_id, metric, window_key, value, source, observed_at)
         WITH counted AS (
           SELECT p.id AS profile_id,
                  count(e.subject_id) FILTER (WHERE i.profile_id IS NULL) AS total,
                  count(e.subject_id) FILTER (
                    WHERE i.profile_id IS NULL
                      AND e.created_at >= ($1::timestamptz - INTERVAL '7 days')
                  ) AS recent
             FROM openproduct.profiles p
             LEFT JOIN openproduct.endorsements e
               ON e.profile_id = p.id AND e.withdrawn_at IS NULL AND e.state = 'confirmed'
             LEFT JOIN openproduct.endorsement_integrity i
               ON i.profile_id = e.profile_id AND i.subject_id = e.subject_id
              AND i.reversed_at IS NULL
            WHERE ${listed("p")}
            GROUP BY p.id
         ),
         windows AS (
           SELECT profile_id, 'total'::text AS window_key, total AS value FROM counted
           UNION ALL
           SELECT profile_id, '7d'::text AS window_key, recent AS value FROM counted
         )
         SELECT gen_random_uuid(), w.profile_id, 'endorsements', w.window_key, w.value,
                'operator', $1::timestamptz
           FROM windows w
           LEFT JOIN LATERAL (
             SELECT m.value, m.observed_at
               FROM openproduct.metrics m
              WHERE m.profile_id = w.profile_id AND m.metric = 'endorsements'
                AND m.window_key = w.window_key
              ORDER BY m.observed_at DESC
              LIMIT 1
           ) latest ON TRUE
          WHERE latest.value IS DISTINCT FROM w.value
             OR latest.observed_at < $2::timestamptz
         RETURNING 1`,
        [input.now, input.republishBefore],
      );
      // Counted from RETURNING: the production executor's `rowCount` is the
      // rows handed back, which a bare INSERT does not hand back.
      return res.rows.length;
    },

    async countEndorsements(profileId, now) {
      // COMPUTED, never read from a counter column (EN-3). A counter cannot
      // be restated without erasing history and drifts the first time a write
      // path forgets it; a count over an append-only log can be restated and
      // stays auditable.
      //
      // The integrity discount is a LEFT JOIN rather than a NOT EXISTS so the
      // two tables stay visibly separate in the one place they meet: this
      // query applies the machine's opinion, and nothing else does.
      //
      // PV3 ADDED `discounted`, AND IT NEVER LEAVES THE SERVER. The clean-vote
      // mark is a boolean over the ratio of this to the total, and computing
      // the ratio here means the count itself has nowhere to travel: no public
      // projection carries it, and `PUBLIC_PROFILE_KEYS` would fail if one
      // tried. EN3's fifth decision and PV3's own done-when both turn on that.
      //
      // The `i.profile_id IS NULL` filter moved into the two FILTER clauses so
      // one query answers both questions over one scan — the discounted rows
      // must be COUNTED here rather than filtered away, which is exactly what
      // the WHERE clause used to do.
      const res = await sql.execute<{
        total: string | number;
        recent: string | number;
        discounted: string | number;
      }>(
        `SELECT
           count(*) FILTER (WHERE i.profile_id IS NULL) AS total,
           count(*) FILTER (
             WHERE i.profile_id IS NULL
               AND e.created_at >= ($2::timestamptz - INTERVAL '7 days')
           ) AS recent,
           count(*) FILTER (WHERE i.profile_id IS NOT NULL) AS discounted
           FROM openproduct.endorsements e
           LEFT JOIN openproduct.endorsement_integrity i
             ON i.profile_id = e.profile_id AND i.subject_id = e.subject_id
            AND i.reversed_at IS NULL
          WHERE e.profile_id = $1
            AND e.withdrawn_at IS NULL
            AND e.state = 'confirmed'`,
        [profileId, now],
      );
      const row = res.rows[0];
      return {
        total: Number(row?.total ?? 0),
        recent: Number(row?.recent ?? 0),
        discounted: Number(row?.discounted ?? 0),
      };
    },

    async recordSnapshot(profileId, takenOn, takenAt, fields) {
      // PV4 — ONE ROW PER LISTING PER DAY, by primary key. The sweep runs
      // every ten minutes; without the conflict clause this would be 144 rows
      // a day per listing and a diff would compare two moments ten minutes
      // apart. `DO UPDATE` rather than `DO NOTHING` so the day's row holds
      // the LATEST shape of that day, which is what a week-ago comparison
      // should read.
      await sql.execute(
        `INSERT INTO openproduct.profile_snapshots (profile_id, taken_on, taken_at, fields)
         VALUES ($1, $2::date, $3, $4::text::jsonb)
         ON CONFLICT (profile_id, taken_on)
         DO UPDATE SET taken_at = EXCLUDED.taken_at, fields = EXCLUDED.fields`,
        [profileId, takenOn, takenAt, JSON.stringify(fields)],
      );
    },

    async latestSnapshotBefore(profileId, beforeDay) {
      // The BASELINE: the most recent snapshot strictly older than the day
      // asked about. Strictly, so today's own row is never its own baseline —
      // which would make every diff empty and look like nothing ever changes.
      const res = await sql.execute<{ taken_at: string | Date; fields: unknown }>(
        `SELECT taken_at, fields
           FROM openproduct.profile_snapshots
          WHERE profile_id = $1 AND taken_on < $2::date
          ORDER BY taken_on DESC
          LIMIT 1`,
        [profileId, beforeDay],
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        takenAt: iso(row.taken_at) ?? beforeDay,
        fields: (row.fields ?? {}) as Record<string, unknown>,
      };
    },

    async listPublicProfilesForSnapshot(limit = 2000) {
      // OS2 — THE WHOLE CORPUS IN ONE READ. PV4 listed ids and then read each
      // profile back one at a time, which was N+1 by construction; the phase
      // now takes the full record here and never asks again. `listed()`, so a
      // delisted or private listing accumulates no history: a snapshot is the
      // public projection at a moment, and a listing with no public projection
      // has no moment to record.
      const res = await sql.execute<ProfileRow>(
        `SELECT ${PROFILE_COLUMNS} FROM openproduct.profiles p
          WHERE ${listed("p")} ORDER BY p.slug ASC LIMIT $1`,
        [Math.min(Math.max(1, Math.trunc(limit)), 5000)],
      );
      return res.rows.map(profileOf);
    },

    async countOpenRoleOpeningsByProfile() {
      // OS2 — the second of the two reads a snapshot tick makes. One GROUP BY
      // for every listing's open-role count, instead of one `listPublicRoleOpenings`
      // per listing. Listings with no open role are ABSENT from the map, and
      // the caller reads that as zero — which is the one place in this
      // product a missing row IS a zero, because "no open roles" is a complete
      // answer about a listing we did count (OPC-C's genuine-zero case).
      const res = await sql.execute<{ profile_id: string; n: string }>(
        `SELECT o.profile_id, count(*) AS n
           FROM openproduct.role_openings o
           JOIN openproduct.profiles p ON p.id = o.profile_id
          WHERE o.status = 'open' AND ${listed("p")}
          GROUP BY o.profile_id`,
      );
      return new Map(res.rows.map((r) => [r.profile_id, Number(r.n)]));
    },

    async getSnapshotSweptAt() {
      // OS2 — the floor, read BEFORE anything else on a snapshot tick.
      const res = await sql.execute<{ swept_at: string | Date | null }>(
        `SELECT swept_at FROM openproduct.snapshot_sweep_state WHERE singleton`,
        [],
      );
      return iso(res.rows[0]?.swept_at ?? null);
    },

    async markSnapshotSwept(at) {
      // Upsert rather than update, for EN3's reason: a database restored
      // without the seed row would otherwise never record a sweep and would
      // snapshot on every tick forever — the defect this floor exists to end,
      // arriving through the floor's own absence.
      await sql.execute(
        `INSERT INTO openproduct.snapshot_sweep_state (singleton, swept_at)
         VALUES (TRUE, $1)
         ON CONFLICT (singleton) DO UPDATE SET swept_at = EXCLUDED.swept_at`,
        [at],
      );
    },

    async listSnapshotPairsInWindow(startDay, endDay, limit = 100) {
      // PV4 — the digest's lead. A week's change for one listing is between
      // the LAST snapshot BEFORE the week and the LAST snapshot IN it, which
      // is the same shape the listing's own diff uses: a baseline, and where
      // it got to.
      //
      // A listing with no snapshot before the week is ABSENT rather than
      // rendered as all-new — the first-snapshot rule, applied to the digest
      // instead of to a page.
      const res = await sql.execute<{
        slug: string;
        from_fields: unknown;
        to_at: string | Date;
        to_fields: unknown;
      }>(
        `WITH latest_in AS (
           SELECT DISTINCT ON (s.profile_id) s.profile_id, s.taken_at, s.fields
             FROM openproduct.profile_snapshots s
            WHERE s.taken_on >= $1::date AND s.taken_on < $2::date
            ORDER BY s.profile_id, s.taken_on DESC
         ),
         baseline AS (
           -- OS5 — bounded to the lookback, not the history: the (taken_on)
           -- index serves a range of days; the whole history was a walk of
           -- every snapshot ever taken (OS0: 6.5 s at a year).
           SELECT DISTINCT ON (s.profile_id) s.profile_id, s.fields
             FROM openproduct.profile_snapshots s
            WHERE s.taken_on < $1::date
              AND s.taken_on >= ($1::date - $4::int)
            ORDER BY s.profile_id, s.taken_on DESC
         )
         SELECT p.slug,
                b.fields  AS from_fields,
                l.taken_at AS to_at,
                l.fields   AS to_fields
           FROM latest_in l
           JOIN baseline b ON b.profile_id = l.profile_id
           JOIN openproduct.profiles p ON p.id = l.profile_id
          WHERE ${listed("p")}
          ORDER BY p.slug ASC
          LIMIT $3`,
        [startDay, endDay, Math.min(Math.max(1, Math.trunc(limit)), 500), SNAPSHOT_BASELINE_LOOKBACK_DAYS],
      );
      return res.rows.map((row) => ({
        slug: row.slug,
        from: (row.from_fields ?? {}) as Record<string, unknown>,
        toAt: iso(row.to_at) ?? endDay,
        to: (row.to_fields ?? {}) as Record<string, unknown>,
      }));
    },

    async setCleanVotes(profileId, clean) {
      // PV3 — WRITTEN BESIDE THE TOTALS, by the one function that already has
      // both numbers. A separate sweep phase would be a second thing that can
      // fall behind, and the mark and the total disagreeing is exactly the
      // confusion this milestone exists to remove.
      await sql.execute(`UPDATE openproduct.profiles SET clean_votes = $2 WHERE id = $1`, [
        profileId,
        clean,
      ]);
    },

    async endorsedSlugsAmong(subjectId, slugs) {
      if (slugs.length === 0) return [];
      // Bounded by the ids the page asked about, exactly like XP2's saved
      // question — the answer is a function of the page rather than of the
      // account's history.
      //
      // `visibility = 'public'` re-asserted here: marking a private slug
      // would confirm that a listing by that name exists.
      const res = await sql.execute<{ slug: string }>(
        `SELECT p.slug
           FROM openproduct.endorsements e
           JOIN openproduct.profiles p ON p.id = e.profile_id
          WHERE e.subject_id = $1
            AND e.withdrawn_at IS NULL
            AND ${listed("p")}
            AND lower(p.slug) = ANY($2::text[])
          ORDER BY p.slug`,
        [subjectId, slugs.map((s) => s.toLowerCase())],
      );
      return res.rows.map((row) => row.slug);
    },

    // ---------------------------------------------------------------------
    // The handle namespace (openproduct-commons CG0).
    // ---------------------------------------------------------------------

    async getHandle(handle) {
      const res = await sql.execute<HandleRowSql>(
        `SELECT handle, subject_id, reserved_for, claimed_at, released_at
           FROM openproduct.handles WHERE handle = lower($1)`,
        [handle],
      );
      const row = res.rows[0];
      return row ? handleOf(row) : null;
    },

    async getActiveHandleForSubject(subjectId) {
      const res = await sql.execute<HandleRowSql>(
        `SELECT handle, subject_id, reserved_for, claimed_at, released_at
           FROM openproduct.handles
          WHERE subject_id = $1 AND released_at IS NULL`,
        [subjectId],
      );
      const row = res.rows[0];
      return row ? handleOf(row) : null;
    },

    async getSubjectsForHandles(handles) {
      // ACTIVE HOLDERS ONLY. A released handle has no holder, and answering
      // with its previous one would attach a follow to somebody who gave the
      // name up — a handle is an address, and addresses change hands.
      const wanted = [...new Set(handles)];
      const out = new Map<string, string>();
      if (wanted.length === 0) return out;
      const res = await sql.execute<{ handle: string; subject_id: string }>(
        `SELECT handle, subject_id
           FROM openproduct.handles
          WHERE handle = ANY($1::text[])
            AND subject_id IS NOT NULL
            AND released_at IS NULL`,
        [wanted],
      );
      for (const row of res.rows) out.set(row.handle, row.subject_id);
      return out;
    },

    async claimHandle(handle, subjectId, at) {
      // THE RULES ARE RE-ASSERTED IN SQL, not trusted from the handler's
      // check. Two people submitting the same handle in the same second is
      // the whole reason this is one statement: the contract decides WHY a
      // claim is refused, and this decides WHO wins.
      //
      // The insert is conditional on the conflicting row being claimable —
      // free (never claimed) or already this subject's. A reserved row has a
      // `reserved_for` and never matches; a released row has a `released_at`
      // and never matches, which is the tombstone doing its job.
      const res = await sql.execute<HandleRowSql>(
        `INSERT INTO openproduct.handles (handle, subject_id, claimed_at)
         VALUES (lower($1), $2, $3)
         ON CONFLICT (handle) DO UPDATE
            SET subject_id = EXCLUDED.subject_id,
                claimed_at = EXCLUDED.claimed_at
          WHERE openproduct.handles.reserved_for IS NULL
            AND openproduct.handles.released_at IS NULL
            AND (openproduct.handles.subject_id IS NULL
                 OR openproduct.handles.subject_id = EXCLUDED.subject_id)
         RETURNING handle, subject_id, reserved_for, claimed_at, released_at`,
        [handle, subjectId, at],
      );
      const row = res.rows[0];
      return row ? handleOf(row) : null;
    },

    async releaseHandle(subjectId, at) {
      // The row SURVIVES. `released_at` is set and the handle is never given
      // to anybody again — a handle is an identity somebody handed out, and
      // re-issuing it hands its accumulated trust to a stranger.
      const res = await sql.execute<HandleRowSql>(
        `UPDATE openproduct.handles
            SET released_at = $2
          WHERE subject_id = $1 AND released_at IS NULL
         RETURNING handle, subject_id, reserved_for, claimed_at, released_at`,
        [subjectId, at],
      );
      const row = res.rows[0];
      return row ? handleOf(row) : null;
    },

    async eraseSubject(subjectId: string, at: string): Promise<SubjectErasure> {
      // CS2 — ONE LIST, READ HERE AND BY THE EXPORT. Before this the exit
      // deleted three tables (the presence, the applications, the saved list)
      // and left about thirty columns carrying the subject: WC-K's third
      // consequence, "a class of row nothing can delete". Now every column the
      // registry classifies is visited, in its class's way, and the
      // information_schema test is what keeps the list complete.
      //
      // Statement per column rather than one transaction: the executor this
      // package is given has none, the statements are independent (no FK
      // joins subject to subject), and a partial run re-run is the same run —
      // every statement matches only rows still carrying the id.
      const columns: Record<string, number> = {};
      let deleted = 0;
      let anonymised = 0;
      // A column keyed to another (the integrity decision to the vote it is
      // about) is rewritten in its parent's statement, so the foreign key —
      // which cascades on delete and not on update — sees both sides moved
      // when it is checked at the statement's end.
      const childrenOf = new Map<string, SubjectColumn[]>();
      for (const entry of OPENPRODUCT_SUBJECT_REGISTRY) {
        if (!entry.withParent) continue;
        const key = `${entry.withParent.table}.${entry.withParent.column}`;
        childrenOf.set(key, [...(childrenOf.get(key) ?? []), entry]);
      }
      for (const entry of OPENPRODUCT_SUBJECT_REGISTRY) {
        if (entry.withParent) continue;
        const where = `${entry.column} = $1` + (entry.when ? ` AND ${entry.when.column} = '${entry.when.equals}'` : "");
        const children = childrenOf.get(subjectEntryKey(entry)) ?? [];
        let res;
        if (children.length > 0) {
          const ctes = [
            `parent AS (UPDATE openproduct.${entry.table} SET ${entry.column} = ${tombstoneSql(entry)} WHERE ${where} RETURNING 1)`,
            ...children.map(
              (c, i) =>
                `child_${i} AS (UPDATE openproduct.${c.table} SET ${c.column} = ${tombstoneSql(c)} WHERE ${c.column} = $1 RETURNING 1)`,
            ),
          ];
          const counts = await sql.execute<Record<string, number | string>>(
            `WITH ${ctes.join(",\n     ")}
             SELECT (SELECT count(*) FROM parent) AS parent_n${children.map((_, i) => `, (SELECT count(*) FROM child_${i}) AS child_${i}_n`).join("")}`,
            [subjectId],
          );
          const row = counts.rows[0] ?? {};
          const parentN = Number(row.parent_n ?? 0);
          anonymised += parentN;
          if (parentN > 0) columns[subjectEntryKey(entry)] = parentN;
          children.forEach((c, i) => {
            const n = Number(row[`child_${i}_n`] ?? 0);
            anonymised += n;
            if (n > 0) columns[subjectEntryKey(c)] = n;
          });
          continue;
        }
        if (entry.class === "theirs") {
          res = await sql.execute(`DELETE FROM openproduct.${entry.table} WHERE ${where}`, [subjectId]);
          deleted += res.rowCount;
        } else {
          const sets = [`${entry.column} = ${tombstoneSql(entry)}`];
          if (entry.alsoSet) sets.push(entry.alsoSet);
          res = await sql.execute(
            `UPDATE openproduct.${entry.table} SET ${sets.join(", ")} WHERE ${where}`,
            entry.alsoSet ? [subjectId, at] : [subjectId],
          );
          anonymised += res.rowCount;
        }
        if (res.rowCount > 0) columns[subjectEntryKey(entry)] = res.rowCount;
      }
      return { deleted, anonymised, columns };
    },

    async exportSubject(subjectId: string, at: string): Promise<SubjectExport> {
      // CS3 — THE REGISTRY, READ AS AN EXPORT. One statement per `rows`
      // column: the row as JSON, less every other classified column on the
      // table (somebody else's id), ordered by the table's first column so
      // two exports of the same account read the same. Then two lookups to
      // make ids mean something: every `profile_id` gets its `slug`, every
      // `thread_id` its title and listing — one statement each, whatever the
      // export's size.
      const tables: Record<string, Record<string, unknown>[]> = {};
      const profileIds = new Set<string>();
      const threadIds = new Set<string>();
      for (const entry of exportColumns()) {
        const strip = redactedColumnsOf(entry);
        const where = `${entry.column} = $1` + (entry.when ? ` AND ${entry.when.column} = '${entry.when.equals}'` : "");
        const res = await sql.execute<{ row: unknown }>(
          `SELECT to_jsonb(t)${strip.length > 0 ? ` - ARRAY[${strip.map((c) => `'${c}'`).join(", ")}]::text[]` : ""} AS row
             FROM openproduct.${entry.table} t
            WHERE ${where}
            ORDER BY 1`,
          [subjectId],
        );
        const rows = res.rows.map((r) => jsonObject(r.row));
        for (const row of rows) {
          if (typeof row.profile_id === "string") profileIds.add(row.profile_id);
          if (typeof row.thread_id === "string") threadIds.add(row.thread_id);
        }
        tables[entry.table] = [...(tables[entry.table] ?? []), ...rows];
      }
      const slugs = new Map<string, string>();
      if (profileIds.size > 0) {
        const res = await sql.execute<{ id: string; slug: string }>(
          `SELECT id, slug FROM openproduct.profiles WHERE id = ANY($1::uuid[])`,
          [[...profileIds]],
        );
        for (const r of res.rows) slugs.set(r.id, r.slug);
      }
      const threads = new Map<string, { title: string; slug: string | null }>();
      if (threadIds.size > 0) {
        const res = await sql.execute<{ id: string; title: string; slug: string | null }>(
          `SELECT t.id, t.title, p.slug
             FROM openproduct.threads t
             LEFT JOIN openproduct.profiles p ON p.id = t.profile_id
            WHERE t.id = ANY($1::uuid[])`,
          [[...threadIds]],
        );
        for (const r of res.rows) threads.set(r.id, { title: r.title, slug: r.slug });
      }
      for (const rows of Object.values(tables)) {
        for (const row of rows) {
          if (typeof row.profile_id === "string" && slugs.has(row.profile_id)) row.slug = slugs.get(row.profile_id);
          if (typeof row.thread_id === "string" && threads.has(row.thread_id)) row.thread = threads.get(row.thread_id);
        }
      }
      // The listings they maintain, as the studio shows them (drafts
      // included), less the link grant — a door token — and every other
      // subject's id on the row.
      const listings = (await this.listProfilesMaintainedBy(subjectId)).map((profile) => {
        const row: Record<string, unknown> = { ...profile };
        for (const key of ["linkGrant", "createdBy", "updatedBy", "reviewedBy"]) delete row[key];
        return row;
      });
      return { exportedAt: at, subjectId, tables, listings };
    },

    async subjectFootprint(subjectId: string): Promise<Map<string, number>> {
      const out = new Map<string, number>();
      for (const entry of OPENPRODUCT_SUBJECT_REGISTRY) {
        const where = `${entry.column} = $1` + (entry.when ? ` AND ${entry.when.column} = '${entry.when.equals}'` : "");
        const res = await sql.execute<{ n: number | string }>(
          `SELECT count(*) AS n FROM openproduct.${entry.table} WHERE ${where}`,
          [subjectId],
        );
        const n = Number(res.rows[0]?.n ?? 0);
        if (n > 0) out.set(subjectEntryKey(entry), n);
      }
      return out;
    },
  };
}
