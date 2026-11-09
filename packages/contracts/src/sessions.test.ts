// The session vocabulary, agreed where three layers can read it (AC2b).
//
// `sessionUsable` is the interesting one: it is the single place that decides
// whether a stored row is still a session, and it lives HERE rather than in
// the SQL or the handler precisely so there is only one of it. Everything
// below either pins that decision or pins a number two layers have to agree
// about.

import { describe, expect, it } from "vitest";

import {
  AUTH_SESSION_TTL_MS,
  SEAM_SUBJECT_BY_EMAIL_PATH,
  SESSION_TOKEN_BYTES,
  SESSION_TOKEN_PREFIX,
  SIGN_IN_PATH,
  SIGN_IN_PER_IP_PER_HOUR,
  SIGN_IN_PER_SUBJECT_PER_HOUR,
  SIGN_IN_UNAVAILABLE_NOTE,
  SIGN_OUT_NOTE,
  SIGN_OUT_PATH,
  isOpenproductSessionToken,
  sessionExpiry,
  sessionUsable,
} from "./sessions.js";
// AC0's string, unchanged and deliberately still living with the credential
// vocabulary: the refusal belongs to the ACT of signing in, not to the
// session it produces, and moving it here would have split one sentence's
// reasoning across two files.
import { SIGN_IN_REFUSAL } from "./credentials.js";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const live = { subjectId: "usr_x", expiresAt: new Date(NOW + 1000).toISOString(), revokedAt: null };

describe("the prefix decides where a token is resolved", () => {
  it("recognises our own and nothing else", () => {
    expect(isOpenproductSessionToken(`${SESSION_TOKEN_PREFIX}abc`)).toBe(true);
    expect(isOpenproductSessionToken("tok_platform_issued")).toBe(false);
    expect(isOpenproductSessionToken("")).toBe(false);
    // A near-miss is not ours. Anything else would make the routing a guess.
    expect(isOpenproductSessionToken("ops")).toBe(false);
    expect(isOpenproductSessionToken(" ops_abc")).toBe(false);
  });

  it("is a shape test and never an answer", () => {
    // `ops_` plus nonsense is still routed to core, which refuses it — the
    // only place that can refuse it truthfully.
    expect(isOpenproductSessionToken("ops_")).toBe(true);
  });

  it("does not collide with the estate's subject prefixes", () => {
    // `usr_` and `sp_` are subject ids, not bearers, but a token prefix that
    // matched one would make two different things look alike in a log.
    expect(isOpenproductSessionToken("usr_0123")).toBe(false);
    expect(isOpenproductSessionToken("sp_0123")).toBe(false);
  });

  it("carries the same entropy as a credential token", () => {
    expect(SESSION_TOKEN_BYTES).toBe(32);
  });
});

describe("sessionUsable — the one place liveness is decided", () => {
  it("accepts a session that has not expired and was not revoked", () => {
    expect(sessionUsable(live, NOW)).toBe(true);
  });

  it("refuses an expired one", () => {
    expect(sessionUsable({ ...live, expiresAt: new Date(NOW - 1).toISOString() }, NOW)).toBe(false);
  });

  it("refuses a revoked one", () => {
    expect(sessionUsable({ ...live, revokedAt: new Date(NOW - 1).toISOString() }, NOW)).toBe(false);
  });

  it("CHECKS REVOKED FIRST, so a disagreeing clock cannot resurrect one", () => {
    // The order is not cosmetic. A revoked session with an expiry far in the
    // future must read as dead even if something upstream is confused about
    // when now is.
    const revokedButFresh = {
      ...live,
      revokedAt: new Date(NOW - 1).toISOString(),
      expiresAt: new Date(NOW + 1e12).toISOString(),
    };
    expect(sessionUsable(revokedButFresh, NOW)).toBe(false);
    expect(sessionUsable(revokedButFresh, 0)).toBe(false);
  });

  it("treats the expiry instant itself as over", () => {
    expect(sessionUsable({ ...live, expiresAt: new Date(NOW).toISOString() }, NOW)).toBe(false);
  });

  it("refuses a row whose expiry is not a date at all", () => {
    // `Date.parse` gives NaN, and every comparison with NaN is false — which
    // lands on "not usable". Worth pinning: the safe direction is the one it
    // happens to take, and a future rewrite could take the other.
    expect(sessionUsable({ ...live, expiresAt: "not-a-date" }, NOW)).toBe(false);
  });
});

describe("the numbers two layers have to agree about", () => {
  it("is thirty days, matching the cookie that carries it", () => {
    expect(AUTH_SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("computes an expiry from the TTL and nothing else", () => {
    expect(sessionExpiry(NOW)).toBe(new Date(NOW + AUTH_SESSION_TTL_MS).toISOString());
  });

  it("limits one account harder than one client", () => {
    // Two buckets for two attacks. The per-subject one is smaller because
    // nobody types their own password ten times in an hour — and somebody who
    // did wanted the reset link.
    expect(SIGN_IN_PER_SUBJECT_PER_HOUR).toBeLessThan(SIGN_IN_PER_IP_PER_HOUR);
    expect(SIGN_IN_PER_IP_PER_HOUR).toBeLessThanOrEqual(20);
  });
});

describe("the addresses", () => {
  it("puts sign-in and sign-out on the public plane, beside sign-up", () => {
    expect(SIGN_IN_PATH).toBe("/v1/openproduct/auth/sign-in");
    expect(SIGN_OUT_PATH).toBe("/v1/openproduct/auth/sign-out");
  });

  it("reaches the platform through the front door, not a binding", () => {
    expect(SEAM_SUBJECT_BY_EMAIL_PATH).toBe("/v1/seam/openproduct/subject-by-email");
    expect(SEAM_SUBJECT_BY_EMAIL_PATH.startsWith("/v1/internal/")).toBe(false);
  });
});

describe("what a person is told", () => {
  it("names neither the account nor the reason", () => {
    // Every way a sign-in fails lands on this one sentence. It must not hint
    // at which one — including by mentioning an address at all.
    expect(SIGN_IN_REFUSAL).not.toMatch(/exists|unknown|not found|no account with|@/i);
  });

  it("distinguishes OUR failure from theirs, without describing the account", () => {
    expect(SIGN_IN_UNAVAILABLE_NOTE).toMatch(/unavailable/i);
    expect(SIGN_IN_UNAVAILABLE_NOTE).not.toMatch(/password|address|@/i);
    expect(SIGN_IN_UNAVAILABLE_NOTE).not.toBe(SIGN_IN_REFUSAL);
  });

  it("says sign-out ends the session everywhere, because it does", () => {
    // The session is revoked server-side, so it is over on every device that
    // held it. That is not what somebody assumes from a sign-out button, and
    // it is worth saying once rather than discovering.
    expect(SIGN_OUT_NOTE).toMatch(/everywhere/i);
  });
});
