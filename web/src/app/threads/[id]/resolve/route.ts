// POST /threads/{id}/resolve (openproduct host) — the crew marks an issue
// resolved (`resolved=1`) or opens it again (`resolved=0`), on a public or a
// private thread (openproduct-redesign OPR-4). Anybody who is not on the
// product's crew gets the not-found a missing thread gets.
import type { NextRequest, NextResponse } from "next/server";

import { handleResolve } from "../../../talk/handlers";
import { talkCall, talkRespond } from "../../../talk/route-io";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { id } = await params;
  return talkRespond(request, await handleResolve(id, await talkCall(request, { body: true })));
}
