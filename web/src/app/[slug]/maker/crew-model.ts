// The crew tab's roles and the Edit crew popup, as rules (openproduct-stages-
// crew SC-3, design §2; boards `Crew`, `PhoneCrew`).
//
// PURE, AND NO JSX: the web test lane is module-level. `crew-roles.tsx` (the
// summary) and `crew-dialog.tsx` (the popup) draw what these say.

import {
  CREW_NAMELESS,
  CREW_ROLES,
  CREW_ROLE_PLURALS,
  type CrewCounts,
  type CrewPerson,
  type CrewRole,
  type CrewRoleChangeInput,
} from "@openproduct/contracts";

/** The popup's title, and the button that opens it (Leads only). */
export const EDIT_CREW_TITLE = "Edit crew";

/** The search box's label and placeholder. */
export const CREW_SEARCH_LABEL = "Search the crew";

/** What the list says when nobody matches the search and filter. */
export const CREW_NONE_MATCH = "No one matches";

/** The summary card's heading for the leads. */
export const CREW_LEADS_HEADING = "Leads";

/** A filter: everybody, or one role. */
export type CrewFilter = "all" | CrewRole;

/** "All · Leads · Maintainers · Members", each with its count (board `Crew`).
 *  The counts are the whole crew's, so they hold still while a Lead types. */
export function crewFilters(counts: CrewCounts): Array<{ key: CrewFilter; label: string; count: number }> {
  return [
    { key: "all", label: "All", count: counts.lead + counts.maintainer + counts.member },
    ...CREW_ROLES.map((role) => ({ key: role, label: CREW_ROLE_PLURALS[role], count: counts[role] })),
  ];
}

/** A person's name on the crew's own pages. */
export function crewPersonName(person: Pick<CrewPerson, "name" | "handle">): string {
  const name = (person.name ?? "").trim();
  if (name) return name;
  return person.handle ? `@${person.handle}` : CREW_NAMELESS;
}

/** The role picked for each person in this sitting, before it is saved. */
export type CrewDraft = ReadonlyMap<string, CrewRole>;

/**
 * The changes a save sends: every drafted role that differs from the role
 * the person holds now. Picking a role and then picking the old one back is
 * no change at all. A locked person never has a draft (no picker is drawn).
 */
export function crewChanges(draft: CrewDraft, held: ReadonlyMap<string, CrewRole>): CrewRoleChangeInput[] {
  const changes: CrewRoleChangeInput[] = [];
  for (const [subjectId, role] of draft) {
    const now = held.get(subjectId);
    if (now !== undefined && now !== role) changes.push({ subjectId, role });
  }
  return changes;
}

/** "Save", "Save 1 change", "Save 3 changes" (board `Crew`). */
export function saveCrewLabel(changes: number): string {
  if (changes === 0) return "Save";
  return `Save ${changes} ${changes === 1 ? "change" : "changes"}`;
}

/** "Show more · 98 left". */
export function showMoreLabel(left: number): string {
  return `Show more · ${left} left`;
}

/** The role a row shows: the draft when there is one, else the held role. */
export function shownRole(person: Pick<CrewPerson, "subjectId" | "role">, draft: CrewDraft): CrewRole {
  return draft.get(person.subjectId) ?? person.role;
}

/** Field errors from a save, by person: core keys them `changes.<subjectId>`. */
export function crewErrorsBySubject(fields: Record<string, string[]>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, messages] of Object.entries(fields)) {
    if (key.startsWith("changes.") && messages[0]) out.set(key.slice("changes.".length), messages[0]);
  }
  return out;
}
