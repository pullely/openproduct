// The transport half of a Talk route (openproduct-redesign OPR-4).
//
// `handlers.ts` decides; this turns a request into its input and its answer
// into a response. Kept apart because this file imports `next/server` and
// the handlers must not (the web test lane does not run Next).
//
// EVERY ANSWER IS `no-store`: each is about one reader.

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../auth/auth";
import { actAnswer, wantsJson } from "../me/act";
import { readFields } from "../posts/crew-route";

import type { TalkAnswer, TalkCall } from "./handlers";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function talkCall(request: NextRequest, options: { body: boolean }): Promise<TalkCall> {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  return {
    token: session ? session.accessToken : null,
    fields: options.body ? await readFields(request) : {},
    json: wantsJson(request) || request.method === "GET",
  };
}

export function talkRespond(request: NextRequest, answer: TalkAnswer): NextResponse {
  if (answer.kind === "signin") return actAnswer(request, "signin", { returnTo: answer.returnTo });
  if (answer.kind === "json") return NextResponse.json(answer.body, { status: answer.status, headers: NO_STORE });
  // 303: a POST answered with a redirect must become a GET.
  const res = NextResponse.redirect(new URL(answer.to, request.url), 303);
  res.headers.set("cache-control", "no-store");
  return res;
}
