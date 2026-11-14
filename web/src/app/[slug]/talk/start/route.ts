// POST /{slug}/talk/start (openproduct host) — start a thread on a product
// from its Talk, with its kind and who can see it (openproduct-redesign
// OPR-4). A form gets a 303: to the new thread's own address, or back to
// Talk with `?talk=…`. Signed out, it goes through sign-in and comes back.
import type { NextRequest, NextResponse } from "next/server";

import { handleStartThread } from "../../../talk/handlers";
import { talkCall, talkRespond } from "../../../talk/route-io";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { slug } = await params;
  return talkRespond(request, await handleStartThread(slug, await talkCall(request, { body: true })));
}
