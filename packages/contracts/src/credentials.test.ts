// The credential store's rules, before anything can reach them (AC0).
//
// What is pinned here is the vocabulary and the arithmetic. The SCHEMA's
// promises — that no column can hold an address, that a token is consumed
// exactly once — are pinned against a live engine in
// packages/db/src/repository-pg.test.ts, and the fact that nothing is routed
// is pinned in tests/core.

import { describe, expect, it } from "vitest";

import {
  ARGON2ID_PARAMS,
  AUTH_TOO_FAST,
  PLATFORM_LOGIN_COMPLETE_PATH,
  PLATFORM_LOGIN_START_PATH,
  SIGN_UP_PATH,
  SIGN_UP_PER_IP_PER_HOUR,
  VERIFY_PATH,
  VERIFY_PER_IP_PER_HOUR,
  narrowCompletion,
  plausibleAddress,
  AUTH_AMBIGUOUS_ANSWER,
  CREDENTIAL_TOKEN_BYTES,
  CREDENTIAL_TOKEN_PURPOSES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REFUSAL,
  PASSWORD_RESET_NOTE,
  PASSWORD_RESET_PROMPT,
  PASSWORD_RULE_NOTE,
  RESET_TOKEN_TTL_MS,
  SIGN_IN_REFUSAL,
  TOKEN_SPENT_NOTE,
  VERIFY_TOKEN_TTL_MS,
  credentialTokenExpiry,
  credentialTokenTtlMs,
  credentialTokenUsable,
  isCredentialTokenPurpose,
  passwordAcceptable,
  verifierIsCurrent,
} from "./credentials.js";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");

describe("the two purposes, and nothing else", () => {
  it("names exactly verify and reset", () => {
    expect([...CREDENTIAL_TOKEN_PURPOSES]).toEqual(["verify", "reset"]);
  });

  it("refuses a purpose the schema's CHECK would refuse", () => {
    expect(isCredentialTokenPurpose("verify")).toBe(true);
    expect(isCredentialTokenPurpose("reset")).toBe(true);
    for (const bad of ["Verify", "invite", "magic", "", "verify "]) {
      expect([bad, isCredentialTokenPurpose(bad)]).toEqual([bad, false]);
    }
  });
});

describe("the two windows, and why they differ", () => {
  it("gives a reset FAR less time than a sign-up", () => {
    // A verify token that leaks creates an account nobody wanted. A reset
    // token that leaks takes one somebody has. The dangerous one is short.
    expect(RESET_TOKEN_TTL_MS).toBeLessThan(VERIFY_TOKEN_TTL_MS);
    expect(VERIFY_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(RESET_TOKEN_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("gives each purpose its own window rather than one default", () => {
    // Separate constants are what stop somebody widening the mail-latency
    // window and widening the dangerous one with it.
    expect(credentialTokenTtlMs("verify")).toBe(VERIFY_TOKEN_TTL_MS);
    expect(credentialTokenTtlMs("reset")).toBe(RESET_TOKEN_TTL_MS);
    expect(credentialTokenTtlMs("verify")).not.toBe(credentialTokenTtlMs("reset"));
  });

  it("computes an expiry from the moment it was issued", () => {
    expect(credentialTokenExpiry("reset", NOW)).toBe("2026-09-05T12:30:00.000Z");
    expect(credentialTokenExpiry("verify", NOW)).toBe("2026-09-06T12:00:00.000Z");
  });
});

describe("a token is usable once, and only for a while", () => {
  const live = { expiresAt: "2026-09-05T12:30:00.000Z", consumedAt: null };

  it("accepts a live, unconsumed token", () => {
    expect(credentialTokenUsable(live, NOW)).toBe(true);
  });

  it("refuses one that was already used, however long it has left", () => {
    // Single use without expiry lets an uncicked link sit valid forever;
    // expiry without single use lets a leaked one be replayed all day. One
    // function checks both, so no caller can check one and forget the other.
    expect(credentialTokenUsable({ ...live, consumedAt: "2026-09-05T12:01:00.000Z" }, NOW)).toBe(
      false,
    );
  });

  it("refuses one that expired, however unused", () => {
    expect(credentialTokenUsable({ ...live, expiresAt: "2026-09-05T11:59:59.000Z" }, NOW)).toBe(
      false,
    );
  });

  it("refuses one whose expiry cannot be read", () => {
    // A row whose timestamp does not parse is a row something wrote wrongly,
    // and the safe reading of "I cannot tell when this expires" is "now".
    expect(credentialTokenUsable({ expiresAt: "not a date", consumedAt: null }, NOW)).toBe(false);
  });

  it("treats the exact expiry instant as gone", () => {
    expect(credentialTokenUsable({ ...live, expiresAt: new Date(NOW).toISOString() }, NOW)).toBe(
      false,
    );
  });

  it("carries enough entropy that guessing is not a strategy", () => {
    expect(CREDENTIAL_TOKEN_BYTES).toBeGreaterThanOrEqual(32);
  });
});

describe("the password rule, and the rules that are deliberately absent", () => {
  it("has a floor and a ceiling", () => {
    expect(passwordAcceptable("a".repeat(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(passwordAcceptable("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(passwordAcceptable("a".repeat(PASSWORD_MAX_LENGTH))).toBe(true);
    expect(passwordAcceptable("a".repeat(PASSWORD_MAX_LENGTH + 1))).toBe(false);
  });

  it("bounds the input because argon2id is expensive on purpose", () => {
    // An unbounded input is CPU exhaustion with a login form in front of it.
    expect(passwordAcceptable("a".repeat(1_000_000))).toBe(false);
  });

  it("asks for NO digit, NO symbol, and NO mixed case", () => {
    // Composition rules push people towards `Password1!` and away from the
    // long passphrase that is actually strong. This assertion exists because
    // a future reviewer will ask for the digit.
    expect(passwordAcceptable("correct horse battery staple")).toBe(true);
    expect(passwordAcceptable("aaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(PASSWORD_RULE_NOTE).not.toMatch(/digit|symbol|uppercase|number/i);
  });

  it("counts code points, so an accented or emoji password is not secretly shorter", () => {
    // Ten emoji is ten characters to the person who typed them. A floor
    // measured in UTF-16 units would count each as two and let a shorter
    // password through for anybody not typing ASCII.
    expect([..."🔑".repeat(PASSWORD_MIN_LENGTH)].length).toBe(PASSWORD_MIN_LENGTH);
    expect(passwordAcceptable("🔑".repeat(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(passwordAcceptable("🔑".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
  });

  it("states the rule before somebody is refused by it", () => {
    expect(PASSWORD_RULE_NOTE).toContain(String(PASSWORD_MIN_LENGTH));
    expect(PASSWORD_REFUSAL).toContain(String(PASSWORD_MIN_LENGTH));
  });
});

describe("the argon2id parameters are published, so decay is detectable", () => {
  it("meets OWASP's argon2id guidance", () => {
    expect(ARGON2ID_PARAMS.memoryKiB).toBeGreaterThanOrEqual(19_456);
    expect(ARGON2ID_PARAMS.iterations).toBeGreaterThanOrEqual(2);
    expect(ARGON2ID_PARAMS.parallelism).toBeGreaterThanOrEqual(1);
  });

  it("recognises a verifier hashed with today's parameters", () => {
    const current = `$argon2id$v=19$m=${ARGON2ID_PARAMS.memoryKiB},t=${ARGON2ID_PARAMS.iterations},p=${ARGON2ID_PARAMS.parallelism}$c29tZXNhbHQ$aGFzaA`;
    expect(verifierIsCurrent(current)).toBe(true);
  });

  it("flags one hashed with weaker parameters, for REHASH and not refusal", () => {
    // The answer to "your password was hashed cheaply in 2026" is to rehash it
    // the next time they sign in successfully — not to refuse them, and not to
    // make them reset something they still know.
    const stale = "$argon2id$v=19$m=4096,t=1,p=1$c29tZXNhbHQ$aGFzaA";
    expect(verifierIsCurrent(stale)).toBe(false);
  });

  it("flags a verifier it cannot read at all", () => {
    for (const bad of ["", "not-a-hash", "$argon2id$v=19$c29tZXNhbHQ$aGFzaA"]) {
      expect([bad, verifierIsCurrent(bad)]).toEqual([bad, false]);
    }
  });

  it("accepts parameters STRONGER than today's without demanding a rehash", () => {
    const strong = "$argon2id$v=19$m=65536,t=4,p=2$c29tZXNhbHQ$aGFzaA";
    expect(verifierIsCurrent(strong)).toBe(true);
  });
});

describe("what every endpoint says, and what none of them says", () => {
  it("gives one answer for every outcome an attacker would like to tell apart", () => {
    // Three handlers writing three sympathetic messages is how the difference
    // leaks — not through a status code somebody audited, but through wording
    // nobody thought of as an oracle.
    expect(AUTH_AMBIGUOUS_ANSWER).toMatch(/^If that address/);
    expect(AUTH_AMBIGUOUS_ANSWER).not.toMatch(/already|exists|unknown|no account|not found/i);
  });

  it("names neither half of a failed sign-in", () => {
    // "No account with that address" tells a stranger which addresses are
    // registered here; "wrong password" tells them they have found one.
    expect(SIGN_IN_REFUSAL).not.toMatch(/no account|wrong password|incorrect password|not registered/i);
    expect(SIGN_IN_REFUSAL).toMatch(/do not match/);
  });

  it("gives one sentence for a spent link, whichever way it was spent", () => {
    // Expired, already used, never existed. Telling them apart is an oracle,
    // and the action is the same in all three.
    expect(TOKEN_SPENT_NOTE).not.toMatch(/expired|already used|never existed|invalid token/i);
    expect(TOKEN_SPENT_NOTE).toMatch(/ask for a new one/);
  });

  it("puts no address, password or token in any published string", () => {
    const all = [
      AUTH_AMBIGUOUS_ANSWER,
      SIGN_IN_REFUSAL,
      TOKEN_SPENT_NOTE,
      PASSWORD_RULE_NOTE,
      PASSWORD_REFUSAL,
    ].join(" ");
    expect(all).not.toMatch(/@/);
    expect(all).not.toMatch(/\$argon2/);
  });
});

describe("AC0's done-when: nothing here HOLDS an address — and AC1 inverted half of it", () => {
  it("exports exactly one name that mentions an address, and it stores nothing", async () => {
    // AC0 SHIPPED THIS AS "no export names an address", and AC1 broke it on
    // purpose. The gateway has to keep the obviously-not-an-address out of a
    // network call, so `plausibleAddress` exists — a pure predicate that reads
    // a string and returns a boolean.
    //
    // The rule AC0 was reaching for survives the correction, and is the one
    // asserted now: nothing here HOLDS an address. A predicate holds nothing.
    // A field on a type, or a constant, would.
    const module = (await import("./credentials.js")) as Record<string, unknown>;
    const naming = Object.keys(module).filter((name) => /e-?mail|address/i.test(name));
    expect(naming).toEqual(["plausibleAddress"]);
    expect(typeof module.plausibleAddress).toBe("function");
  });

  it("exports no VALUE that is or contains an address", () => {
    // The half of AC0's guard that did not need correcting, and the half that
    // was doing the work: a constant is stored, shipped and logged, and a
    // function's argument is none of those.
    const values = [
      AUTH_AMBIGUOUS_ANSWER,
      AUTH_TOO_FAST,
      SIGN_IN_REFUSAL,
      TOKEN_SPENT_NOTE,
      PASSWORD_RULE_NOTE,
      PASSWORD_REFUSAL,
      PLATFORM_LOGIN_START_PATH,
      PLATFORM_LOGIN_COMPLETE_PATH,
      SIGN_UP_PATH,
      VERIFY_PATH,
    ];
    for (const value of values) {
      expect([value, value.includes("@")]).toEqual([value, false]);
    }
  });

  it("returns no address from anything, whatever it is handed", () => {
    // The narrowing function is the one that could: it reads a body that
    // genuinely contains an address and must give back only a subject id.
    expect(JSON.stringify(narrowCompletion({ data: { user: { id: "u", email: "a@b.co" } } })))
      .not.toContain("@");
    expect(plausibleAddress("ada@example.com")).toBe(true);
    // …and the predicate's answer is a boolean, so there is nothing in it to
    // leak into a log line.
    expect(typeof plausibleAddress("ada@example.com")).toBe("boolean");
  });
});

describe("AC1 — what comes back from the platform, and what is kept of it", () => {
  /** The real shape: the platform sends the address because it has no reason
   *  not to. */
  const real = {
    data: {
      token: "tok_live",
      tokenType: "bearer",
      expiresAt: "2026-09-06T12:00:00.000Z",
      user: { id: "usr_0123456789abcdef0123456789abcdef", email: "ada@example.com", displayName: "Ada" },
    },
  };

  it("keeps the subject id and NOTHING else", () => {
    // The narrowing is the point. openproduct asked for a subject; the answer
    // carries an address alongside it, and this is the one place that is
    // dropped rather than being dropped at each call site.
    const kept = narrowCompletion(real);
    expect(kept).toEqual({ subjectId: "usr_0123456789abcdef0123456789abcdef" });
    expect(JSON.stringify(kept)).not.toContain("@");
    expect(Object.keys(kept!)).toEqual(["subjectId"]);
  });

  it("keeps nothing at all from an answer it cannot read", () => {
    for (const bad of [
      null,
      undefined,
      "a string",
      {},
      { data: {} },
      { data: { user: {} } },
      { data: { user: { id: 42 } } },
      { data: { user: { id: "" } } },
      { data: { user: null } },
    ]) {
      expect([JSON.stringify(bad) ?? "undefined", narrowCompletion(bad)]).toEqual([
        JSON.stringify(bad) ?? "undefined",
        null,
      ]);
    }
  });

  it("reads an unwrapped body too, so a fixture and the platform agree", () => {
    expect(narrowCompletion(real.data)).toEqual({
      subjectId: "usr_0123456789abcdef0123456789abcdef",
    });
  });

  it("cannot be made to return an address by any input shape", () => {
    // The narrowed type has one field. A caller cannot get an address out of
    // it however the platform decorates its answer.
    const decorated = {
      data: {
        user: { id: "usr_1", email: "ada@example.com" },
        email: "ada@example.com",
        recipient: { address: "ada@example.com" },
      },
    };
    expect(JSON.stringify(narrowCompletion(decorated))).not.toContain("@");
  });
});

describe("AC1 — the addresses openproduct will hand onwards", () => {
  it("passes something that looks like an address", () => {
    for (const good of ["ada@example.com", "a.b+c@sub.domain.co.uk", "x@y.zz"]) {
      expect([good, plausibleAddress(good)]).toEqual([good, true]);
    }
  });

  it("refuses what is obviously not one, and no more than that", () => {
    // DELIBERATELY LOOSE. The platform is the authority and validates again; a
    // stricter rule here would reject somebody the platform would have taken,
    // and the failure would be openproduct's to explain and nobody's to fix.
    for (const bad of ["", "   ", "ada", "ada@", "@example.com", "a b@example.com", "ada@example"]) {
      expect([bad, plausibleAddress(bad)]).toEqual([bad, false]);
    }
  });

  it("refuses one long enough to be an attack rather than an address", () => {
    expect(plausibleAddress(`${"a".repeat(400)}@example.com`)).toBe(false);
  });
});

describe("AC1 — the paths, and the limits on them", () => {
  it("names the platform's endpoints in one place", () => {
    expect(PLATFORM_LOGIN_START_PATH).toBe("/v1/auth/login/start");
    expect(PLATFORM_LOGIN_COMPLETE_PATH).toBe("/v1/auth/login/complete");
  });

  it("puts openproduct's two on the public plane", () => {
    // Somebody signing up has no subject yet, so there is no actor to
    // authenticate — having one is the outcome, not the precondition.
    expect(SIGN_UP_PATH).toBe("/v1/openproduct/auth/sign-up");
    expect(VERIFY_PATH).toBe("/v1/openproduct/auth/verify");
  });

  it("limits sign-up harder than verify, and both far harder than reading", () => {
    // The read plane is 120/min. These are per HOUR, because the thing being
    // defended is a slow grind rather than a burst.
    expect(SIGN_UP_PER_IP_PER_HOUR).toBeLessThan(VERIFY_PER_IP_PER_HOUR);
    expect(SIGN_UP_PER_IP_PER_HOUR).toBeLessThanOrEqual(10);
  });

  it("refuses a fast caller without telling them anything", () => {
    expect(AUTH_TOO_FAST).not.toMatch(/account|address|exists|@/i);
  });
});

describe("AC3 — the reset is a sentence, because the flow already existed", () => {
  it("names the act somebody is about to perform, not the one they wanted", () => {
    // "Reset your password" would be a lie about which button to press. The
    // note says Create account and then immediately answers what that sounds
    // like it costs.
    expect(PASSWORD_RESET_NOTE).toContain("Create account");
    expect(PASSWORD_RESET_NOTE).toMatch(/same account/i);
    expect(PASSWORD_RESET_NOTE).toMatch(/sets a new password/i);
  });

  it("promises nothing is lost, in the words of the things people have here", () => {
    for (const kept of ["profile", "upvotes", "comments"]) {
      expect([kept, PASSWORD_RESET_NOTE.includes(kept)]).toEqual([kept, true]);
    }
  });

  it("says the mail is what proves you, which is the whole security argument", () => {
    // The reset is safe for exactly the reason sign-up is: the platform sends
    // a code to the address and openproduct writes nothing until it comes
    // back. If the sentence did not say a code was coming, somebody would
    // read this as "type an address and get the account".
    expect(PASSWORD_RESET_NOTE).toMatch(/code we email you/i);
  });

  it("carries the word people search a sign-in form for", () => {
    expect(PASSWORD_RESET_PROMPT).toBe("Forgot your password?");
  });

  it("keeps both token purposes even though only one is ever issued", () => {
    // The unused member is what makes the purpose column a guard. See the
    // AC3 note in credentials.ts.
    expect(isCredentialTokenPurpose("reset")).toBe(true);
    expect(credentialTokenTtlMs("reset")).toBeLessThan(credentialTokenTtlMs("verify"));
  });
});
