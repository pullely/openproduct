"use client";

import * as React from "react";

import { FOCUS } from "../../ui/design";

import { POST_SHARE_COPIED, POST_SHARE_FAILED, POST_SHARE_LABEL } from "./post-page";

/**
 * *Share* on a post's page (openproduct-redesign OPR-3; boards `Post`,
 * `PhonePost`): copies the post's address and says so for a moment.
 *
 * NO WIDGET AND NO THIRD PARTY (the share control's rule, RE3): the thing
 * people want is the link, and the browser's clipboard is the whole
 * mechanism.
 *
 * A LINK TO THE POST ITSELF, so with no JavaScript — or a clipboard that
 * refuses — it is still the address, one long-press or right-click away from
 * being copied by hand.
 *
 * THE SAME MARKUP FOR EVERY VISITOR (I6): `path` is the post's own address,
 * and the origin is read in the browser at the press.
 */
export function PostShare({ path, url }: { path: string; /** The canonical address, where the deployment has one. */ url: string | null }) {
  const [said, setSaid] = React.useState<"copied" | "failed" | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const address = url ?? `${window.location.origin}${path}`;
    const done = (outcome: "copied" | "failed") => {
      setSaid(outcome);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setSaid(null), 1600);
    };
    if (!navigator.clipboard) {
      done("failed");
      return;
    }
    navigator.clipboard.writeText(address).then(
      () => done("copied"),
      () => done("failed"),
    );
  };

  return (
    <a
      href={path}
      onClick={copy}
      data-post-share
      className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-full text-[13px] font-medium text-copy no-underline hover:bg-foreground/[0.04] max-sm:min-h-[44px] ${FOCUS}`}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5" />
      </svg>
      <span role="status">{said === "copied" ? POST_SHARE_COPIED : said === "failed" ? POST_SHARE_FAILED : POST_SHARE_LABEL}</span>
    </a>
  );
}
