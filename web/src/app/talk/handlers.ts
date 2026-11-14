// A Talk act, from fields to an answer (openproduct-redesign OPR-4).
//
// The route files are adapters (`route-io.ts`): they read the session cookie
// and the body, call one function here, and turn its `TalkAnswer` into a
// response. Everything that decides anything is in this file and none of it
// touches `next/server`, so each decision is assertable directly.
//
// THE PRIVATE READS HAVE ONE REFUSAL (design §7.2). No session, a session
// core no longer honours, a thread that is not the reader's, a thread that
// does not exist, an id that is not an id, an outage: `NOT_FOUND` below,
// the same status and the same body. Nothing here answers 401 or 403 for a
// private thread, because either would say more than "nothing is here".

import {
  MAX_POST_BODY,
  MAX_THREAD_TITLE,
  isThreadKind,
  isThreadVisibility,
  privateThreadPath,
  publicThreadPath,
  type PrivateThreadDocument,
  type PrivateThreadList,
  type ThreadVisibility,
} from "@openproduct/contracts";

import { sanitizeReturnTo } from "../auth/auth";
import type { MeFetch } from "../me/me-api";

import { isThreadId } from "./model";
import {
  fetchPrivateThread,
  fetchPrivateThreads,
  replyPrivately,
  setThreadResolved,
  startThread,
} from "./talk-api";

export type TalkAnswer =
  /** No session: through sign-in, back to `returnTo`. Never for a private read. */
  | { kind: "signin"; returnTo: string }
  | { kind: "json"; status: number; body: unknown }
  | { kind: "redirect"; to: string };

export interface TalkCall {
  /** The bearer from the session cookie, or null. */
  token: string | null;
  fields: Readonly<Record<string, unknown>>;
  /** The caller sent `accept: application/json`. */
  json: boolean;
  fetchImpl?: MeFetch;
}

/** The one refusal a private read or write gives. */
export const NOT_FOUND: TalkAnswer = {
  kind: "json",
  status: 404,
  body: { error: { code: "not_found", message: "Not found" } },
};

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

function text(fields: Readonly<Record<string, unknown>>, name: string): string {
  const value = fields[name];
  return typeof value === "string" ? value.trim() : "";
}

function withQuery(path: string, key: string, value: string): string {
  const [before, hash = ""] = path.split("#");
  const joiner = before!.includes("?") ? "&" : "?";
  return `${before}${joiner}${key}=${encodeURIComponent(value)}${hash ? `#${hash}` : ""}`;
}

/**
 * POST /{slug}/talk/start — start a thread with its kind and who can see it.
 *
 * `return_to` is where Talk is for this product (the tab, or an idea's
 * section); a refusal goes back there with `?talk=…`. A thread that started
 * goes to its own address.
 *
 * THE TITLE NEVER GOES INTO AN ADDRESS. A refused or signed-out start comes
 * back with a code and nothing typed: a private thread's words in a query
 * string would be in a history, a log and a referrer. The composer keeps the
 * draft in the tab (`sessionStorage`) instead.
 */
export async function handleStartThread(slug: string, call: TalkCall): Promise<TalkAnswer> {
  if (!SLUG_RE.test(slug)) return NOT_FOUND;
  const back = sanitizeReturnTo(text(call.fields, "return_to")) ?? `/${slug}/talk`;
  const refuse = (code: string, status: number, fields: Record<string, string[]> = {}): TalkAnswer =>
    call.json
      ? { kind: "json", status, body: { error: { code, message: code, fields } } }
      : { kind: "redirect", to: withQuery(back, "talk", code) };

  if (!call.token) return { kind: "signin", returnTo: back };

  const title = text(call.fields, "title");
  const kind = text(call.fields, "kind");
  const visibility = text(call.fields, "visibility") || "public";
  if (title.length === 0 || title.length > MAX_THREAD_TITLE || !isThreadKind(kind) || !isThreadVisibility(visibility)) {
    return refuse("invalid", 422);
  }

  const result = await startThread(call.token, { slug, title, kind, visibility }, call.fetchImpl);
  if (result.kind === "signin") return { kind: "signin", returnTo: back };
  if (result.kind === "profile") return refuse("profile", 403);
  if (result.kind === "invalid") return refuse("invalid", 422, result.fields);
  if (result.kind !== "ok") return refuse("failed", 502);

  // What core WROTE decides the address, not what the form asked for.
  const made: ThreadVisibility = result.data.visibility === "private" ? "private" : "public";
  // `started` tells the thread's page which product's draft to drop from the
  // tab: the words are a thread now. It is a slug, never the words.
  const to = withQuery(
    made === "private" ? privateThreadPath(result.data.threadId) : publicThreadPath(result.data.threadId),
    "started",
    slug,
  );
  return call.json
    ? { kind: "json", status: 201, body: { data: { threadId: result.data.threadId, visibility: made, href: to } } }
    : { kind: "redirect", to };
}

/**
 * GET /{slug}/talk/private — the reader's private threads on this product.
 *
 * Signed out, or anything else that is not a list: an EMPTY list, the answer
 * somebody with no private threads gets. The page asks this only after the
 * overlay says the reader is signed in.
 */
export async function handlePrivateList(slug: string, call: TalkCall): Promise<TalkAnswer> {
  const empty: PrivateThreadList = { crew: false, threads: [] };
  const answer = (list: PrivateThreadList): TalkAnswer => ({ kind: "json", status: 200, body: { data: list } });
  if (!SLUG_RE.test(slug) || !call.token) return answer(empty);
  const list = await fetchPrivateThreads(call.token, slug, call.fetchImpl);
  return answer(list ?? empty);
}

/** GET /threads/private/{id}/data — one private thread, or the one refusal. */
export async function handlePrivateThread(threadId: string, call: TalkCall): Promise<TalkAnswer> {
  if (!isThreadId(threadId) || !call.token) return NOT_FOUND;
  const document: PrivateThreadDocument | null = await fetchPrivateThread(call.token, threadId, call.fetchImpl);
  return document ? { kind: "json", status: 200, body: { data: document } } : NOT_FOUND;
}

/**
 * POST /threads/private/{id}/reply — a reply from the author or the crew.
 *
 * A form comes back to the thread's address whatever happened: for somebody
 * who may not read it that address is the not-found, so the redirect says
 * nothing either.
 */
export async function handlePrivateReply(threadId: string, call: TalkCall): Promise<TalkAnswer> {
  if (!isThreadId(threadId)) return NOT_FOUND;
  const here = privateThreadPath(threadId);
  const answer = (code: string, status: number): TalkAnswer =>
    call.json
      ? { kind: "json", status, body: { error: { code, message: code } } }
      : { kind: "redirect", to: withQuery(here, "talk", code) };
  if (!call.token) return call.json ? NOT_FOUND : { kind: "redirect", to: here };

  const body = text(call.fields, "body");
  if (body.length === 0 || body.length > MAX_POST_BODY) return answer("invalid", 422);

  const result = await replyPrivately(call.token, threadId, body, call.fetchImpl);
  if (result.kind === "ok") {
    return call.json
      ? { kind: "json", status: 201, body: { data: { postId: result.data.postId } } }
      : { kind: "redirect", to: here };
  }
  if (result.kind === "invalid") return answer("invalid", 422);
  if (result.kind === "failed") return answer("failed", 502);
  // signin, profile, missing: not the reader's, in one answer.
  return call.json ? NOT_FOUND : { kind: "redirect", to: here };
}

/**
 * POST /threads/{id}/resolve — the crew marks an issue resolved (`resolved`
 * = `1`) or opens it again (`0`). Anybody who is not the crew gets the
 * not-found a missing thread gets.
 */
export async function handleResolve(threadId: string, call: TalkCall): Promise<TalkAnswer> {
  if (!isThreadId(threadId)) return NOT_FOUND;
  const back = sanitizeReturnTo(text(call.fields, "return_to")) ?? publicThreadPath(threadId);
  if (!call.token) return call.json ? NOT_FOUND : { kind: "signin", returnTo: back };
  const resolved = text(call.fields, "resolved") !== "0";
  const result = await setThreadResolved(call.token, threadId, resolved, call.fetchImpl);
  if (result.kind === "ok") {
    return call.json
      ? { kind: "json", status: 200, body: { data: { resolvedAt: result.data.resolvedAt } } }
      : { kind: "redirect", to: back };
  }
  if (result.kind === "failed" || result.kind === "invalid") {
    return call.json
      ? { kind: "json", status: 502, body: { error: { code: "failed", message: "failed" } } }
      : { kind: "redirect", to: withQuery(back, "talk", "failed") };
  }
  return call.json ? NOT_FOUND : { kind: "redirect", to: back };
}
