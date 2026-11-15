"use client";

import * as React from "react";

import { CREW_ROLE_LABELS, crewSummaryLine, crewTotalLine, type CrewList, type CrewPerson } from "@openproduct/contracts";

import { FOCUS } from "../../ui/design";

import { crewRead } from "./act";
import { CREW_LEADS_HEADING, EDIT_CREW_TITLE, crewPersonName } from "./crew-model";
import { useMaker } from "./use-maker";

/** The popup, fetched when Edit crew is pressed: a Lead only. */
const CrewDialog = React.lazy(() => import("./crew-dialog").then((module) => ({ default: module.CrewDialog })));

/** The stack's six grounds, the board's soft tints in the app's tokens. */
const STACK_TINTS = ["bg-amber-soft", "bg-version-soft", "bg-success-soft", "bg-idea-soft", "bg-sunken", "bg-seat-wash"];

/** A person's disc of initials. */
export function CrewDisc({ person, size = 36, tint = "bg-sunken" }: { person: Pick<CrewPerson, "name" | "handle">; size?: 32 | 36; tint?: string }) {
  const label = crewPersonName(person).replace(/^@/, "");
  const parts = label.split(/[\s\-_.]+/).filter((part) => part.length > 0);
  const initials = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "··").slice(0, 2);
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold uppercase text-copy ${tint} ${size === 36 ? "h-[36px] w-[36px] text-[13px]" : "h-[32px] w-[32px] text-[12px]"}`}
    >
      {initials}
    </span>
  );
}

/**
 * The crew tab's roles (openproduct-stages-crew SC-3, design §2.5; board
 * `Crew`): the avatar stack, "N on the crew", the counts per role, the
 * leads, and for a Lead the Edit crew button that opens the popup.
 *
 * THE CREW'S OWN, READ AFTER LOAD. Nothing here is in the cached page: the
 * public crew is the consent roster (design §2.6), and who holds which role
 * is the crew's to know. One signed-in, `no-store` read of
 * `GET /{slug}/manage/crew` — the first page is Leads first, so it carries
 * the leads — once the overlay says this visitor is on the crew. A Member
 * sees it read-only; Edit crew is a Lead's.
 *
 * BUILT FOR HUNDREDS: the page never lists everyone. The full list is the
 * popup's, 30 at a time.
 */
export function CrewRoles({ slug }: { slug: string }) {
  const { crew, mode, leads } = useMaker(slug);
  const [list, setList] = React.useState<CrewList | null>(null);
  const [open, setOpen] = React.useState(false);
  const [version, setVersion] = React.useState(0);
  const titleId = React.useId();
  const visible = crew !== null && mode === "manage";

  React.useEffect(() => {
    if (!visible) return;
    let live = true;
    void (async () => {
      const result = await crewRead<CrewList>(slug, "crew");
      if (live && result.ok) setList(result.data);
    })();
    return () => {
      live = false;
    };
  }, [visible, slug, version]);

  const close = React.useCallback(() => setOpen(false), []);
  if (!visible || list === null) return null;
  const leadsList = list.people.filter((person) => person.role === "lead");
  const moreLeads = list.counts.lead - leadsList.length;

  return (
    <section aria-labelledby={titleId} data-crew-roles className="flex flex-col gap-3 rounded-[16px] bg-card p-[18px] max-sm:gap-2.5 max-sm:p-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span data-crew-stack className="flex shrink-0">
            {list.people.slice(0, 6).map((person, i) => (
              <span key={person.subjectId} className={`rounded-full ring-[3px] ring-card ${i > 0 ? "-ml-2" : ""}`}>
                <CrewDisc person={person} tint={STACK_TINTS[i % STACK_TINTS.length] ?? "bg-sunken"} />
              </span>
            ))}
          </span>
          <span className="grid min-w-0 leading-[1.35]">
            <h2 id={titleId} className="m-0 text-[17px] font-semibold text-foreground">
              {crewTotalLine(list.total)}
            </h2>
            <span data-crew-summary className="text-[13px] text-muted-foreground">
              {crewSummaryLine(list.counts)}
            </span>
          </span>
        </div>
        {leads ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            data-edit-crew
            className={`inline-flex h-[36px] cursor-pointer items-center rounded-full border-0 bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:opacity-90 max-sm:h-[44px] ${FOCUS}`}
          >
            {EDIT_CREW_TITLE}
          </button>
        ) : null}
      </div>

      {leadsList.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-foreground/[0.06] pt-3">
          <h3 className="m-0 font-mono text-mono-label uppercase text-muted-foreground">{CREW_LEADS_HEADING}</h3>
          <ul data-crew-leads className="m-0 grid list-none gap-2.5 p-0">
            {leadsList.map((person) => (
              <li key={person.subjectId} className="flex min-w-0 items-center gap-2.5">
                <CrewDisc person={person} size={32} />
                <span className="min-w-0 truncate text-[15px] font-semibold text-foreground">{crewPersonName(person)}</span>
                <span className="sr-only">{CREW_ROLE_LABELS.lead}</span>
              </li>
            ))}
          </ul>
          {moreLeads > 0 ? <span className="text-[13px] text-muted-foreground">and {moreLeads} more</span> : null}
        </div>
      ) : null}

      {open ? (
        <React.Suspense fallback={null}>
          <CrewDialog
            slug={slug}
            onClose={close}
            onSaved={() => {
              setOpen(false);
              setVersion((v) => v + 1);
            }}
          />
        </React.Suspense>
      ) : null}
    </section>
  );
}
