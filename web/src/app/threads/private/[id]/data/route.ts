// GET /threads/private/{id}/data (openproduct host) — one private thread
// with its posts, for its author or the product's crew (openproduct-redesign
// OPR-4, design §7).
//
// ONE REFUSAL: 404, the same body, for no session, a thread that is not the
// reader's, a thread that does not exist and an id that is not one. JSON and
// `no-store`; the page at `/threads/private/{id}` is a shell that asks this
// after load.
import type { NextRequest, NextResponse } from "next/server";

import { handlePrivateThread } from "../../../../talk/handlers";
import { talkCall, talkRespond } from "../../../../talk/route-io";

type Context = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { id } = await params;
  return talkRespond(request, await handlePrivateThread(id, await talkCall(request, { body: false })));
}
