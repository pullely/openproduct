// The gateway's half of the auth seam (openproduct-launch AC2b).
//
// One call: turn a typed address into a subject id, or nothing.
//
// ─── WHY THIS IS SIGNED RATHER THAN BOUND ────────────────────────────────
//
// Every other caller of identity's `/v1/internal/*` family holds a service
// binding. openproduct holds none, in either direction, by design (OPX-4) —
// and the gateway's binding list is a tested security control that renders
// exactly one binding (core) and no data resource of any kind. So the one
// thing openproduct needs from identity arrives through the front door and
// authenticates itself, on the canonical OrunCloud webhook scheme:
//
//   message   = `${timestamp}.${body}`
//   signature = `sha256=` + hex(HMAC-SHA256(secret, message))
//
// The scheme is restated here rather than imported from `seam.ts`, which
// restates it too and says why: after OX6 this code leaves the monorepo, and
// a shared import would make the repo cut a negotiation.
//
// ─── ITS OWN KEY, NOT THE LISTING SEAM'S ─────────────────────────────────
//
// `LISTING_SEAM_SECRET` moves listing facts and is shared with core and with
// membership-worker. This key authorizes an account-enumeration oracle. One
// key compromised should not buy both, so they are two keys.
//
// ─── A MISSING KEY IS A REFUSAL, NOT AN OPENING ──────────────────────────
//
// Absent secret, absent platform URL, a platform that did not answer, a
// malformed answer: all return null, and the caller turns every null into the
// same refusal a wrong password gets. That is the point — the failure modes
// of this call must not be distinguishable from "no account with that
// address", or the outage becomes the oracle.

import { SEAM_SUBJECT_BY_EMAIL_PATH } from "@openproduct/contracts";

import type { Env } from "./env.js";

const SIGNATURE_PREFIX = "sha256=";

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Address → subject id, over the seam. Null for every failure.
 *
 * THE ADDRESS IS ON THIS LINE AND NOWHERE ELSE IN THE PROCESS. It arrives in
 * a request body, is signed into one outbound body, and is gone when the
 * request ends. Core has no parameter for it and the schema has no column.
 */
export async function resolveSubjectByEmail(
  env: Env,
  email: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<string | null> {
  const secret = (env.OPENPRODUCT_AUTH_SEAM_SECRET ?? "").trim();
  const base = (env.PLATFORM_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!secret || !base) return null;

  const body = JSON.stringify({ email });
  const timestamp = String(Math.floor(now() / 1000));
  const signature = `${SIGNATURE_PREFIX}${await hmacHex(secret, `${timestamp}.${body}`)}`;

  let res: Response;
  try {
    res = await fetchImpl(`${base}${SEAM_SUBJECT_BY_EMAIL_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": signature,
        "x-webhook-timestamp": timestamp,
        "x-webhook-id": crypto.randomUUID(),
      },
      body,
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  // READ NARROWLY, the discipline `deliverDigests` already applies outbound.
  // The only field taken is the subject id; anything else the platform sends
  // is ignored rather than logged, because the shapes it could take that we
  // do not already have are facts about how people are reached.
  try {
    const parsed = (await res.json()) as { data?: { subjectId?: unknown } };
    const id = parsed?.data?.subjectId;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}
