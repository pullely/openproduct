"use client";

import * as React from "react";

import { INSTALL_COPIED_LABEL, INSTALL_COPY_LABEL } from "@openproduct/contracts";

/**
 * The install line (openproduct-worldclass PV2).
 *
 * One command, in the maintainer's own words, in the design's grey mono box
 * with Copy inside it. `BadgeSnippet`'s shape, one form rather than two — and the rules it
 * states apply here for the same reasons:
 *
 *   SELECTABLE TEXT FIRST, BUTTON AS A CONVENIENCE. A page that offers only a
 *   button has taken the value away from anybody whose clipboard permission
 *   was refused, whose browser is old, or who wanted to READ the command
 *   before pasting it — and on this element, more than on the badge, reading
 *   it first is the point.
 *
 *   IT SCROLLS, SO IT HAS TO BE REACHABLE (FR5). A `docker run` with a port
 *   and a registry path is longer than a phone is wide; `overflow-x-auto`
 *   makes it scroll and `tabIndex` makes that scroll reachable by keyboard.
 *
 * ─── THE NOTE UNDER THE BOX IS NOT DECORATION ────────────────────────────
 *
 * It says a maintainer wrote this and that nothing here has run it. That is
 * the entire provenance claim the field makes, and it is the one sentence
 * standing between "a command on a page" and "a command this product
 * endorses". `INSTALL_NOTE` is a contract constant, and a contract test
 * refuses every stronger word — verified, official, safe, tested, trusted —
 * because none of them is true.
 */
export function InstallLine({ command }: { command: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-3 rounded-[14px] bg-well py-1 pl-3 pr-1">
        <code
          role="region"
          aria-label="The install command"
          tabIndex={0}
          className="min-w-0 flex-1 select-all overflow-x-auto whitespace-pre py-1 font-mono text-[13px] leading-[1.6] text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {command}
        </code>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(command);
                setCopied(true);
              } catch {
                // Clipboard access can be refused, and there is nothing to
                // say about it: the command is selectable text right beside
                // this button, so the person already has the other way.
              }
            })();
          }}
          aria-live="polite"
          className="tap inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border-0 bg-transparent px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <CopyGlyph />
          {copied ? INSTALL_COPIED_LABEL : INSTALL_COPY_LABEL}
        </button>
      </div>
    </div>
  );
}

/** The design's copy glyph: two offset squares. */
function CopyGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5h-7a1 1 0 0 0-1 1v7" />
    </svg>
  );
}
