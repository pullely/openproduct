// THE INVERSION AC2a PROMISED, and the file it inverts said so in advance:
//
//   "WHEN AC2b LANDS, THIS FILE INVERTS. Exactly as `credentials-dormant`
//    did: the assertions below become the statement of what changed, rather
//    than being deleted as if the dormancy had never been the point."
//
// So this is the same four questions with the answers turned over, plus the
// two that only make sense once the path is live. Deleting it and writing a
// fresh file would have lost the record that the resolver spent a milestone
// unreachable ON PURPOSE — which is the part somebody reading this in a year
// would otherwise assume was an accident of ordering.
//
// Every assertion here is a source scan, and is worth exactly what the lane
// running it is worth. That the lane runs on a change to this directory was
// itself checked, in PR #1261, because it had been in doubt.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTH_SESSION_TTL_MS,
  SEAM_SUBJECT_BY_EMAIL_PATH,
  SESSION_TOKEN_PREFIX,
} from "@openproduct/contracts";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATEWAY_SRC = resolve(HERE, "../../../gateway/src");
const CORE_SRC = resolve(HERE, "../../../core/src");
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

const GATEWAY_SOURCES = sourcesUnder(GATEWAY_SRC);
const ALL_SOURCES = [...GATEWAY_SOURCES, ...sourcesUnder(CORE_SRC), ...sourcesUnder(WEB_SRC)];

describe("AC2b — the resolver is reached, and only from where it may be", () => {
  it("is called from the gateway, which is the only layer that may hold an address", () => {
    // WAS: "no openproduct source names the seam path".
    //
    // THE SYMBOL, NOT THE LITERAL. `env.ts` names the path in a doc comment
    // explaining what its key is for, and a scan for the string counts that
    // as a caller — which would make this test say "two files call the seam"
    // when one of them is prose. What identifies a caller is importing the
    // constant, so that is what is looked for.
    const callers = ALL_SOURCES.filter((f) =>
      /SEAM_SUBJECT_BY_EMAIL_PATH/.test(readFileSync(f, "utf-8")),
    );
    expect(callers.map((f) => f.replace(`${resolve(HERE, "../../..")}/`, ""))).toEqual([
      "gateway/src/auth-seam.ts",
    ]);
    // And the constant is the address the platform actually serves.
    expect(SEAM_SUBJECT_BY_EMAIL_PATH).toBe("/v1/seam/openproduct/subject-by-email");
  });

  it("holds the resolver's key in the gateway and nowhere else", () => {
    // WAS: "no openproduct source holds the resolver's key". Core has a
    // database binding and no way to reach the platform; the web worker is
    // the browser's server and holds no platform secret at all. A reference
    // to this key in either would mean the seam had moved somewhere it must
    // not be.
    const holders = ALL_SOURCES.filter((f) =>
      readFileSync(f, "utf-8").includes("OPENPRODUCT_AUTH_SEAM_SECRET"),
    ).map((f) => f.replace(`${resolve(HERE, "../../..")}/`, ""));
    expect(holders.sort()).toEqual(["gateway/src/auth-seam.ts", "gateway/src/env.ts"]);
  });

  it("publishes the sign-in route it refused to publish before", () => {
    // WAS: "the gateway still offers no sign-in route".
    const router = readFileSync(join(GATEWAY_SRC, "router.ts"), "utf-8");
    expect(router).toContain("/auth/sign-up");
    expect(router).toContain("/auth/verify");
    expect(router).toContain("/auth/sign-in");
    expect(router).toContain("/auth/sign-out");
  });

  it("still has no reset route — AC3's, and not published before it works", () => {
    // The dormancy discipline did not end with AC2b; it moved to the next
    // unbuilt thing. An address that answers before its milestone is the
    // defect DQ0 found in production, and it is cheap to keep refusing.
    const router = readFileSync(join(GATEWAY_SRC, "router.ts"), "utf-8");
    expect(router).not.toContain("/auth/reset");
  });
});

describe("AC2b — the session is a pointer at both doors", () => {
  it("resolves an openproduct token against core and a platform token against the platform", () => {
    // The property the whole milestone turns on: neither cookie is ever a
    // claim this worker verifies for itself, so R2's argument reads the same
    // for both. A `jwt`, `verify` or `decode` appearing in this file would
    // mean one door had become a claim.
    const subject = readFileSync(join(GATEWAY_SRC, "subject.ts"), "utf-8");
    expect(subject).toContain("isOpenproductSessionToken");
    expect(subject).toContain("/auth/sessions/resolve");
    expect(subject).toContain("/v1/identity/me");
    expect(subject).not.toMatch(/\bjwt\b|jwtVerify|decodeToken/i);
  });

  it("caches positives and never negatives, for both doors", () => {
    // A revocation has to bite on the next request, which is what makes
    // `revokeAuthSession` a mechanism rather than a promise. One shared cache
    // rather than two, because two are two places for that to fail.
    const subject = readFileSync(join(GATEWAY_SRC, "subject.ts"), "utf-8");
    const cacheWrites = subject.match(/cache\.set\(/g) ?? [];
    expect(cacheWrites).toHaveLength(2);
    // Both writes are on the success path — the line before each is the
    // `subject` it caches, never a refusal.
    expect(subject).not.toMatch(/status: 401[\s\S]{0,120}cache\.set/);
  });

  it("agrees with the cookie about how long a session lasts", () => {
    // Two numbers that must match and neither of which is the authority for
    // the other: a cookie outliving its row looks signed in and is refused; a
    // row outliving its cookie is a credential nobody can present.
    const webAuth = readFileSync(join(WEB_SRC, "app/auth/auth.ts"), "utf-8");
    const expression = /SESSION_MAX_AGE_SECONDS = ([^;]+);/.exec(webAuth)?.[1] ?? "";
    // The cookie's TTL is written as a product of plain numbers
    // (`30 * 24 * 60 * 60`), so multiplying its literals is enough — and it
    // beats `eval` on a source file, which is a lot of trust to place in a
    // regex to check one number.
    const factors = expression.match(/\d+/g) ?? [];
    expect(factors.length).toBeGreaterThan(0);
    const seconds = factors.reduce((total, n) => total * Number(n), 1);
    expect(seconds * 1000).toBe(AUTH_SESSION_TTL_MS);
  });

  it("mints tokens under the prefix that decides where they are resolved", () => {
    const auth = readFileSync(join(GATEWAY_SRC, "auth.ts"), "utf-8");
    expect(auth).toContain("SESSION_TOKEN_PREFIX");
    expect(SESSION_TOKEN_PREFIX).toBe("ops_");
  });
});
