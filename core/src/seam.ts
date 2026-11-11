// openproduct's half of the listing seam (OX5 — S4/S5).
//
// The GRANT is the platform's attestation that a listing may bind to a
// workspace + project: signed with the shared seam secret, short-lived at
// verification (10 minutes on issuedAt — the redirect hop it survives is
// seconds), every field non-secret. Verifying it is the WHOLE of the
// platform-authority question at create/link time; nothing is asked
// per-request afterwards.
//
// Dependency-free by design (WebCrypto only) — the repo-cut property.

export const SEAM_VERSION = "v1";
const GRANT_MAX_AGE_MS = 10 * 60 * 1000;

export interface ListingGrant {
  orgId: string;
  projectId: string;
  workspaceVisibility: "public";
  doorRef: string;
  grantedBy: string;
  issuedAt: string;
}

function b64urlDecode(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish hex comparison (lengths first, then XOR fold). */
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a grant blob (`base64url(JSON).hexsig`). Null on ANY defect —
 * malformed, bad signature, wrong seam version, stale, or missing fields.
 * Deny-by-default: the caller treats null as "no platform attestation".
 */
export async function verifyListingGrant(
  secret: string,
  blob: string,
  now: () => Date = () => new Date(),
): Promise<ListingGrant | null> {
  const trimmed = (blob ?? "").trim();
  const dot = trimmed.indexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) return null;
  const encoded = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  if (!/^[0-9a-f]{64}$/.test(sig)) return null;
  const expected = await hmacHex(secret, encoded);
  if (!hexEqual(sig, expected)) return null;

  const bytes = b64urlDecode(encoded);
  if (!bytes) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (payload.seam !== SEAM_VERSION) return null;
  const { orgId, projectId, workspaceVisibility, doorRef, grantedBy, issuedAt } = payload as {
    orgId?: unknown;
    projectId?: unknown;
    workspaceVisibility?: unknown;
    doorRef?: unknown;
    grantedBy?: unknown;
    issuedAt?: unknown;
  };
  if (
    typeof orgId !== "string" ||
    typeof projectId !== "string" ||
    workspaceVisibility !== "public" ||
    typeof doorRef !== "string" ||
    typeof grantedBy !== "string" ||
    typeof issuedAt !== "string"
  ) {
    return null;
  }
  const issued = Date.parse(issuedAt);
  if (Number.isNaN(issued)) return null;
  const age = now().getTime() - issued;
  if (age < -60_000 || age > GRANT_MAX_AGE_MS) return null;
  return { orgId, projectId, workspaceVisibility: "public", doorRef, grantedBy, issuedAt };
}
