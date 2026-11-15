"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { FOCUS } from "../../ui/design";

import { VIEW_MODES, VIEW_MODE_LABELS, VIEW_SWITCH_LABEL, VIEW_SWITCH_SLOT_ID, type ViewMode } from "./model";
import { setViewMode, useMaker } from "./use-maker";

/**
 * The Manage / Visitor switch (boards `Product`, `PhoneProduct`; design §4).
 *
 * CREW ONLY, AND IN THE SITE HEADER. From `sm` up it is the board's small
 * segmented control, left of the search; on a phone it is the board's two
 * icon buttons (a pencil and an eye). It is drawn into the header's one named
 * slot through a portal, so the header itself stays the static bar it is for
 * everybody else.
 *
 * Nothing renders until the overlay says this visitor is on the crew — the
 * slot stays empty on the server, for a signed-out visitor, and for anybody
 * who is not on this product's crew.
 */
export function ViewSwitch({ slug }: { slug: string }) {
  const { writes, mode } = useMaker(slug);
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setSlot(document.getElementById(VIEW_SWITCH_SLOT_ID));
  }, []);

  // SC-3 — a Member has nothing to manage: no switch.
  if (!writes || slot === null) return null;

  return createPortal(
    <div
      role="group"
      aria-label={VIEW_SWITCH_LABEL}
      data-view-switch
      className="flex shrink-0 gap-0.5 rounded-full bg-foreground/[0.06] p-[3px]"
    >
      {VIEW_MODES.map((option) => {
        const on = option === mode;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            aria-label={option === "visitor" ? "Visitor view" : VIEW_MODE_LABELS[option]}
            title={option === "visitor" ? "Visitor view" : VIEW_MODE_LABELS[option]}
            onClick={() => setViewMode(slug, option)}
            // 34px in the desktop header (board `Product`); a 44px disc on a
            // phone (board `PhoneProduct`), where only the glyph is drawn.
            className={`inline-flex h-[34px] cursor-pointer items-center justify-center rounded-full border-0 px-3 text-[13px] transition-colors max-sm:h-[44px] max-sm:w-[44px] max-sm:px-0 ${FOCUS} ${
              on ? "bg-card font-semibold text-foreground" : "bg-transparent font-medium text-muted-foreground"
            }`}
          >
            <ViewGlyph mode={option} />
            <span className="max-sm:hidden">{VIEW_MODE_LABELS[option]}</span>
          </button>
        );
      })}
    </div>,
    slot,
  );
}

/** The phone board's glyphs: a pencil for Manage, an eye for Visitor. */
function ViewGlyph({ mode }: { mode: ViewMode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="sm:hidden"
    >
      <path
        d={
          mode === "manage"
            ? "M4 20h4L19 9l-4-4L4 16zM14 6l4 4"
            : "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z"
        }
      />
    </svg>
  );
}
