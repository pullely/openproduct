"use client";

import * as React from "react";

import {
  NO_MATCHES,
  searchSegments,
  sectionHead,
  visibleSections,
  type SearchCounts,
  type SearchSection,
  type SearchSegment,
} from "./segments";

import { EYEBROW, FOCUS } from "../ui/design";

/**
 * The segmented control and the sections under it (openproduct-redesign
 * OPR1, boards `Search` and `PhoneSearch`).
 *
 * ─── THE CLIENT HALF IS THE CHOICE AND NOTHING ELSE ───────────────────────
 *
 * The server page reads the query, makes the one read and draws every row.
 * This component receives those rows as finished nodes, one per class, and
 * owns a single piece of state: which segment is pressed. So the rows stay a
 * server render (a product's tile resolves its image origin there), the page
 * is the same bytes for every visitor (I6), and with no JavaScript the
 * reader gets All — every section, each under its own head.
 *
 * ─── COUNTS ARE THE READ'S, NEVER THE CHOICE'S ────────────────────────────
 *
 * Each segment wears how many of its class the query found, and pressing a
 * segment changes what is shown, not what was counted. A class with nothing
 * in it keeps its segment at zero (`searchSegments`).
 *
 * ─── THE BOARD'S MEASUREMENTS ─────────────────────────────────────────────
 *
 * A pill tray on a 6% ink wash, 4px inside; each segment 40px tall at 15px
 * with its count in the mono face. On a phone the tray spans the column and
 * the segments share it, 44px tall at 13px. A section's own head (`Products
 * · 3`) is drawn under All only: under one segment the pressed pill already
 * says it.
 */
export function SearchView({
  counts,
  products,
  people,
  topics,
}: {
  counts: SearchCounts;
  products: React.ReactNode;
  people: React.ReactNode;
  topics: React.ReactNode;
}) {
  const [segment, setSegment] = React.useState<SearchSegment>("all");
  const bodies: Record<SearchSection, React.ReactNode> = { products, people, topics };
  const shown = visibleSections(segment, counts);

  return (
    <>
      <div
        role="group"
        aria-label="Show results"
        className="box-border flex max-w-full flex-wrap gap-[2px] self-start rounded-full bg-foreground/[0.06] p-1 max-sm:flex-nowrap max-sm:self-stretch max-sm:p-[3px]"
      >
        {searchSegments(counts).map((item) => {
          const on = item.key === segment;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSegment(item.key)}
              aria-pressed={on}
              className={`flex min-h-[40px] items-center gap-2 rounded-full border-0 px-4 text-[15px] transition-colors max-sm:min-h-[44px] max-sm:min-w-0 max-sm:flex-auto max-sm:justify-center max-sm:gap-[5px] max-sm:px-2 max-sm:text-[13px] ${FOCUS} ${
                on
                  ? "bg-card font-semibold text-foreground"
                  : "bg-transparent font-medium text-copy hover:text-foreground"
              }`}
            >
              {item.label}
              <span
                className={`font-mono text-label font-normal ${on ? "text-amber-ink" : "text-muted-foreground"}`}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {shown.map((section) => (
        <section
          key={section}
          aria-label={sectionHead(section, counts[section])}
          className="flex flex-col gap-[10px] max-sm:gap-[6px]"
        >
          {segment === "all" ? (
            <h2 className={`m-0 px-[6px] font-normal ${EYEBROW}`}>
              {sectionHead(section, counts[section])}
            </h2>
          ) : null}
          {bodies[section]}
        </section>
      ))}

      {shown.length === 0 ? (
        <p
          role="status"
          className="m-0 rounded-[16px] bg-card p-8 text-center text-[15px] text-muted-foreground max-sm:px-[14px] max-sm:py-6"
        >
          {NO_MATCHES}
        </p>
      ) : null}
    </>
  );
}
