// The signed-in Talk calls (openproduct-redesign OPR-4, design §7).
//
// SERVER ONLY: each takes the bearer from the session cookie, which a route
// handler read. Nothing here runs in a page's render — a private thread is
// never part of a public page's HTML.
//
// EVERY PRIVATE READ HAS ONE FAILURE: `null`. Core answers 404 to anybody
// who may not read a private thread, the gateway answers 404 with no
// session, and this collapses a dead token and an outage into the same
// `null` — so the page above can only ever say "nothing here", and can never
// be made to say "something is here, and it is not yours".

import {
  TALK_API,
  type PrivateThreadDocument,
  type PrivateThreadList,
  type ThreadKind,
  type ThreadVisibility,
} from "@openproduct/contracts";

import { meHeaders, type MeFetch } from "../me/me-api";
import { publicApiBase } from "../public-api";

interface Envelope<T> {
  data?: T;
  error?: { code?: string; message?: string; details?: { fields?: Record<string, string[]> } };
}

async function call(
  token: string,
  path: string,
  init: { method: string; body?: unknown },
  fetchImpl: MeFetch,
): Promise<Response | null> {
  try {
    return await fetchImpl(`${publicApiBase()}${path}`, {
      method: init.method,
      headers: meHeaders(token, init.body !== undefined),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

async function dataOf<T>(res: Response | null): Promise<T | null> {
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  return body?.data ?? null;
}

/** The reader's private threads on a product, or null. */
export async function fetchPrivateThreads(
  token: string,
  slug: string,
  fetchImpl: MeFetch = fetch,
): Promise<PrivateThreadList | null> {
  return dataOf<PrivateThreadList>(await call(token, TALK_API.privateThreads(slug), { method: "GET" }, fetchImpl));
}

/** One private thread with its posts, or null — for every reason alike. */
export async function fetchPrivateThread(
  token: string,
  threadId: string,
  fetchImpl: MeFetch = fetch,
): Promise<PrivateThreadDocument | null> {
  return dataOf<PrivateThreadDocument>(await call(token, TALK_API.privateThread(threadId), { method: "GET" }, fetchImpl));
}

export type TalkWrite<T> =
  | { kind: "ok"; data: T }
  /** No session core honours. */
  | { kind: "signin" }
  /** A public thread needs a public profile (CB-2). */
  | { kind: "profile" }
  /** Not there — or not the reader's. One answer. */
  | { kind: "missing" }
  | { kind: "invalid"; fields: Record<string, string[]> }
  | { kind: "failed" };

async function writeOf<T>(res: Response | null): Promise<TalkWrite<T>> {
  if (!res) return { kind: "failed" };
  if (res.status === 401) return { kind: "signin" };
  if (res.status === 403) return { kind: "profile" };
  if (res.status === 404) return { kind: "missing" };
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (res.status === 422) return { kind: "invalid", fields: body?.error?.details?.fields ?? {} };
  if (!res.ok || body?.data === undefined || body.data === null) return { kind: "failed" };
  return { kind: "ok", data: body.data };
}

/** Start a thread on a product, with its kind and who can see it. */
export async function startThread(
  token: string,
  input: { slug: string; title: string; kind: ThreadKind; visibility: ThreadVisibility },
  fetchImpl: MeFetch = fetch,
): Promise<TalkWrite<{ threadId: string; visibility: ThreadVisibility }>> {
  return writeOf(await call(token, TALK_API.start(), { method: "POST", body: input }, fetchImpl));
}

/** Reply in a private thread. */
export async function replyPrivately(
  token: string,
  threadId: string,
  body: string,
  fetchImpl: MeFetch = fetch,
): Promise<TalkWrite<{ postId: string }>> {
  return writeOf(await call(token, TALK_API.privateReply(threadId), { method: "POST", body: { body } }, fetchImpl));
}

/** Mark an issue resolved, or open it again. Crew only: anybody else is `missing`. */
export async function setThreadResolved(
  token: string,
  threadId: string,
  resolved: boolean,
  fetchImpl: MeFetch = fetch,
): Promise<TalkWrite<{ resolvedAt: string | null }>> {
  return writeOf(await call(token, TALK_API.resolved(threadId), { method: resolved ? "PUT" : "DELETE" }, fetchImpl));
}
