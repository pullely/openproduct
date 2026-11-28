import type { Env } from "./env.js";
import { isOpenCorsPath } from "./oauth.js";

// CORS, owned by the product it serves (OX3 — this left api-edge with the
// facade). ONE allowed origin since OX5b:
//
//   SITE_ORIGIN — openproduct's own web app. Its server-side reads need no
//                 CORS at all; this covers any client-side call it grows.
//
// (CONSOLE_ORIGIN retired at OX5b: the maintainer surface moved into the
// studio and the join door's interim S11 POST deleted — the platform console
// no longer speaks to this gateway from a browser at all.)
//
// An origin that is not configured simply is not allowed — no wildcard, ever.

const ALLOWED_METHODS = "GET, POST, PATCH, PUT, DELETE, OPTIONS";
const ALLOWED_HEADERS = "authorization, content-type, idempotency-key, x-request-id, traceparent";

export function allowedOrigins(env: Env): string[] {
  return [env.SITE_ORIGIN]
    .map((origin) => (origin ?? "").trim().replace(/\/$/, ""))
    .filter((origin) => origin.length > 0);
}

function matchOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  return allowedOrigins(env).includes(origin) ? origin : null;
}

/** MC1 — what a browser-based MCP client may send to the open paths. */
const OPEN_ALLOWED_HEADERS = "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id";
const OPEN_EXPOSED_HEADERS = "www-authenticate, mcp-session-id";

export function handlePreflight(request: Request, env: Env): Response | null {
  if (request.method !== "OPTIONS") return null;
  // MC1 — the OAuth door and /mcp/me read no cookie, so any origin may call
  // them (oauth.ts explains). Nothing else on this worker is opened by it.
  if (request.headers.get("origin") && isOpenCorsPath(new URL(request.url).pathname)) {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
        "access-control-allow-headers": OPEN_ALLOWED_HEADERS,
        "access-control-expose-headers": OPEN_EXPOSED_HEADERS,
        "access-control-max-age": "600",
      },
    });
  }
  const origin = matchOrigin(request, env);
  if (!origin) return new Response(null, { status: 204 });
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": ALLOWED_METHODS,
      "access-control-allow-headers": ALLOWED_HEADERS,
      "access-control-max-age": "600",
      vary: "origin",
    },
  });
}

export function applyCorsHeaders(response: Response, request: Request, env: Env): Response {
  const origin = matchOrigin(request, env);
  if (!origin) {
    if (request.headers.get("origin") && isOpenCorsPath(new URL(request.url).pathname)) {
      response.headers.set("access-control-allow-origin", "*");
      response.headers.set("access-control-expose-headers", OPEN_EXPOSED_HEADERS);
    }
    return response;
  }
  response.headers.set("access-control-allow-origin", origin);
  response.headers.append("vary", "origin");
  return response;
}
