// GET /{slug}/talk/private (openproduct host) — the private threads on this
// product that the reader may see (openproduct-redesign OPR-4, design §7):
// their own, or all of them for the crew.
//
// JSON, `no-store`, never part of the page's render: the cached Talk page
// asks this after load, once the overlay says the reader is signed in.
// Anybody else — signed out included — gets an empty list.
import type { NextRequest, NextResponse } from "next/server";

import { handlePrivateList } from "../../../talk/handlers";
import { talkCall, talkRespond } from "../../../talk/route-io";

type Context = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { slug } = await params;
  return talkRespond(request, await handlePrivateList(slug, await talkCall(request, { body: false })));
}
