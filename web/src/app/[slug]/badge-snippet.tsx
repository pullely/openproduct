"use client";

import * as React from "react";

/**
 * The line a maker pastes into their README (openproduct-worldclass RE4).
 *
 * The audit's own words for why this exists: an embeddable badge is *"Product
 * Hunt's single largest organic growth loop"*. The badge is worth nothing
 * unless the person who would paste it can find the line without reading
 * documentation, so the line lives on the listing, under the fold, beside the
 * thing it is a badge for.
 *
 * TWO FORMS, BECAUSE READMEs ARE NOT ALL MARKDOWN. Markdown is the default and
 * HTML is one tab away — a maintainer whose README is `.rst` or whose docs are
 * generated has the same badge and no reason to hand-translate it.
 *
 * THE SNIPPET IS SELECTABLE TEXT AND THE BUTTON IS A CONVENIENCE, which is the
 * rule `CopyLink` already states: a page that offers only a button has taken
 * the value away from anyone whose clipboard permission was refused, whose
 * browser is old, or who wanted to read it before pasting it.
 */
/** OB7 — one badge the maker can paste: what it says, and both forms. */
export interface BadgeChoice {
  readonly id: string;
  readonly label: string;
  /** What the badge's right half reads, so the chooser shows it. */
  readonly value: string;
  readonly markdown: string;
  readonly html: string;
}

export function BadgeSnippet({ choices }: { choices: readonly BadgeChoice[] }) {
  const [form, setForm] = React.useState<"markdown" | "html">("markdown");
  // OB7 — which badge: *listed*, *most active #n*, *n changes this week*.
  const [chosen, setChosen] = React.useState(choices[0]?.id ?? "");
  const [copied, setCopied] = React.useState(false);
  const choice = choices.find((c) => c.id === chosen) ?? choices[0];
  const value = choice ? (form === "markdown" ? choice.markdown : choice.html) : "";

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  // After every hook, so the hook order never changes (an empty list is
  // the page's own guard; this is the component's).
  if (!choice) return null;

  return (
    <div>
      {choices.length > 1 ? (
        <div role="group" aria-label="Which badge" className="mb-2 flex flex-wrap gap-1.5">
          {choices.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                setChosen(option.id);
                setCopied(false);
              }}
              aria-pressed={choice.id === option.id}
              title={option.value}
              className={`tap inline-flex h-[28px] items-center gap-1.5 rounded-full border px-2 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
                choice.id === option.id
                  ? "border-border-strong bg-card text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="font-medium">{option.label}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{option.value}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div role="group" aria-label="Snippet format" className="mb-2 inline-flex gap-0.5 rounded-[14px] bg-surface-2 p-0.5">
        {(["markdown", "html"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setForm(option);
              setCopied(false);
            }}
            aria-pressed={form === option}
            className={`tap h-[26px] rounded-full px-2.5 text-[13px] font-medium capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
              form === option
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div>
        {/* FR5 — IT SCROLLS, SO IT HAS TO BE REACHABLE. A snippet is longer
            than a phone is wide, `overflow-x-auto` makes it scroll sideways,
            and it holds nothing focusable — so a keyboard user could not
            scroll it and saw the first two thirds of a line they were meant
            to copy. `tabIndex` makes it a stop, and the name is what makes
            that stop explicable. `select-all` was already the point of this
            element; being able to GET here with a keyboard is the rest of
            it. */}
        <code
          role="region"
          aria-label="The badge snippet"
          tabIndex={0}
          className="block select-all overflow-x-auto rounded-[14px] bg-well px-3 py-2 font-mono text-[13px] leading-[1.6] text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(value);
                setCopied(true);
              } catch {
                // Clipboard access can be refused, and there is nothing to
                // say about it: the snippet is selectable text right beside
                // this button, so the person already has the other way.
              }
            })();
          }}
          aria-live="polite"
          className="tap mt-2 inline-flex h-[32px] items-center gap-1.5 rounded-full border border-border-strong bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:border-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 3.5h-7a1 1 0 0 0-1 1v7" />
          </svg>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
