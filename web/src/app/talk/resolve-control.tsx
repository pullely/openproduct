"use client";

import * as React from "react";

import { TALK_MARK_RESOLVED, TALK_RESOLVED } from "@openproduct/contracts";

import { useMaker } from "../[slug]/maker/use-maker";
import { FOCUS } from "../ui/design-core";

import { TALK_ACTION, TALK_ACTION_DONE, TALK_ACTION_PLAIN, TALK_RESOLVED_MARK } from "./classes";
import { CheckGlyph } from "./glyphs";
import { canResolve, isResolved, threadResolveRoute, type TalkThread } from "./model";

/**
 * What an issue says about being resolved (boards `Product`, `PhoneProduct`).
 *
 *   everybody   a resolved issue shows a green "Resolved" — in the cached
 *               page, the same for every visitor
 *   the crew    on Manage, an issue shows the Mark resolved button instead,
 *               pressed when it is resolved
 *
 * THE SERVER RENDER IS THE VISITOR'S. `useMaker` answers "not the crew" on
 * the server and until the overlay has spoken, so the button is drawn only
 * in the crew's own browser. `slug` may be null (a thread whose product the
 * page was not told): then nobody is the crew here.
 *
 * The press is optimistic and is taken back if the write is refused. The
 * cached page catches up within its minute.
 */
export function ResolveControl({
  slug,
  thread,
}: {
  slug: string | null;
  thread: Pick<TalkThread, "id" | "kind" | "state" | "resolvedAt">;
}) {
  const { managing } = useMaker(slug ?? "");
  const [resolved, setResolved] = React.useState(isResolved(thread));
  const [busy, setBusy] = React.useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !resolved;
    setBusy(true);
    setResolved(next);
    try {
      const res = await fetch(threadResolveRoute(thread.id), {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ resolved: next ? "1" : "0" }),
      });
      if (!res.ok) setResolved(!next);
    } catch {
      setResolved(!next);
    } finally {
      setBusy(false);
    }
  };

  if (slug !== null && canResolve(thread, managing)) {
    return (
      <button
        type="button"
        aria-pressed={resolved}
        onClick={toggle}
        data-resolve
        className={`${TALK_ACTION} cursor-pointer border-0 ${resolved ? TALK_ACTION_DONE : TALK_ACTION_PLAIN} ${FOCUS}`}
      >
        {resolved ? TALK_RESOLVED : TALK_MARK_RESOLVED}
      </button>
    );
  }
  if (!resolved) return null;
  return (
    <span data-resolved className={TALK_RESOLVED_MARK}>
      <CheckGlyph />
      {TALK_RESOLVED}
    </span>
  );
}
