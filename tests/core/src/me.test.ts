// The contributor surface (openproduct-home OH2): /internal/openproduct/me/…
//
// What is pinned: the routes are subject-keyed and org-free; only PEOPLE have
// a contributor surface (a service principal is refused, not given an empty
// one); the authored fields obey the OD2a boundary rule (no email, refused at
// the write); save-by-slug goes THROUGH the visibility filter so unknown and
// private answer identically; and the wire shapes are composed literally.
//
// The repository is faked at its interface — the real SQL (the visibility
// filter, the one-row-per-opening upsert, the cascade) is pinned against a
// live engine in packages/db/src/openproduct/repository-pg.test.ts.

import { ME_OVERLAY_KEYS, ME_OVERLAY_MAX_IDS } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const SUBJECT = "usr_0123456789abcdef0123456789abcdef";
const BASE = "https://openproduct.internal/internal/openproduct/me";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(
  url: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {
    "x-actor-subject-id": SUBJECT,
    "x-actor-subject-type": "user",
  },
): Request {
  return new Request(url, {
    method,
    headers: { "x-request-id": "req_me", "content-type": "application/json", ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

interface Harness {
  deps: ProfileHandlerDeps;
  calls: string[];
  contributors: Map<string, { subjectId: string; displayName: string | null; bio: string | null }>;
  saved: string[];
  recorded: Array<{ subjectId: string; jrRequestRef?: string | null }>;
}

function harness(): Harness {
  const calls: string[] = [];
  const contributors = new Map<string, { subjectId: string; displayName: string | null; bio: string | null }>();
  const saved: string[] = [];
  const recorded: Array<{ subjectId: string; jrRequestRef?: string | null }> = [];
  const activity: Array<{ kind: string; actorSubjectId: string | null }> = [];
  const repo = {
    // openproduct-studio OSD3 — the rows' logos; none unless a test says so.
    async listPublicMediaForSlugs() {
      return new Map();
    },
    async listMediaForProfiles() {
      return new Map();
    },
    // CG1 — the handle and the standing gate, for the contributor's own view.
    async getActiveHandleForSubject(subjectId: string) {
      calls.push("getActiveHandleForSubject");
      return subjectId === SUBJECT
        ? { handle: "ada", subjectId, reservedFor: null, claimedAt: "2026-08-24T10:00:00.000Z", releasedAt: null }
        : null;
    },
    async getHandle(handle: string) {
      calls.push(`getHandle:${handle}`);
      return handle === "taken"
        ? { handle, subjectId: "usr_someone_else", reservedFor: null, claimedAt: "2026-08-24T10:00:00.000Z", releasedAt: null }
        : null;
    },
    async claimHandle(handle: string, subjectId: string) {
      calls.push(`claimHandle:${handle}`);
      return { handle, subjectId, reservedFor: null, claimedAt: "2026-08-24T10:00:00.000Z", releasedAt: null };
    },
    async releaseHandle(subjectId: string) {
      calls.push("releaseHandle");
      return { handle: "ada", subjectId, reservedFor: null, claimedAt: "2026-08-24T10:00:00.000Z", releasedAt: "2026-08-25T10:00:00.000Z" };
    },
    async setProfileVisibility(subjectId: string, isPublic: boolean, at: string) {
      calls.push(`setProfileVisibility:${isPublic}`);
      const existing = contributors.get(subjectId);
      if (!existing) return null;
      const record = { ...existing, profilePublic: isPublic, publishedAt: isPublic ? at : null };
      contributors.set(subjectId, record);
      return { ...record, createdAt: "2026-08-24T10:00:00.000Z", updatedAt: "2026-08-24T10:00:00.000Z" };
    },
    async getContributor(subjectId: string) {
      calls.push("getContributor");
      const c = contributors.get(subjectId);
      return c
        ? { ...c, createdAt: "2026-08-24T10:00:00.000Z", updatedAt: "2026-08-24T10:00:00.000Z" }
        : null;
    },
    async upsertContributor(input: { subjectId: string; displayName?: string | null; bio?: string | null }) {
      calls.push("upsertContributor");
      const record = {
        subjectId: input.subjectId,
        displayName: input.displayName ?? null,
        bio: input.bio ?? null,
      };
      contributors.set(input.subjectId, record);
      return { ...record, createdAt: "2026-08-24T10:00:00.000Z", updatedAt: "2026-08-24T10:00:00.000Z" };
    },
    async listApplicationsBySubject(subjectId: string) {
      calls.push("listApplicationsBySubject");
      return [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          subjectId,
          profileId: "55555555-5555-4555-8555-555555555555",
          roleOpeningId: "77777777-7777-4777-8777-777777777777",
          jrRequestRef: "jrq_1",
          status: "pending" as const,
          createdAt: "2026-08-24T10:00:00.000Z",
          updatedAt: "2026-08-24T10:00:00.000Z",
          productSlug: "acme-thing",
          productTagline: "A thing",
        },
      ];
    },
    async listSavedPublicCards() {
      calls.push("listSavedPublicCards");
      return [
        {
          slug: "acme-thing",
          tagline: "A thing",
          stack: ["typescript"],
          roleOpeningCount: 1,
          openCommitments: [],
          hasLiveUrl: false,
          publishedAt: "2026-08-01T00:00:00.000Z",
          indexable: true,
        },
      ];
    },
    async saveProductBySlug(_subjectId: string, slug: string) {
      calls.push("saveProductBySlug");
      if (slug !== "acme-thing") return false; // unknown and private alike
      saved.push(slug);
      return true;
    },
    async unsaveProductBySlug(_subjectId: string, slug: string) {
      calls.push("unsaveProductBySlug");
      return slug === "acme-thing";
    },
    async getRoleOpeningByJoinLinkRef(linkRef: string) {
      calls.push("getRoleOpeningByJoinLinkRef");
      return linkRef === "jl_listed"
        ? { id: "77777777-7777-4777-8777-777777777777", profileId: "55555555-5555-4555-8555-555555555555" }
        : null;
    },
    async recordApplication(input: { subjectId: string; jrRequestRef?: string | null }) {
      calls.push("recordApplication");
      recorded.push(input);
      return {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        subjectId: input.subjectId,
        profileId: "55555555-5555-4555-8555-555555555555",
        roleOpeningId: "77777777-7777-4777-8777-777777777777",
        jrRequestRef: input.jrRequestRef ?? null,
        status: "pending" as const,
        createdAt: "2026-08-24T10:00:00.000Z",
        updatedAt: "2026-08-24T10:00:00.000Z",
        productSlug: "acme-thing",
        productTagline: "A thing",
      };
    },
    // CB3 — the decision trail. An acceptance writes a `joined` row; a
    // decline writes nothing, which is why there is no branch for it.
    async getApplicationByRequestRef(_ref: string) {
      return {
        subjectId: "usr_0123456789abcdef0123456789abcdef",
        profileId: "55555555-5555-4555-8555-555555555555",
        status: "approved",
        openingTitle: "Someone who likes tests",
      };
    },
    async appendActivity(input: { kind: string; actorSubjectId: string | null }) {
      activity.push({ kind: input.kind, actorSubjectId: input.actorSubjectId });
    },
    async setApplicationStatusByRequestRef(ref: string, status: string) {
      calls.push(`setStatus:${ref}:${status}`);
      return 1;
    },
    // CS3 — the export is the registry's, and the handler only hands it over.
    async exportSubject(subjectId: string, at: string) {
      calls.push(`exportSubject:${subjectId}:${at}`);
      return { exportedAt: at, subjectId, tables: { contributors: [{ subject_id: subjectId, display_name: "Ada" }] }, listings: [] };
    },
    // CS2 — the exit is the registry's, and the handler only reports it.
    async eraseSubject(subjectId: string, at: string) {
      calls.push(`eraseSubject:${subjectId}:${at}`);
      return subjectId === SUBJECT
        ? { deleted: 7, anonymised: 3, columns: { "contributors.subject_id": 1, "posts.author_subject_id": 3 } }
        : { deleted: 0, anonymised: 0, columns: {} };
    },
    async revokeWorkspaceEligibility(orgId: string) {
      calls.push(`revoke:${orgId}`);
      return orgId === "11111111-1111-4111-8111-111111111111"
        ? ["55555555-5555-4555-8555-555555555555"]
        : [];
    },
    async appendAudit(input: { type: string }) {
      calls.push(`audit:${input.type}`);
    },
    // DQ1 — which of the page's comments this visitor upvoted. Bounded by
    // the ids the page sent, like every other overlay question.
    // NF0 — the badge. A fact about the READER rather than about anything the
    // page rendered, so it takes no bound from the page.
    async countUnreadNotifications() {
      calls.push("unread");
      return 3;
    },
    async listPostVotesBy(_subjectId: string, postIds: readonly string[]) {
      calls.push(`postVotes:${postIds.join("|")}`);
      return postIds.slice(0, 1);
    },
    async overlayFor(subjectId: string, slugs: readonly string[]) {
      calls.push(`overlayFor:${slugs.join("|")}`);
      // Only PUBLIC saved slugs come back from the real query; the fake
      // mirrors that by knowing exactly one public slug.
      return {
        savedSlugs: slugs.filter((s) => s === "acme-thing"),
        // EN1 — a SEPARATE list from a separate table. The fake keeps them
        // deliberately different so a surface that conflated them would fail
        // here rather than pass by coincidence.
        endorsedSlugs: slugs.filter((s) => s === "other-thing"),
        savedCount: subjectId === SUBJECT ? 3 : 0,
        requestCount: 1,
        listingCount: 2,
      };
    },
    async listProfilesMaintainedBy(subjectId: string) {
      calls.push("listProfilesMaintainedBy");
      return subjectId === SUBJECT
        ? [
            {
              id: "55555555-5555-4555-8555-555555555555",
              orgId: "11111111-1111-4111-8111-111111111111",
              projectId: "33333333-3333-4333-8333-333333333333",
              slug: "acme-thing",
              visibility: "private",
              tagline: "A thing",
              publishedAt: null,
              reviewedAt: null,
              repoVisibility: null,
              linkGrant: {
                doorRef: "jlt_printable_token",
                grantedBy: "usr_admin6789abcdef0123456789abcdef",
                grantedAt: "2026-08-17T11:55:00.000Z",
                workspaceVisibility: "public",
              },
            },
          ]
        : [];
    },
  } as unknown as OpenproductRepository;
  return { deps: { repo }, calls, contributors, saved, recorded };
}

describe("the me routes are people-only and subject-keyed", () => {
  it("401s without forwarded actor headers", async () => {
    const h = harness();
    const res = await route(new Request(BASE, { method: "GET" }), env(), h.deps);
    expect(res.status).toBe(401);
    expect(h.calls).toEqual([]);
  });

  it("refuses a non-user subject — a bot has no contributor surface", async () => {
    const h = harness();
    const res = await route(
      req(BASE, "GET", undefined, {
        "x-actor-subject-id": "spr_" + "c".repeat(32),
        "x-actor-subject-type": "service_principal",
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
    expect(h.calls).toEqual([]);
  });

  it("answers null for a subject that never authored a presence — existence is opt-in", async () => {
    const h = harness();
    const res = await route(req(BASE, "GET"), env(), h.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { contributor: unknown; subjectId: string } };
    expect(body.data.contributor).toBeNull();
    expect(body.data.subjectId).toBe(SUBJECT);
  });
});

describe("authoring the presence", () => {
  it("upserts authored fields, trimmed, keyed by the FORWARDED subject", async () => {
    const h = harness();
    const res = await route(req(BASE, "PUT", { displayName: "  Ada  ", bio: "builds things" }), env(), h.deps);
    expect(res.status).toBe(200);
    expect(h.contributors.get(SUBJECT)).toEqual({
      subjectId: SUBJECT,
      displayName: "Ada",
      bio: "builds things",
    });
  });

  it("refuses an email in the display name — the OD2a boundary rule, at the write", async () => {
    const h = harness();
    const res = await route(req(BASE, "PUT", { displayName: "ada@example.com" }), env(), h.deps);
    expect(res.status).toBe(422);
    expect(h.contributors.size).toBe(0);
  });

  it("bounds the authored fields (120 / 2000)", async () => {
    const h = harness();
    expect((await route(req(BASE, "PUT", { displayName: "x".repeat(121) }), env(), h.deps)).status).toBe(422);
    expect((await route(req(BASE, "PUT", { bio: "x".repeat(2001) }), env(), h.deps)).status).toBe(422);
    expect(h.contributors.size).toBe(0);
  });
});

describe("applications and saved products", () => {
  it("lists the contributor's applications with the product's public identity joined", async () => {
    const h = harness();
    const res = await route(req(`${BASE}/applications`, "GET"), env(), h.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { applications: Array<Record<string, unknown>> } };
    const app = body.data.applications[0]!;
    // The wire shape, exactly — composed literally, never spread from a row.
    expect(Object.keys(app).sort()).toEqual(
      ["createdAt", "id", "productSlug", "productTagline", "profileId", "requestRef", "roleOpeningId", "status"].sort(),
    );
    expect(app.productSlug).toBe("acme-thing");
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("lists saved products as PUBLIC cards with the pinned card keys", async () => {
    const h = harness();
    const res = await route(req(`${BASE}/saved`, "GET"), env(), h.deps);
    const body = (await res.json()) as { data: { products: Array<Record<string, unknown>> } };
    expect(Object.keys(body.data.products[0]!).sort()).toEqual(
      // openproduct-studio OSD3 — the tile's logo joins the card.
      ["publishedAt", "roleOpeningCount", "slug", "stack", "tagline", "thumbnail"].sort(),
    );
  });

  it("saves by slug; unknown and private answer identically (404)", async () => {
    const h = harness();
    const ok = await route(req(`${BASE}/saved`, "PUT", { slug: "acme-thing" }), env(), h.deps);
    expect(ok.status).toBe(200);
    expect(h.saved).toEqual(["acme-thing"]);
    const miss = await route(req(`${BASE}/saved`, "PUT", { slug: "private-or-unknown" }), env(), h.deps);
    expect(miss.status).toBe(404);
  });

  it("unsaves by slug and reports whether anything was removed", async () => {
    const h = harness();
    const res = await route(req(`${BASE}/saved/acme-thing`, "DELETE"), env(), h.deps);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { removed: boolean } }).data.removed).toBe(true);
  });
});

// ─── openproduct-home OH3 — applying, from the home ───

describe("the JR bridge and the status truth (OH3, reshaped at OX5)", () => {
  // The console join door's interim POST retired at OX5b — the S6 webhook
  // upsert (the seam receiver below) is the sole record path, so the route
  // answers 405 rather than half-surviving as a second writer.
  it("refuses POST /me/applications — the record path is the seam webhook now", async () => {
    const h = harness();
    const res = await route(
      req(`${BASE}/applications`, "POST", { linkRef: "jl_listed", requestRef: "jreq_" + "a".repeat(32) }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(405);
    expect(h.recorded).toEqual([]);
  });

  // OX5 — the snapshot heals by S6 WEBHOOK now, not a per-request JR read:
  // the list serves what it has, and the seam receiver below writes toward JR.
  it("serves the stored snapshot verbatim — no live read remains on this path", async () => {
    const h = harness();
    const res = await route(req(`${BASE}/applications`, "GET"), env(), h.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { applications: Array<{ status: string }> } };
    expect(body.data.applications[0]!.status).toBe("pending");
    expect(h.calls.filter((c) => c.startsWith("setStatus"))).toEqual([]);
  });
});

// The S6 receiver (OX5): the platform pushes lifecycle changes; core upserts.
// Authenticity is the GATEWAY's question (it verified the webhook signature
// before forwarding) — what is pinned here is the upsert discipline.
describe("the seam event receiver (S6)", () => {
  const SEAM = "https://openproduct.internal/internal/openproduct/seam/join-request";

  function seamReq(body: unknown): Request {
    return new Request(SEAM, {
      method: "POST",
      headers: { "x-request-id": "req_seam", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("overwrites the snapshot on a decided event — JR is right, no second state machine", async () => {
    const h = harness();
    const res = await route(
      seamReq({
        seam: "v1",
        type: "join_request.decided",
        data: { jrRequestRef: "jrq_1", subjectId: SUBJECT, status: "approved", occurredAt: "2026-08-24T10:05:00.000Z" },
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(h.calls).toContain("setStatus:jrq_1:approved");
  });

  it("records the application on a submitted event — the sole record path since OX5", async () => {
    const h = harness();
    const res = await route(
      seamReq({
        seam: "v1",
        type: "join_request.submitted",
        data: { jrRequestRef: "jrq_2", doorRef: "jl_listed", subjectId: SUBJECT, status: "pending", occurredAt: "2026-08-24T10:00:00.000Z" },
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(h.calls).toContain("recordApplication");
    expect(h.recorded[0]!.jrRequestRef).toBe("jrq_2");
  });

  it("answers 200 {recorded:false} for a door with no live opening — a benign miss, not an outage", async () => {
    const h = harness();
    const res = await route(
      seamReq({
        seam: "v1",
        type: "join_request.submitted",
        data: { jrRequestRef: "jrq_3", doorRef: "jl_unknown", subjectId: SUBJECT, status: "pending", occurredAt: "2026-08-24T10:00:00.000Z" },
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { recorded: boolean } }).data.recorded).toBe(false);
    expect(h.calls).not.toContain("recordApplication");
  });

  it("refuses an unknown seam version and an invented status", async () => {
    const h = harness();
    const wrongSeam = await route(
      seamReq({ seam: "v2", type: "join_request.decided", data: { jrRequestRef: "jrq_1", subjectId: SUBJECT, status: "approved", occurredAt: "x" } }),
      env(),
      h.deps,
    );
    expect(wrongSeam.status).toBe(422);
    const wrongStatus = await route(
      seamReq({ seam: "v1", type: "join_request.decided", data: { jrRequestRef: "jrq_1", subjectId: SUBJECT, status: "escalated", occurredAt: "x" } }),
      env(),
      h.deps,
    );
    expect(wrongStatus.status).toBe(422);
    expect(h.calls.filter((c) => c.startsWith("setStatus"))).toEqual([]);
  });
});

// The maintainer landing's whole input (OX5): every listing this subject
// maintains, across workspaces, answered from listing_maintainers alone.
describe("the maintained-listings read (GET /me/listings)", () => {
  it("lists what the subject maintains, with the link fact and public ids only", async () => {
    const h = harness();
    const res = await route(req(`${BASE}/listings`, "GET"), env(), h.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { listings: Array<Record<string, unknown>> } };
    expect(body.data.listings).toHaveLength(1);
    const listing = body.data.listings[0]!;
    expect(listing.slug).toBe("acme-thing");
    expect(String(listing.id)).toMatch(/^opp_/);
    expect(String(listing.orgId)).toMatch(/^org_/);
    expect(String(listing.projectId)).toMatch(/^prj_/);
    expect(listing.workspaceLinkedAt).toBe("2026-08-17T11:55:00.000Z");
  });

  it("refuses a non-user subject exactly as the rest of the surface does", async () => {
    const h = harness();
    const res = await route(
      req(`${BASE}/listings`, "GET", undefined, {
        "x-actor-subject-id": "spr_" + "c".repeat(32),
        "x-actor-subject-type": "service_principal",
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
  });
});


// Everything they may take with them (CS3).
describe("GET /me/export — the subject's own data", () => {
  it("hands the registry's document over, keyed by the FORWARDED subject, with the moment", async () => {
    const h = harness();
    const res = await route(req(`${BASE}/export`, "GET"), env(), h.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { subjectId: string; exportedAt: string; tables: Record<string, unknown[]>; listings: unknown[] } };
    expect(body.data.subjectId).toBe(SUBJECT);
    expect(body.data.tables.contributors).toHaveLength(1);
    expect(h.calls.some((c) => c.startsWith(`exportSubject:${SUBJECT}:`))).toBe(true);
  });

  it("refuses a non-user subject, and is GET only", async () => {
    const h = harness();
    const refused = await route(
      req(`${BASE}/export`, "GET", undefined, { "x-actor-subject-id": "spr_" + "c".repeat(32), "x-actor-subject-type": "service_principal" }),
      env(),
      h.deps,
    );
    expect(refused.status).toBe(403);
    expect((await route(req(`${BASE}/export`, "POST"), env(), h.deps)).status).toBe(405);
    expect(h.calls.filter((c) => c.startsWith("exportSubject")).length).toBe(0);
  });
});

// The contributor's own exit (OX5c).
describe("DELETE /me — the contributor's own exit", () => {
  it("erases the subject by the registry and reports it, keyed by the FORWARDED subject (CS2)", async () => {
    const h = harness();
    const res = await route(req(BASE, "DELETE"), env(), h.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deleted: boolean; rows: { deleted: number; anonymised: number } } };
    expect(body.data.deleted).toBe(true);
    // The two numbers a person would want to read back: what went, what stayed without them.
    expect(body.data.rows).toEqual({ deleted: 7, anonymised: 3 });
    // No column names leave core: which tables a person appeared in is schema, not theirs to learn from a 200.
    expect(JSON.stringify(body)).not.toContain("author_subject_id");
    expect(h.calls.some((c) => c.startsWith(`eraseSubject:${SUBJECT}:`))).toBe(true);
  });

  it("refuses a non-user subject — the surface stays people-only", async () => {
    const h = harness();
    const res = await route(
      req(BASE, "DELETE", undefined, {
        "x-actor-subject-id": "spr_" + "c".repeat(32),
        "x-actor-subject-type": "service_principal",
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
    expect(h.calls).toEqual([]);
  });
});

// The workspace lifecycle receiver (OX5c): the platform's visibility_narrowed
// delivery — grants revoke, pages come down, each revocation audited locally.
describe("the seam workspace-event receiver", () => {
  const SEAM = "https://openproduct.internal/internal/openproduct/seam/workspace-event";
  const ORG_PUBLIC = "org_" + "11111111-1111-4111-8111-111111111111".replace(/-/g, "");

  function seamReq(body: unknown): Request {
    return new Request(SEAM, {
      method: "POST",
      headers: { "x-request-id": "req_seam", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("revokes the org's eligibility and audits each affected listing", async () => {
    const h = harness();
    const res = await route(
      seamReq({ seam: "v1", type: "workspace.visibility_narrowed", data: { orgId: ORG_PUBLIC } }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { revoked: number } }).data.revoked).toBe(1);
    expect(h.calls).toContain(`revoke:${"11111111-1111-4111-8111-111111111111"}`);
    expect(h.calls).toContain("audit:openproduct.profile.workspace_narrowed");
  });

  it("is idempotent — an already-private org revokes nothing and still answers 200", async () => {
    const h = harness();
    const other = "org_" + "22222222-2222-4222-8222-222222222222".replace(/-/g, "");
    const res = await route(
      seamReq({ seam: "v1", type: "workspace.visibility_narrowed", data: { orgId: other } }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { revoked: number } }).data.revoked).toBe(0);
    expect(h.calls.filter((c) => c.startsWith("audit:"))).toEqual([]);
  });

  it("refuses an unknown type and a malformed org id", async () => {
    const h = harness();
    const badType = await route(
      seamReq({ seam: "v1", type: "workspace.deleted", data: { orgId: ORG_PUBLIC } }),
      env(),
      h.deps,
    );
    expect(badType.status).toBe(422);
    const badOrg = await route(
      seamReq({ seam: "v1", type: "workspace.visibility_narrowed", data: { orgId: "acme" } }),
      env(),
      h.deps,
    );
    expect(badOrg.status).toBe(422);
    expect(h.calls).toEqual([]);
  });
});

describe("the personalisation overlay (openproduct-commons XP2)", () => {
  it("answers ids and integers, and EXACTLY the pinned key set", async () => {
    const h = harness();
    const res = await route(req(`${BASE}/overlay?ids=acme-thing,other-thing`, "GET"), env(), h.deps);
    expect(res.status).toBe(200);
    const overlay = ((await res.json()) as { data: { overlay: Record<string, unknown> } }).data.overlay;

    // THE WHOLE POINT OF THIS ASSERTION: the overlay is the one per-subject
    // response that reaches a public page, and everything it carries becomes
    // renderable-adjacent. A tagline, a name or a timestamp appearing here
    // would be a SECOND rendering path for the same product — one cached and
    // crawled, one personal and not — and the two would drift.
    expect(Object.keys(overlay).sort()).toEqual([...ME_OVERLAY_KEYS]);
    for (const [key, value] of Object.entries(overlay)) {
      // FL0 — `follows` joins the two string arrays. Its members are KEYS
      // (`topic:dev-tools`, `person:ada`) rather than bare slugs, and still
      // strings. DQ1 adds a fourth, whose members are POST IDS — a third
      // namespace, and still strings: the overlay carries ids and integers and
      // nothing else, which is what stops it becoming a second rendering path.
      const ok =
        key === "saved" || key === "endorsed" || key === "follows" || key === "postVotes"
        ? Array.isArray(value) && value.every((v) => typeof v === "string")
        : key === "handle"
          ? value === null || typeof value === "string"
          : key === "profilePublic"
            ? typeof value === "boolean"
            : typeof value === "number";
      expect([key, ok]).toEqual([key, true]);
    }
    // CG1's two identity fields: the visitor's OWN handle (already public by
    // construction — a handle is an address) and whether their page is on.
    // Nothing authored rides here: no name, no bio, no link. Those render
    // from the profile page's own read, never from an overlay that reaches
    // every public page.
    expect(overlay.handle).toBe("ada");
    expect(overlay.profilePublic).toBe(false);

    // EN1 — and the two id lists are SEPARATE ANSWERS, not one list rendered
    // twice. The fake saves one slug and endorses the other precisely so
    // that a handler which read `savedSlugs` into both fields fails here.
    expect(overlay.saved).toEqual(["acme-thing"]);
    expect(overlay.endorsed).toEqual(["other-thing"]);
  });

  it("bounds the answer to the ids the page asked about", async () => {
    const h = harness();
    const res = await route(req(`${BASE}/overlay?ids=acme-thing`, "GET"), env(), h.deps);
    const overlay = ((await res.json()) as { data: { overlay: Record<string, unknown> } }).data.overlay;
    expect(overlay.saved).toEqual(["acme-thing"]);
    // `savedCount` is the ACCOUNT total and is deliberately a different
    // number from `saved.length`. Conflating them tells someone with three
    // saved products that they have one.
    expect(overlay.savedCount).toBe(3);
    expect(h.calls).toContain("overlayFor:acme-thing");
  });

  it("truncates and drops unparseable ids rather than refusing the request", async () => {
    const h = harness();
    // A 400 here would blank a visitor's own state over one malformed id
    // that came from whatever the page happened to render. The overlay is
    // decoration; a partial answer beats no answer.
    const res = await route(
      req(`${BASE}/overlay?ids=acme-thing,not a slug,,../etc,acme-thing`, "GET"),
      env(),
      h.deps,
    );
    expect(res.status).toBe(200);
    // Deduped, and the junk is gone — one clean id reached the repository.
    expect(h.calls).toContain("overlayFor:acme-thing");
  });

  it("answers the counts when no ids are asked about at all", async () => {
    const h = harness();
    // The account chip needs only totals. It must not have to invent an id.
    const res = await route(req(`${BASE}/overlay`, "GET"), env(), h.deps);
    expect(res.status).toBe(200);
    const overlay = ((await res.json()) as { data: { overlay: Record<string, unknown> } }).data.overlay;
    expect(overlay.saved).toEqual([]);
    expect(overlay.requests).toBe(1);
    expect(overlay.listings).toBe(2);
  });

  it("caps the id list at the contract's maximum", async () => {
    const h = harness();
    const ids = Array.from({ length: ME_OVERLAY_MAX_IDS + 50 }, (_, i) => `slug-${i}`);
    await route(req(`${BASE}/overlay?ids=${ids.join(",")}`, "GET"), env(), h.deps);
    const call = h.calls.find((c) => c.startsWith("overlayFor:"))!;
    // An unbounded id list is an unbounded `= ANY($2)`; the cap is what keeps
    // the highest-frequency query in the product a bounded one.
    expect(call.slice("overlayFor:".length).split("|").length).toBe(ME_OVERLAY_MAX_IDS);
  });

  it("is people-only, like every other contributor route", async () => {
    const h = harness();
    const res = await route(
      req(`${BASE}/overlay`, "GET", undefined, {
        "x-actor-subject-id": "sp_0123456789abcdef0123456789abcdef",
        "x-actor-subject-type": "service_principal",
      }),
      env(),
      h.deps,
    );
    // A bot does not have a "saved products" list, and giving it an empty one
    // would be inventing a contributor surface for a thing that is not a
    // contributor.
    expect(res.status).toBe(403);
  });

  it("is a read: no other method reaches it", async () => {
    const h = harness();
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const res = await route(req(`${BASE}/overlay`, method), env(), h.deps);
      expect([method, res.status]).toEqual([method, 405]);
    }
  });
});
