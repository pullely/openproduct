"use client";

import { useEffect, useState } from "react";

import { BTN_INK, BTN_SOFT } from "../../ui/design";

/**
 * Save and Discard for the settings form (openproduct-redesign OPR1, boards
 * `Settings` and `PhoneSettings`): the status word, Discard while there is
 * something to discard, and Save — spent while there is nothing to save.
 *
 * THE FORM STILL WORKS WITHOUT THIS. The two buttons are a real `submit` and
 * a real `reset` bound to the form by its id, so before this script runs —
 * or if it never does — Save posts the form exactly as the old page's button
 * did. What the script adds is the board's behaviour on top: it compares
 * each control with the value the server rendered, and only then disables a
 * Save that would save nothing and shows a Discard that would discard
 * something.
 *
 * THE COMPARISON IS THE BROWSER'S OWN: `defaultValue` and `defaultChecked`
 * are what the document arrived with, so "changed" needs no copy of the
 * profile in script and cannot drift from what the form will actually post.
 *
 * The page hangs two amber dots on the same fact (the side list's row and the
 * card's heading), so the nearest `[data-settings]` ancestor is told too,
 * and the dots are plain CSS.
 */
export function SaveBar({ formId, saved }: { formId: string; saved: boolean }) {
  // `null` until the script has looked: Save stays live for that moment.
  const [dirty, setDirty] = useState<boolean | null>(null);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const scope = form.closest("[data-settings]");
    const measure = () => {
      const changed = formChanged(form);
      setDirty(changed);
      scope?.toggleAttribute("data-dirty", changed);
    };
    // A reset event fires BEFORE the controls go back, so look after it.
    const afterReset = () => window.setTimeout(measure, 0);
    // A reload can restore what was typed: measure once on arrival too.
    const arrival = window.setTimeout(measure, 0);
    form.addEventListener("input", measure);
    form.addEventListener("change", measure);
    form.addEventListener("reset", afterReset);
    return () => {
      window.clearTimeout(arrival);
      form.removeEventListener("input", measure);
      form.removeEventListener("change", measure);
      form.removeEventListener("reset", afterReset);
    };
  }, [formId]);

  const status = dirty ? "Unsaved changes" : saved ? "Saved" : "";

  return (
    <div className="flex items-center gap-3 max-sm:gap-2">
      {/* On a phone the word for "unsaved" is not drawn (board
          `PhoneSettings`: Discard appearing says it, and the dot beside the
          card's heading); it is still announced. */}
      <span role="status" className={`text-[13px] ${dirty ? "text-amber-ink max-sm:sr-only" : "text-success"}`}>
        {status}
      </span>
      {dirty ? (
        <button type="reset" form={formId} className={`${BTN_SOFT} cursor-pointer border-0 px-4 text-copy`}>
          Discard
        </button>
      ) : null}
      <button
        type="submit"
        form={formId}
        disabled={dirty === false}
        className={`${BTN_INK} cursor-pointer border-0 px-[22px] disabled:cursor-default disabled:bg-foreground/[0.08] disabled:text-muted-foreground disabled:opacity-100 max-sm:px-5`}
      >
        Save
      </button>
    </div>
  );
}

/** Does any control differ from what the document arrived with? */
function formChanged(form: HTMLFormElement): boolean {
  for (const control of Array.from(form.elements)) {
    if (control instanceof HTMLInputElement) {
      if (control.type === "hidden") continue;
      if (control.type === "checkbox" || control.type === "radio") {
        if (control.checked !== control.defaultChecked) return true;
      } else if (control.value !== control.defaultValue) {
        return true;
      }
    } else if (control instanceof HTMLTextAreaElement) {
      if (control.value !== control.defaultValue) return true;
    }
  }
  return false;
}
