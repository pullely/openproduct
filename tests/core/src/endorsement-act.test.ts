// The public act (openproduct-commons EN1): endorse and withdraw.
//
// WHAT THIS FILE IS DEFENDING is not the feature — a button that writes a row
// is not hard — but the four properties that make the feature safe to have,
// each of which is one refactor away from quietly ceasing to be true:
//
//   1. ENDORSING AND SAVING NEVER TOUCH. Separate paths, separate tables,
//      separate answers on the overlay. The day they share a handler is the
//      day somebody's private bookmark is published (OPC-3, EN-1).
//   2. THE ACT IS IDEMPOTENT AND THE ROW IS REUSED. One (listing, subject)
//      pair is one row forever, so "endorsed, withdrew, endorsed again" has a
//      history rather than three facts nobody can reconcile.
//   3. TS1'S FLOOR RECORDS RATHER THAN REFUSES. A newcomer's endorsement is
//      written `pending` and counts the moment they clear — refusing the
//      click would discard an honest gesture and teach them the button is
//      broken.
//   4. UNKNOWN AND UNPUBLISHED ANSWER IDENTICALLY on the endorse path, and
//      withdrawal is NOT filtered at all. Endorsing must not become an
//      existence oracle for other people's drafts; withdrawing must not
//      become impossible because somebody else unpublished a listing.
//
// The repository is faked at its interface — the SQL that makes the row reuse
// real is pinned against a live engine in packages/db.

import { ENDORSEMENT_MEANING, SAVE_MEANING, endorsementStateFor } from "@openproduct/contracts";
import type { OpenproductRepository, EndorsementRecord, TrustLevelRecord } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const SUBJECT = "usr_0123456789abcdef0123456789abcdef";
const BASE = "https://openproduct.internal/internal/openproduct/me";
const PUBLIC_ID = "55555555-5555-4555-8555-555555555555";
const DRAFT_ID = "66666666-6666-4666-8666-666666666666";

/** One public listing, one draft. The draft is the oracle test's subject. */
const SLUGS: Record<string, { id: string; visibility: "public" | "private" }> = {
  "acme-thing": { id: PUBLIC_ID, visibility: "public" },
  "secret-thing": { id: DRAFT_ID, visibility: "private" },
};

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      "x-request-id": "req_en1",
      "content-type": "application/json",
      "x-actor-subject-id": SUBJECT,
      "x-actor-subject-type": "user",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

interface Harness {
  deps: ProfileHandlerDeps;
  calls: string[];
  /** The endorsement table, keyed exactly as the real one is. */
  rows: Map<string, EndorsementRecord>;
  /** The SAVE table, which nothing here may ever touch. */
  saves: string[];
  level: { current: "new" | "established" | "trusted" | "restricted" };
}

function harness(): Harness {
  const calls: string[] = [];
  const rows = new Map<string, EndorsementRecord>();
  const saves: string[] = [];
  const level: Harness["level"] = { current: "established" };
  let clock = 0;
  const now = () => `2026-08-26T00:00:0${clock++}.000Z`;

  const repo = {
    // CG1 — the overlay also carries the visitor's own handle and page state
    // for the account menu; this harness has neither, and says so.
    async getActiveHandleForSubject(_subjectId: string) {
      return null;
    },
    async getContributor(_subjectId: string) {
      return null;
    },
    async getPublicProfileId(slug: string) {
      calls.push(`getPublicProfileId:${slug}`);
      const found = SLUGS[slug];
      return found && found.visibility === "public" ? found.id : null;
    },
    async getProfileIdBySlug(slug: string) {
      calls.push(`getProfileIdBySlug:${slug}`);
      return SLUGS[slug]?.id ?? null;
    },
    async getTrustLevel(subjectId: string): Promise<TrustLevelRecord | null> {
      calls.push("getTrustLevel");
      return {
        subjectId,
        level: level.current,
        setBy: "system",
        reason: null,
        setAt: "2026-08-01T00:00:00.000Z",
      };
    },
    async endorse(
      profileId: string,
      subjectId: string,
      state: "confirmed" | "pending",
      at: string,
    ): Promise<EndorsementRecord> {
      calls.push(`endorse:${profileId}:${state}`);
      const key = `${profileId}|${subjectId}`;
      const existing = rows.get(key);
      // The real statement is an upsert that clears `withdrawn_at` and KEEPS
      // `created_at`. The fake mirrors it exactly, because that is the
      // property under test — a fake that inserted a fresh row would let a
      // regression in the SQL pass here.
      const row: EndorsementRecord = existing
        ? { ...existing, state, withdrawnAt: null }
        : { profileId, subjectId, state, createdAt: at, withdrawnAt: null };
      rows.set(key, row);
      return row;
    },
    async withdrawEndorsement(profileId: string, subjectId: string, at: string) {
      calls.push(`withdrawEndorsement:${profileId}`);
      const key = `${profileId}|${subjectId}`;
      const existing = rows.get(key);
      if (!existing || existing.withdrawnAt !== null) return null;
      const row = { ...existing, withdrawnAt: at };
      rows.set(key, row);
      return row;
    },
    // NF0 — the badge rides the same read as the counts.
    async countUnreadNotifications() {
      return 0;
    },
    async overlayFor(_subjectId: string, slugs: readonly string[]) {
      calls.push("overlayFor");
      const endorsed = slugs.filter((s) => {
        const id = SLUGS[s]?.id;
        const row = id ? rows.get(`${id}|${SUBJECT}`) : undefined;
        return Boolean(row && row.withdrawnAt === null);
      });
      return {
        savedSlugs: slugs.filter((s) => saves.includes(s)),
        endorsedSlugs: endorsed,
        savedCount: saves.length,
        requestCount: 0,
        listingCount: 0,
      };
    },
    async saveProductBySlug(_subjectId: string, slug: string) {
      calls.push("saveProductBySlug");
      if (SLUGS[slug]?.visibility !== "public") return false;
      if (!saves.includes(slug)) saves.push(slug);
      return true;
    },
  } as unknown as OpenproductRepository;

  // The handler stamps its own timestamps from `new Date()`; the fake's clock
  // exists only so the withdrawal timestamp is distinguishable in assertions.
  void now;
  return { deps: { repo }, calls, rows, saves, level };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe("endorsing (openproduct-commons EN1)", () => {
  it("records the act and reports the state it was recorded in", async () => {
    const h = harness();
    const res = await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps);
    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.endorsement).toMatchObject({ slug: "acme-thing", state: "confirmed", withdrawnAt: null });
    expect(h.rows.size).toBe(1);
  });

  it("is idempotent — endorsing twice is one row with the ORIGINAL created_at", async () => {
    const h = harness();
    const first = await json(
      await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps),
    );
    const second = await json(
      await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps),
    );
    expect(h.rows.size).toBe(1);
    // NOT just "one row" — the same row. A second endorsement that reset
    // `created_at` would silently re-date a two-year-old endorsement into the
    // trailing-seven-day window that EN2's `recent` reads from.
    expect((second.endorsement as { createdAt: string }).createdAt).toBe(
      (first.endorsement as { createdAt: string }).createdAt,
    );
  });

  it("withdraws, and re-endorsing REUSES the row rather than making a second one", async () => {
    const h = harness();
    const created = await json(
      await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps),
    );

    const gone = await route(req(`${BASE}/endorsements/acme-thing`, "DELETE"), env(), h.deps);
    expect(gone.status).toBe(200);
    expect(await json(gone)).toEqual({ withdrawn: true });
    expect(h.rows.get(`${PUBLIC_ID}|${SUBJECT}`)!.withdrawnAt).not.toBeNull();
    // The row SURVIVES a withdrawal — EN3 must be able to restate a total
    // without erasing what it restated.
    expect(h.rows.size).toBe(1);

    const again = await json(
      await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps),
    );
    expect(h.rows.size).toBe(1);
    expect((again.endorsement as { withdrawnAt: string | null }).withdrawnAt).toBeNull();
    expect((again.endorsement as { createdAt: string }).createdAt).toBe(
      (created.endorsement as { createdAt: string }).createdAt,
    );
  });

  it("withdrawing what was never given is a no-op, not an error", async () => {
    const h = harness();
    const res = await route(req(`${BASE}/endorsements/acme-thing`, "DELETE"), env(), h.deps);
    // The caller's intent — "I do not endorse this" — is satisfied either
    // way, and a 404 here would leak whether they had.
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ withdrawn: false });
  });

  it("withdrawing twice stays a no-op and does not move withdrawn_at", async () => {
    const h = harness();
    await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps);
    await route(req(`${BASE}/endorsements/acme-thing`, "DELETE"), env(), h.deps);
    const at = h.rows.get(`${PUBLIC_ID}|${SUBJECT}`)!.withdrawnAt;
    const second = await route(req(`${BASE}/endorsements/acme-thing`, "DELETE"), env(), h.deps);
    expect(await json(second)).toEqual({ withdrawn: false });
    expect(h.rows.get(`${PUBLIC_ID}|${SUBJECT}`)!.withdrawnAt).toBe(at);
  });
});

describe("TS1's floor records rather than refuses (EN1)", () => {
  it("a `new` subject endorses — and the row is `pending`", async () => {
    const h = harness();
    h.level.current = "new";
    const res = await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps);
    // NOT a 403. The click happened, the record exists, and it counts the
    // moment they clear the floor.
    expect(res.status).toBe(200);
    expect((await json(res)).endorsement).toMatchObject({ state: "pending" });
    expect(h.rows.get(`${PUBLIC_ID}|${SUBJECT}`)!.state).toBe("pending");
  });

  it("a `restricted` subject still endorses, pending — restriction is not deletion", async () => {
    const h = harness();
    h.level.current = "restricted";
    const res = await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps);
    expect(res.status).toBe(200);
    expect((await json(res)).endorsement).toMatchObject({ state: "pending" });
  });

  it("a subject with no trust row at all is treated as `new`, not as trusted", async () => {
    const h = harness();
    (h.deps.repo as unknown as { getTrustLevel: () => Promise<null> }).getTrustLevel = async () => null;
    const res = await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps);
    // Fail CLOSED on the public side: an absent row is the newcomer case, and
    // defaulting the other way would make "never assessed" the fastest route
    // to a counted endorsement.
    expect((await json(res)).endorsement).toMatchObject({ state: "pending" });
  });

  it("the handler and the contract agree about the floor", () => {
    // One function decides this, so a second caller cannot grow a second,
    // disagreeing opinion about what counts.
    expect(endorsementStateFor("new")).toBe("pending");
    expect(endorsementStateFor("restricted")).toBe("pending");
    expect(endorsementStateFor("established")).toBe("confirmed");
    expect(endorsementStateFor("trusted")).toBe("confirmed");
  });
});

describe("endorsing is not an existence oracle (EN1)", () => {
  it("a draft and a slug that does not exist answer identically", async () => {
    const h = harness();
    const draft = await route(req(`${BASE}/endorsements/secret-thing`, "PUT"), env(), h.deps);
    const nothing = await route(req(`${BASE}/endorsements/no-such-thing`, "PUT"), env(), h.deps);
    expect(draft.status).toBe(404);
    expect(nothing.status).toBe(404);
    expect(await draft.clone().text()).toBe(await nothing.clone().text());
    expect(h.rows.size).toBe(0);
  });

  it("resolves the listing THROUGH the visibility filter, never by id then check", async () => {
    const h = harness();
    await route(req(`${BASE}/endorsements/secret-thing`, "PUT"), env(), h.deps);
    // The distinction matters: a handler that resolved the id first and
    // refused second would have the answer in hand, and the next person to
    // add a log line or an error message would leak it.
    expect(h.calls).toContain("getPublicProfileId:secret-thing");
    expect(h.calls).not.toContain("getProfileIdBySlug:secret-thing");
  });

  it("but WITHDRAWAL is not filtered — a listing going private does not trap you", async () => {
    const h = harness();
    // Endorsed while public, then the maintainer unpublishes.
    await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps);
    SLUGS["acme-thing"]!.visibility = "private";
    try {
      const res = await route(req(`${BASE}/endorsements/acme-thing`, "DELETE"), env(), h.deps);
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ withdrawn: true });
      expect(h.calls).toContain("getProfileIdBySlug:acme-thing");
    } finally {
      SLUGS["acme-thing"]!.visibility = "public";
    }
  });

  it("refuses a malformed slug before it reaches the repository", async () => {
    const h = harness();
    // TS2 moved the slug into the PATH, so a malformed one is now a route
    // that does not exist rather than a body that does not validate — and a
    // 404 is the better answer anyway: the shape of the string is not
    // information this surface owes anybody.
    const res = await route(req(`${BASE}/endorsements/not%20a%20slug`, "PUT"), env(), h.deps);
    expect(res.status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it("has no collection verbs — an endorsement is always about one listing", async () => {
    const h = harness();
    for (const method of ["GET", "PUT", "POST", "DELETE"]) {
      const res = await route(req(`${BASE}/endorsements`, method), env(), h.deps);
      expect([method, res.status]).toEqual([method, 405]);
    }
    expect(h.rows.size).toBe(0);
  });
});

describe("a save and an endorsement never touch (OPC-3, EN1)", () => {
  it("endorsing writes no save, and saving writes no endorsement", async () => {
    const h = harness();
    await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps);
    expect(h.saves).toEqual([]);
    expect(h.calls).not.toContain("saveProductBySlug");

    const h2 = harness();
    await route(req(`${BASE}/saved`, "PUT", { slug: "acme-thing" }), env(), h2.deps);
    expect(h2.rows.size).toBe(0);
    expect(h2.calls.some((c) => c.startsWith("endorse:"))).toBe(false);
  });

  it("the overlay answers them as two separate fields over two separate tables", async () => {
    const h = harness();
    await route(req(`${BASE}/saved`, "PUT", { slug: "acme-thing" }), env(), h.deps);
    const before = await json(
      await route(req(`${BASE}/overlay?ids=acme-thing`, "GET"), env(), h.deps),
    );
    const o1 = before.overlay as { saved: string[]; endorsed: string[] };
    // Saved and NOT endorsed. If a single "you interacted with this" field
    // existed, this assertion could not be written at all.
    expect(o1.saved).toEqual(["acme-thing"]);
    expect(o1.endorsed).toEqual([]);

    await route(req(`${BASE}/endorsements/acme-thing`, "PUT"), env(), h.deps);
    const after = await json(await route(req(`${BASE}/overlay?ids=acme-thing`, "GET"), env(), h.deps));
    const o2 = after.overlay as { saved: string[]; endorsed: string[] };
    expect(o2.saved).toEqual(["acme-thing"]);
    expect(o2.endorsed).toEqual(["acme-thing"]);

    // And withdrawing the PUBLIC one leaves the PRIVATE one alone.
    await route(req(`${BASE}/endorsements/acme-thing`, "DELETE"), env(), h.deps);
    const end = await json(await route(req(`${BASE}/overlay?ids=acme-thing`, "GET"), env(), h.deps));
    const o3 = end.overlay as { saved: string[]; endorsed: string[] };
    expect(o3.saved).toEqual(["acme-thing"]);
    expect(o3.endorsed).toEqual([]);
  });

  it("the two meanings are published, and they contradict each other on purpose", () => {
    expect(ENDORSEMENT_MEANING).toMatch(/public/i);
    expect(ENDORSEMENT_MEANING).toMatch(/your name/i);
    expect(SAVE_MEANING).toMatch(/private/i);
    expect(SAVE_MEANING).toMatch(/only you/i);
  });
});

describe("the endorsement routes are shaped like the rest of the me surface", () => {
  it("401s without forwarded actor headers — the ACTOR CHECK RUNS FIRST", async () => {
    const h = harness();
    const res = await route(
      new Request(`${BASE}/endorsements/acme-thing`, { method: "PUT" }),
      env(),
      h.deps,
    );
    // Not a 404, and the ordering is the point: an anonymous request is
    // refused before the router has decided which route it was. That is
    // EN-2's "never anonymous" enforced by shape rather than by a check
    // inside a handler somebody could later delete.
    expect(res.status).toBe(401);
    expect(h.calls).toEqual([]);
  });

  it("refuses a non-user subject — a bot has no opinion to publish", async () => {
    const h = harness();
    const res = await route(
      new Request(`${BASE}/endorsements/acme-thing`, {
        method: "PUT",
        headers: {
          "x-request-id": "req_en1",
          "content-type": "application/json",
          "x-actor-subject-id": "svc_0123456789abcdef0123456789abcd",
          "x-actor-subject-type": "service",
        },
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
    expect(h.rows.size).toBe(0);
  });

  it("405s the wrong verbs", async () => {
    const h = harness();
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      expect((await route(req(`${BASE}/endorsements`, method), env(), h.deps)).status).toBe(405);
    }
    for (const method of ["GET", "POST", "PATCH"]) {
      expect((await route(req(`${BASE}/endorsements/acme-thing`, method), env(), h.deps)).status).toBe(
        405,
      );
    }
  });
});
