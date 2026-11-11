// The password door's server half (openproduct-launch AC2c).
//
// One route handler for three acts, because they share everything that
// matters: the browser never talks to the gateway directly, the address never
// reaches the client bundle, and the session cookie is set here or not at all.
//
// ─── WHY THE BROWSER DOES NOT POST TO THE GATEWAY ────────────────────────
//
// It is a different origin, so a direct post would need CORS on an auth
// endpoint — a surface worth not having — and the answer sets a cookie, which
// has to be on THIS host to be the session. Proxying costs one hop and keeps
// the gateway's door closed to browsers.
//
// ─── WHAT EACH ACT IS ────────────────────────────────────────────────────
//
//   sign-in   AC2b. Address + password → an `ops_` session token.
//   sign-up   AC1. Address + password → the platform mails a code. No
//             session yet; there is nothing to sign in AS until the code is
//             typed back.
//   verify    AC1. The code → a subject, a written password, and a session.
//
// ─── THE ANSWER IS NARROWED, AND THE NOTE IS THE GATEWAY'S ───────────────
//
// Everything a person is told about a failed sign-in was decided at the
// gateway, in one sentence, on purpose (AC2b). This handler forwards that
// sentence and adds nothing: a second layer composing its own message is a
// second place for the ambiguity to leak.

import { NextResponse, type NextRequest } from "next/server";

import {
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  VERIFY_PATH,
  SESSION_TOKEN_PREFIX,
} from "@openproduct/contracts";

import { openproductApiBase } from "@/lib/platform";
import {
  SESSION_COOKIE,
  SESSION_HINT_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  cookieAttributes,
  hintAttributes,
  encodeSession,
} from "../auth";

const NO_STORE = { "cache-control": "no-store" } as const;

/** The three acts, and the gateway path each forwards to. */
const ACTS = {
  "sign-in": SIGN_IN_PATH,
  "sign-up": SIGN_UP_PATH,
  verify: VERIFY_PATH,
} as const;

type Act = keyof typeof ACTS;

function isAct(value: unknown): value is Act {
  return typeof value === "string" && value in ACTS;
}

/** What the modal renders when this side could not even ask. */
const UNREACHABLE = "Sign-in is unavailable right now. Nothing about your account has changed.";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { act?: unknown; email?: unknown; password?: unknown; challengeId?: unknown; code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ data: { ok: false, note: UNREACHABLE } }, { headers: NO_STORE });
  }

  const act = body.act;
  if (!isAct(act)) {
    return NextResponse.json({ data: { ok: false, note: UNREACHABLE } }, { headers: NO_STORE });
  }

  // FORWARDED FIELD BY FIELD, never as a spread of what arrived. A client
  // that sent extra keys sends them nowhere: the gateway's contract is three
  // shapes and this is where that stays true.
  const payload =
    act === "verify"
      ? { challengeId: String(body.challengeId ?? ""), code: String(body.code ?? "") }
      : { email: String(body.email ?? ""), password: String(body.password ?? "") };

  let upstream: Response;
  try {
    upstream = await fetch(`${openproductApiBase()}${ACTS[act]}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return NextResponse.json({ data: { ok: false, note: UNREACHABLE } }, { headers: NO_STORE });
  }

  let answer: { note?: unknown; token?: unknown; challengeId?: unknown; credentialSet?: unknown } = {};
  try {
    answer = ((await upstream.json()) as { data?: typeof answer }).data ?? {};
  } catch {
    answer = {};
  }

  const note = typeof answer.note === "string" ? answer.note : null;
  const token = typeof answer.token === "string" ? answer.token : null;

  // ─── no session to set ─────────────────────────────────────────────────
  //
  // Sign-up never mints one: nothing has been proved yet. A refused sign-in
  // never mints one either, and its note is the gateway's single sentence.
  if (!token) {
    return NextResponse.json(
      {
        data: {
          ok: upstream.ok,
          note: note ?? (upstream.ok ? null : UNREACHABLE),
          // The one non-secret handle the verify step needs back. The
          // platform's own code says a challenge id is not a secret; the
          // secret is the code in the mail, which never comes near this app.
          challengeId: typeof answer.challengeId === "string" ? answer.challengeId : null,
        },
      },
      { headers: NO_STORE },
    );
  }

  // ─── a session, and which door it came through ─────────────────────────
  //
  // `ops_` is ours (AC2b's sign-in). Anything else came back from the
  // platform's own login/complete, which is what `verify` returns — and that
  // one IS refreshable, so it keeps the platform shape.
  const ours = token.startsWith(SESSION_TOKEN_PREFIX);
  const res = NextResponse.json(
    {
      data: {
        ok: true,
        // AC1's `credentialSet: false` — signed in, but the password did not
        // get written because the row was already spent. Passed through
        // rather than swallowed: the person is in, and the honest next step
        // is a reset, which they can only take if somebody says so.
        credentialSet: answer.credentialSet !== false,
        note: note ?? null,
      },
    },
    { headers: NO_STORE },
  );
  res.cookies.set(
    SESSION_COOKIE,
    encodeSession({
      // NOT FROM THE GATEWAY, and there is nothing to take it from: the
      // sign-in answer is a token and an expiry, deliberately. The chrome
      // fills the name in from `/auth/session` on the next paint, which is
      // where every other page gets it too.
      subjectId: "",
      displayName: null,
      accessToken: token,
      expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
      ...(ours ? { kind: "openproduct" as const } : {}),
    }),
    cookieAttributes(SESSION_MAX_AGE_SECONDS),
  );
  // Same hint as the platform door writes, and deliberately the same value:
  // the shell must not be able to tell which door somebody came through, any
  // more than the chip it paints can.
  res.cookies.set(SESSION_HINT_COOKIE, "1", hintAttributes(SESSION_MAX_AGE_SECONDS));
  return res;
}
