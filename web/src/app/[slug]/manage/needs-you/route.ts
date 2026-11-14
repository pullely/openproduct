// GET /{slug}/manage/needs-you (openproduct host) — what waits on a product's
// crew (openproduct-redesign OPR-3): pending seat requests and drafts.
//
// JSON, always, and `no-store`: 401 signed out, 404 for anybody not on the
// crew — the same answer as a product that does not exist. A cached product
// page asks this after load, once the overlay says the visitor is on the
// crew; it is never part of the page's own render.
import type { NextRequest, NextResponse } from "next/server";

import { handleNeedsYouRead } from "../../../posts/crew-handler";
import { crewCall, notFound, respond } from "../../../posts/crew-route";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: false });
  return call ? respond(request, await handleNeedsYouRead(call)) : notFound();
}
