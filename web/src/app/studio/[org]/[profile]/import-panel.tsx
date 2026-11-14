// IN2 — what the repository says, beside what the maintainer wrote.
//
// OPC-2 IS THE WHOLE COMPONENT. Four fields arrive from a repository check
// and four fields can be typed, and the one thing this product must never do
// is present the first kind as the second. So each row says which class its
// value is in, in words rather than a colour, and when the two differ it
// shows both — a maintainer who overrode a description can still see what
// the repository says, and change their mind.
//
// NOTHING HERE WRITES. The panel is a reading of state the check produced;
// adopting an observation is done by editing the field, which is what makes
// it authored. A one-click "use this" button would be a third way for a value
// to become authored and a third place for the rule to be got wrong.

import {
  IMPORTED_FIELD_LABEL,
  OBSERVED_ONLY_FIELDS,
  PROVENANCE_LABEL,
  PROVENANCE_NOTE,
  type ImportedValue,
} from "@openproduct/contracts";

import type { ReactNode } from "react";

import { H2 } from "../../../ui/design";
import { RAIL_PANEL } from "../../frame";

/**
 * One field's line: what it says, where it came from, and — only when they
 * disagree — what the repository says instead.
 */
export function ProvenanceRow({ value }: { value: ImportedValue }) {
  const observedOnly = OBSERVED_ONLY_FIELDS.includes(value.field);
  const overridden =
    value.provenance === "authored" && value.observed !== null && value.observed !== value.value;
  return (
    <li className="border-t border-line py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13px] font-medium text-foreground">{IMPORTED_FIELD_LABEL[value.field]}</span>
        <span
          className="inline-flex items-center rounded-full border border-border px-2 py-[1px] text-[11px] text-muted-foreground"
          title={PROVENANCE_NOTE[value.provenance]}
        >
          {observedOnly ? "observed only" : PROVENANCE_LABEL[value.provenance]}
        </span>
      </div>
      <p className="m-0 mt-[3px] text-[13px] leading-[1.5] text-foreground [overflow-wrap:anywhere]">
        {/* Not yet observed and not yet typed. A dash, never an empty line
            and never a zero — the two are different claims (OPC-C). */}
        {value.value ?? <span className="text-faint">—</span>}
      </p>
      {overridden ? (
        <p className="m-0 mt-[2px] text-[13px] leading-[1.5] text-muted-foreground">
          The repository says <span className="text-foreground">{value.observed}</span>.
        </p>
      ) : null}
    </li>
  );
}

/**
 * The rail's panel: the four fields an import fills, the state of the check
 * that filled them beside the heading, and — handed in by the page, because
 * this panel writes nothing — the check itself under a rule.
 *
 * THE NOT-YET-CHECKED CASE IS NOT AN EMPTY PANEL. A listing that has never
 * been checked has observed nothing, which is a different thing from a
 * repository that says nothing, and the line says which.
 */
export function ImportPanel({
  values,
  checkedAt,
  observed,
  children,
}: {
  values: readonly ImportedValue[];
  checkedAt: string | null;
  /** Whether the last check actually read anything — see `hasObservation`. */
  observed: boolean;
  /** The repository check's form, from the page that owns the act. */
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="from-repository" className={RAIL_PANEL}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="from-repository" className={H2}>From the repository</h2>
        <span className="text-[13px] text-muted-foreground">
          {checkedAt === null
            ? "Not checked yet"
            : observed
              ? `Read ${readDay(checkedAt)}`
              : "The last check read nothing"}
        </span>
      </div>
      <ul className="m-0 mt-1.5 list-none p-0">
        {values.map((value) => (
          <ProvenanceRow key={value.field} value={value} />
        ))}
      </ul>
      {children ? (
        <div className="mt-2 flex flex-wrap items-center gap-2.5 border-t border-line pt-3">{children}</div>
      ) : null}
    </section>
  );
}

/** `11 Sep 2026`, or the raw value when it is not a moment we can read. */
function readDay(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at)
    ? iso
    : new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
