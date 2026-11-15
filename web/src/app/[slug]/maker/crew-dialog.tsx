"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import {
  CREW_ROLES,
  CREW_ROLE_CAN,
  CREW_ROLE_LABELS,
  CREW_SEARCH_MAX,
  crewQueryString,
  type CrewCounts,
  type CrewList,
  type CrewPerson,
  type CrewRole,
  type CrewRolesAnswer,
} from "@openproduct/contracts";

import { BTN_INK, FOCUS } from "../../ui/design";

import { crewRead, crewWrite } from "./act";
import {
  CREW_NONE_MATCH,
  CREW_SEARCH_LABEL,
  EDIT_CREW_TITLE,
  crewChanges,
  crewErrorsBySubject,
  crewFilters,
  crewPersonName,
  saveCrewLabel,
  showMoreLabel,
  shownRole,
  type CrewFilter,
} from "./crew-model";
import { CrewDisc } from "./crew-roles";
import { useMaker } from "./use-maker";

/** The focusable things inside the dialog, in order, for the trap. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** How long the search waits after the last key before it asks. */
const SEARCH_DELAY_MS = 250;

const LOCK = "M6 11V8a6 6 0 0112 0v3M5 11h14v10H5z";

/**
 * The Edit crew popup (openproduct-stages-crew SC-3, design §2.5; boards
 * `Crew`, `PhoneCrew`), opened by a Lead from the crew tab's roles card.
 *
 * A DIALOG, AND IT BEHAVES LIKE ONE — the Change stage popup's pattern:
 * `role="dialog"`, `aria-modal`, named by its title; focus moves in, is
 * trapped (Tab and Shift+Tab wrap) and goes back to Edit crew on close;
 * Escape, ✕, Cancel and a press on the scrim close it. Centred over a scrim
 * from `sm` up; the whole screen on a phone, the footer pinned.
 *
 * BUILT FOR HUNDREDS: a search box (names and handles, asked of the server
 * a beat after the last key), All / Leads / Maintainers / Members with the
 * whole crew's counts, 30 people at a time and "Show more · n left". Each row
 * is a person and a role picker; a locked Lead (an Orunbase admin, SC-4)
 * shows a lock and "Lead" instead. A row whose role was changed is
 * highlighted, and the footer says "Save n changes". On a phone a row opens
 * a chooser of the three roles, each with what it can do (board
 * `PhoneCrew`).
 *
 * ONE SAVE IS ONE REQUEST (`POST /{slug}/manage/crew` → core's batch). A
 * change core refused — locked, the last Lead, no longer on the crew — is
 * said beside its row and stays drafted; the rest are saved.
 */
export function CrewDialog({ slug, onClose, onSaved }: { slug: string; onClose: () => void; onSaved: () => void }) {
  const { leads } = useMaker(slug);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<CrewFilter>("all");
  const [people, setPeople] = React.useState<CrewPerson[]>([]);
  const [counts, setCounts] = React.useState<CrewCounts | null>(null);
  const [matching, setMatching] = React.useState(0);
  const [next, setNext] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState<Map<string, CrewRole>>(() => new Map());
  const [held, setHeld] = React.useState<Map<string, CrewRole>>(() => new Map());
  const [errors, setErrors] = React.useState<Map<string, string>>(() => new Map());
  const [failed, setFailed] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [chooser, setChooser] = React.useState<CrewPerson | null>(null);
  const dialog = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();
  const searchId = React.useId();

  const changes = crewChanges(draft, held);

  // In on open, trapped while open, back on close.
  React.useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>("input[type='search']")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const head = items[0]!;
      const tail = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [onClose]);

  // The search asks a beat after the last key.
  React.useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const remember = React.useCallback((list: readonly CrewPerson[]) => {
    setHeld((current) => {
      const out = new Map(current);
      for (const person of list) out.set(person.subjectId, person.role);
      return out;
    });
  }, []);

  const load = React.useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      const result = await crewRead<CrewList>(
        slug,
        "crew",
        fetch,
        crewQueryString({ q: query, role: filter === "all" ? null : filter, cursor }),
      );
      setLoading(false);
      if (!result.ok) {
        setFailed(result.message);
        return;
      }
      setFailed(null);
      setPeople((current) => (cursor ? [...current, ...result.data.people] : result.data.people));
      setCounts(result.data.counts);
      setMatching(result.data.matching);
      setNext(result.data.next);
      remember(result.data.people);
    },
    [slug, query, filter, remember],
  );

  // A new search or filter starts from the first page.
  React.useEffect(() => {
    void load(null);
  }, [load]);

  const pick = (person: CrewPerson, role: CrewRole) => {
    setDraft((current) => new Map(current).set(person.subjectId, role));
    if (errors.has(person.subjectId)) {
      setErrors((current) => {
        const out = new Map(current);
        out.delete(person.subjectId);
        return out;
      });
    }
  };

  const save = () => {
    if (busy || changes.length === 0) return;
    setBusy(true);
    setFailed(null);
    void (async () => {
      const result = await crewWrite<CrewRolesAnswer>(slug, "crew", { changes });
      setBusy(false);
      if (!result.ok) {
        const bySubject = crewErrorsBySubject(result.fields);
        setErrors(bySubject);
        setFailed(bySubject.size > 0 ? null : result.message);
        return;
      }
      const refused = crewErrorsBySubject(result.data.refused);
      if (refused.size === 0) {
        onSaved();
        return;
      }
      // Some stood, some were refused: keep the refused ones drafted, beside
      // their words, and take the saved ones as held.
      setCounts(result.data.counts);
      setHeld((current) => {
        const out = new Map(current);
        for (const change of result.data.changed) out.set(change.subjectId, change.to);
        return out;
      });
      setPeople((current) =>
        current.map((person) => {
          const change = result.data.changed.find((c) => c.subjectId === person.subjectId);
          return change ? { ...person, role: change.to } : person;
        }),
      );
      setDraft((current) => {
        const out = new Map(current);
        for (const change of result.data.changed) out.delete(change.subjectId);
        return out;
      });
      setErrors(refused);
    })();
  };

  // A Lead's alone, like the button that opens it.
  if (!leads) return null;
  const left = Math.max(0, matching - people.length);

  return createPortal(
    <div
      data-crew-scrim
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-scrim/45 p-6 max-sm:block max-sm:p-0"
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-crew-dialog
        className="box-border flex max-h-[calc(100dvh-48px)] w-full max-w-[600px] flex-col overflow-hidden rounded-[20px] bg-card ring-1 ring-inset ring-foreground/10 max-sm:h-[100dvh] max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none max-sm:ring-0"
      >
        <div className="flex items-center justify-between gap-3 px-[22px] pb-2 pt-5 max-sm:px-4 max-sm:pt-4">
          {chooser ? (
            <button
              type="button"
              onClick={() => setChooser(null)}
              aria-label="Back to the crew"
              className={`grid h-[44px] w-[44px] cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground ${FOCUS}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          ) : null}
          <h2 id={titleId} className="m-0 mr-auto text-[20px] font-semibold tracking-[-0.01em] text-foreground">
            {chooser ? "Role" : EDIT_CREW_TITLE}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`grid h-[44px] w-[44px] cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground ${FOCUS}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {chooser ? (
          <RoleChooser
            person={chooser}
            role={shownRole(chooser, draft)}
            onPick={(role) => {
              pick(chooser, role);
              setChooser(null);
            }}
          />
        ) : (
          <>
            <div className="flex flex-col gap-3 px-[22px] pb-3 max-sm:px-4">
              <label htmlFor={searchId} className="sr-only">
                {CREW_SEARCH_LABEL}
              </label>
              <input
                id={searchId}
                type="search"
                value={search}
                maxLength={CREW_SEARCH_MAX}
                placeholder={CREW_SEARCH_LABEL}
                onChange={(event) => setSearch(event.target.value)}
                className="box-border h-[44px] w-full rounded-[14px] border-0 bg-well px-3.5 text-nozoom text-foreground outline-none ring-1 ring-inset ring-foreground/[0.08] focus:ring-2 focus:ring-ring"
              />
              {counts ? (
                <div role="group" aria-label="Show" data-crew-filters className="flex flex-wrap gap-0.5 self-start rounded-full bg-sunken p-1 max-sm:self-stretch">
                  {crewFilters(counts).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={filter === option.key}
                      data-crew-filter={option.key}
                      onClick={() => setFilter(option.key)}
                      className={`inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-full border-0 px-3 text-[13px] max-sm:min-h-[44px] max-sm:flex-auto max-sm:justify-center ${FOCUS} ${
                        filter === option.key ? "bg-card font-semibold text-foreground" : "bg-transparent font-medium text-muted-foreground"
                      }`}
                    >
                      {option.label}
                      <span className="font-mono text-label">{option.count}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto border-t border-foreground/[0.06]" aria-busy={loading}>
              {people.length === 0 && !loading ? (
                <p className="m-0 px-[22px] py-6 text-[15px] text-muted-foreground max-sm:px-4">{CREW_NONE_MATCH}</p>
              ) : (
                <ul data-crew-list className="m-0 list-none p-0">
                  {people.map((person) => (
                    <CrewRow
                      key={person.subjectId}
                      person={person}
                      role={shownRole(person, draft)}
                      changed={shownRole(person, draft) !== (held.get(person.subjectId) ?? person.role)}
                      error={errors.get(person.subjectId) ?? null}
                      onPick={(role) => pick(person, role)}
                      onOpen={() => setChooser(person)}
                    />
                  ))}
                </ul>
              )}
              {next && left > 0 ? (
                <div className="px-[22px] py-3 max-sm:px-4">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void load(next)}
                    data-crew-more
                    className={`inline-flex h-[40px] w-full cursor-pointer items-center justify-center rounded-full border-0 bg-foreground/[0.06] text-[13px] font-semibold text-copy hover:bg-foreground/[0.1] max-sm:h-[44px] ${FOCUS}`}
                  >
                    {showMoreLabel(left)}
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}

        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2.5 border-t border-foreground/[0.06] bg-card px-[22px] py-4 max-sm:px-4 max-sm:pb-[max(16px,env(safe-area-inset-bottom))]">
          {failed ? (
            <span role="alert" className="mr-auto text-[13px] leading-[1.4] text-destructive">
              {failed}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-[40px] cursor-pointer items-center rounded-full border-0 bg-transparent px-[18px] text-[15px] font-semibold text-muted-foreground hover:text-foreground max-sm:h-[44px] ${FOCUS}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || changes.length === 0}
            data-crew-save
            className={`${BTN_INK} cursor-pointer border-0 disabled:cursor-default disabled:bg-border-strong disabled:text-muted-foreground disabled:opacity-100 ${FOCUS}`}
          >
            {saveCrewLabel(changes.length)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One person in the popup: their disc and name, and the role picker — or,
 *  for a locked Lead, a lock and "Lead". */
function CrewRow({
  person,
  role,
  changed,
  error,
  onPick,
  onOpen,
}: {
  person: CrewPerson;
  role: CrewRole;
  changed: boolean;
  error: string | null;
  onPick: (role: CrewRole) => void;
  onOpen: () => void;
}) {
  const name = crewPersonName(person);
  const errorId = React.useId();
  return (
    <li
      data-crew-row
      data-changed={changed || undefined}
      className={`flex min-h-[56px] items-center gap-3 border-t border-foreground/[0.05] px-[22px] py-1.5 first:border-t-0 max-sm:px-4 ${changed ? "bg-amber-soft/40" : ""}`}
    >
      <CrewDisc person={person} />
      <span className="grid min-w-0 flex-1 leading-[1.35]">
        <span className="truncate text-[15px] font-semibold text-foreground">{name}</span>
        {error ? (
          <span id={errorId} role="alert" className="text-[13px] text-destructive">
            {error}
          </span>
        ) : null}
      </span>
      {person.locked ? (
        <span data-crew-locked className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground" title="Changed only on Orunbase">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d={LOCK} />
          </svg>
          {CREW_ROLE_LABELS.lead}
          <span className="sr-only">, changed only on Orunbase</span>
        </span>
      ) : (
        <>
          <select
            aria-label={`Role for ${name}`}
            value={role}
            onChange={(event) => onPick(event.target.value as CrewRole)}
            {...(error ? { "aria-invalid": true as const, "aria-describedby": errorId } : {})}
            className={`h-[36px] cursor-pointer rounded-[10px] border-0 px-2.5 text-[13px] font-semibold max-sm:hidden ${FOCUS} ${
              changed ? "bg-amber-soft text-endorse-ink" : "bg-well text-foreground"
            }`}
          >
            {CREW_ROLES.map((option) => (
              <option key={option} value={option}>
                {CREW_ROLE_LABELS[option]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Role for ${name}: ${CREW_ROLE_LABELS[role]}`}
            className={`inline-flex h-[44px] cursor-pointer items-center gap-1 rounded-[10px] border-0 px-2.5 text-[13px] font-semibold sm:hidden ${FOCUS} ${
              changed ? "bg-amber-soft text-endorse-ink" : "bg-transparent text-muted-foreground"
            }`}
          >
            {CREW_ROLE_LABELS[role]}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </>
      )}
    </li>
  );
}

/** The phone's role chooser (board `PhoneCrew`): the person, then the three
 *  roles, each with what it can do. */
function RoleChooser({ person, role, onPick }: { person: CrewPerson; role: CrewRole; onPick: (role: CrewRole) => void }) {
  return (
    <div data-crew-chooser className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[22px] pb-5 max-sm:px-4">
      <div className="flex items-center gap-3">
        <CrewDisc person={person} />
        <span className="truncate text-[17px] font-semibold text-foreground">{crewPersonName(person)}</span>
      </div>
      <div role="radiogroup" aria-label={`Role for ${crewPersonName(person)}`} className="flex flex-col gap-2">
        {CREW_ROLES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={role === option}
            onClick={() => onPick(option)}
            className={`flex min-h-[64px] cursor-pointer flex-col items-start gap-0.5 rounded-[14px] border-0 px-3.5 py-2.5 text-left ${FOCUS} ${
              role === option ? "bg-primary text-primary-foreground" : "bg-well text-foreground"
            }`}
          >
            <span className="text-[15px] font-semibold">{CREW_ROLE_LABELS[option]}</span>
            <span className={`text-[13px] ${role === option ? "opacity-80" : "text-muted-foreground"}`}>{CREW_ROLE_CAN[option]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
