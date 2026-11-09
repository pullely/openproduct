// The cached identity, and the read it stops making (openproduct-performance
// OPP8b).
//
// ─── WHAT THIS IS ABOUT ───────────────────────────────────────────────────
//
// `/auth/session` runs on every page load — the account chip calls it to
// correct the rendering hint. For an OPENPRODUCT-kind session (the AC2c
// password door) it called `fetchMe()` every single time: a full
// browser → web worker → gateway → core → Hyperdrive → Postgres chain, to
// refresh a display name that almost never changes.
//
// Beside the overlay's own read that made a signed-in page view cost TWO
// upstream chains where an anonymous one costs none. OPP5 made it the dominant
// remaining cost: the document itself is now served from cache without running
// the worker at all, so what is left of a signed-in page view is almost
// entirely these two calls.
//
// The cookie already held the last answer — `session/route.ts` has always
// called `subjectId` and `displayName` "a CACHE of the last answer". OPP8b
// dates that cache and honours the date.
//
// ─── WHAT IS PINNED HERE, AND WHY EACH ────────────────────────────────────
//
// The trade is real and bounded, so it is asserted rather than described:
// `fetchMe()` was also acting as a liveness check, and skipping it leaves the
// CHROME optimistic for up to a minute after a token is revoked. Everything
// that matters still refuses — the gateway resolves the bearer on every real
// request, the overlay answers 204, an act returns 401 — but the window is a
// deliberate sixty seconds and a test should say so.
//
// The subtle failure this file exists for is **a cache that never records a
// hit**: if the stamp were only written when the NAME changed, a session whose
// name is stable would re-read on every page load forever, and every test
// about freshness would still pass. That is the third case below.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_MAX_AGE_MS,
  decodeSession,
  encodeSession,
  identityStale,
} from "@openproduct-web/app/auth/auth";

// The route itself imports `next/server`, which this package does not depend
// on, so it cannot be driven here. The predicate below IS driven — it is where
// the decision lives — and the route's WIRING of it is asserted against the
// source, which is the same shape `session-hint.test.ts` and
// `cookie-is-not-authority.test.ts` use for the same reason. Stated plainly
// because a source assertion is weaker than a behavioural one and should never
// be mistaken for it: this proves the call is written, not that it ran.
const ROUTE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../web/src/app/auth/session/route.ts"),
  "utf-8",
);

function openproductSession(identityAt: number | undefined) {
  return decodeSession(
    encodeSession({
      subjectId: "usr_ada",
      displayName: "Ada",
      accessToken: "ops_live_token",
      // An openproduct session is never "stale" in the access-token sense, so
      // this is inert here and set far ahead to keep it obviously so.
      expiresAt: Date.now() + 86_400_000,
      kind: "openproduct",
      ...(identityAt === undefined ? {} : { identityAt }),
    }),
  )!;
}

describe("identityStale — the predicate on its own", () => {
  it("treats a cookie written before OPP8b as stale, so it backfills", () => {
    // Nobody signs in again for this. The first page load after the deploy
    // reads once and stamps.
    const session = openproductSession(undefined);
    expect(session.identityAt).toBeUndefined();
    expect(identityStale(session)).toBe(true);
  });

  it("is fresh inside the window and stale on its boundary", () => {
    const now = 1_000_000_000;
    const session = openproductSession(now);
    expect(identityStale(session, now)).toBe(false);
    expect(identityStale(session, now + IDENTITY_MAX_AGE_MS - 1)).toBe(false);
    // The boundary is stale rather than fresh: a cache that keeps an entry
    // exactly at its limit is one whose limit means "or a bit more".
    expect(identityStale(session, now + IDENTITY_MAX_AGE_MS)).toBe(true);
  });

  it("is sixty seconds, the same freshness the rest of the product uses", () => {
    // OD-H, `PUBLIC_CACHE_SECONDS`, every public page's `revalidate`. One
    // freshness constant is easier to reason about than two, and a name that
    // can be a minute out of date is exactly as stale as the board it is read
    // on.
    expect(IDENTITY_MAX_AGE_MS).toBe(60_000);
  });
});

describe("/auth/session wires the predicate in front of the read", () => {
  it("returns early on a fresh identity, BEFORE reaching fetchMe", () => {
    // Order is the whole point: a freshness check after the read saves
    // nothing. Asserted as positions rather than as presence.
    const guard = ROUTE.indexOf("if (!identityStale(session))");
    const read = ROUTE.indexOf("await fetchMe(session.accessToken)");
    expect(guard).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(read);
  });

  it("STAMPS the read unconditionally, so a stable name is not re-read forever", () => {
    // The subtle bug this guards. The cookie used to be re-set only when the
    // VALUE moved; keeping that would mean a session whose name never changes
    // re-reads on every page load forever — a cache that never records a hit
    // is not a cache, and every freshness test would still pass.
    expect(ROUTE).toContain("identityAt: Date.now()");
    expect(ROUTE).not.toContain("identity.subjectId !== session.subjectId");
  });

  it("says what it trades, where somebody would undo it", () => {
    // Skipping the read also skips a liveness check: a token revoked in the
    // last minute leaves the chrome optimistic. That is bounded and
    // deliberate, and the next reader meets the reasoning at the code rather
    // than in the epic.
    expect(ROUTE).toMatch(/liveness check/i);
  });
});
