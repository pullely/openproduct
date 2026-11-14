// /{slug}/manage/milestones (openproduct host) — a product's milestones, for
// its crew (openproduct-redesign OPR-3).
//
//   GET   the milestones with their ids, and the stage  → JSON, always
//   POST  intent = create | update | reorder | delete | ship | unship
//                                                        → 303 back for a form,
//                                                          JSON for `accept: application/json`
//
// Fields: `intent`, `milestone` (pms_…), `code`, `title`, `summary`, `order`
// (every id, comma-separated, for reorder), `return_to`. The workspace and
// listing ids are never fields (`posts/crew-handler.ts`).
import type { NextRequest, NextResponse } from "next/server";

import { handleMilestoneWrite, handleMilestonesRead } from "../../../posts/crew-handler";
import { crewCall, notFound, respond } from "../../../posts/crew-route";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: false });
  return call ? respond(request, await handleMilestonesRead(call)) : notFound();
}

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: true });
  return call ? respond(request, await handleMilestoneWrite(call)) : notFound();
}
