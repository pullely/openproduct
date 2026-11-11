// Response envelopes, matching the platform's wire shape byte-for-byte so the
// web app's clients did not have to change when the front door did (OX3).
// Deliberately dependency-free: the gateway imports no workspace package at
// all, which is the repo-cut property stated as code.
//
// ─── WHY EVERY ENVELOPE SAYS `no-store` (openproduct-performance OPP4a) ────
//
// These helpers used to set no `cache-control` at all, which was harmless
// while nothing cached this worker's output. **Workers Caching changes what
// silence means.** With it enabled, Cloudflare caches a response according to
// RFC 9111 — and under RFC 9111 a `200` with no `Cache-Control` and no
// `Expires` is HEURISTICALLY CACHEABLE. The cache key does not include the
// `Authorization` header, so "cacheable by omission" is one route away from
// one visitor being handed another visitor's answer.
//
// The automatic bypasses (a request carrying `Authorization`, a response
// carrying `Set-Cookie`) cover most of that, and "most" is not the standard
// for this. So the DEFAULT IS INVERTED: nothing this worker returns is
// cacheable unless a caller says so out loud, and exactly one place does —
// the public read branch in `router.ts`, which overwrites this header with the
// `public, max-age=N` it got from core.
//
// `/health` is the other reason. It is the one route whose whole job is to
// report a fact that changes; a cached "ok" would keep saying so while the
// sweep went stale, which is the outage RS0 already had once.

export function resolveRequestId(request: Request): string {
  const inbound = request.headers.get("x-request-id");
  if (inbound && /^[A-Za-z0-9_-]{8,128}$/.test(inbound)) return inbound;
  return crypto.randomUUID();
}

export function successResponse<T>(data: T, requestId: string, status = 200): Response {
  return Response.json(
    { data, meta: { requestId, cursor: null } },
    { status, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId: string,
  details?: Record<string, unknown>,
): Response {
  return Response.json(
    { error: { code, message, details: details ?? {}, requestId } },
    { status, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}

export function notFound(requestId: string, path: string): Response {
  return errorResponse("not_found", `Route not found: ${path}`, 404, requestId);
}

export function methodNotAllowed(requestId: string): Response {
  return errorResponse("unsupported", "Method not allowed", 405, requestId);
}
