// openproduct-worker — the public plane (saas-openproduct OD1).
//
// One worker, two doors that share nothing but a database connection: an
// unauthenticated public read (OD3) and an authenticated maintainer write
// (OD2). What makes that safe is not the routing — it is that this isolate
// holds no binding through which a privileged question could be asked. See
// wrangler.template.jsonc, which is a security control with a CI test on it.

import type { Env } from "./env.js";
import { route } from "./router.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // `ctx` reaches `route` so the request's database clients are closed after
    // the response is sent rather than before it returns (OPP10).
    return route(request, env, undefined, undefined, ctx);
  },
} satisfies ExportedHandler<Env>;
