// AC0's done-when: the schema exists and NOTHING can reach it.
//
// Two milestones on this estate shipped dormant before (EN0, CB0) and each
// proved it the same way — by asking the router for every address the next
// milestone will use and requiring a refusal. That is what this does, and it
// is worth more here than it was there: AC1 opens a PASSWORD path, and the
// gap between "the table exists" and "the table is reachable" is the window
// where a half-built auth surface would be at its most dangerous.
//
// The RULES are pinned in packages/contracts/src/credentials.test.ts, the
// SCHEMA's promises against a live engine in packages/db, and the GATEWAY
// half of "nothing is routed" in tests/gateway — which matters more than it
// looks, because an address the gateway maps but core does not dispatch is
// the exact defect DQ0 found live in production for `/v1/openproduct/threads`.

import {
  AUTH_AMBIGUOUS_ANSWER,
  CREDENTIAL_TOKEN_PURPOSES,
  PASSWORD_MIN_LENGTH,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function deps(): ProfileHandlerDeps {
  return { repo: {} as unknown as OpenproductRepository } as unknown as ProfileHandlerDeps;
}

/**
 * Every address AC1–AC3 will claim, and one shape either side of each.
 *
 * AC2b NOTE, AND THE LIST DID NOT SHRINK. The session plane AC2b opened lives
 * at `/internal/openproduct/auth/sessions{,/resolve,/revoke}` and the
 * credential read at `/internal/openproduct/credentials/{subjectId}` — none
 * of which is on this list, because the list is the ADDRESSES THIS TEST SAYS
 * MUST NOT ANSWER, and every one of them still must not.
 *
 * The two that look closest are worth naming. `/internal/openproduct/auth/
 * sign-in` stays refused because sign-in is the GATEWAY's route: core never
 * sees a typed password, and an address here that answered would mean it had
 * started to. `/internal/openproduct/credentials`, bare, stays refused
 * because the live read requires a subject segment — a list endpoint over the
 * credential table is the shape nothing should ever have.
 */
const FUTURE_AUTH_PATHS = [
  "/internal/openproduct/auth/sign-up",
  "/internal/openproduct/auth/verify",
  "/internal/openproduct/auth/sign-in",
  "/internal/openproduct/auth/reset",
  "/internal/openproduct/auth/reset/confirm",
  "/internal/openproduct/credentials",
  "/internal/public/openproduct/auth/sign-up",
  "/internal/public/openproduct/auth/verify",
  "/internal/public/openproduct/credentials",
];

/** What AC2b opened, and therefore what must NOW answer. */
const LIVE_SESSION_PATHS = [
  "/internal/openproduct/auth/sessions",
  "/internal/openproduct/auth/sessions/resolve",
  "/internal/openproduct/auth/sessions/revoke",
];

describe("AC0 — the store ships dormant, and nothing is routed", () => {
  it("refuses every address the account cluster will use, on every method", async () => {
    for (const path of FUTURE_AUTH_PATHS) {
      for (const method of ["GET", "POST", "PUT", "DELETE"]) {
        const res = await route(
          new Request(`https://openproduct.internal${path}`, {
            method,
            headers: {
              "x-request-id": "req_ac0",
              "x-actor-subject-id": "usr_0123456789abcdef0123456789abcdef",
              "x-actor-subject-type": "user",
            },
          }),
          env(),
          deps() as never,
        );
        // 404 on the public plane, 404 or 405 on the authenticated one —
        // what matters is that none of them is a 2xx. "Nothing is routed"
        // means no address answers, not that they all answer alike.
        expect([path, method, res.ok]).toEqual([path, method, false]);
      }
    }
  });

  it("AC2b — the session plane answers, and the refused list is unchanged", async () => {
    // The other half of the same discipline. A dormancy test that only ever
    // asserts refusals cannot tell "still dormant" from "quietly deleted",
    // and the day somebody removes a route by accident it passes.
    for (const path of LIVE_SESSION_PATHS) {
      const res = await route(
        new Request(`https://openproduct.internal${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-request-id": "req_ac2b" },
          body: JSON.stringify({ token: "ops_not-a-real-session" }),
        }),
        env(),
        deps() as never,
      );
      // Not 404 and not 405: the address exists and the method is right. What
      // it answers about a token nobody issued is the sessions suite's.
      expect([path, res.status === 404 || res.status === 405]).toEqual([path, false]);
    }
  });

  it("mentions no credential, password or token in any public projection", async () => {
    // A field rendered before the act exists would be a shape the API had
    // promised and could not keep — the failure SN2 spent a milestone
    // refusing for unobserved metrics.
    const res = await route(
      new Request("https://openproduct.internal/internal/public/openproduct/catalog/products", {
        headers: { "x-request-id": "req_ac0" },
      }),
      env(),
      deps() as never,
    );
    const text = await res.text();
    for (const word of ["password", "credential", "verifier", "argon2", "token_hash"]) {
      expect([word, text.toLowerCase().includes(word)]).toEqual([word, false]);
    }
  });
});

describe("the contract is agreed before anything can bend it to a handler", () => {
  it("names the two purposes the schema's CHECK will accept", () => {
    expect([...CREDENTIAL_TOKEN_PURPOSES]).toEqual(["verify", "reset"]);
  });

  it("has a published password floor before there is a form to type into", () => {
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(8);
  });

  it("has ONE answer for every outcome an attacker would like to tell apart", () => {
    expect(AUTH_AMBIGUOUS_ANSWER).not.toMatch(/already|exists|unknown|no account/i);
  });
});
