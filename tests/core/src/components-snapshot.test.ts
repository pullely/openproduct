// Components on a listing (openproduct-home OH4) — the first deliberate
// widening of OD's projection. What is pinned at the handler layer: the
// curated list rides the publish body, bounded and email-free; absent means
// none (the default); and both views carry the snapshot with pinned entry
// keys. The wholesale-rewrite and null-default semantics are pinned against
// the real engine in repository-pg.test.ts.

import type { OpenproductRepository, ProfileRecord, ProfileComponent } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const ORG_UUID = "11111111-1111-4111-8111-111111111111";
const PROJECT_UUID = "33333333-3333-4333-8333-333333333333";
const PROFILE_UUID = "55555555-5555-4555-8555-555555555555";
const ORG_PUBLIC = `org_${ORG_UUID.replace(/-/g, "")}`;
const PROFILE_PUBLIC = `opp_${PROFILE_UUID.replace(/-/g, "")}`;
const BASE = `https://openproduct.internal/internal/openproduct/orgs/${ORG_PUBLIC}/profiles`;
const ACTOR = { subjectId: "usr_0123456789abcdef0123456789abcdef", subjectType: "user" };

function env(): Env {
  return { ENVIRONMENT: "test", LISTING_SEAM_SECRET: "test-seam-secret" } as unknown as Env;
}

function publishable(): ProfileRecord {
  return {
    id: PROFILE_UUID,
    orgId: ORG_UUID,
    projectId: PROJECT_UUID,
    slug: "acme-thing",
    visibility: "private",
    tagline: "A thing",
    // PV2 — most listings have no install line; the fixture's default is the
    // common case rather than the interesting one.
    installLine: null,
    // PV3 — most listings have too few upvotes to check, so `false` is the
    // ordinary case and the fixture's default.
    cleanVotes: false,
    pitchBody: "We are building a thing.",
    pitchDigest: "sha256:abc",
    repoUrl: "https://github.com/acme/thing",
    liveUrl: null,
    stack: ["typescript"],
    stackCanonical: ["typescript"],
    category: null,
    hosting: null,
    pricing: null,
    repoVisibility: "public",
    repoLicence: "Apache-2.0",
    repoCheckedAt: "2026-08-17T12:00:00.000Z",
    // IN2 — observed from the linked repository, never authored. `null` is
    // "not observed", which is what a fixture that never ran a check holds.
    repoName: null,
    repoDescription: null,
    repoTopics: null,
    // PV0 — the rest of the observed row. `null` is "not observed".
    repoLanguage: null,
    repoPushedAt: null,
    repoOpenIssues: null,
    reviewedAt: "2026-08-17T12:00:00.000Z",
    reviewedBy: "usr_admin",
    publishedAt: null,
    indexable: true,
    // TS3 — the estate's own axis, on every fixture: a listing nobody has
    // acted on. Kept separate from `visibility` above, which is the
    // maintainer's switch and says nothing about moderation.
    moderationState: "visible" as const,
    moderatedAt: null,
    moderationActId: null,
    components: null,
    // Linked (OX5): the stored grant satisfies the workspace gate.
    linkGrant: {
      doorRef: "jlt_printable_token",
      grantedBy: "usr_admin6789abcdef0123456789abcdef",
      grantedAt: "2026-08-17T11:55:00.000Z",
      workspaceVisibility: "public",
    },
    // eslint-disable-next-line no-restricted-syntax
    createdBy: ACTOR.subjectId,
    updatedBy: null,
    createdAt: "2026-08-17T12:00:00.000Z",
    updatedAt: "2026-08-17T12:00:00.000Z",
  };
}

function harness(): { deps: ProfileHandlerDeps; publishedWith: Array<ProfileComponent[] | null | undefined> } {
  const publishedWith: Array<ProfileComponent[] | null | undefined> = [];
  const repo = {
    // OX4 — authority is listing-local: the harness actor owns the listing.
    async getListingRole() {
      return "owner";
    },
    async getProfileForOrg() {
      return publishable();
    },
    // TS1 — an established maker: the ladder waves them through, so these
    // tests stay about the SNAPSHOT rather than about trust.
    async getTrustLevel() {
      return { subjectId: "usr", level: "established" as const, setBy: "test", reason: null, setAt: "2026-08-17T12:00:00.000Z" };
    },
    async countUnreviewedPublished() {
      return 0;
    },
    async publishProfile(
      _o: string,
      _p: string,
      at: string,
      _a: string,
      options: { components?: ProfileComponent[] | null },
    ) {
      const components = options.components;
      publishedWith.push(components);
      return { ...publishable(), visibility: "public" as const, publishedAt: at, components: components ?? null };
    },
    async listRoleOpenings() {
      return [];
    },
    async listMaintainers() {
      return [];
    },
    // openproduct-studio OSD7 — the editor's read asks for handles too.
    async listMaintainerHandles() {
      return new Map();
    },
    async appendAudit() {},
  } as unknown as OpenproductRepository;
  // The stored link grant satisfies the workspace gate (OX5) — no injected
  // visibility read exists any more.
  return { deps: { repo }, publishedWith };
}

function publishReq(body?: unknown): Request {
  return new Request(`${BASE}/${PROFILE_PUBLIC}/publish`, {
    method: "POST",
    headers: {
      "x-request-id": "req_oh4",
      "content-type": "application/json",
      "x-actor-subject-id": ACTOR.subjectId,
      "x-actor-subject-type": ACTOR.subjectType,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("the components snapshot rides the publish (OH4)", () => {
  it("publishes the curated list the maintainer selected, trimmed", async () => {
    const h = harness();
    const res = await route(
      publishReq({ components: [{ name: "  api-edge  ", kind: "service" }, { name: "platform-db" }] }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(h.publishedWith[0]).toEqual([
      { name: "api-edge", kind: "service" },
      { name: "platform-db", kind: null },
    ]);
    const body = (await res.json()) as { data: { profile: { components: unknown } } };
    expect(body.data.profile.components).toEqual([
      { name: "api-edge", kind: "service" },
      { name: "platform-db", kind: null },
    ]);
  });

  it("publishes NONE by default — an empty body is today's publish, unchanged", async () => {
    const h = harness();
    const res = await route(publishReq(), env(), h.deps);
    expect(res.status).toBe(200);
    expect(h.publishedWith[0]).toBeNull();
  });

  it("bounds the list and refuses an email in a name — the public-field boundary rule", async () => {
    const h = harness();
    expect((await route(publishReq({ components: [{ name: "ops@acme.io" }] }), env(), h.deps)).status).toBe(422);
    expect(
      (
        await route(
          publishReq({ components: Array.from({ length: 51 }, (_, i) => ({ name: `c${i}` })) }),
          env(),
          h.deps,
        )
      ).status,
    ).toBe(422);
    expect((await route(publishReq({ components: [{ name: "x".repeat(101) }] }), env(), h.deps)).status).toBe(422);
    expect(h.publishedWith).toEqual([]);
  });
});
