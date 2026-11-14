// POST /{slug}/manage/profile (openproduct host) — the listing fields a
// product's page edits in place (openproduct-redesign OPR-3): `tryUrl`,
// `tagline`, `pitch`, and `slug` (the name; renaming changes the address).
//
// 303 back for a form, JSON for `accept: application/json`. Only a field the
// form sent is changed. The workspace and listing ids are never fields
// (`posts/crew-handler.ts`).
import type { NextRequest, NextResponse } from "next/server";

import { handleProfileWrite } from "../../../posts/crew-handler";
import { crewCall, notFound, respond } from "../../../posts/crew-route";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: true });
  return call ? respond(request, await handleProfileWrite(call)) : notFound();
}
