// GET /api/search?q=… (openproduct host) — the palette's read (DS3).
//
// A THIN PASSTHROUGH, and it exists for one reason: the palette runs in the
// browser, and the browser cannot call the gateway's origin without CORS. So
// this hop is same-origin by construction rather than by configuration —
// there is no allowlist to get wrong, and no preflight to serve.
//
// NOTHING PERSONAL PASSES THROUGH IT. No session is read, no cookie is
// forwarded, no header is copied from the inbound request. The answer is the
// same for every visitor, which is what lets it be cached at all (OPC-1) and
// is why the ORDER can be published (OPC-4) — a personalised ranking would be
// a ranking with an input nobody outside this program can see.
import { NextResponse, type NextRequest } from "next/server";

import { publicApiBase } from "../../public-api";

/** Long enough that a typist's keystrokes coalesce at the edge; short enough
 *  that a listing published a minute ago is findable. Matches the catalog
 *  document's own TTL — the index cannot usefully be fresher than the page
 *  its results link to. */
const CACHE_SECONDS = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const base = publicApiBase();
  if (!base) {
    return NextResponse.json({ data: { query: "", results: [] } }, { status: 200 });
  }

  try {
    const upstream = await fetch(`${base}/v1/search?q=${encodeURIComponent(q)}`, {
      // A fresh, CLOSED header set. A credential cannot reach the gateway
      // by being forgotten in a denylist if nothing is copied in the first
      // place. The gateway sets its own cache-control on the public branch;
      // this hop re-states it on the way out rather than caching here, so
      // there is one place that decides how stale a result may be.
      headers: { accept: "application/json" },
    });
    if (!upstream.ok) {
      // The status survives; the body does not. Upstream's error names an
      // internal path, and this surface says nothing about its own shape.
      return NextResponse.json(
        { error: { code: "unavailable", message: "Search is unavailable" } },
        { status: upstream.status === 429 ? 429 : 503 },
      );
    }
    return NextResponse.json(await upstream.json(), {
      headers: { "cache-control": `public, max-age=0, s-maxage=${CACHE_SECONDS}` },
    });
  } catch {
    return NextResponse.json(
      { error: { code: "unavailable", message: "Search is unavailable" } },
      { status: 503 },
    );
  }
}
