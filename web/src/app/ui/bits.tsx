// The reference design's small parts (openproduct-commons XP1).
//
// Four route archetypes share these, which is the point: LC's two new routes
// and CG's two cost layout rather than invention. Nothing here holds state or
// fetches — they are shapes, and the pages decide what goes in them.

import type { ReactNode } from "react";

import { formulaHref, type FormulaId } from "@openproduct/contracts";

import { pendingProps, type Pending } from "./pending";

import { AppLink } from "./link";

/** Two initials from a slug or a name, for the square product marks and the
 *  round people ones. Never empty — a blank tile reads as a loading state. */
export function initialsOf(value: string): string {
  const parts = value.split(/[\s\-_.]+/).filter((p) => p.length > 0);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** The square mark beside a product. Sizes are the design's: 24 in the launch
 *  strip, 34 in a profile's lists, 40 in a directory row, 56 on the page. */
export function ProductMark({ slug, size = 40 }: { slug: string; size?: number }) {
  const radius =
    size >= 56 ? "rounded-[14px]" : size >= 40 ? "rounded-[11px]" : size >= 34 ? "rounded-[9px]" : "rounded-[7px]";
  const text = size >= 56 ? "text-[18px]" : size >= 40 ? "text-[14px]" : "text-[12px]";
  return (
    <span
      aria-hidden="true"
      style={{ height: size, width: size }}
      className={`grid shrink-0 place-items-center border border-border bg-card font-mono ${radius} ${text} font-medium text-faint`}
    >
      {initialsOf(slug)}
    </span>
  );
}

/** The round mark beside a person. Sizes are the design's: 30 in a
 *  maintainers list, 40 in a directory row, 72 on the page. */
export function PersonMark({ name, size = 30 }: { name: string; size?: number }) {
  const text =
    size >= 72 ? "text-[15px]" : size >= 40 ? "text-[12.5px] font-medium" : "text-[11.5px]";
  return (
    <span
      aria-hidden="true"
      style={{ height: size, width: size }}
      className={`grid shrink-0 place-items-center rounded-full bg-secondary font-mono ${text} text-faint`}
      data-person-mark
    >
      {initialsOf(name)}
    </span>
  );
}

/** `N contributors wanted` — the design's one green pill. Green always means
 *  "this is open to you", and nothing else uses it (XP-1). */
export function OpenPill({ children, title }: { children: ReactNode; title?: string }) {
  return (
    // AG3 — `title` carries WHOSE CLAIM this is. The pill says somebody is
    // open; the sentence says they ticked it themselves and nothing observes
    // availability, which is the difference between a fact about a person and
    // a fact they stated (OPC-2).
    <span
      {...(title === undefined ? {} : { title })}
      className="inline-flex items-center whitespace-nowrap rounded-full bg-success-soft px-2.5 py-[3px] text-[13.5px] font-semibold text-success"
    >
      {children}
    </span>
  );
}

/** The `new` pill. Amber, and only ever this. */
export function NewPill() {
  return (
    <span className="inline-flex items-center rounded-full bg-warning-soft px-[9px] py-[2px] text-[12.5px] font-semibold text-warning-strong">
      New
    </span>
  );
}

/** A stack entry, licence, or kind. Mono, hairline, no fill. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[7px] border border-border bg-card px-2.5 py-[3px] font-mono text-[12.5px] text-faint">
      {children}
    </span>
  );
}

/**
 * One of the four cards in a product page's stat strip.
 *
 * `value` is a ReactNode so a caller can pass a dash for something not yet
 * observed — and `note` is required, because a number with no unit beneath it
 * is the thing OPC-7 exists to stop us printing.
 *
 * `formula` IS THE `?`, and it is the same affordance DS2 put on every sort
 * pill: a derived number owes a sentence a reader can reach (OPC-4), and a
 * sentence nobody can find is a sentence nobody has. A real anchor rather
 * than a tooltip, because a tooltip cannot be shared, cannot be reached by
 * keyboard on a phone, and cannot be quoted back at us by somebody who thinks
 * the number is wrong — which is the entire reason for publishing it.
 *
 * OPTIONAL, because not every card is derived: a card showing a fact somebody
 * TYPED has no formula, and giving it one would send a reader to a rule that
 * did not produce it.
 */
export function StatCard({
  label,
  value,
  note,
  formula,
  pending: isPending,
}: {
  label: string;
  value: ReactNode;
  /** A ReactNode so a caller can pass the observed-at line SN2 requires. */
  note: ReactNode;
  formula?: FormulaId;
  pending?: Pending;
}) {
  return (
    <div
      className="rounded-[12px] border border-border bg-card px-4 py-3.5"
      {...(isPending ? pendingProps(isPending) : {})}
    >
      <div className="flex items-center justify-between gap-2 text-[13px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        <span>{label}</span>
        {formula ? (
          <AppLink
            href={formulaHref(formula)}
            aria-label={`How "${label}" is computed`}
            title={`How "${label}" is computed`}
            // The design draws no `?`, so the link is visually hidden until
            // it has focus — the address still exists, and a keyboard or a
            // screen reader still reaches it (OPC-4).
            className="sr-only grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full font-mono text-[12px] font-normal normal-case tracking-normal text-muted-foreground focus:not-sr-only focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            ?
          </AppLink>
        ) : null}
      </div>
      <div
        className={`mt-1.5 text-[22px] font-medium tabular-nums ${isPending ? "text-muted-foreground" : "text-foreground"}`}
      >
        {value}
      </div>
      <div className="mt-[3px] text-[14px] text-muted-foreground">{note}</div>
    </div>
  );
}

/**
 * A person's name, as a LINK when their profile resolves and as plain text
 * when it does not (openproduct-commons XP-5, wired by CG4).
 *
 * ONE COMPONENT BECAUSE IT IS ONE RULE. The product page renders maintainer
 * names in two places — the roster and the sidebar — and a rule expressed as
 * two ternaries is a rule that holds in one of them after the next edit. The
 * first draft of CG4 did exactly that, and a browser found the half that was
 * still plain text.
 *
 * THE BRANCH TURNS ON PRESENCE ALONE. `handle` is non-null if and only if
 * `/@handle` resolves — the read applies both of the profile's own gates, the
 * opt-in and standing — so nothing here has to know why a handle is missing,
 * and nothing here can get the reason wrong. There is deliberately no fallback
 * address: a link built from a subject id, or from a guessed handle, is the
 * dead link this rule exists to forbid wearing a convenience.
 *
 * THE LABEL IS THE SAME EITHER WAY. Somebody without a public profile must not
 * read as diminished beside somebody with one — that would turn an opt-in into
 * a status, which is the opposite of what OPC-5 is for.
 */
export function PersonName({
  name,
  handle,
  className,
}: {
  name: string;
  handle: string | null;
  className: string;
}) {
  if (!handle) return <span className={className}>{name}</span>;
  return (
    <AppLink
      className={`${className} underline decoration-transparent underline-offset-[3px] hover:decoration-inherit`}
      href={`/@${handle}`}
    >
      {name}
    </AppLink>
  );
}

/** A small uppercase section heading — the design's `WHERE IT NEEDS PEOPLE`. */
/**
 * A number and its word, inline, with its published sentence behind them
 * (openproduct-launch MP0).
 *
 * THE DESIGN'S MAKER HEADER DRAWS ITS COUNTS AS A ROW OF TEXT, not as cards,
 * and MP0 moved this page's three CG4 numbers into the same shape — two of
 * them onto the headings of the sections that list what they count, where a
 * reader can check the number against the evidence instead of taking it on
 * trust from a card beside it.
 *
 * WHAT DID NOT CHANGE IS THE `?`. Every derived number on this estate owes a
 * sentence a reader can reach (OPC-4), and moving a number out of a card is
 * not a reason to drop its link. Visually hidden until focus, exactly as
 * `StatCard` hides it, because the design draws no `?` and a keyboard and a
 * screen reader still have to find one.
 */
export function StatInline({
  value,
  label,
  formula,
}: {
  value: ReactNode;
  label: string;
  /**
   * REQUIRED SINCE VC2, and the change is one character.
   *
   * **WC-7**: every counter is computed by the same query as the list beside
   * it, and where two counts legitimately differ the difference is *published
   * at an address* and linked from the number. `formula` is that address, and
   * while it was optional a counter could ship without one — not because
   * anybody wanted that, but because nothing stopped it. All six call sites
   * already passed one, so making it required cost nothing and closed the
   * hole permanently: the compiler now enforces what a test could only
   * notice.
   */
  formula: FormulaId;
}) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono font-medium text-foreground tabular-nums">{value}</span>{" "}
      {label}
      <AppLink
        href={formulaHref(formula)}
        aria-label={`How "${label}" is computed`}
        title={`How "${label}" is computed`}
        className="sr-only ml-1 font-mono text-[12px] font-normal text-muted-foreground focus:not-sr-only focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
      >
        ?
      </AppLink>
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </h2>
  );
}

/**
 * What a not-yet section renders instead of an empty list.
 *
 * Deliberately not a skeleton: a skeleton says "loading", and this is not
 * loading. It says what will be here and which part of the product brings it.
 */
export function NotYet({ what, pending: p }: { what: string; pending: Pending }) {
  return (
    <div
      className="rounded-[12px] border border-dashed border-border-strong bg-muted px-4 py-5"
      data-pending={p.cluster}
    >
      <p className="m-0 max-w-[70ch] text-[14.5px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{what}</span> — {p.then}.
      </p>
    </div>
  );
}

/** The value a surface renders where something has not been observed.
 *  Never `0`: a zero is a claim, and an unmeasured thing has not made one. */
export const DASH = "—";
