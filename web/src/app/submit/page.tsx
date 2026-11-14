"use client";

import * as React from "react";

import {
  OPEN_BUILD_HEADING,
  OPEN_BUILD_REPO_HINT,
  OPEN_BUILD_REPO_LABEL,
  OPEN_BUILD_REPO_MAX,
  PREVIEW_HEADING,
  isGithubRepoUrl,
  previewEntry,
} from "@openproduct/contracts";

import { consoleOrigin } from "@/lib/platform";

import { PreviewRow } from "./preview-row";

import {
  LIMITS,
  clampDraft,
  clearDraft,
  draftCanSubmit,
  readDraft,
  readRepoStash,
  submitPlan,
  writeDraft,
  writeRepoStash,
  type CreateDraft,
  type DraftStorage,
} from "./handoff";

import { BTN_PRIMARY, EYEBROW, FIELD, FOCUS, LABEL, PAGE_TITLE, TEXTAREA } from "../ui/design";
import { AppLink } from "../ui/link";

/**
 * The founder's front door (openproduct create funnel): `/submit` on the
 * public apex — the design's address, which SB0 moved it to. `/create` is
 * still served and permanently redirects here, because it is a live inbound
 * link and OPA5 shipped it.
 *
 * The form is fillable signed-out — the pitch is captured while the intent
 * is fresh — and a session is required AT SUBMIT (openproduct-account OPA5,
 * design §9). A signed-in submit hands off to the console's landing at once,
 * carrying the draft in the URL (a separate origin; sessionStorage does not
 * cross it); there the account, the public workspace, its first project and
 * the listing link are provisioned in one pass. A signed-out submit stashes
 * the draft beside `op.studio.link`, bounces through sign-in with `/submit`
 * as the return, and on the way back this page re-hydrates the form and
 * finishes the submit on its own — nothing typed is lost to the round trip.
 *
 * Self-contained: it lives in the route group (teardown row 3 stays a
 * directory delete) and imports no console module. It reads no cookie — the
 * one session fact comes from `/auth/session`, client-side, exactly as the
 * shell's account chip reads it.
 *
 * THE FRAME: a 1080px column, the page title, and a two-column grid — the
 * form on the left, the sticky preview in a 26rem column on the right, 48px
 * between. On a phone the grid stacks, form first, preview under it.
 *
 * THE NEW LOOK (openproduct-redesign OPR1). The page is on no board, so its
 * structure and steps are what they were and its skin is the redesign's:
 * the Lora title, the form on one flat card, 44px fields, a pill for the
 * act. It carries no sentence a reader does not need to fill it in
 * (design.md §2 rule 9): the lede under the title and the paragraph under
 * the repository field are gone. What stays is each field's label, which
 * ones are optional, and — only once an address has been typed that is not
 * a GitHub repository — what the field takes, in the danger ink.
 */

function storage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The one fact a submit needs, read at that moment and never cached. */
async function sessionSignedIn(): Promise<boolean> {
  try {
    const res = await fetch("/auth/session", { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { data?: { signedIn?: boolean } };
    return body.data?.signedIn === true;
  } catch {
    return false;
  }
}

type Phase = "idle" | "checking" | "signingIn" | "leaving";

export default function CreateOpenproductPage() {
  const [name, setName] = React.useState("");
  const [tagline, setTagline] = React.useState("");
  const [pitch, setPitch] = React.useState("");
  // OB6 — the public repo, optional. It does not cross to the console (S10's
  // hand-off is name, tagline and pitch); it waits in this tab's session
  // storage for the studio's Details step.
  const [repo, setRepo] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("idle");
  // Back from sign-in with a stash: the form is filled and the submit
  // resumes by itself, so the reader is told rather than shown a form they
  // already sent.
  const [resuming, setResuming] = React.useState(false);

  const leave = React.useCallback((draft: CreateDraft) => {
    const plan = submitPlan(true, consoleOrigin(), draft);
    if (plan.kind !== "handoff") return;
    clearDraft(storage());
    setPhase("leaving");
    window.location.href = plan.url;
  }, []);

  React.useEffect(() => {
    const stashed = readDraft(storage());
    if (!stashed) return;
    setRepo(readRepoStash(storage()) ?? "");
    setName(stashed.name);
    setTagline(stashed.tagline);
    setPitch(stashed.pitch);
    setResuming(true);
    let cancelled = false;
    void (async () => {
      const signedIn = await sessionSignedIn();
      if (cancelled) return;
      // Signed in now: the submit the visitor started completes. Still
      // signed out (sign-in abandoned): the form stays filled, and the
      // button is theirs again.
      if (signedIn) leave(stashed);
      else setResuming(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [leave]);

  const draft = clampDraft({ name, tagline, pitch });
  // An empty repo is fine — it is optional. A typed one must be a GitHub
  // repository address, the one host the sweep reads (S8).
  const repoTyped = repo.trim().length > 0;
  const repoOk = !repoTyped || isGithubRepoUrl(repo);
  const canSubmit = draftCanSubmit(draft) && repoOk && phase === "idle" && !resuming;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    // Kept on BOTH paths — the hand-off and the sign-in bounce — so the
    // studio can offer it when the maker arrives there.
    writeRepoStash(storage(), repo);
    setPhase("checking");
    const plan = submitPlan(await sessionSignedIn(), consoleOrigin(), draft);
    if (plan.kind === "handoff") {
      leave(draft);
      return;
    }
    // The draft waits here for the way back; the sign-in returns to /create.
    writeDraft(storage(), draft);
    setPhase("signingIn");
    window.location.href = plan.href;
  };

  const buttonLabel =
    phase === "checking"
      ? "Checking your session…"
      : phase === "signingIn"
        ? "Taking you to sign in…"
        : phase === "leaving" || resuming
          ? "Taking you to Orunbase…"
          : "Continue on Orunbase";

  return (
    <main className="mx-auto box-border w-full max-w-[1080px] px-[44px] pb-[104px] pt-[80px] max-lg:px-7 max-sm:px-4 max-sm:pb-[72px] max-sm:pt-12">
      <header className="mb-8 max-sm:mb-6">
        <h1 className={PAGE_TITLE}>{OPEN_BUILD_HEADING}</h1>
      </header>

      {resuming ? (
        <p className="m-0 mb-4 rounded-[14px] bg-sunken px-3.5 py-2.5 text-[13px] text-muted-foreground" role="status">
          Picking up where you left off.
        </p>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-12">
        <form onSubmit={onSubmit} className="grid gap-5 rounded-[16px] bg-card p-6 max-sm:p-4">
          <label className="block">
            <span className={LABEL}>Build name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={LIMITS.name}
              required
              autoFocus
              placeholder="Acme Thing"
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className={LABEL}>
              One-liner <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              type="text"
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              maxLength={LIMITS.tagline}
              placeholder="What it does, in a sentence"
              className={FIELD}
            />
          </label>

          <label className="block">
            <span className={LABEL}>
              Pitch <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <textarea
              value={pitch}
              onChange={(event) => setPitch(event.target.value)}
              maxLength={LIMITS.pitch}
              rows={6}
              placeholder="Why it matters, who it's for, and what you're looking for in people."
              className={`${TEXTAREA} leading-[1.6]`}
            />
          </label>

          {/* OB6 — THE REPO, UP FRONT AND OPTIONAL. A build is a public repo;
              asking for it here is what lets its work count from the first
              sweep. The label says it is optional; nothing under the field
              argues for it (OPR1). */}
          <label className="block">
            <span className={LABEL}>
              {OPEN_BUILD_REPO_LABEL} <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input
              type="url"
              inputMode="url"
              value={repo}
              onChange={(event) => setRepo(event.target.value)}
              maxLength={OPEN_BUILD_REPO_MAX}
              placeholder="https://github.com/owner/repo"
              aria-describedby={repoOk ? undefined : "repo-hint"}
              aria-invalid={repoOk ? undefined : true}
              className={FIELD}
            />
            {/* Said only when what was typed cannot be saved, and in red
                because it is an error: what the field takes. */}
            {repoOk ? null : (
              <span id="repo-hint" role="status" className="mt-1.5 block text-[13px] leading-[1.45] text-destructive">
                {OPEN_BUILD_REPO_HINT}
              </span>
            )}
          </label>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={!canSubmit}
              className={`${BTN_PRIMARY} max-sm:h-[44px] disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {buttonLabel}
            </button>
            <AppLink
              href="/"
              className={`tap text-[13px] font-semibold text-amber-ink no-underline hover:text-foreground ${FOCUS}`}
            >
              Back to the feed
            </AppLink>
          </div>
        </form>

        <Preview draft={draft} />
      </div>
    </main>
  );
}

/**
 * The feed's row, showing a listing that does not exist yet (IN0).
 *
 * THE SAME COMPONENT THE FEED RENDERS, which is the milestone's whole
 * done-when and the reason the mapping lives in the contract: `previewEntry`
 * produces a whole `FeedEntry` and this file decides nothing about how a
 * listing looks. If the row changes, this changes with it, because it IS the
 * row.
 *
 * `inert` ON THE ROW AND NOT THE SECTION. Every link inside the row — the
 * tile, the name, the topics — points at an address that does not exist, and
 * a preview whose title is a 404 is a worse lie than a preview that cannot be
 * clicked. `inert` also takes the row out of the accessibility tree, which is
 * why the heading and BOTH sentences sit outside it: they are the part that
 * carries meaning, and they are not a second rendering of the row — they say
 * what the row cannot.
 *
 * NOTHING HERE ACTS, and `PreviewRow` carries the reason: a live vote box
 * would send the name somebody is typing to the overlay on every keystroke.
 *
 * THE HEADING IS A MONO LABEL (OPR1), like every section head over a card:
 * the row under it is the feed's own, and is the only thing in the column.
 */
function Preview({ draft }: { draft: CreateDraft }) {
  // A fixed clock rather than `new Date()` on every render: the row shows no
  // date, the day only feeds a field it does not draw, and a value that
  // changed each keystroke would make the preview a new object forever.
  const [now] = React.useState(() => new Date());
  const entry = previewEntry(draft, now);
  return (
    <section
      aria-labelledby="preview-heading"
      className="lg:sticky lg:top-6"
    >
      <h2 id="preview-heading" className={`m-0 px-[6px] font-normal ${EYEBROW}`}>
        {PREVIEW_HEADING}
      </h2>
      <ul
        inert
        className="m-0 mt-3 list-none p-0"
      >
        <PreviewRow entry={entry} />
      </ul>
    </section>
  );
}
