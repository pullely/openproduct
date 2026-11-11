"use client";

import * as React from "react";

import { SHARE_LABEL, type ShareIntent } from "@openproduct/contracts";

/**
 * The share control (openproduct-worldclass RE3).
 *
 * ─── NO WIDGET, BECAUSE THE ZERO IS WORTH MORE THAN THE WIDGET ────────────
 *
 * The audit measured **zero** third-party requests on this site and named it
 * one of only two dimensions the product already wins. Every share widget on
 * the internet is a script from somebody else's origin that reports who looked
 * at the page, and adding one would trade a measured advantage for a row of
 * logos.
 *
 * So this is three things and none of them is a script:
 *
 *   THE BROWSER'S OWN SHEET  `navigator.share` where it exists — a native
 *                            dialog on every phone and on Safari and Edge,
 *                            offering every app the reader actually has,
 *                            including the ones no widget would list.
 *   THE ADDRESS              copyable, because the thing most people want is
 *                            the URL, and because a control that offers only
 *                            buttons has taken it away from anyone whose
 *                            clipboard was refused.
 *   PLAIN LINKS              an intent is an `<a href>`. Nothing is fetched,
 *                            nothing is embedded, and no request leaves this
 *                            page unless a person clicks — which is a
 *                            NAVIGATION, not a third-party request, and the
 *                            distinction is the whole reason this is allowed.
 *
 * ─── THE SHEET IS TRIED FIRST AND THE PANEL IS NOT A FALLBACK ─────────────
 *
 * Both are always available. A reader on a phone gets the native sheet on the
 * first tap; a reader whose browser has no sheet gets the panel; and a reader
 * who dismisses the sheet still has the panel, because dismissing a sheet is
 * not the same as not wanting to share. The alternative — a control that does
 * one thing on one browser and another elsewhere, with no way back — is how a
 * share button ends up being reported as broken by the half of people whose
 * browser took the other branch.
 */
export function ShareControl({
  url,
  text,
  intents,
  className = "",
}: {
  url: string;
  text: string;
  intents: readonly ShareIntent[];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  React.useEffect(() => {
    if (!open) return;
    const onAway = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((was) => !was);
          // THE SHEET IS OPENED FROM THE CLICK, not from an effect: every
          // browser requires a user gesture for `navigator.share`, and a call
          // one tick later is a call that gets refused.
          if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
            void navigator.share({ title: text, text, url }).then(
              () => setOpen(false),
              () => {
                // Dismissed, or refused. Either way the panel is behind it and
                // there is nothing to say — a toast about a dialog somebody
                // just closed is a notification about their own decision.
              },
            );
          }
        }}
        title={SHARE_LABEL}
        aria-label={SHARE_LABEL}
        className="tap inline-flex h-[36px] w-[36px] items-center justify-center rounded-full border border-transparent bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
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
          <path d="M8 10.5V3M5.5 5.5 8 3l2.5 2.5M3.5 9.5V13h9V9.5" />
        </svg>
      </button>

      {open ? (
        <div
          role="group"
          aria-label={SHARE_LABEL}
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(320px,calc(100vw-32px))] rounded-[12px] border border-border bg-card p-3 shadow-menu"
        >
          <div className="flex items-center gap-2">
            {/* The same reachable-scroll-region treatment as the badge
                snippet's `<code>` (FR5), for the same reason: an address is
                wider than a phone, this scrolls, and nothing in it could take
                focus. */}
            <code
              role="region"
              aria-label="The address"
              tabIndex={0}
              className="min-w-0 flex-1 select-all overflow-x-auto rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-[12.5px] text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {url}
            </code>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                  } catch {
                    // The address is selectable text right beside this button,
                    // so the person already has the other way.
                  }
                })();
              }}
              aria-live="polite"
              className="inline-flex h-[32px] shrink-0 items-center rounded-full border border-border-strong px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-1.5 p-0">
            {intents.map((intent) => (
              <li key={intent.id}>
                <a
                  href={intent.href}
                  target="_blank"
                  // `noreferrer` as well as `noopener`: the destination has no
                  // business being told which listing somebody was reading
                  // when they decided to post about it.
                  rel="noreferrer noopener"
                  className="tap inline-flex h-[30px] items-center rounded-full border border-border px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {intent.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
