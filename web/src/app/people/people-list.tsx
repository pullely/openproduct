"use client";

import * as React from "react";

import {
  OPEN_TO_PROJECT_LABEL,
  OPEN_TO_PROJECT_NOTE,
  PROFILE_STAT_NOTES,
  cardTitle,
  type PublicContributorCard,
  PEOPLE_FILTERS_EMPTY,
  PEOPLE_FILTER_LABELS,
  filterPeople,
  parsePeopleFilters,
  peopleCountLine,
  peopleFiltersQuery,
  peopleTopics,
  type PeopleFilterState,
} from "@openproduct/contracts";

import { initialsOf } from "../feed/tile";
import { OpenPill } from "../ui/bits";

import { AppLink } from "../ui/link";

/**
 * The people directory's list, with the design's filter row above it: a
 * field ("Filter by name, handle, or product") and two pills, "Everyone" and
 * "Open to one more project".
 *
 * A CLIENT ISLAND FOR THE SAME REASON THE FEED'S FILTERS ARE ONE (OPC-1):
 * the server render is the whole, unfiltered list — identical for every
 * visitor, cacheable as one document — and the filtering happens in the
 * visitor's browser, with the state in the URL (`?q=`, `?open=1`) so a view
 * is linkable and reload-safe (XP-2). Without JavaScript the list is simply
 * complete, which is the right fallback for a directory.
 *
 * A PERSON IS A TILE (openproduct-calm CL4, CL-R3): one rounded card per
 * person, a 56px round mark, the name at 20px with the handle beside it, the
 * bio in one line, and what they build in one quiet line under it. The
 * prototype's `headline` is a field this product does not hold, so the line
 * beneath the name carries what the card does: the handle and, when written,
 * the bio.
 */
/** PE3 — the state is the contract's, parsed from and printed to the address. */
function readState(): PeopleFilterState {
  if (typeof window === "undefined") return PEOPLE_FILTERS_EMPTY;
  return parsePeopleFilters(window.location.search);
}

export function PeopleList({
  people,
  topicOf,
}: {
  people: readonly PublicContributorCard[];
  /** PE3 — a listing's slug to its category, from the directory the page already reads. */
  topicOf: Readonly<Record<string, string | null>>;
}) {
  const [state, setState] = React.useState<PeopleFilterState>(PEOPLE_FILTERS_EMPTY);

  React.useEffect(() => {
    setState(readState());
  }, []);

  const update = React.useCallback((next: Partial<PeopleFilterState>) => {
    setState((prev) => {
      const merged = { ...prev, ...next };
      // EVERY FILTER IS AN ADDRESS: the state prints to the query string the
      // contract parses, so the view in the bar is the view somebody else
      // gets when handed it.
      window.history.replaceState(null, "", peopleFiltersQuery(merged) || window.location.pathname);
      return merged;
    });
  }, []);

  const visible = filterPeople(people, state, topicOf, cardTitle);
  const openCount = people.reduce((n, p) => n + (p.openToProject ? 1 : 0), 0);
  const topics = peopleTopics(people, topicOf);

  return (
    <>
      {/* WC-7 — THE COUNT IS THE FILTERED LIST'S OWN. Computed from what is
          shown, and it says which filter made it so; the server render, with
          nothing filtered, is the whole directory's line. */}
      <p className="m-0 mb-4 text-[15px] leading-[1.5] text-muted-foreground" aria-live="polite">
        {peopleCountLine(visible.length, openCount, state)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="box-border flex h-[44px] min-w-[220px] flex-1 items-center gap-2.5 rounded-full border border-transparent bg-card px-4 focus-within:border-border">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 text-muted-foreground">
            <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.4 9.4 12.4 12.4" stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>
          <input
            type="search"
            value={state.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Filter by name, handle, or product"
            aria-label="Filter people"
            className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <FilterPill
          on={!state.open && !state.launched && !state.maintains && !state.topic}
          onPick={() => update({ open: false, launched: false, maintains: false, topic: "" })}
        >
          {PEOPLE_FILTER_LABELS.everyone}
        </FilterPill>
        <FilterPill on={state.open} onPick={() => update({ open: !state.open })}>
          {PEOPLE_FILTER_LABELS.open}
        </FilterPill>
        {/* PE3 — two more facts to filter by, and a topic. Each toggles, so
            they combine; the address carries whichever are on. */}
        <FilterPill on={state.launched} onPick={() => update({ launched: !state.launched })}>
          {PEOPLE_FILTER_LABELS.launched}
        </FilterPill>
        <FilterPill on={state.maintains} onPick={() => update({ maintains: !state.maintains })}>
          {PEOPLE_FILTER_LABELS.maintains}
        </FilterPill>
        {topics.length > 0 ? (
          <label className="inline-flex h-[40px] shrink-0 items-center gap-2 rounded-full bg-secondary px-4 text-[14.5px] text-copy max-sm:min-h-[44px]">
            <span>Topic</span>
            <select
              value={state.topic}
              onChange={(e) => update({ topic: e.target.value })}
              aria-label="Filter by topic"
              className="bg-transparent text-[14px] text-foreground outline-none"
            >
              <option value="">Any</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="m-0 mt-6 rounded-[20px] border border-dashed border-border px-6 py-12 text-center text-[15px] text-muted-foreground">
          Nobody matches that. Clear the field, or switch back to everyone.
        </p>
      ) : (
        <ul className="m-0 mt-6 grid list-none gap-[14px] p-0">
          {visible.map((person) => (
            <PersonTile key={person.handle} person={person} />
          ))}
        </ul>
      )}
    </>
  );
}

/** A filter pill: 40px tall, round, on the chip fill in `--copy` — and the
 *  foreground's own ink when it is the one that is on. NOT THE ACCENT
 *  (openproduct-calm CL4, CL-R8): the accent is the upvote's, and a filter is
 *  not an endorsement. */
function FilterPill({
  on,
  onPick,
  children,
}: {
  on: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={`inline-flex h-[40px] shrink-0 items-center rounded-full px-4 text-[14.5px] transition-colors max-sm:min-h-[44px] ${
        on ? "bg-foreground font-medium text-background" : "bg-secondary text-copy hover:bg-border"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One person, as a tile (openproduct-calm CL4): the round mark, the name with
 * the handle and the pill beside it, the bio beneath, and what they build on a
 * third, quiet line.
 *
 * THE WHOLE TILE IS ONE LINK, to that person's canonical `/@handle`. A tile
 * where only the name is clickable is a tile people miss, and nesting an
 * anchor inside an anchor is invalid markup that browsers resolve
 * differently.
 */
function PersonTile({ person }: { person: PublicContributorCard }) {
  const title = cardTitle(person);
  return (
    <li className="list-none">
      <AppLink
        href={`/@${person.handle}`}
        className="flex items-center gap-5 rounded-[20px] border border-border bg-card px-8 py-6 no-underline transition-colors hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:gap-4 max-sm:px-5 max-sm:py-5"
      >
        <span
          aria-hidden="true"
          className="grid h-[56px] w-[56px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[15px] text-copy"
        >
          {initialsOf(title)}
        </span>
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[20px] font-semibold tracking-[-0.015em] text-foreground max-sm:text-[18px]">{title}</span>
            <span className="font-mono text-[13.5px] text-faint">@{person.handle}</span>
            {/* Authored, and false by default — nobody is advertised as
                looking for work without having said so. AG3 — the label
                from the contract, not a string here. */}
            {person.openToProject ? (
              <OpenPill title={OPEN_TO_PROJECT_NOTE}>{OPEN_TO_PROJECT_LABEL}</OpenPill>
            ) : null}
          </span>
          {person.bio ? (
            <span className="truncate text-[15.5px] text-copy">{person.bio}</span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[13.5px] text-faint">
            <span>Maintains {person.maintains.length}</span>
            {/* CG4 — REAL, and rendered ONLY WHEN THERE IS SOMETHING TO SAY.
                `contributes to 0` is a true sentence — we hold every edge —
                but printing it beside a stranger's name on every tile turns
                an honest zero into a comparison nobody asked for. */}
            {person.contributesTo > 0 ? (
              <>
                <span>·</span>
                <span title={PROFILE_STAT_NOTES.contributesTo}>contributes to {person.contributesTo}</span>
              </>
            ) : null}
            {person.maintains.length > 0 ? (
              <>
                <span>·</span>
                <span className="font-mono text-[12.5px]">{person.maintains.join(" · ")}</span>
              </>
            ) : null}
          </span>
        </span>
      </AppLink>
    </li>
  );
}
