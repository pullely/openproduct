"use client";

import * as React from "react";

import { AUTH_ERROR_COPY } from "./auth/auth";
import { FOCUS } from "./ui/design";
import { CloseIcon } from "./ui/icons";

/**
 * The sign-in failure notice (launch polish, from the Chrome review).
 *
 * Every auth failure redirects to `/?auth_error=<reason>` — and before this
 * island, nothing read it: a denied consent or an expired handshake landed on
 * the directory pixel-identical to a normal visit. The query is read HERE, on
 * the client, so the server-rendered page stays static and cached; dismissing
 * strips the parameter so a reload or a share does not resurrect the notice.
 *
 * THE NEW LOOK (openproduct-redesign OPR1): one flat card above the page —
 * what failed, in the danger ink because it IS a failure (design.md §2 rule
 * 8), one muted sentence, one action (sign in again) and a round dismiss.
 * No heading element: the page under it has the `h1`.
 */
export function AuthNotice() {
  const [copy, setCopy] = React.useState<{ title: string; detail: string } | null>(null);

  React.useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("auth_error");
    if (!reason) return;
    setCopy(
      AUTH_ERROR_COPY[reason] ?? {
        title: "Sign-in didn't complete",
        detail: "Something interrupted the sign-in. Trying again usually resolves it.",
      },
    );
  }, []);

  if (!copy) return null;

  const dismiss = () => {
    setCopy(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("auth_error");
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  return (
    <div role="status" className="mx-auto mt-4 box-border w-full max-w-[760px] px-6 max-sm:mt-[10px] max-sm:px-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[16px] bg-card py-2 pl-5 pr-2 max-sm:pl-4">
        <div className="min-w-0 flex-1 basis-[240px] py-1">
          <p className="m-0 text-[15px] font-semibold text-destructive">{copy.title}</p>
          <p className="m-0 text-[13px] text-muted-foreground">{copy.detail}</p>
        </div>
        <a
          href="/signin"
          className={`inline-flex min-h-[40px] shrink-0 items-center rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground no-underline transition-opacity hover:opacity-90 max-sm:min-h-[44px] ${FOCUS}`}
        >
          Sign in again
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className={`grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full border-0 bg-transparent text-muted-foreground hover:text-foreground max-sm:h-[44px] max-sm:w-[44px] ${FOCUS}`}
        >
          <CloseIcon className="h-[14px] w-[14px]" />
        </button>
      </div>
    </div>
  );
}
