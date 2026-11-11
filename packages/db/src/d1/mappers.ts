// Row mappers for the D1 slice (openproduct-standalone OPN).
//
// COPIED VERBATIM from the module-private helpers of `../repository.ts`
// (`iso`, `jsonInstant`, `jsonObject`, `jsonArray`, `stackOf`,
// `parseStringList`, `parseFacets`, `cardOf`, `metricOf`, `mediaOf`) so the D1
// repository hands back byte-identical records without the Postgres
// implementation being edited for this proof. The one omission is
// `parseStringList`'s Postgres-array-literal branch (`{a,b}`), which no D1
// read can produce. The differential suite is what keeps the two copies
// honest; the real port would move them to one shared module.

import type { MediaKindName, MetricRecord, ProductMediaRecord, ProfileCardRecord, SignalSourceName } from "../types.js";

export function iso(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/** A timestamp from inside a JSON document, back to the ISO form every other read returns. */
export function jsonInstant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const at = Date.parse(text);
  return Number.isNaN(at) ? text : new Date(at).toISOString();
}

/** A JSON value that should be an object, parsed if the driver left it as text. */
export function jsonObject(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export function jsonArray(value: unknown): Record<string, unknown>[] {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
}

export function stackOf(value: unknown): string[] {
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

/** A list of strings: a parsed array, or a JSON string holding one. */
export function parseStringList(value: unknown): string[] {
  let parsed: unknown = value;
  if (typeof value === "string" && value.length > 0) {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is string => typeof entry === "string");
}

export function parseFacets(value: unknown): Record<string, string[]> {
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

export type CardRow = {
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

export function cardOf(row: CardRow): ProfileCardRecord {
  return {
    slug: row.slug,
    tagline: row.tagline,
    stack: stackOf(row.stack),
    stackCanonical: stackOf(row.stack_canonical),
    category: row.category,
    hosting: row.hosting,
    pricing: row.pricing ?? null,
    licence: row.repo_licence,
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

export interface MetricRow {
  [key: string]: unknown;
  profile_id: string;
  metric: string;
  window_key: string;
  value: number | string;
  source: string;
  observed_at: string | Date;
}

export function metricOf(row: MetricRow): MetricRecord {
  return {
    profileId: row.profile_id,
    metric: row.metric,
    window: row.window_key,
    value: Number(row.value),
    source: row.source as SignalSourceName,
    observedAt: iso(row.observed_at)!,
  };
}

export interface MediaRow {
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

export function mediaOf(row: MediaRow): ProductMediaRecord {
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
