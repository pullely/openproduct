// The founder's front door, pure (openproduct-account OPA5 — S10 as built,
// moved to the design's address by openproduct-launch SB0).
//
// `/submit` requires a session AT SUBMIT: the form stays fillable signed-out,
// and what a submit does depends on one fact the page reads from
// `/auth/session` at that moment. Signed in → hand off to the console's
// landing with the draft in the URL (a separate origin; sessionStorage does
// not cross it). Signed out → stash the draft HERE, beside `op.studio.link`,
// bounce through `/signin?return_to=/submit`, and on return the page
// re-hydrates and finishes the submit on its own.
//
// Kept pure so the decision and the parameter bounds are testable without a
// browser, and colocated in the route group so teardown stays a directory
// delete. Imports nothing.

import { OPEN_BUILD_REPO_KEY, isGithubRepoUrl } from "@openproduct/contracts";

export interface CreateDraft {
  name: string;
  tagline: string;
  pitch: string;
}

/** Beside the studio's `op.studio.link` — one namespace for one-hop stashes.
 *
 *  STILL `op.create.draft` AFTER SB0 MOVED THE PAGE, and deliberately: somebody
 *  bouncing through sign-in at the moment of a deploy has a draft under the old
 *  key, and renaming it would throw away the one thing this stash exists to
 *  protect. The key is a private implementation detail nobody reads; the
 *  address is the part that had to change. */
export const DRAFT_KEY = "op.create.draft";

/** The S10 bounds, pinned on both sides of the hand-off. */
export const LIMITS = { name: 64, tagline: 140, pitch: 1000 } as const;

/** The sign-in entry, returning to this page — `sanitizeReturnTo` accepts it. */
export const SIGN_IN_FOR_SUBMIT = "/signin?return_to=%2Fsubmit";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function clamp(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** A draft from anything — form state or storage — trimmed and capped. */
export function clampDraft(input: Partial<Record<keyof CreateDraft, unknown>> | null | undefined): CreateDraft {
  return {
    name: clamp(input?.name, LIMITS.name),
    tagline: clamp(input?.tagline, LIMITS.tagline),
    pitch: clamp(input?.pitch, LIMITS.pitch),
  };
}

/** The one thing a submit needs: a product name of at least two characters. */
export function draftCanSubmit(draft: CreateDraft): boolean {
  return draft.name.length >= 2;
}

/**
 * The hand-off URL (S10): the console's landing, the draft in the query.
 * `consoleOrigin` empty means the single-host dev setup — a relative path.
 * Parameter names and order are the seam contract; the console's
 * `parseDraftParams` reads exactly these.
 */
export function handoffUrl(consoleOrigin: string, draft: CreateDraft): string {
  const params = new URLSearchParams();
  params.set("name", draft.name);
  if (draft.tagline) params.set("tagline", draft.tagline);
  if (draft.pitch) params.set("pitch", draft.pitch);
  const origin = consoleOrigin.replace(/\/+$/, "");
  return `${origin}/start/openproduct?${params.toString()}`;
}

export type SubmitPlan = { kind: "handoff"; url: string } | { kind: "signIn"; href: string };

/** What a submit does, given the one fact that decides it. */
export function submitPlan(signedIn: boolean, consoleOrigin: string, draft: CreateDraft): SubmitPlan {
  if (signedIn) return { kind: "handoff", url: handoffUrl(consoleOrigin, draft) };
  return { kind: "signIn", href: SIGN_IN_FOR_SUBMIT };
}

// ─── the stash, across the sign-in round trip ───

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readDraft(storage: DraftStorage | null): CreateDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const draft = clampDraft(parsed as Partial<Record<keyof CreateDraft, unknown>>);
    return draft.name.length > 0 || draft.tagline.length > 0 || draft.pitch.length > 0 ? draft : null;
  } catch {
    return null;
  }
}

export function writeDraft(storage: DraftStorage | null, draft: CreateDraft): void {
  if (!storage) return;
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(clampDraft(draft)));
  } catch {
    /* storage unavailable — the bounce still happens; the visitor retypes */
  }
}

export function clearDraft(storage: DraftStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

// ─── OB6 — the repo, across the hand-off ───

/**
 * The public repository typed on Open a build. NOT part of `CreateDraft`:
 * that shape is S10's, pinned on both sides of the console hand-off, and the
 * repo is openproduct's own field. It waits in this origin's session storage
 * (the same tab comes back from Orunbase) until the studio's Details step
 * offers it, and nothing is saved until the maker saves.
 */
export function readRepoStash(storage: DraftStorage | null): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(OPEN_BUILD_REPO_KEY);
    return raw && isGithubRepoUrl(raw) ? raw.trim() : null;
  } catch {
    return null;
  }
}

/** Keep the repo for the studio, or forget it when the field is empty. */
export function writeRepoStash(storage: DraftStorage | null, repo: string): void {
  if (!storage) return;
  try {
    if (isGithubRepoUrl(repo)) storage.setItem(OPEN_BUILD_REPO_KEY, repo.trim());
    else storage.removeItem(OPEN_BUILD_REPO_KEY);
  } catch {
    /* storage unavailable — the maker types it again in the studio */
  }
}

export function clearRepoStash(storage: DraftStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(OPEN_BUILD_REPO_KEY);
  } catch {
    /* ignore */
  }
}
