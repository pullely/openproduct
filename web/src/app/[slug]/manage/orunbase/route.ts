// /{slug}/manage/orunbase (openproduct host) — the crew's Orunbase card
// (openproduct-stages-crew SC-4, design §3.4).
//
//   GET  → the sync: when it last synced, the crew count, the last stage and
//          production deploys, and where "Manage on Orunbase" goes
//
// JSON, always, and `no-store`: 401 signed out, 404 for anybody not on the
// crew — the same answer as a product that does not exist. The workspace and
// listing ids are never fields (`posts/crew-handler.ts`).
import type { NextRequest, NextResponse } from "next/server";

import { handleOrunbaseRead } from "../../../posts/crew-handler";
import { crewCall, notFound, respond } from "../../../posts/crew-route";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: false });
  return call ? respond(request, await handleOrunbaseRead(call)) : notFound();
}
