"use client";

// The link-grant receiver (openproduct-independence OX5b — seam edge S4).
//
// The console minted a LINK GRANT (the founder landing, or the workspace
// picker — S10/S13) and sent the maintainer here with it in the URL FRAGMENT (`#listing_grant=…`) — the fragment because it never
// reaches a server or a log on the way (the OX-C history concern), and a
// fragment is all that is needed because every field in the blob is
// non-secret and its AUTHORITY comes from the HMAC that core verifies, not
// from secrecy in transit.
//
// This page's whole job is to get the blob from the fragment into a form
// post: stash it in sessionStorage first (so it survives the sign-in round
// trip — the OAuth redirect drops fragments), confirm the session, prefill
// the draft the console passed along, and POST to /studio/link/submit where
// the server-side handler talks to the gateway. Client JS never holds the
// session token; the grant is the only thing that rides the browser, and it
// is a 10-minute attestation by construction.

import * as React from "react";

import { BTN_PRIMARY, FIELD, LABEL, PAGE_TITLE } from "../../ui/design";
import { consoleOrigin } from "../../../lib/platform";
import { readGrantPayload } from "../studio-api";
import { LINK_WORKSPACE_LABEL, consoleWorkspacePickerUrl } from "../workspace-picker";

const STORAGE_KEY = "op.studio.link";

interface LinkHandoff {
  grant: string;
  tagline: string;
  pitch: string;
}

function parseFragment(hash: string): LinkHandoff | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const grant = params.get("listing_grant") ?? "";
  if (!grant) return null;
  return {
    grant,
    tagline: (params.get("tagline") ?? "").slice(0, 200),
    pitch: (params.get("pitch") ?? "").slice(0, 1000),
  };
}

const ERROR_COPY: Record<string, string> = {
  grant_expired:
    "That link expired — a workspace link is valid for ten minutes. Pick the workspace again to start over.",
  grant_invalid:
    "That link could not be verified. Pick the workspace again to start over.",
  slug_taken: "That name is taken — choose another and try again.",
  not_maintainer:
    "This project already has a listing, maintained by someone else. Ask one of its maintainers to add you.",
  unavailable: "The service could not be reached. Your link is kept — try again in a moment.",
};

export default function StudioLinkPage() {
  const [handoff, setHandoff] = React.useState<LinkHandoff | null>(null);
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reference, setReference] = React.useState<string | null>(null);
  const [slug, setSlug] = React.useState("");

  React.useEffect(() => {
    // The fragment wins over storage (a fresh hand-off replaces a stale one),
    // and is stashed immediately: the sign-in round trip drops fragments.
    const fromFragment = parseFragment(window.location.hash);
    let next = fromFragment;
    if (fromFragment) {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromFragment));
      } catch {
        /* storage unavailable — the flow still works within this page */
      }
      // Clear the fragment from the address bar; the blob has a home now.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } else {
      try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        next = raw ? (JSON.parse(raw) as LinkHandoff) : null;
      } catch {
        next = null;
      }
    }
    setHandoff(next);

    const search = new URLSearchParams(window.location.search);
    const err = search.get("error");
    if (err) {
      setError(ERROR_COPY[err] ?? ERROR_COPY.unavailable!);
      // The upstream's own sentence and request id (submit/route.ts): the
      // one thing a maintainer can quote when "could not be reached" recurs.
      const ref = search.get("ref");
      const why = search.get("why");
      if (ref || why) setReference([why, ref ? `ref ${ref}` : null].filter(Boolean).join(" · "));
      if (err === "grant_expired" || err === "grant_invalid") {
        try {
          window.sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* nothing to clear */
        }
        setHandoff(err === "grant_expired" || err === "grant_invalid" ? null : next);
      }
    }

    void fetch("/auth/session", { cache: "no-store" })
      .then((res) => res.json() as Promise<{ data?: { signedIn?: boolean } }>)
      .then((body) => setSignedIn(body.data?.signedIn === true))
      .catch(() => setSignedIn(false));
  }, []);

  const payload = handoff ? readGrantPayload(handoff.grant) : null;

  if (signedIn === false) {
    // The grant is stashed; sign in and come straight back.
    window.location.assign("/signin?return_to=%2Fstudio%2Flink");
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-[768px] px-6 pb-[72px] pt-12 max-sm:px-4">
      <h1 className={PAGE_TITLE}>Link a project</h1>

      {error ? (
        <p className="m-0 mt-4 max-w-[65ch] rounded-[8px] border border-warning-soft-border bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning-strong">
          {error}
          {reference ? <span className="mt-1 block text-[12px] font-normal opacity-80">{reference}</span> : null}
        </p>
      ) : null}

      {!handoff || !payload ? (
        <div className="mt-6 max-w-[65ch] text-[13.5px] leading-[1.6] text-muted-foreground">
          <p className="m-0">
            There is no workspace link here.{" "}
            <a className="underline underline-offset-4" href={consoleWorkspacePickerUrl(consoleOrigin())}>
              {LINK_WORKSPACE_LABEL}
            </a>{" "}
            to start one.
          </p>
        </div>
      ) : signedIn === null ? (
        <p className="m-0 mt-6 text-[13.5px] text-muted-foreground">Checking your session…</p>
      ) : (
        <>
          <p className="m-0 mt-2 max-w-[65ch] text-[13.5px] leading-[1.6] text-muted-foreground">
            Give the listing its public address.
          </p>

          <form method="post" action="/studio/link/submit" className="mt-8 grid max-w-[65ch] gap-5">
            <input type="hidden" name="grant" value={handoff.grant} />
            <input type="hidden" name="tagline" value={handoff.tagline} />
            <input type="hidden" name="pitch" value={handoff.pitch} />
            <div>
              <label htmlFor="slug" className={LABEL}>
                Public address
              </label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[13.5px] text-muted-foreground">openproduct.live/</span>
                <input
                  id="slug"
                  name="slug"
                  type="text"
                  required
                  maxLength={64}
                  pattern="[A-Za-z0-9-]+"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="your-product"
                  className={FIELD}
                />
              </div>
              <p className="m-0 mt-1.5 text-[12.5px] leading-[1.5] text-muted-foreground">
                Lowercase letters, digits and hyphens.
              </p>
            </div>
            <div>
              <button type="submit" className={BTN_PRIMARY}>
                Create the listing
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
