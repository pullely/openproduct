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

import { FIELD, FOCUS, LABEL, PAGE_TITLE } from "../ui/design";
import { BackIcon, MailIcon } from "../ui/icons";

/**
 * The sign-in card (openproduct-launch AC2c; boards `SignIn` and
 * `PhoneSignIn` since openproduct-redesign OPR1) — one flat card: Continue
 * with Orunbase, or email and password.
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
 * ─── THE BOARD, AND WHERE THIS DOOR DIFFERS FROM IT ──────────────────────
 *
 * One flat card, 420px, with the amber glow in its top corner: the title,
 * `Continue with Orunbase` as the ink button, an `OR` rule in the mono face,
 * then the email door, and one line that switches between signing in and
 * creating an account. After a sign-up the card becomes `Check your inbox`:
 * the envelope disc, the address, and a way back to use a different one.
 *
 * THE EMAIL DOOR IS A PASSWORD, AND IT SAYS SO. The board's second door is
 * "Email me a sign-in link". That is not what happens here: sign-in is an
 * email and a password, and creating an account emails a six-digit CODE,
 * not a link. So the card keeps the board's shape and says what is true:
 * two fields and `Sign in`; and on the inbox screen a code field, because
 * the mail carries a code to type rather than a link to press.
 *
 * WHAT THE BOARD DRAWS THAT IS NOT HERE: the illustration panel beside the
 * card and the line "Same Orunbase account, not a second one" (an account
 * made with a password here is openproduct's own, so the sentence would be
 * false for it).
 *
 * THE MODES ARE A LINE, NOT TABS. The old card had a two-tab strip; the
 * board has `New here? Create an account` under the form, and that is what
 * switches. The state is still called `tab`.
 *
 * A REFUSAL IS RED AND NOTHING ELSE IS (design.md §2 rule 8): the gateway's
 * sentence for a failed sign-in or a wrong code is drawn in the danger ink;
 * the reset's explanation and "check your inbox" are not failures and keep
 * the body ink. Both arrive in the same `aria-live` region.
 *
 * In the modal the mark and the wordmark head the card, because the page
 * behind is dimmed; on `/signin` the header above already carries them.
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

/** The card: flat white at 16px, the amber glow in its top right corner
 *  (the board's radial wash), `36px 32px 30px` inside and 18px between its
 *  blocks; `22px 16px 16px` and 14px on a phone. */
const CARD =
  "box-border flex w-full max-w-[420px] flex-col gap-[18px] rounded-[16px] bg-card bg-[radial-gradient(420px_200px_at_100%_0%,oklch(var(--amber)/0.2),transparent_70%)] px-8 pb-[30px] pt-9 max-sm:gap-[14px] max-sm:px-4 max-sm:pb-4 max-sm:pt-[22px]";

/** The platform's door, and the card's first act: the ink pill, 40px (48px
 *  on a phone), full width. */
const PLATFORM =
  "flex min-h-[40px] w-full items-center justify-center gap-[10px] rounded-full bg-primary text-[15px] font-semibold text-primary-foreground no-underline transition-opacity hover:opacity-90 max-sm:min-h-[48px]";

/** The email door's act: the amber tint under its ink once it can be
 *  pressed, the 5% ink wash while it cannot (the board's two states). */
const SUBMIT =
  "flex min-h-[40px] w-full items-center justify-center rounded-full border-0 bg-amber-soft px-5 text-[15px] font-semibold text-endorse-ink ring-1 ring-inset ring-amber/[0.35] transition-colors disabled:bg-foreground/[0.05] disabled:text-muted-foreground disabled:ring-0 max-sm:min-h-[48px]";

/** The one act of the inbox screen: confirm the code. Ink, like every act. */
const CONFIRM =
  "flex min-h-[40px] w-full items-center justify-center rounded-full border-0 bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 max-sm:min-h-[48px]";

/** A text control inside the card: amber ink, 40px (44px on a phone). */
const TEXT_ACT =
  "inline-flex min-h-[40px] items-center gap-[6px] border-0 bg-transparent p-0 font-semibold text-amber-ink hover:text-foreground max-sm:min-h-[44px]";

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
  // Whether `note` is a REFUSAL (drawn in the danger ink) rather than an
  // explanation. Red is for a failure and for nothing else.
  const [refused, setRefused] = React.useState(false);

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
    setRefused(false);
    setNote(PASSWORD_RESET_NOTE);
  }

  /** Between signing in and creating an account: the line under the form. */
  function switchTo(next: Tab): void {
    setTab(next);
    setRefused(false);
    setNote(null);
  }

  /** Back from the inbox screen to the form, to use a different address. */
  function startOver(): void {
    setStage("form");
    setCode("");
    setChallengeId(null);
    setRefused(false);
    setNote(null);
  }

  /** The gateway's refusal, as the card's message — in red. */
  function refuse(sentence: string): void {
    setRefused(true);
    setNote(sentence);
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
    setRefused(false);
    setNote(null);
    try {
      if (stage === "code") {
        const answer = await post({ act: "verify", challengeId, code });
        if (answer.ok) return land();
        refuse(answer.note ?? SIGN_IN_REFUSAL);
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
      refuse(answer.note ?? SIGN_IN_REFUSAL);
    } finally {
      setBusy(false);
    }
  }

  /** A full navigation, not a client transition: the session cookie was just
   *  set, and every server-rendered page has to be asked again. */
  function land(): void {
    window.location.assign(returnTo && returnTo.startsWith("/") ? returnTo : "/");
  }

  const title = stage === "code" ? "Check your inbox" : creating ? "Create an account" : "Sign in";
  // ONE `h1` PER PAGE: on `/signin` the title is the page's; over a scrim the
  // page behind already has one, so the dialog's title is an `h2`.
  const Title = inDialog ? "h2" : "h1";
  const ready =
    stage === "code" ? code.trim().length > 0 : email.trim().length > 0 && password.length > 0;

  // The card's one message. `aria-live` because somebody using a screen
  // reader must hear a refusal that appeared without the page moving.
  const message = note ? (
    <p
      role="status"
      aria-live="polite"
      className={`m-0 text-[13px] leading-[1.45] ${refused ? "text-destructive" : "text-copy"}`}
    >
      {note}
    </p>
  ) : null;

  return (
    <div
      ref={dialog}
      {...(onClose ? { role: "dialog", "aria-modal": "true", "aria-label": title } : {})}
      className={`${CARD} ${className}`}
    >
      {/* The mark names the site over a scrim, where the page behind is
          dimmed. On `/signin` the header above already says it. */}
      {inDialog ? (
        <div className="flex items-center gap-[10px] text-[18px] font-semibold leading-none tracking-[-0.02em] text-foreground">
          <Logomark size={24} />
          openproduct
        </div>
      ) : null}

      {stage === "code" ? (
        <>
          <span
            aria-hidden="true"
            className="grid h-[64px] w-[64px] place-items-center rounded-full bg-amber-soft text-endorse-ink max-sm:h-[52px] max-sm:w-[52px]"
          >
            <MailIcon className="h-[28px] w-[28px] max-sm:h-[24px] max-sm:w-[24px]" />
          </span>
          <Title className={PAGE_TITLE}>{title}</Title>
          {/* The address the code went to, so a typo is caught here and not
              after ten minutes of waiting for mail. */}
          <p className="m-0 break-all text-[15px] font-semibold text-foreground">{email}</p>
          <form onSubmit={submit} className="grid gap-[10px]">
            <label className="block">
              <span className={LABEL}>Six-digit code</span>
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
            {message}
            <button type="submit" disabled={busy || !ready} className={CONFIRM}>
              Confirm
            </button>
          </form>
          <button type="button" onClick={startOver} className={`self-start text-[15px] ${TEXT_ACT} ${FOCUS}`}>
            <BackIcon className="h-[14px] w-[14px]" />
            Use a different email
          </button>
        </>
      ) : (
        <>
          <Title className={PAGE_TITLE}>{title}</Title>

          <a
            href={returnTo ? `/auth/start?return_to=${encodeURIComponent(returnTo)}` : "/auth/start"}
            className={PLATFORM}
          >
            <OrunbaseGlyph />
            Continue with Orunbase
          </a>

          <div aria-hidden="true" className="flex items-center gap-3">
            <span className="h-px flex-1 bg-foreground/10" />
            <span className="font-mono text-mono-label uppercase text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-foreground/10" />
          </div>

          <form onSubmit={submit} className="grid gap-[10px]">
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
                // The floor, said where somebody is about to choose one, in
                // the field itself: no line under the control.
                placeholder={creating ? `At least ${PASSWORD_MIN_LENGTH} characters` : "••••••••"}
                className={FIELD}
              />
            </label>
            {creating ? null : (
              <button
                type="button"
                onClick={offerReset}
                className={`justify-self-start text-[13px] ${TEXT_ACT} ${FOCUS}`}
              >
                {PASSWORD_RESET_PROMPT}
              </button>
            )}
            {message}
            <button type="submit" disabled={busy || !ready} className={SUBMIT}>
              {creating ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="m-0 flex flex-wrap items-center gap-x-[6px] text-[13px] text-muted-foreground">
            {creating ? "Have an account?" : "New here?"}
            <button
              type="button"
              onClick={() => switchTo(creating ? "signin" : "create")}
              className={`${TEXT_ACT} ${FOCUS}`}
            >
              {creating ? "Sign in" : "Create an account"}
            </button>
          </p>
        </>
      )}
    </div>
  );
}

/** Orunbase's mark on its own door: the cube, in the amber. Decorative — the
 *  words beside it name the control. */
function OrunbaseGlyph(): React.ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0 text-amber"
    >
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </svg>
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
        // An edge, not a drop shadow (design.md §2 rule 11): the one-pixel
        // inset ring the header's search card wears over the page.
        className="ring-1 ring-inset ring-foreground/10"
      />
    </div>
  );
}
