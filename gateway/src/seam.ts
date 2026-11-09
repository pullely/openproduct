// The gateway's half of the listing seam (openproduct-independence OX5;
// specs/components/19-openproduct-seam.md).
//
// Two receivers, both POST, both signed by the platform with the shared
// LISTING_SEAM_SECRET in the canonical OrunCloud webhook scheme:
//
//   message   = `${timestamp}.${body}`
//   signature = `sha256=` + hex(HMAC-SHA256(secret, message))
//   headers     X-Webhook-Signature / X-Webhook-Timestamp / X-Webhook-ID
//   tolerance   ±300s on the timestamp
//
// Verified INLINE — this file deliberately re-states the scheme rather than
// importing @saas/webhook-verifier, because the gateway is the repo-cut
// boundary: after OX6 this code leaves the monorepo, and a workspace import
// would make that cut a negotiation. The scheme is small, frozen, and pinned
// by tests on both sides of the seam.
//
// What the receivers DO after verification is deliberately thin: parse,
// bound, and forward over the one in-product binding (core). Authenticity is
// settled here; semantics live in core's handlers.

const SIGNATURE_PREFIX = "sha256=";
const TOLERANCE_SECONDS = 300;

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

/** Constant-time-ish comparison: length first, then a full XOR fold. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a seam webhook delivery. False on ANY defect — missing headers,
 * malformed or out-of-tolerance timestamp, bad signature — answered
 * identically on purpose: a caller probing this surface learns nothing about
 * which check refused it.
 */
export async function verifySeamSignature(
  secret: string,
  body: string,
  headers: Headers,
  now: () => Date = () => new Date(),
): Promise<boolean> {
  const signature = headers.get("X-Webhook-Signature") ?? "";
  const timestamp = headers.get("X-Webhook-Timestamp") ?? "";
  if (!signature.startsWith(SIGNATURE_PREFIX)) return false;
  if (!/^[0-9]+$/.test(timestamp)) return false;
  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds) || tsSeconds > Number.MAX_SAFE_INTEGER / 1000) return false;
  const nowSeconds = Math.floor(now().getTime() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > TOLERANCE_SECONDS) return false;

  const provided = signature.slice(SIGNATURE_PREFIX.length).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = await hmacHex(secret, `${timestamp}.${body}`);
  return timingSafeEqual(provided, expected);
}

// ─── OUTBOUND: digest delivery (openproduct-commons LC5) ──────────────────
//
// The first thing this estate SENDS over the seam rather than receives. The
// scheme is the same one the receivers above verify, signed in the other
// direction with the same shared secret — deliberately, so there is one
// scheme on this boundary rather than two half-remembered ones.
//
// WHAT CROSSES: a subject id, a week, and a link. Not an address, not a
// rendered email, not a preview of the week. openproduct does not know how
// anybody is reached and has nowhere to put the answer; the platform resolves
// the id at delivery and that resolution never comes back (I3).
//
// INERT WITHOUT CONFIGURATION, and that is the milestone's own escape hatch
// rather than an oversight. LC5's done-when says that if the seam cannot
// carry delivery, LC1's page and feed remain the shipped digest and the
// milestone closes as NOT TAKEN rather than half-built. So: no delivery URL,
// no send, and the drain says `no_seam` instead of reporting a successful run
// of nothing.

/** What the platform is handed, per person. Mirrors the contract's
 *  `DigestDelivery` — three fields, none of them an address. */
export interface OutboundDigest {
  readonly subjectId: string;
  readonly week: string;
  readonly link: string;
}

/**
 * Sign and post a batch of digest deliveries.
 *
 * Returns the subject ids the platform accepted. A subject it did not accept
 * stays queued and is retried, bounded by the outbox's attempts ceiling —
 * openproduct does not learn WHY one failed, because the reason would be a
 * fact about somebody's address and this side does not hold those.
 */
export async function deliverDigests(
  env: { LISTING_SEAM_SECRET?: string; DIGEST_DELIVERY_URL?: string },
  deliveries: readonly OutboundDigest[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ delivered: readonly string[] }> {
  if (!env.LISTING_SEAM_SECRET || !env.DIGEST_DELIVERY_URL || deliveries.length === 0) {
    return { delivered: [] };
  }

  const body = JSON.stringify({ deliveries });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `${SIGNATURE_PREFIX}${await hmacHex(env.LISTING_SEAM_SECRET, `${timestamp}.${body}`)}`;

  const res = await fetchImpl(env.DIGEST_DELIVERY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": signature,
      "x-webhook-timestamp": timestamp,
      "x-webhook-id": crypto.randomUUID(),
    },
    body,
  });
  if (!res.ok) return { delivered: [] };

  // THE RESPONSE IS READ NARROWLY. The platform tells us which ids went out
  // and nothing else; anything more in the body is ignored rather than
  // logged, because the only shapes it could take that we do not already have
  // are facts about how people are reached.
  try {
    const parsed = (await res.json()) as { delivered?: unknown };
    const delivered = Array.isArray(parsed.delivered)
      ? parsed.delivered.filter((id): id is string => typeof id === "string")
      : [];
    return { delivered };
  } catch {
    return { delivered: [] };
  }
}
