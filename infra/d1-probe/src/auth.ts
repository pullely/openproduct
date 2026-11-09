// The probe's one credential check (openproduct-standalone OPN-2).
//
// A static bearer, PROBE_TOKEN, delivered to the Worker as a runtime secret
// (the composition's secrets-live step) and to the smoke through secretEnv.
// No token configured, or one too short to be a secret, means the Worker
// answers nothing at all.

/** A token shorter than this is treated as no token: the Worker then answers nothing. */
export const MIN_TOKEN_LENGTH = 16;

const encoder = new TextEncoder();

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/**
 * Constant-time: both sides are hashed first, so the comparison is always of
 * two 32-byte values whatever was presented, and the bytes are compared with
 * `crypto.subtle.timingSafeEqual` (XOR-accumulated where a runtime lacks it).
 */
export async function bearerMatches(header: string | null, token: string | undefined): Promise<boolean> {
  const configured = typeof token === "string" && token.length >= MIN_TOKEN_LENGTH;
  const presented = header !== null && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const [a, b] = await Promise.all([sha256(presented), sha256(configured ? token : "\u0000unset")]);
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean };
  let equal: boolean;
  if (typeof subtle.timingSafeEqual === "function") {
    equal = subtle.timingSafeEqual(a, b);
  } else {
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
    equal = diff === 0;
  }
  return configured && presented.length > 0 && equal;
}
