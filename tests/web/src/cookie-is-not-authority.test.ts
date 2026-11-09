// R2 SAID "AC2 SIGNS THE COOKIE". IT DOES NOT, AND THIS FILE IS WHY.
//
// ─── WHAT R2 ACTUALLY ARGUED ─────────────────────────────────────────────
//
// "`op_session` is base64url JSON — not signed, not encrypted. It is safe
//  today only because the access token inside is scoped to
//  `GET /v1/identity/me` and the gateway re-resolves it on every call, so a
//  forged cookie buys nothing. AC2 puts an openproduct-minted token in that
//  cookie, and the reasoning stops holding."
//
// The premise is that an openproduct-minted token would NOT be re-resolved —
// that it would be a claim this app verifies for itself. AC2b did not build
// that. It kept the pointer shape: an `ops_` token is resolved against core
// on every request exactly as a platform token is resolved against the
// platform, with the same 60-second positive cache and the same rule that
// negatives are never cached.
//
// So the premise is false, and the conclusion goes with it. A forged cookie
// still buys nothing, at both doors.
//
// ─── WHAT WOULD ACTUALLY MAKE IT UNSAFE ──────────────────────────────────
//
// Not the absence of a signature. Somebody TRUSTING A FIELD IN IT. The
// cookie carries `subjectId` and `displayName` beside the token, and the
// moment a page reads `session.subjectId` and shows that person's data,
// forging becomes an act with a victim.
//
// A signature would not prevent that. It would make the forgery harder for a
// stranger and do nothing about the design mistake, which is the part that
// bites — and it would cost a new estate secret, a fail-closed dependency on
// the web's hottest path, and signing every visitor out once.
//
// THIS TEST IS THE THING A SIGNATURE WOULD NOT HAVE BEEN. It asserts the
// property R2 was protecting — the cookie is a pointer, never a claim — at
// the place it can actually break.
//
// ─── AND WHAT A FORGERY BUYS TODAY, SAID PLAINLY ─────────────────────────
//
// A cookie is per-browser, HttpOnly and host-scoped. Forging one means
// editing your own, in your own browser, to paint a name in your own header.
// There is no path that shows it to anybody else. That is the whole of it,
// and it is why this is a test rather than a secret.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../../web/src");

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

const SOURCES = sourcesUnder(WEB_SRC);
const rel = (file: string) => file.replace(`${WEB_SRC}/`, "");

/**
 * The ONE file allowed to read `session.subjectId`, and what it does with it
 * — which is not authority.
 *
 *   app/auth/session/route.ts   REPORTS it to the visitor's own browser, and
 *                               overwrites it from the resolved answer.
 *
 * A second entry appearing here is the review this test exists to force. It
 * already forced one: `app/studio/page.tsx` printed the raw id in its status
 * line, straight off the cookie with nothing having resolved it. Harmless as
 * it stood — a forger paints their own header in their own browser — and
 * exactly the shape that stops being harmless the moment somebody uses it for
 * a decision. It now says "Signed in", which is both safer and truer: an
 * opaque `usr_…` answers "who am I signed in as" with a string no human can
 * check.
 */
const MAY_READ_SUBJECT_ID = ["app/auth/session/route.ts"];

describe("the cookie is a pointer, never a claim", () => {
  it("is read for its TOKEN everywhere that acts, and its subjectId nowhere", () => {
    // Every authenticated act passes `session.accessToken` to the gateway,
    // which resolves it against the authority that issued it. Not one passes
    // `session.subjectId` — because if one did, the cookie would be saying
    // who you are instead of pointing at somewhere that knows.
    const readers = SOURCES.filter((file) =>
      /session\.subjectId/.test(readFileSync(file, "utf-8")),
    ).map(rel);
    expect(readers.sort()).toEqual(MAY_READ_SUBJECT_ID);
  });

  it("hands the token to the gateway rather than deciding anything with it", () => {
    // The shape of every `/me` route: read the session, pass the token, let
    // the gateway say yes or no. A route that branched on a cookie field
    // instead would be making an authorization decision in the browser's
    // own storage.
    const meRoutes = SOURCES.filter((f) => rel(f).startsWith("app/me/") && rel(f).endsWith("route.ts"));
    expect(meRoutes.length).toBeGreaterThan(3);
    for (const file of meRoutes) {
      const src = readFileSync(file, "utf-8");
      expect([rel(file), /session\.accessToken/.test(src)]).toEqual([rel(file), true]);
      expect([rel(file), /session\.subjectId/.test(src)]).toEqual([rel(file), false]);
    }
  });

  it("never treats the cookie's displayName as anything but a cache", () => {
    // `/auth/session` refreshes it from the resolved identity on every call.
    // If it were ever rendered without that round trip having happened, a
    // forged name would be a name the product had asserted.
    const route = readFileSync(join(WEB_SRC, "app/auth/session/route.ts"), "utf-8");
    expect(route).toContain("fetchMe(session.accessToken)");
    expect(route).toContain("me.data.contributor?.displayName");
  });

  it("carries no secret of its own, so there is nothing in it to steal", () => {
    // The cookie holds a bearer the gateway resolves and two display fields.
    // A password, a verifier or a seam key appearing in this module would be
    // a different kind of cookie entirely.
    const auth = readFileSync(join(WEB_SRC, "app/auth/auth.ts"), "utf-8");
    // NOT A BARE "verifier" OR "password" SCAN, and the near-miss is worth
    // recording: this module is full of both words, because PKCE calls its
    // random string a `code_verifier` and OAuth's grant types include
    // `password`. A guard that flagged those would be deleted by the next
    // person in a hurry, and would have been right about nothing.
    for (const forbidden of ["argon2", "SEAM_SECRET", "hashPassword", "credentials."]) {
      expect([forbidden, auth.includes(forbidden)]).toEqual([forbidden, false]);
    }
    // What is actually asserted, and it is SCOPED TO THE INTERFACE rather
    // than the file — the second near-miss in the same test. PKCE's random
    // string is a `verifier: string` parameter three functions down, and a
    // whole-file scan would flag the one part of this module that is doing
    // exactly the right thing.
    const shape = /export interface OpenproductSession \{[\s\S]*?\n\}/.exec(auth)?.[0] ?? "";
    expect(shape).toContain("accessToken: string;");
    expect(shape).not.toMatch(/verifier|password|secret/i);
  });
});

describe("R2's own premise, restated where it can be checked", () => {
  it("resolves an openproduct token against core, not against itself", () => {
    // The sentence R2 was worried about — "AC2 puts an openproduct-minted
    // token in that cookie" — is true. What did not follow is that the app
    // would start trusting it. The gateway asks core.
    const subject = readFileSync(
      resolve(HERE, "../../../gateway/src/subject.ts"),
      "utf-8",
    );
    expect(subject).toContain("/auth/sessions/resolve");
    expect(subject).not.toMatch(/jwtVerify|verifyToken|decodeToken/i);
  });

  it("has no cookie-signing secret anywhere in the web worker", () => {
    // Not an omission — a decision, argued at the top of this file. A secret
    // appearing here means somebody re-litigated it, and should have to edit
    // this line to do so.
    const holders = SOURCES.filter((f) =>
      /SESSION_SIGNING_KEY|COOKIE_SECRET|signSession/.test(readFileSync(f, "utf-8")),
    ).map(rel);
    expect(holders).toEqual([]);
  });
});
