// /{slug}/manage/posts (openproduct host) — a product's template posts, for its
// crew (openproduct-redesign OPR-3).
//
//   GET   the product's posts, drafts included        → JSON, always
//   POST  intent = create | save | publish | remove   → 303 back for a form,
//                                                        JSON for `accept: application/json`
//
// Fields: `intent`, `post` (ppo_…), `kind`, one `block.<id>` per block (or
// `blocks`), `milestone` (pms_…) and `opening` (opr_…) on publish,
// `return_to`. The workspace and listing ids are NEVER fields: they are
// resolved from the slug in this address and the caller's session
// (`posts/crew-handler.ts`, which also documents the answers).
import type { NextRequest, NextResponse } from "next/server";

import { handlePostWrite, handlePostsRead } from "../../../posts/crew-handler";
import { crewCall, notFound, respond } from "../../../posts/crew-route";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: false });
  return call ? respond(request, await handlePostsRead(call)) : notFound();
}

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const call = await crewCall(request, params, { body: true });
  return call ? respond(request, await handlePostWrite(call)) : notFound();
}
