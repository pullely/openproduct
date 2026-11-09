"use client";

// The strip of steps along the hero card's bottom edge (IN1), drawn ONCE by
// the listing's layout rather than once per step (openproduct-studio OSD5).
//
// WHY A CLIENT COMPONENT. The layout persists across tab clicks — that is the
// point of it: the head, the hero and this strip stay on screen while only the
// open card is fetched. A layout is not re-rendered when a sibling segment
// changes, so it cannot be told which tab is current by a prop; the strip
// reads the one fact it needs, the selected segment, from the router. It is
// the only client code the editor's chrome carries, and it holds no data.
//
// WHAT IT REFUSES TO DO IS SCORE THEM. A tick beside a filled step and a dash
// beside an empty one is a completeness meter, and the meter is IN3's, in the
// rail. This is navigation.

import { useSelectedLayoutSegment } from "next/navigation";

import { STRIP_STEPS, listingBasePath, listingStepPath } from "@openproduct/contracts";

import { TAB_OFF, TAB_ON } from "../../../ui/design";
import { AppLink } from "../../../ui/link";

/** A tab on the hero's strip: 40px tall, 14px/500, the accent underline when current. */
const STRIP_TAB = "-mb-px inline-flex h-[40px] items-center border-b-2 px-3 text-[14px] font-medium transition-colors";

export function StepStrip({ org, profileId }: { org: string; profileId: string }) {
  // `null` on the overview — the layout's own page.
  const segment = useSelectedLayoutSegment();
  const base = listingBasePath(org, profileId);
  const tabs = [
    { key: "overview", label: "Overview", href: base, current: segment === null },
    // OB6 — `STRIP_STEPS`: the Launches step left the strip; its page stays.
    ...STRIP_STEPS.map((step) => ({
      key: step.id,
      label: step.label,
      href: listingStepPath(org, profileId, step),
      current: step.segment !== null && step.segment === segment,
    })),
    // CB1's surface is not a step of the listing — nothing on it is authored —
    // but it is a section of the editor, so it sits at the end of the strip.
    { key: "discussions", label: "Discussions", href: `${base}/discussions`, current: segment === "discussions" },
  ];
  return (
    <nav aria-label="Listing steps" className="mt-4 border-t border-line px-3 max-sm:px-1">
      <ol className="m-0 flex list-none flex-wrap gap-x-0.5 p-0">
        {tabs.map((tab) =>
          tab.href === null ? (
            <li key={tab.key}>
              <span className={`${STRIP_TAB} whitespace-nowrap border-transparent text-faint`}>{tab.label}</span>
            </li>
          ) : (
            <li key={tab.key}>
              <AppLink
                // "auto" in view: the layout is already here, so what it fetches
                // is the tab's own loading boundary — the click paints the
                // card's skeleton at once. "intent" on hover: the card itself.
                prefetch="auto"
                warm="intent"
                href={tab.href}
                {...(tab.current ? { "aria-current": "page" as const } : {})}
                className={`${STRIP_TAB} ${tab.current ? TAB_ON : TAB_OFF} whitespace-nowrap no-underline`}
              >
                {tab.label}
              </AppLink>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
