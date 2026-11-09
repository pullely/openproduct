// openproduct-d1-probe — the slice on REMOTE D1, measured from inside
// Cloudflare (openproduct-standalone OPN-2, milestone OPN1 "D1 proven on one
// slice"; design §5.2, PROOF.md "the remote test still needed").
//
// A stage-only Worker bound to a throwaway database (`openproduct-probe-stage`,
// infra/cloudflare-d1-probe), never the product's. It loads the slice's
// 5,000-listing corpus with the same loader the local scale suites use, times
// the slice's methods, sends the negative probes local workerd accepts, and
// exports the slice's outputs for a diff against local D1. The smoke script
// (`scripts/probe-run.mjs`) drives it on every stage deploy.
//
// THE SURFACE. POST only, and every route requires
// `Authorization: Bearer <PROBE_TOKEN>` (compared in constant time). Anything
// else — a wrong token, no token, a token the Worker was never given, another
// method or path — is a bare 404 with no body: the probe does not admit to
// existing, and it never echoes what it was sent.
//
//   POST /schema                         apply 0001_slice.sql (idempotent)
//   POST /reset                          empty the probe tables
//   POST /load?size=suite|full&step=N    one bounded corpus statement per call → { done, nextStep }
//   POST /bench?runs=50[&op=…]           p50/p95 inside the Worker + D1 meta, per op
//   POST /negative[?probe=…]             the four limit probes → refused | accepted
//   POST /export[?detail=full]           digests of the slice's outputs

import { bearerMatches } from "./auth.js";
import type { Env } from "./env.js";
import { errorText } from "./instrument.js";
import { ProbeError, probeContext, type ProbeContext } from "./probe.js";
import { benchRoute } from "./routes/bench.js";
import { exportRoute } from "./routes/export.js";
import { loadRoute } from "./routes/load.js";
import { negativeRoute } from "./routes/negative.js";
import { resetRoute } from "./routes/reset.js";
import { schemaRoute } from "./routes/schema.js";

type Route = (ctx: ProbeContext, url: URL) => Promise<unknown>;

const ROUTES: Record<string, Route> = {
  "/schema": schemaRoute,
  "/reset": resetRoute,
  "/load": loadRoute,
  "/bench": benchRoute,
  "/negative": negativeRoute,
  "/export": exportRoute,
};

const notFound = () => new Response(null, { status: 404 });

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!(await bearerMatches(request.headers.get("Authorization"), env.PROBE_TOKEN))) return notFound();
    const url = new URL(request.url);
    const route = request.method === "POST" ? ROUTES[url.pathname] : undefined;
    if (!route) return notFound();
    try {
      return json(200, await route(probeContext(env), url));
    } catch (error) {
      if (error instanceof ProbeError) return json(error.status, { error: error.message });
      return json(500, { error: errorText(error) });
    }
  },
} satisfies ExportedHandler<Env>;
