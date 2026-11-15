// /{slug}/manage/crew (openproduct host) — the crew's own list and its roles
// (openproduct-stages-crew SC-3, design §2).
//
//   GET   ?q=&role=&cursor=                  → the list: 30 people and the
//                                               counts, for anybody on the crew
//   POST  {changes: [{subjectId, role}]}     → one save from Edit crew, for a
//                                               Lead
//
// JSON, always, and `no-store`: 401 signed out, 404 for anybody not on the
// crew (or, for a save, not its Lead) — the same answer as a product that
// does not exist. The workspace and listing ids are never fields
// (`posts/crew-handler.ts`).
import type { NextRequest, NextResponse } from "next/server";

import { handleCrewRead, handleCrewSave } from "../../../posts/crew-handler";
import { crewCall, notFound, respond } from "../../../posts/crew-route";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: false });
  return call ? respond(request, await handleCrewRead(call)) : notFound();
}

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: true });
  return call ? respond(request, await handleCrewSave(call)) : notFound();
}
