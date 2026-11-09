"use client";

import * as React from "react";

import {
  AUTH_AMBIGUOUS_ANSWER,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_NOTE,
  PASSWORD_RESET_PROMPT,
  SIGN_IN_REFUSAL,
} from "@openproduct/contracts";

import { Logomark } from "./logomark";

import { FIELD, LABEL, PAGE_TITLE, TAB, TAB_OFF, TAB_ON } from "../ui/design";

/**
 * The design's sign-in card (openproduct-launch AC2c) — 400px, two tabs,
 * email and password, or Continue with Orunbase.
 *
 * TWO SURFACES, ONE CARD. `AuthPanel` is the card; `AuthModal` is that card
 * over a scrim, opened from the top panel's `Sign in`. The same card is the
 * whole of `/signin`, which is where every act that needs a session now sends
 * a signed-out visitor — commenting, upvoting, reporting, starting a thread.
 *
 * THE BUG THAT SPLIT IT IN TWO. Those acts used to bounce straight to
 * `/auth/start`, which is not a door: it is the first step of the OAuth
 * handshake. Press `Post` under a comment while signed out and the next thing
 * on the screen was Orunbase's consent page — no explanation of why you had
 * left openproduct, and no way to use the openproduct account you may well
 * have had, because that account's form was in a modal you were never shown.
 * A door has to be openproduct's own and has to offer both ways in;
 * `/auth/start` is one of the things BEHIND it, chosen deliberately, exactly
 * as `Continue with Google` is chosen.
 *
 * THE FIRST WEB SURFACE ANY OF THE ACCOUNT CLUSTER HAS HAD. AC1 shipped
 * sign-up and verification with no form anywhere in the app; AC2b shipped
 * sign-in the same way. This is where all three arrive at once, which is why
 * it is its own milestone rather than a coat of paint on one of them.
 *
 * ─── WHAT THE DESIGN DRAWS THAT IS NOT HERE: THE NAME FIELD ──────────────
 *
 * The prototype's Create account form has Name above Email. It is not here,
 * and that is the same call SB0 made about its own form: what ships is what
 * is real.
 *
 * A name typed here would have nowhere to go. openproduct stores no user
 * record — that is the whole of I3 and AC0 — and the display name it shows
 * belongs to the platform, fetched per request. AC1's seam contract carries
 * `{ email, password }`; a fourth field would be a field nothing receives,
 * which is precisely what OL-8 refused for the submit form.
 *
 * So the field is dropped rather than collected and discarded, because a form
 * that takes something and throws it away is R6's "fake" in its purest form.
 * Somebody who wants a name has a real place to set one — the profile at
 * `/me`, which CG1 built and which already has the field.
 *
 * ─── WHAT THE DESIGN DOES NOT DRAW THAT IS HERE: THE RESET ───────────────
 *
 * The prototype's modal has no "forgot your password" anywhere in it, and the
 * reason is visible in the prototype: it has no backend, so it has no failure
 * to recover from. There was nothing to be faithful to.
 *
 * openproduct's reset is the Create account tab (AC3, and `PASSWORD_RESET_NOTE`
 * says why: `writeCredential` upserts, so signing up again with an address you
 * already hold sets a new password on the SAME subject). That is a real path
 * that works today — and one nobody will find, because a person who forgot
 * their password looks for the word "forgot" and will not guess that the tab
 * marked Create account is where they should go.
 *
 * So the milestone adds one control and one sentence, which is the opposite
 * call to the Name field above and the same rule underneath: what ships is
 * what is real. A field the design draws and nothing receives comes out; a
 * path that exists and the design never had a reason to draw goes in.
 *
 * ─── I6 SURVIVES, AND THE ANCHOR IS HOW ──────────────────────────────────
 *
 * The control that opens this is an ANCHOR to `/auth/start`, not a button.
 * Server-rendered it is exactly the markup the signed-out chrome always had,
 * so the cached HTML does not vary; hydrated, a plain click opens the modal
 * instead. Middle-click, a copied link and a visitor with no JavaScript all
 * still reach the platform's door.
 *
 * ─── THE DESIGN'S GEOMETRY ───────────────────────────────────────────────
 *
 * The wordmark and the 26px sans title stand ABOVE the card on `/signin`; the card itself — a 12px-radius hairline panel with 20px
 * of padding — holds the tabs, the two fields, the 40px accent button, the
 * `or` rule and the outlined `Continue with Orunbase`. In the modal there is
 * no page for the heading to stand on, so the whole thing is one card over
 * the scrim; the markup inside is the same either way.
 */

type Tab = "signin" | "create";
type Stage = "form" | "code";

const ENDPOINT = "/auth/password";

interface Answer {
  ok?: boolean;
  note?: string | null;
  challengeId?: string | null;
  credentialSet?: boolean;
}

/** The 40px, full-width act — the one thing this card asks for, in ink like
 *  every act (CP-R1), not the upvote's accent. */
const SUBMIT =
  "mt-5 flex h-[40px] w-full items-center justify-center rounded-full bg-primary text-[14.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60";

/** The 40px, full-width outlined button — the platform's door. */
const PLATFORM =
  "flex h-[40px] w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-[14.5px] font-medium text-foreground no-underline transition-colors hover:border-faint";

/**
 * The card, with nothing around it — the whole of `/signin`, and what the
 * modal below puts over a scrim.
 *
 * `onClose` is the MODAL's, and passing it is what makes this a dialog: the
 * Escape key, the ARIA role, the label. On the page there is nothing to
 * dismiss, so none of it is drawn.
 */
export function AuthPanel({
  returnTo,
  onClose,
  className = "",
}: {
  returnTo: string | null;
  onClose?: () => void;
  className?: string;
}): React.ReactElement {
  const [tab, setTab] = React.useState<Tab>("signin");
  const [stage, setStage] = React.useState<Stage>("form");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [challengeId, setChallengeId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);

  const dialog = React.useRef<HTMLDivElement | null>(null);
  const firstField = React.useRef<HTMLInputElement | null>(null);

  // Escape closes, and focus lands in the first field — the two things a
  // dialog owes somebody who never touches a mouse. On `/signin` there is no
  // dialog and nothing to escape from, so only the focus half runs.
  React.useEffect(() => {
    firstField.current?.focus();
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const creating = tab === "create";
  const inDialog = onClose !== undefined;

  /**
   * The reset, and it is a TAB SWITCH rather than a route.
   *
   * Nothing else happens: no request, no token, no third stage. Create account
   * with an address somebody already holds IS the reset — the platform finds
   * the existing subject, and core's upsert replaces the password against it.
   * The note is set as the modal's own message so it lands in the same
   * `aria-live` region a refusal would, because for a screen reader this is
   * exactly as much of a state change.
   */
  function offerReset(): void {
    setTab("create");
    setNote(PASSWORD_RESET_NOTE);
  }

  async function post(body: Record<string, unknown>): Promise<Answer> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    try {
      return ((await res.json()) as { data?: Answer }).data ?? {};
    } catch {
      return {};
    }
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (stage === "code") {
        const answer = await post({ act: "verify", challengeId, code });
        if (answer.ok) return land();
        setNote(answer.note ?? SIGN_IN_REFUSAL);
        return;
      }
      if (creating) {
        const answer = await post({ act: "sign-up", email, password });
        // ONE ANSWER FOR EVERY OUTCOME, straight from the gateway. A known
        // address and an unknown one both reach this line, and the stage
        // advances either way — the code screen is what somebody sees whether
        // or not the mail was for a new account.
        setChallengeId(answer.challengeId ?? null);
        setStage("code");
        setNote(answer.note ?? AUTH_AMBIGUOUS_ANSWER);
        return;
      }
      const answer = await post({ act: "sign-in", email, password });
      if (answer.ok) return land();
      setNote(answer.note ?? SIGN_IN_REFUSAL);
    } finally {
      setBusy(false);
    }
  }

  /** A full navigation, not a client transition: the session cookie was just
   *  set, and every server-rendered page has to be asked again. */
  function land(): void {
    window.location.assign(returnTo && returnTo.startsWith("/") ? returnTo : "/");
  }

  const title = stage === "code" ? "Check your email" : creating ? "Create an account" : "Sign in";
  const hint = stage === "code" ? "Enter the six-digit code we sent." : null;

  return (
    <div
      ref={dialog}
      {...(onClose ? { role: "dialog", "aria-modal": "true", "aria-label": title } : {})}
      className={`box-border w-full max-w-[400px] ${
        inDialog ? "rounded-[20px] border border-border bg-card p-7" : ""
      } ${className}`}
    >
      {/* The mark names the site over a scrim, where the page behind is
          dimmed. On `/signin` the bar above already says it (CP1, words
          once), so the page opens on the title. */}
      {inDialog ? (
        <div className="mb-6 flex items-center gap-[9px]">
          <Logomark size={26} />
          <span className="font-serif text-[22px] font-normal leading-none tracking-[-0.02em] text-foreground">
            openproduct
          </span>
        </div>
      ) : null}

      <h2 className={PAGE_TITLE}>{title}</h2>
      {hint ? (
        <p className="m-0 mt-2 text-[14px] leading-[1.6] text-muted-foreground">{hint}</p>
      ) : null}

      {/* The card proper. On the page it is its own hairline panel under the
          heading; in the dialog the outer box is already that panel. */}
      <div className={inDialog ? "mt-5" : "mt-8 rounded-[20px] border border-border bg-card p-7 max-sm:p-5"}>
        {stage === "form" ? (
          // ONE KIND OF TAB (CP-R2): the two modes are the underline strip
          // every list's sorts use, not a pill in a tray.
          <div className="-mt-1 flex gap-4 border-b border-line">
            {(
              [
                ["signin", "Sign in"],
                ["create", "Create account"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTab(value);
                  setNote(null);
                }}
                aria-pressed={tab === value}
                className={`${TAB} px-0 ${tab === value ? TAB_ON : TAB_OFF}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <form onSubmit={submit} className={stage === "form" ? "mt-4 grid gap-4" : "grid gap-4"}>
          {stage === "code" ? (
            <label className="block">
              <span className={LABEL}>Code</span>
              <input
                ref={firstField}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="482913"
                className={FIELD}
              />
            </label>
          ) : (
            <>
              <label className="block">
                <span className={LABEL}>Email</span>
                <input
                  ref={firstField}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className={LABEL}>Password</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete={creating ? "new-password" : "current-password"}
                  minLength={creating ? PASSWORD_MIN_LENGTH : undefined}
                  placeholder="••••••••"
                  className={FIELD}
                />
              </label>
              {creating ? (
                <p className="m-0 text-[12.5px] leading-[1.45] text-muted-foreground">
                  At least {PASSWORD_MIN_LENGTH} characters.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={offerReset}
                  className="justify-self-start text-[12.5px] leading-[1.45] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
                >
                  {PASSWORD_RESET_PROMPT}
                </button>
              )}
            </>
          )}

          {note ? (
            // The gateway's sentence, rendered and not rewritten. `aria-live`
            // because somebody using a screen reader must hear a refusal that
            // appeared without the page moving.
            <p role="status" aria-live="polite" className="m-0 text-[13px] leading-[1.45] text-copy">
              {note}
            </p>
          ) : null}

          <button type="submit" disabled={busy} className={`${SUBMIT} -mt-1`}>
            {stage === "code" ? "Confirm" : creating ? "Create account" : "Sign in"}
          </button>
        </form>

        {stage === "form" ? (
          <>
            <div className="my-[18px] flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <a
              href={returnTo ? `/auth/start?return_to=${encodeURIComponent(returnTo)}` : "/auth/start"}
              className={PLATFORM}
            >
              Continue with Orunbase
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The card over a scrim — the shell's own sign-in, opened from the account
 * control without leaving the page somebody was reading.
 *
 * Everything that makes it a DIALOG is here rather than in the card: the
 * scrim, the click-outside, the role and the Escape key it hands down. A page
 * you navigated to is not something you dismiss, so `/signin` gets none of it.
 *
 * ─── IT TAKES NO `open` PROP, AND THAT IS A PERFORMANCE INVARIANT ─────────
 *
 * It used to: `open: boolean` with `if (!open) return null` at the top, which
 * meant the element was ALWAYS in the tree and only its contents were
 * conditional. That reads as free and is not, once the component is behind a
 * `next/dynamic` boundary — a lazy component that is always mounted loads its
 * chunk on mount, so the boundary defers nothing and costs the loader.
 *
 * That is exactly what the first attempt at OPP11 measured: `next/dynamic` on
 * this file made every route BIGGER, and the reason was here rather than in
 * `next/dynamic`. Removing the prop moves the condition to the call site,
 * where it belongs, and makes the mistake unspellable: there is no longer an
 * `open={false}` to pass.
 */
export function AuthModal({
  onClose,
  returnTo,
}: {
  onClose: () => void;
  returnTo: string | null;
}): React.ReactElement {
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-scrim/45 p-6 max-sm:p-4"
    >
      <AuthPanel
        returnTo={returnTo}
        onClose={onClose}
        className="shadow-[0_24px_60px_rgba(20,18,15,0.25)]"
      />
    </div>
  );
}
