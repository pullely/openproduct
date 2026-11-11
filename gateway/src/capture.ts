// Observed screenshots — taking one (openproduct-worldclass MD4).
//
// The gateway's half of a capture: visit the listing's declared address in
// the provider's browser, check what came back the way an upload is checked,
// store it the way an upload is stored, and say what happened in one word.
// Core's half — which listing, and the row — is `core/handlers/captures.ts`.
//
// EVERYTHING MD1 DOES TO A STRANGER'S UPLOAD IS DONE TO THE PROVIDER'S REPLY.
// The bytes are sniffed before they are stored (a JSON error body dressed as
// a picture fails the sniff), the ceilings are the same ceilings, and the key
// is the content hash. A capture is not more trusted than an upload because
// it came from a service we pay: it is bytes from the internet, and the
// store has one door.
//
// THE ADDRESS IS PARSED FIRST, and a refusal is reported without touching the
// network — `captureTarget` is the contract's policy, applied here so the
// browser is never asked to visit something the policy would not have.

import {
  CAPTURE_TIMEOUT_MS,
  CAPTURE_VIEWPORT,
  MEDIA_FORMATS,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_SIDE,
  MEDIA_MIN_HEIGHT,
  MEDIA_MIN_WIDTH,
  captureTarget,
  screenshotAlt,
  type CaptureFailure,
  type CaptureProvider,
  type CaptureReport,
  type DueCapture,
} from "@openproduct/contracts";

import { deriveAll, originalKey, sha256Hex, sniff } from "./media.js";
import type { Env } from "./env.js";

export type ConfiguredProvider = Extract<CaptureProvider, { ok: true }>;

/** What the provider is asked for. One shape, spelled once, so a test can
 *  assert the browser was pointed where the policy allowed and nowhere else. */
export function captureRequest(provider: ConfiguredProvider, url: string): RequestInit {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.token}`,
      "content-type": "application/json",
      accept: "image/png",
    },
    body: JSON.stringify({
      url,
      viewport: { width: CAPTURE_VIEWPORT.width, height: CAPTURE_VIEWPORT.height },
      screenshotOptions: { type: "png", fullPage: false },
      gotoOptions: { waitUntil: "networkidle2", timeout: CAPTURE_TIMEOUT_MS },
    }),
    signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS + 5_000),
  };
}

/**
 * One attempt, reported. Never throws: every way this can go wrong is a
 * word from the contract's closed list, because the sweep's job is to
 * record what happened, and "it threw" is not a thing the ledger can hold.
 */
export async function captureOne(
  env: Env,
  bucket: R2Bucket,
  provider: ConfiguredProvider,
  due: DueCapture,
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<CaptureReport> {
  const fail = (error: CaptureFailure): CaptureReport => ({
    profileId: due.profileId,
    target: due.target,
    ok: false,
    error,
  });

  const target = captureTarget(due.target);
  if (!target.ok) return fail("target_refused");

  let res: Response;
  try {
    res = await fetchImpl(provider.url, captureRequest(provider, target.url));
  } catch {
    return fail("provider_unreachable");
  }
  if (!res.ok) return fail("provider_refused");

  let bytes: ArrayBuffer;
  try {
    bytes = await res.arrayBuffer();
  } catch {
    return fail("provider_unreachable");
  }
  if (bytes.byteLength === 0) return fail("not_an_image");
  if (bytes.byteLength > MEDIA_MAX_BYTES) return fail("too_large");

  const sniffed = sniff(new Uint8Array(bytes));
  if (!sniffed) return fail("not_an_image");
  if (sniffed.width < MEDIA_MIN_WIDTH || sniffed.height < MEDIA_MIN_HEIGHT) return fail("too_small");
  if (sniffed.width > MEDIA_MAX_SIDE || sniffed.height > MEDIA_MAX_SIDE) return fail("too_large");

  const hash = await sha256Hex(bytes);
  const ref = `${hash}.${sniffed.format}`;
  const key = originalKey(hash, sniffed.format);
  try {
    // Content-addressed: the same page rendering to the same bytes is one
    // object, and a retake that changed nothing stores nothing.
    if ((await bucket.head(key)) === null) {
      await bucket.put(key, bytes, { httpMetadata: { contentType: MEDIA_FORMATS[sniffed.format] } });
    }
  } catch {
    return fail("store_failed");
  }

  // Derivatives go through the zone, which needs this API's own origin. An
  // upload reads it from the request; the sweep has no request, so CT2's
  // `PUBLIC_API_ORIGIN` is it. Absent, the original serves at every width —
  // MD1's fallback, the same one an environment without resizing gets.
  const origin = (env.PUBLIC_API_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (origin.length > 0) await deriveAll(bucket, env, origin, ref, sniffed, "sweep");

  const observedAt = now.toISOString();
  return {
    profileId: due.profileId,
    target: due.target,
    ok: true,
    ref,
    // GENERATED, AND IT SAYS SO: the alt is the contract's sentence, naming
    // the product by the one name it has on every public surface.
    alt: screenshotAlt(due.slug, observedAt),
    width: sniffed.width,
    height: sniffed.height,
    observedAt,
  };
}
