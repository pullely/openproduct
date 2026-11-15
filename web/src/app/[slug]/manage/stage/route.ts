// /{slug}/manage/stage (openproduct host) — move a product one stage, for its
// crew (openproduct-stages-crew SC-2, design §1).
//
//   POST  `to` and the step's own inputs   → 303 back for a form,
//                                            JSON for `accept: application/json`
//
// Fields: `to`, `repository`, `firstMilestone`, `stageUrl`, `tryWhat`,
// `productionUrl`, `liveSince`, `access`, `version`, `reason`, `comment`,
// `post`, `return_to`. The workspace and listing ids are never fields
// (`posts/crew-handler.ts`).
import type { NextRequest, NextResponse } from "next/server";

import { handleStageWrite } from "../../../posts/crew-handler";
import { crewCall, notFound, respond } from "../../../posts/crew-route";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: true });
  return call ? respond(request, await handleStageWrite(call)) : notFound();
}
