// POST /{slug}/manage/seats (openproduct host) — a product's seats, for its
// crew (openproduct-redesign OPR-3).
//
// A seat is a ROLE OPENING: a role, what it is, the commitment, and whether
// it is open. It is not the Help wanted post — opening a seat prepares that
// post as a draft, and the answer names it.
//
//   POST  intent = create | update | delete   → 303 back for a form,
//                                                JSON for `accept: application/json`
//
// Fields: `intent`, `seat` (opr_…), `title`, `description`, `commitment`,
// `status` (open | filled | closed), `return_to`. The workspace and listing
// ids are never fields (`posts/crew-handler.ts`). The seats themselves are on
// the product's public document; there is no crew-only read here.
import type { NextRequest, NextResponse } from "next/server";

import { handleSeatWrite } from "../../../posts/crew-handler";
import { crewCall, notFound, respond } from "../../../posts/crew-route";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: true });
  return call ? respond(request, await handleSeatWrite(call)) : notFound();
}
