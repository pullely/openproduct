"use client";

import * as React from "react";

/**
 * The copy-able short link (openproduct-commons CG1).
 *
 * The design draws `openproduct.live/@ada` with a `Copy` → `Copied` button
 * that reverts after about a second and a half. That detail is the point of
 * the control: a handle is a thing people HAND OUT, and the page's job is to
 * make handing it out one gesture.
 *
 * THE LINK IS ALSO A LINK. The button copies, but the address beside it is
 * selectable text — a copy button is a convenience, and a page that offers
 * only a button has taken the address away from anyone whose clipboard
 * permission was refused, whose browser is old, or who wanted to read it.
 *
 * The label swap is the only feedback: no toast, because a toast for a copy
 * is a notification about something the person just did on purpose.
 */
export function CopyLink({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    // `max-w-full` and a truncating label: on a phone the address is wider
    // than the hero's text column, and it must not widen the page. The text
    // is still `select-all`, so what is copied by hand is the whole address.
    <span className="inline-flex h-[30px] max-w-full items-center gap-2 rounded-[8px] border border-border bg-card pl-3 pr-1">
      <span className="min-w-0 select-all truncate font-mono text-[13px] text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={() => {
          void (async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              // Clipboard access can be refused, and there is nothing to say
              // about it: the address is selectable text right beside this
              // button, so the person already has the other way.
            }
          })();
        }}
        aria-live="polite"
        className="shrink-0 rounded-[6px] px-2 py-0.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
