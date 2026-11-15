// Crew roles (openproduct-stages-crew SC-3, design §2).
//
// ONE ROLE PER PERSON, NO PERMISSION SWITCHES (owner, 2026-11-15: "keep it
// simple"):
//
//   Lead        everything, and decides who does what
//   Maintainer  edits the product, changes its stage, posts, handles seats
//   Member      on the crew, reads private threads
//
// What each role may DO is one decision table, core's (`core/src/
// authorize.ts`); everything here is the vocabulary both sides speak and the
// shapes of the two crew routes:
//
//   GET  …/profiles/{id}/crew?q=&role=&cursor=   the crew's own list, 30 at a
//                                                time, with the counts
//   PUT  …/profiles/{id}/crew/{subjectId}        one person's role (`{role}`)
//   PUT  …/profiles/{id}/crew                    several at once — what the
//                                                Edit crew popup's "Save n
//                                                changes" sends
//
// PURE, AND NO JSX: imported by core, the gateway and the web.

/** The three roles, highest first. */
export const CREW_ROLES = ["lead", "maintainer", "member"] as const;
export type CrewRole = (typeof CREW_ROLES)[number];

export function isCrewRole(value: unknown): value is CrewRole {
  return typeof value === "string" && (CREW_ROLES as readonly string[]).includes(value);
}

/** The role, as a person reads it (boards `Crew`, `PhoneCrew`). */
export const CREW_ROLE_LABELS: Record<CrewRole, string> = {
  lead: "Lead",
  maintainer: "Maintainer",
  member: "Member",
};

/** The role filter's words: "All · Leads · Maintainers · Members". */
export const CREW_ROLE_PLURALS: Record<CrewRole, string> = {
  lead: "Leads",
  maintainer: "Maintainers",
  member: "Members",
};

/** What each role can do, in one line (board `PhoneCrew`'s role chooser). */
export const CREW_ROLE_CAN: Record<CrewRole, string> = {
  lead: "Everything, and decides who does what",
  maintainer: "Edits the product, changes its stage, posts, handles seats",
  member: "On the crew, reads private threads",
};

/**
 * What the page DRAWS for a role. Core's table decides; these say only
 * which controls to offer, and a test holds them to core's table for every
 * role.
 */
export function crewRoleWrites(role: CrewRole | null | undefined): boolean {
  return role === "lead" || role === "maintainer";
}

/** Only a Lead changes roles (and sees Edit crew). */
export function crewRoleLeads(role: CrewRole | null | undefined): boolean {
  return role === "lead";
}

// ─── the crew list ─────────────────────────────────────────────────────────

/** People per page in the crew list and the Edit crew popup ("Show more"). */
export const CREW_PAGE_SIZE = 30;

/** The longest search the list reads; longer is cut, never refused. */
export const CREW_SEARCH_MAX = 80;

/** The most role changes one save carries. */
export const CREW_SAVE_MAX = 100;

/** A subject id as a crew route's path segment: opaque, bounded, plain. */
export const CREW_SUBJECT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** One person on the crew, as the crew reads it. */
export interface CrewPerson {
  /** The key the role routes take. Opaque; never shown. */
  subjectId: string;
  role: CrewRole;
  /** Changed only on Orunbase (an Orunbase admin, SC-4): no role picker. */
  locked: boolean;
  /** How they came onto the crew. */
  source: "creator" | "seat" | "orunbase";
  /** Their own name, or the crew's word for them on the public roster;
   *  null when neither exists (the page writes "Someone on the crew"). */
  name: string | null;
  /** Their handle, only while their public page resolves. */
  handle: string | null;
}

/** People per role, of the WHOLE crew (never of the page or the search). */
export type CrewCounts = Record<CrewRole, number>;

/** `GET …/crew`. */
export interface CrewList {
  people: CrewPerson[];
  counts: CrewCounts;
  /** Everybody on the crew. */
  total: number;
  /** Everybody matching the search and the filter, across every page. */
  matching: number;
  /** The next page's cursor, or null after the last. */
  next: string | null;
}

export const CREW_LIST_KEYS = ["counts", "matching", "next", "people", "total"] as const;
export const CREW_PERSON_KEYS = ["handle", "locked", "name", "role", "source", "subjectId"] as const;

/** The list's query: `q` searches names and handles, `role` filters. */
export interface CrewQuery {
  q: string | null;
  role: CrewRole | null;
  offset: number;
}

/** A page cursor: the offset, written so nothing reads it as a number to
 *  do arithmetic on. Opaque to the page. */
export function crewCursor(offset: number): string {
  return `o${Math.max(0, Math.trunc(offset))}`;
}

/** A cursor read back; anything that is not one is the first page. */
export function crewOffsetOf(cursor: string | null | undefined): number {
  const match = /^o(\d{1,6})$/.exec(cursor ?? "");
  return match ? Number(match[1]) : 0;
}

/** The list's query, read from a URL's search params. */
export function readCrewQuery(params: URLSearchParams): CrewQuery {
  const q = (params.get("q") ?? "").trim().slice(0, CREW_SEARCH_MAX);
  const role = params.get("role");
  return { q: q.length > 0 ? q : null, role: isCrewRole(role) ? role : null, offset: crewOffsetOf(params.get("cursor")) };
}

/** The list's query, as the search params of its address. */
export function crewQueryString(query: { q?: string | null; role?: CrewRole | null; cursor?: string | null }): string {
  const params = new URLSearchParams();
  const q = (query.q ?? "").trim();
  if (q) params.set("q", q.slice(0, CREW_SEARCH_MAX));
  if (query.role) params.set("role", query.role);
  if (query.cursor) params.set("cursor", query.cursor);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** "1 lead · 12 maintainers · 113 members" (board `Crew`). */
export function crewSummaryLine(counts: CrewCounts): string {
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    part(counts.lead, "lead", "leads"),
    part(counts.maintainer, "maintainer", "maintainers"),
    part(counts.member, "member", "members"),
  ].join(" · ");
}

/** "N on the crew". */
export function crewTotalLine(total: number): string {
  return `${total} on the crew`;
}

/** What a person with no name is called on the crew's own pages. */
export const CREW_NAMELESS = "Someone on the crew";

// ─── changing roles ────────────────────────────────────────────────────────

/** `PUT …/crew/{subjectId}`. */
export interface CrewRoleRequest {
  role: CrewRole;
}

/** One change inside a save. */
export interface CrewRoleChangeInput {
  subjectId: string;
  role: CrewRole;
}

/** `PUT …/crew`: several changes, applied as one save. */
export interface CrewRolesRequest {
  changes: CrewRoleChangeInput[];
}

/** What a save answers: the people whose role changed, the counts now, and
 *  each change that was refused (keyed `changes.<subjectId>`; empty when
 *  every change stood). */
export interface CrewRolesAnswer {
  changed: Array<{ subjectId: string; from: CrewRole; to: CrewRole }>;
  counts: CrewCounts;
  refused: Record<string, string[]>;
}

/** The refusals, in the words the popup shows beside the row. */
export const CREW_ROLE_REFUSALS = {
  absent: "They are no longer on the crew",
  locked: "Changed only on Orunbase",
  last_lead: "The product needs at least one Lead",
  role: "Pick Lead, Maintainer or Member",
  too_many: `Save at most ${CREW_SAVE_MAX} changes at once`,
  duplicate: "Changed twice in one save",
} as const;

/**
 * A save's changes, read and checked: every entry a subject id and a role,
 * no person twice, at most `CREW_SAVE_MAX`. Field errors are keyed
 * `changes.<subjectId>` (or `changes`), so the popup can put each beside its
 * row. Nothing here knows the crew; core checks each person is on it.
 */
export function readCrewChanges(
  raw: unknown,
): { ok: true; changes: CrewRoleChangeInput[] } | { ok: false; fields: Record<string, string[]> } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, fields: { changes: ["Change at least one role"] } };
  if (raw.length > CREW_SAVE_MAX) return { ok: false, fields: { changes: [CREW_ROLE_REFUSALS.too_many] } };
  const fields: Record<string, string[]> = {};
  const seen = new Set<string>();
  const changes: CrewRoleChangeInput[] = [];
  for (const entry of raw) {
    const { subjectId, role } = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    if (typeof subjectId !== "string" || !CREW_SUBJECT_ID_RE.test(subjectId)) {
      fields.changes = ["Each change names somebody on the crew"];
      continue;
    }
    if (!isCrewRole(role)) {
      fields[`changes.${subjectId}`] = [CREW_ROLE_REFUSALS.role];
      continue;
    }
    if (seen.has(subjectId)) {
      fields[`changes.${subjectId}`] = [CREW_ROLE_REFUSALS.duplicate];
      continue;
    }
    seen.add(subjectId);
    changes.push({ subjectId, role });
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, changes };
}

/**
 * The order a save is applied in: whoever BECOMES a Lead first, then the
 * rest. So a Lead who hands over ("make Ada Lead, make me Maintainer") is
 * never refused as the last Lead halfway through their own save.
 */
export function crewChangeOrder<T extends { role: CrewRole }>(changes: readonly T[]): T[] {
  return [...changes.filter((c) => c.role === "lead"), ...changes.filter((c) => c.role !== "lead")];
}

/** The crew's addresses at the gateway. */
export const CREW_API = {
  /** GET the list (`crewQueryString`); PUT `CrewRolesRequest`. */
  crew: (org: string, profile: string): string => `/v1/organizations/${org}/openproduct/profiles/${profile}/crew`,
  /** PUT `CrewRoleRequest`. */
  member: (org: string, profile: string, subjectId: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/crew/${encodeURIComponent(subjectId)}`,
  /** SC-4 — GET the crew's Orunbase card (`OrunbaseSync`). */
  orunbase: (org: string, profile: string): string => `/v1/organizations/${org}/openproduct/profiles/${profile}/orunbase`,
} as const;
