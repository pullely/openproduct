// WHERE A SUBJECT ID COMES FROM, PINNED (openproduct-launch AC3).
//
// AC3's requirement is *"one subject per person, whichever door they used"*,
// and the reason openproduct needs no merge rule to satisfy it is stated in
// three files already: *"the platform is the only thing on this estate that
// ever creates a subject, so signing up here with a password and continuing
// with Orunbase later reach the same account because there was only ever one
// way to make it."*
//
// THAT SENTENCE IS AN ARCHITECTURAL CLAIM AND NOTHING WAS CHECKING IT. The
// gateway lane proves both doors reach the same subject through the fixtures
// they are given; it cannot prove that a THIRD door will not appear. This can,
// because the claim reduces to something a scan can see: openproduct generates
// random values in a small number of places, and none of them may be an
// identity.
//
// ─── WHY A SCAN RATHER THAN A TYPE ───────────────────────────────────────
//
// A branded `SubjectId` that only a parser could produce was the other option
// and is weaker here, because the thing to prevent is not a wrong assignment —
// it is a NEW SOURCE. `generateId() as SubjectId` type-checks. What has to be
// hard is inventing an identity at all, and the list below makes that a
// deliberate edit to a test with a paragraph attached.
//
// The failure this exists to stop is one commit long and completely plausible:
// a session that mints a local id when the seam is down, an anonymous
// "shadow" subject for somebody mid-sign-up, an id derived from an address so
// two devices agree. Each ends the linking silently — nobody is signed out,
// nothing errors, and one person quietly becomes two accounts.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const ROOTS = ["core/src", "gateway/src"];

/** Anything that produces a value nobody typed. */
const RANDOM = /crypto\.randomUUID\(|crypto\.getRandomValues\(|Math\.random\(/;

/**
 * EVERY PLACE OPENPRODUCT MAKES A RANDOM VALUE, and what each one is for.
 *
 * A new entry here is not forbidden — it is a decision that has to be written
 * down. What must never appear is a row whose purpose is "an identity",
 * because the estate has exactly one thing that mints those and it is not
 * this app.
 */
const GENERATORS: Array<{ file: string; count: number; what: string }> = [
  {
    file: "core/src/handlers/seam-events.ts",
    count: 3,
    what: "an event id for a seam delivery — a row in our own log",
  },
  {
    file: "core/src/ids.ts",
    count: 1,
    what: "a UUID primary key for one of openproduct's own rows",
  },
  {
    file: "core/src/router.ts",
    count: 1,
    what: "a request id, for correlating log lines",
  },
  {
    file: "gateway/src/auth-seam.ts",
    count: 1,
    what: "a webhook delivery id on the subject-by-email call",
  },
  {
    file: "gateway/src/auth.ts",
    count: 1,
    what: "the 32 bytes behind an `ops_` SESSION token — a pointer AT a subject, never one",
  },
  {
    file: "gateway/src/http.ts",
    count: 1,
    what: "a request id, for correlating log lines",
  },
  {
    file: "gateway/src/password.ts",
    count: 1,
    what: "an argon2id salt",
  },
  {
    file: "gateway/src/seam.ts",
    count: 1,
    what: "a webhook delivery id on the digest and notification calls",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const FILES = ROOTS.flatMap((root) => walk(resolve(REPO_ROOT, root))).map((f) =>
  relative(REPO_ROOT, f).split("\\").join("/"),
);

function read(file: string): string {
  return readFileSync(resolve(REPO_ROOT, file), "utf-8");
}

describe("AC3 — openproduct mints no identity of its own", () => {
  it("finds a file to scan, so a broken path cannot read as a pass", () => {
    // The failure mode every source scan has: a wrong root, zero files, green.
    expect(FILES.length).toBeGreaterThan(30);
    expect(FILES).toContain("gateway/src/auth.ts");
    expect(FILES).toContain("core/src/handlers/auth.ts");
  });

  it("generates a random value in exactly the places listed above, and no others", () => {
    const found = FILES.filter((file) => RANDOM.test(read(file))).sort();
    expect(found).toEqual(GENERATORS.map((g) => g.file).sort());
  });

  it("generates it as many times as the list says, so a new call site is not absorbed", () => {
    for (const { file, count } of GENERATORS) {
      const hits = read(file).match(new RegExp(RANDOM.source, "g")) ?? [];
      expect([file, hits.length]).toEqual([file, count]);
    }
  });

  it("never feeds one of them into a subject", () => {
    // The direct form of the rule. A subject is assigned from something that
    // ARRIVED — a request body, a header, a platform answer, a stored row —
    // and never from the generators above.
    const offending = /subject(?:Id)?\s*[:=][^;\n]*(?:randomUUID|getRandomValues|Math\.random|generateId)/i;
    for (const file of FILES) {
      expect([file, offending.test(read(file))]).toEqual([file, false]);
    }
  });

  it("turns an address into a subject on exactly one line, and it is the seam call", () => {
    // A hash of an email is stable, unique and looks exactly like an id, so
    // deriving one locally is the tempting way to link two doors without
    // asking the platform. It also puts the address back into the system in a
    // form I3 cannot see, because a digest of an address is not an address to
    // an `information_schema` query and is one to anybody holding a list.
    //
    // ASKING IS THE LEGAL FORM AND COMPUTING IS NOT, so the rule is not "no
    // address near a subject" — the sign-in path is exactly that, and has to
    // be. It is that every such line delegates the answer.
    const crossings: string[] = [];
    for (const file of FILES) {
      for (const line of read(file).split("\n")) {
        if (!/subject(?:Id)?\s*[:=]/i.test(line)) continue;
        if (!/\b(email|address)\b/i.test(line)) continue;
        crossings.push(`${file}: ${line.trim()}`);
      }
    }
    expect(crossings).toEqual([
      "gateway/src/auth.ts: const subjectId = await deps.resolveSubjectByEmail(env, email);",
    ]);
  });
});

describe("AC3 — a credential is written only behind a consumed token", () => {
  const AUTH = "core/src/handlers/auth.ts";

  it("writes one in exactly one place", () => {
    // "An unverified address never merges" is a claim about how many ways
    // there are to attach a password to a subject. There is one.
    const hits = read(AUTH).match(/repo\.writeCredential\(/g) ?? [];
    expect(hits).toHaveLength(1);
    const everywhere = FILES.filter((f) => /\.writeCredential\(/.test(read(f)));
    expect(everywhere).toEqual([AUTH]);
  });

  it("consumes the token FIRST, in the same handler, above the write", () => {
    // Order as a property of the file rather than of one test's mocking: the
    // consume is an atomic `UPDATE … WHERE consumed_at IS NULL`, so writing
    // first would let the loser of a double-click race set a password.
    const src = read(AUTH);
    const consume = src.indexOf("consumeCredentialToken(");
    const write = src.indexOf("repo.writeCredential(");
    expect(consume).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(consume);
    // And nothing between them writes: the only statement separating the two
    // is the refusal that returns when the token was not spendable.
    expect(src.slice(consume, write)).toContain("credentialSet: false");
  });

  it("asks for the `verify` purpose by name, so a reset token cannot open this door", () => {
    // The purpose argument is what makes the column a guard rather than a
    // label — see the AC3 note in credentials.ts on why `reset` stays in the
    // vocabulary while nothing issues one.
    expect(read(AUTH)).toMatch(/consumeCredentialToken\([\s\S]{0,120}"verify"/);
  });
});

describe("AC3 — the `reset` purpose stays in the vocabulary and out of the code", () => {
  it("is issued by nothing and consumed by nothing", () => {
    // AC0 planned a reset flow; AC3 found that sign-up already IS one,
    // because `writeCredential` upserts and the platform's magic link finds
    // an existing subject. So a second flow would differ from the first in a
    // button label. `credentials.ts` carries the reasoning.
    //
    // WHAT THIS TEST IS ACTUALLY FOR is the day somebody deletes the unused
    // member to tidy up. That would make `consumeCredentialToken(hash,
    // "verify", at)` a check with one legal answer — a guard that cannot
    // refuse anything — and the db lane's "a reset link cannot set a
    // sign-up's password" a test of nothing.
    const issuing = FILES.filter((f) => /"reset"/.test(read(f)));
    expect(issuing).toEqual([]);
  });

  it("is still a value the vocabulary and the schema admit", () => {
    const contracts = readFileSync(
      resolve(REPO_ROOT, "packages/contracts/src/credentials.ts"),
      "utf-8",
    );
    expect(contracts).toContain('CREDENTIAL_TOKEN_PURPOSES = ["verify", "reset"]');
    expect(contracts).toContain("RESET_TOKEN_TTL_MS");
    // And the paragraph that says why an unused member is deliberate, so the
    // next reader finds the reasoning before the delete key.
    expect(contracts).toContain("WHICH LEAVES THE `reset` PURPOSE UNUSED, DELIBERATELY");
  });
});
