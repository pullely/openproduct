import { isOpenproductSessionToken } from "@openproduct/contracts";

import type { Env } from "./env.js";

// Token → subject, the S2 seam edge (19-openproduct-seam.md).
//
// The gateway never mints, refreshes, introspects, or verifies a platform
// token itself. It asks the platform the one question the `identity` scope
// was built to answer — `GET /v1/identity/me` with the visitor's own bearer —
// and forwards the subject to core. This is the whole of openproduct's
// authentication machinery, which is the point: least authority survives
// independence because there is nothing here to steal.
//
// ─── AC2b: TWO DOORS, ONE SHAPE ──────────────────────────────────────────
//
// A password sign-in mints openproduct's own session, which the platform has
// never heard of. So there are now two things a bearer might be, and the
// prefix says which: `ops_` is ours and resolves against CORE; anything else
// is the platform's and resolves against the platform.
//
// WHAT DID NOT CHANGE IS THE SHAPE, and that is the design rather than a
// happy accident. Both doors put a POINTER in the cookie and resolve it, per
// request, against the authority that issued it. Neither cookie is ever a
// claim this worker verifies for itself. R2's argument — a forged cookie buys
// nothing — reads identically for both, which is what stops the two paths
// from drifting into two security models.
//
// A positive resolution may be cached in-isolate for ≤60s, keyed by a digest
// of the token (never the token itself). Negative answers are never cached:
// a revocation must bite on the next request. That applies to BOTH doors —
// and it is what makes `revokeAuthSession` a mechanism rather than a promise.

export interface ResolvedSubject {
  subjectId: string;
  subjectType: "user" | "service_principal";
}

export type SubjectResult =
  | { ok: true; subject: ResolvedSubject }
  | { ok: false; status: 401 | 503; code: string; message: string };

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { subject: ResolvedSubject; expiresAt: number }>();

async function tokenDigest(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `usr_…` is a user; `sp_…` a service principal. Anything else is refused —
 *  the two are the only subject kinds core's authorizer understands. */
function subjectTypeOf(subjectId: string): ResolvedSubject["subjectType"] | null {
  if (subjectId.startsWith("usr_")) return "user";
  if (subjectId.startsWith("sp_")) return "service_principal";
  return null;
}

export async function resolveSubject(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
  core?: Fetcher,
): Promise<SubjectResult> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token) {
    return { ok: false, status: 401, code: "unauthorized", message: "Authentication required" };
  }

  const key = await tokenDigest(token);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, subject: cached.subject };
  }

  // AC2b — ours, so core answers. The prefix decides WHERE to ask and never
  // whether the answer is yes: a token that starts `ops_` and is otherwise
  // nonsense reaches core and is refused there, which is the only place that
  // can refuse it truthfully.
  if (isOpenproductSessionToken(token)) {
    return resolveOwnSession(token, key, core);
  }

  const base = (env.PLATFORM_API_URL ?? "").trim().replace(/\/$/, "");
  if (!base) {
    return { ok: false, status: 503, code: "internal_error", message: "Platform unreachable" };
  }

  let res: Response;
  try {
    res = await fetchImpl(`${base}/v1/identity/me`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
  } catch (error) {
    // The one line that distinguishes "api-edge said no" from "the request
    // never got there" — a platform outage versus this worker's own fetch
    // routing (see wrangler.jsonc, compatibility_flags).
    console.error(
      JSON.stringify({
        level: "error",
        msg: "identity_unreachable",
        base,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }),
    );
    return { ok: false, status: 503, code: "internal_error", message: "Platform unreachable" };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: 401, code: "unauthorized", message: "Authentication required" };
  }
  if (!res.ok) {
    console.error(JSON.stringify({ level: "error", msg: "identity_failed", base, status: res.status }));
    return { ok: false, status: 503, code: "internal_error", message: "Platform unreachable" };
  }

  let subjectId: string | undefined;
  try {
    const body = (await res.json()) as { data?: { subjectId?: string } };
    subjectId = body.data?.subjectId;
  } catch {
    subjectId = undefined;
  }
  const subjectType = subjectId ? subjectTypeOf(subjectId) : null;
  if (!subjectId || !subjectType) {
    return { ok: false, status: 503, code: "internal_error", message: "Malformed identity response" };
  }

  const subject: ResolvedSubject = { subjectId, subjectType };
  cache.set(key, { subject, expiresAt: Date.now() + CACHE_TTL_MS });
  return { ok: true, subject };
}

/**
 * The other door: a session this app minted, resolved against core.
 *
 * SAME CACHE, SAME TTL, SAME RULE — positives for ≤60s keyed by a digest,
 * negatives never. Sharing the cache is deliberate: two caches would be two
 * places for a revocation to fail to bite, and the key is a token digest,
 * which cannot collide across doors.
 */
async function resolveOwnSession(
  token: string,
  key: string,
  core: Fetcher | undefined,
): Promise<SubjectResult> {
  if (!core) {
    return { ok: false, status: 503, code: "internal_error", message: "Session store unreachable" };
  }

  let res: Response;
  try {
    res = await core.fetch(
      "https://openproduct.internal/internal/openproduct/auth/sessions/resolve",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      },
    );
  } catch {
    // A 503 AND NOT A 401. Core being unreachable is not evidence that this
    // session is dead, and answering 401 would sign everybody out of the
    // product for the length of an outage.
    return { ok: false, status: 503, code: "internal_error", message: "Session store unreachable" };
  }
  if (!res.ok) {
    return { ok: false, status: 503, code: "internal_error", message: "Session store unreachable" };
  }

  let subjectId: string | null = null;
  try {
    const body = (await res.json()) as { data?: { subjectId?: unknown } };
    const id = body?.data?.subjectId;
    subjectId = typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    subjectId = null;
  }

  // EXPIRED, REVOKED AND NEVER-ISSUED ARRIVE THE SAME WAY and are refused the
  // same way. The person signs in again in all three cases.
  const subjectType = subjectId ? subjectTypeOf(subjectId) : null;
  if (!subjectId || !subjectType) {
    return { ok: false, status: 401, code: "unauthorized", message: "Authentication required" };
  }

  const subject: ResolvedSubject = { subjectId, subjectType };
  cache.set(key, { subject, expiresAt: Date.now() + CACHE_TTL_MS });
  return { ok: true, subject };
}

/** Test seam: the cache is module state; suites reset it between cases. */
export function resetSubjectCache(): void {
  cache.clear();
}
