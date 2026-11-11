"use client";

import { useEffect } from "react";

import { claimReload, isStaleDeployError } from "@/lib/stale-deploy";

// The boundary of last resort (openproduct-commons XP3).
//
// This one replaces the ROOT LAYOUT, which means the shell, the fonts and the
// token stylesheet are all gone by the time it renders — Next requires it to
// emit its own `<html>` and `<body>`. So it is deliberately the plainest
// thing in this app: system fonts, inline colours, no imports that could
// themselves be what failed.
//
// A styled page here would be a page betting that the failure was not in the
// styling. That bet is exactly the one you lose in the case this file exists
// for. What it CAN borrow from the design costs nothing: the 26px/600 title,
// the 36px 8px-radius button, spelled inline.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // OB8 — a page from the previous build (its chunks are gone) reloads into
  // the current one, once per address per minute (`lib/stale-deploy.ts`).
  // Only that pure module is imported — no `ui/`, no stylesheet: this
  // boundary renders its own document and must not depend on anything the
  // failed layout provides.
  useEffect(() => {
    if (!isStaleDeployError(error)) return;
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    if (claimReload(storage, window.location.pathname, Date.now())) window.location.reload();
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background: "#fafafa",
          color: "#171717",
          font: "16px/1.55 system-ui, sans-serif",
          padding: "64px 20px",
        }}
      >
        <main style={{ margin: "0 auto", maxWidth: 620 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            openproduct is down
          </h1>
          <p style={{ marginTop: 12, maxWidth: "62ch", lineHeight: 1.65 }}>
            Not this page — the whole surface failed to start. Reloading is worth one try; if it
            does not work, this is ours to fix and we can see it.
          </p>
          <p style={{ marginTop: 24 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                font: "inherit",
                fontSize: 14,
                fontWeight: 500,
                height: 36,
                padding: "0 15px",
                borderRadius: 8,
                border: "1px solid #171717",
                background: "#171717",
                color: "#fafafa",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </p>
          {error.digest ? (
            // The one case where the digest is shown rather than logged: the
            // console may not be reachable either, and a person reporting this
            // needs something to quote. It is a hash, not a message.
            <p style={{ marginTop: 28, fontSize: 13, color: "#6b6b6b" }}>
              Reference <code style={{ fontFamily: "ui-monospace, monospace" }}>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
