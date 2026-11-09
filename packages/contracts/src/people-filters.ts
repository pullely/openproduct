// The people index's filters (openproduct-worldclass-v2 PE3).
//
// EVERY FILTER IS AN ADDRESS. The directory's server render is the whole
// list — one document, identical for every visitor, cacheable — and the
// filtering happens in the visitor's browser with the state in the URL, so
// a view can be handed to somebody. `?open=1` was the one filter; PE3 adds
// *launched* (a listing they maintain has gone live), *maintains* (they run
// at least one public listing) and *topic* (a category of a listing they
// maintain). The state parses from and prints to the same query string, so
// there is one shape and it round-trips.
//
// THE COUNT ABOVE THE LIST IS THE FILTERED LIST'S OWN (WC-7). "12 people ·
// 4 open" over a list showing three is the counter and the list disagreeing
// on one screen; the line is computed from what is shown, and says which
// filter made it so.

import type { PublicContributorCard } from "./profiles.js";

export interface PeopleFilterState {
  readonly q: string;
  readonly open: boolean;
  readonly launched: boolean;
  readonly maintains: boolean;
  /** A category value, or "" for all. */
  readonly topic: string;
}

export const PEOPLE_FILTERS_EMPTY: PeopleFilterState = { q: "", open: false, launched: false, maintains: false, topic: "" };

export const PEOPLE_FILTER_LABELS = {
  everyone: "Everyone",
  open: "Open to one more project",
  launched: "Launched",
  maintains: "Maintains a listing",
} as const;

/** From a query string. Unknown keys are ignored; nothing is guessed. */
export function parsePeopleFilters(search: string): PeopleFilterState {
  const p = new URLSearchParams(search);
  return {
    q: (p.get("q") ?? "").slice(0, 80),
    open: p.get("open") === "1",
    launched: p.get("launched") === "1",
    maintains: p.get("maintains") === "1",
    topic: (p.get("topic") ?? "").slice(0, 40),
  };
}

/** To the address, or "" for the bare page. */
export function peopleFiltersQuery(state: PeopleFilterState): string {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.open) p.set("open", "1");
  if (state.launched) p.set("launched", "1");
  if (state.maintains) p.set("maintains", "1");
  if (state.topic) p.set("topic", state.topic);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

/** The rows a state keeps. `topicOf` maps a listing's slug to its category. */
export function filterPeople(
  people: readonly PublicContributorCard[],
  state: PeopleFilterState,
  topicOf: Readonly<Record<string, string | null>>,
  title: (person: PublicContributorCard) => string,
): PublicContributorCard[] {
  const needle = state.q.trim().toLowerCase();
  return people.filter((person) => {
    if (state.open && !person.openToProject) return false;
    if (state.launched && !person.launched) return false;
    if (state.maintains && person.maintains.length === 0) return false;
    if (state.topic && !person.maintains.some((slug) => topicOf[slug] === state.topic)) return false;
    if (!needle) return true;
    return `${title(person)} ${person.handle} ${person.maintains.join(" ")}`.toLowerCase().includes(needle);
  });
}

/** The categories the listed people's listings carry, for the topic control. */
export function peopleTopics(
  people: readonly PublicContributorCard[],
  topicOf: Readonly<Record<string, string | null>>,
): string[] {
  const out = new Set<string>();
  for (const person of people) {
    for (const slug of person.maintains) {
      const topic = topicOf[slug];
      if (topic) out.add(topic);
    }
  }
  return [...out].sort();
}

/** "12 people · 4 open to one more project", or the filtered list's own. */
export function peopleCountLine(shown: number, open: number, state: PeopleFilterState): string {
  const people = `${shown} ${shown === 1 ? "person" : "people"}`;
  const filtered = state.open || state.launched || state.maintains || state.topic || state.q.trim();
  if (!filtered) return `${people} · ${open} open to one more project`;
  const by: string[] = [];
  if (state.open) by.push("open to one more project");
  if (state.launched) by.push("launched");
  if (state.maintains) by.push("maintaining a listing");
  if (state.topic) by.push(`in ${state.topic}`);
  if (state.q.trim()) by.push(`matching “${state.q.trim()}”`);
  return `${people} ${by.join(", ")}`;
}
