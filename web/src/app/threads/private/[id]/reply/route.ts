// POST /threads/private/{id}/reply (openproduct host) — a reply in a private
// thread, from its author or the product's crew (openproduct-redesign OPR-4).
// A form gets a 303 back to the thread's address; anybody who may not read
// the thread gets the not-found a missing thread gets.
import type { NextRequest, NextResponse } from "next/server";

import { handlePrivateReply } from "../../../../talk/handlers";
import { talkCall, talkRespond } from "../../../../talk/route-io";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { id } = await params;
  return talkRespond(request, await handlePrivateReply(id, await talkCall(request, { body: true })));
}
