"use client";

import * as React from "react";

import { AUTH_ERROR_COPY } from "./auth/auth";

/**
 * The sign-in failure notice (launch polish, from the Chrome review).
 *
 * Every auth failure redirects to `/?auth_error=<reason>` — and before this
 * island, nothing read it: a denied consent or an expired handshake landed on
 * the directory pixel-identical to a normal visit. The query is read HERE, on
 * the client, so the server-rendered page stays static and cached; dismissing
 * strips the parameter so a reload or a share does not resurrect the notice.
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
    <div
      role="status"
      className="mx-auto mt-6 flex w-full max-w-3xl items-start justify-between gap-4 px-5 sm:px-6"
    >
      <div className="flex-1 rounded-lg border border-border bg-muted px-4 py-3">
        <p className="text-[13px] font-medium text-foreground">{copy.title}</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {copy.detail}{" "}
          <a className="underline underline-offset-4" href="/signin">
            Try signing in again
          </a>
          .
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="mt-1 shrink-0 text-[13px] text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
