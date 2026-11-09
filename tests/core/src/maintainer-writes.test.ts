// The maintainer door (saas-openproduct OD2).
//
// What is pinned here is the behaviour a reviewer would otherwise have to take
// on trust: that authorization is deny-by-default and fails CLOSED, that the
// publish gates cannot be talked around, that a builder cannot wave their own
// listing through review, and that an email cannot enter the table that feeds
// a public page.
//
// The repository is faked at its interface (the real SQL is pinned against a
// live engine in packages/db/src/openproduct/repository-pg.test.ts — including
// both publish gates as WHERE clauses and a CHECK, which is where they finally
// bite). What is exercised here is the handler layer: policy, validation,
// audit, and the shape of a refusal.

import type { OpenproductRepository, ProfileRecord } from "@openproduct/db";
import { UNREVIEWED_LISTING_CAP, publishStateCopy } from "@openproduct/contracts";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const ORG_UUID = "11111111-1111-4111-8111-111111111111";
const PROJECT_UUID = "33333333-3333-4333-8333-333333333333";
const PROFILE_UUID = "55555555-5555-4555-8555-555555555555";
const ORG_PUBLIC = `org_${ORG_UUID.replace(/-/g, "")}`;
const PROJECT_PUBLIC = `prj_${PROJECT_UUID.replace(/-/g, "")}`;
const PROFILE_PUBLIC = `opp_${PROFILE_UUID.replace(/-/g, "")}`;

const ACTOR = { subjectId: "usr_0123456789abcdef0123456789abcdef", subjectType: "user" };

// ─── the link grant (OX5 — S4/S5) ───
//
// The platform's attestation, rebuilt here exactly as membership-worker's
// buildListingGrant emits it: base64url(JSON).hexHMAC over the shared secret.
// The suite signs its own grants because that IS the trust model — anything
// signed with the secret is the platform speaking, and nothing else is.
const SEAM_SECRET = "test-seam-secret";
const NOW = new Date("2026-08-17T12:00:00.000Z");
const FRESH_ISSUED_AT = "2026-08-17T11:55:00.000Z";

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function grantBlob(
  overrides: Record<string, unknown> = {},
  secret = SEAM_SECRET,
): Promise<string> {
  const payload = {
    seam: "v1",
    orgId: ORG_PUBLIC,
    projectId: PROJECT_PUBLIC,
    workspaceVisibility: "public",
    doorRef: "tok_listed_door_secret",
    grantedBy: "usr_admin6789abcdef0123456789abcdef",
    issuedAt: FRESH_ISSUED_AT,
    ...overrides,
  };
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${encoded}.${await hmacHex(secret, encoded)}`;
}

const STORED_GRANT = {
  doorRef: "tok_listed_door_secret",
  grantedBy: "usr_admin6789abcdef0123456789abcdef",
  grantedAt: FRESH_ISSUED_AT,
  workspaceVisibility: "public" as const,
};

function profile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: PROFILE_UUID,
    orgId: ORG_UUID,
    projectId: PROJECT_UUID,
    slug: "acme-thing",
    visibility: "private",
    tagline: "A thing",
    pitchBody: "We are building a thing.",
    pitchDigest: "sha256:abc",
    // PV2 — most listings have no install line, and the fixture's default is
    // the common case rather than the interesting one.
    installLine: null,
    // PV3 — most listings have too few upvotes to check, so `false` is the
    // ordinary case and the fixture's default.
    cleanVotes: false,
    repoUrl: "https://github.com/acme/thing",
    liveUrl: null,
    stack: ["typescript"],
    stackCanonical: ["typescript"],
    category: null,
    hosting: null,
    pricing: null,
    repoVisibility: null,
    repoLicence: null,
    repoCheckedAt: null,
    // IN2 — observed from the linked repository, never authored. `null` is
    // "not observed", which is what a fixture that never ran a check holds.
    repoName: null,
    repoDescription: null,
    repoTopics: null,
    // PV0 — the rest of the observed row. `null` is "not observed".
    repoLanguage: null,
    repoPushedAt: null,
    repoOpenIssues: null,
    reviewedAt: null,
    reviewedBy: null,
    publishedAt: null,
    indexable: true,
    // TS3 — the estate's own axis, on every fixture: a listing nobody has
    // acted on. Kept separate from `visibility` above, which is the
    // maintainer's switch and says nothing about moderation.
    moderationState: "visible" as const,
    moderatedAt: null,
    moderationActId: null,
    components: null,
    // The common case since OX5: a LINKED listing. Tests about the unlinked
    // (pre-seam) state override with null.
    linkGrant: STORED_GRANT,
    // created_by is TEXT here, not a UUID column — see the 1160 migration.
    // eslint-disable-next-line no-restricted-syntax
    createdBy: ACTOR.subjectId,
    updatedBy: null,
    createdAt: "2026-08-17T12:00:00.000Z",
    updatedAt: "2026-08-17T12:00:00.000Z",
    ...overrides,
  };
}

interface Harness {
  deps: ProfileHandlerDeps;
  audited: string[];
  calls: string[];
  /** TS1 — what the ladder decided, as the repository was told it. */
  published: Array<{ allowWithoutReview: boolean; indexable: boolean }>;
}

function harness(
  stored: ProfileRecord | null,
  overrides: Partial<OpenproductRepository> = {},
  // OX4: authority is listing-local. The default harness makes the ACTOR the
  // stored listing's OWNER — the common case — and a test that wants a
  // stranger or a maintainer passes its own map.
  roles: Record<string, "owner" | "maintainer"> = { [ACTOR.subjectId]: "owner" },
  // TS1 — the ladder's inputs. `established` is the default because it is the
  // common case once earned, and because these tests are about the LISTING's
  // gates: a test that wants to exercise the ladder itself says so.
  trust: { level: "new" | "established" | "trusted" | "restricted"; unreviewed?: number } = {
    level: "established",
  },
): Harness {
  const audited: string[] = [];
  const calls: string[] = [];
  const published: Array<{ allowWithoutReview: boolean; indexable: boolean }> = [];
  const trustLevel = {
    subjectId: ACTOR.subjectId,
    level: trust.level,
    setBy: "test",
    reason: null,
    setAt: "2026-08-17T12:00:00.000Z",
  };
  const unreviewedCount = trust.unreviewed ?? 0;
  const repo = {
    async getListingRole(_profileId: string, subjectId: string) {
      return roles[subjectId] ?? null;
    },
    async listMaintainedProfileIds(_orgId: string, subjectId: string) {
      return stored && roles[subjectId] ? [stored.id] : [];
    },
    async addListingMaintainer() {
      calls.push("addListingMaintainer");
    },
    async getProfileForOrg(orgId: string) {
      calls.push("getProfileForOrg");
      return stored && stored.orgId === orgId ? stored : null;
    },
    async getProfileByProject() {
      return null;
    },
    async listProfilesForOrg() {
      return stored ? [stored] : [];
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
    async createProfile(input: { slug: string; linkGrant?: { doorRef: string } | null }) {
      calls.push("createProfile");
      calls.push(`grant:${input.linkGrant?.doorRef ?? "none"}`);
      return profile({ slug: input.slug });
    },
    async setProfileLinkGrant(_id: string, grant: { doorRef: string }) {
      calls.push(`setLinkGrant:${grant.doorRef}`);
      return stored ? { ...stored, linkGrant: { ...STORED_GRANT, doorRef: grant.doorRef } } : null;
    },
    // OX5c — the LOCAL audit log; the platform events repository is gone.
    async appendAudit(input: { type: string }) {
      audited.push(input.type);
    },
    async updateProfile() {
      calls.push("updateProfile");
      return stored;
    },
    async reviewProfile(_id: string, by: string, at: string) {
      calls.push("reviewProfile");
      return profile({ reviewedAt: at, reviewedBy: by });
    },
    // TS1 — the ladder. `established` is the common case once earned, and it
    // is what these tests describe: a maker publishing without a human.
    async getTrustLevel() {
      calls.push("getTrustLevel");
      return trustLevel;
    },
    async countUnreviewedPublished() {
      calls.push("countUnreviewedPublished");
      return unreviewedCount;
    },
    async publishProfile(
      _o: string,
      _p: string,
      _at: string,
      _actor: string,
      options: { allowWithoutReview: boolean; indexable: boolean },
    ) {
      calls.push("publishProfile");
      published.push(options);
      return profile({ visibility: "public", publishedAt: "2026-08-17T12:00:00.000Z" });
    },
    async unpublishProfile() {
      calls.push("unpublishProfile");
      return profile({ visibility: "private" });
    },
    async setMaintainers(_id: string, list: Array<{ subjectId: string; roleLabel?: string | null }>) {
      calls.push("setMaintainers");
      return list.map((m, i) => ({
        profileId: PROFILE_UUID,
        subjectId: m.subjectId,
        roleLabel: m.roleLabel ?? null,
        sortOrder: i,
      }));
    },
    ...overrides,
  } as unknown as OpenproductRepository;

  return {
    audited,
    calls,
    published,
    deps: {
      repo,
      now: () => NOW,
    },
  };
}

function env(operators?: string, seamSecret: string | null = SEAM_SECRET): Env {
  return {
    ENVIRONMENT: "stage",
    ...(seamSecret ? { LISTING_SEAM_SECRET: seamSecret } : {}),
    ...(operators ? { OPENPRODUCT_OPERATORS: operators } : {}),
  } as Env;
}

function req(path: string, method: string, body?: unknown, actor = ACTOR): Request {
  return new Request(`https://openproduct-worker.internal${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-actor-subject-id": actor.subjectId,
      "x-actor-subject-type": actor.subjectType,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const BASE = `/internal/openproduct/orgs/${ORG_PUBLIC}/profiles`;

describe("the maintainer door refuses before it does anything", () => {
  it("401s a request carrying no actor headers", async () => {
    const h = harness(null);
    const res = await route(
      new Request(`https://openproduct-worker.internal${BASE}`, { method: "GET" }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(401);
  });
});

// CREATE is gated by the LINK GRANT alone since OX5 (S4/S5): the platform
// attested the binding ONCE, at mint time, and this worker verifies the
// signature instead of asking anyone anything. Deny-by-default: every defect
// answers identically, and an unconfigured seam refuses rather than passes.
describe("the create gate is the link grant (OX5)", () => {
  it("creates with a fresh, well-signed grant — and stores the attested facts", async () => {
    const h = harness(null);
    const res = await route(
      req(BASE, "POST", { grant: await grantBlob(), slug: "acme-thing" }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(201);
    expect(h.calls).toContain("createProfile");
    expect(h.calls).toContain("grant:tok_listed_door_secret");
  });

  it("422s a create with no grant at all", async () => {
    const h = harness(null);
    const res = await route(req(BASE, "POST", { slug: "acme-thing" }), env(), h.deps);
    expect(res.status).toBe(422);
    expect(h.calls).not.toContain("createProfile");
  });

  it("403s a forged grant — signed with the wrong secret", async () => {
    const h = harness(null);
    const res = await route(
      req(BASE, "POST", { grant: await grantBlob({}, "wrong-secret"), slug: "acme-thing" }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
    expect(h.calls).not.toContain("createProfile");
  });

  it("403s a STALE grant — issued more than ten minutes ago", async () => {
    const h = harness(null);
    const res = await route(
      req(BASE, "POST", { grant: await grantBlob({ issuedAt: "2026-08-17T11:40:00.000Z" }), slug: "acme-thing" }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
  });

  it("403s a grant minted for a DIFFERENT workspace — a replay where it does not apply", async () => {
    const h = harness(null);
    const other = `org_${"99999999-9999-4999-8999-999999999999".replace(/-/g, "")}`;
    const res = await route(
      req(BASE, "POST", { grant: await grantBlob({ orgId: other }), slug: "acme-thing" }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
  });

  it("422s a body whose projectId disagrees with the grant — never silently corrected", async () => {
    const h = harness(null);
    const other = `prj_${"99999999-9999-4999-8999-999999999999".replace(/-/g, "")}`;
    const res = await route(
      req(BASE, "POST", { grant: await grantBlob(), projectId: other, slug: "acme-thing" }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(422);
    expect(h.calls).not.toContain("createProfile");
  });

  it("503s when the seam secret is unset — unconfigured is visible, never a pass", async () => {
    const h = harness(null);
    const res = await route(
      req(BASE, "POST", { grant: await grantBlob(), slug: "acme-thing" }),
      env(undefined, null),
      h.deps,
    );
    expect(res.status).toBe(503);
    expect(h.calls).not.toContain("createProfile");
  });
});

describe("the link-grant door on an existing listing (OX5)", () => {
  it("attaches a fresh grant to a PRE-SEAM listing and audits it", async () => {
    const h = harness(profile({ linkGrant: null }));
    const res = await route(
      req(`${BASE}/${PROFILE_PUBLIC}/link-grant`, "PUT", { grant: await grantBlob() }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(h.calls).toContain("setLinkGrant:tok_listed_door_secret");
    expect(h.audited).toContain("openproduct.profile.workspace_linked");
  });

  it("refuses a stranger's grant hop with a resource-hiding 404 — write authority still required", async () => {
    const h = harness(profile({ linkGrant: null }), {}, {});
    const res = await route(
      req(`${BASE}/${PROFILE_PUBLIC}/link-grant`, "PUT", { grant: await grantBlob() }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(404);
    expect(h.calls).not.toContain("setLinkGrant:tok_listed_door_secret");
  });

  it("403s a grant naming a DIFFERENT project — a different binding, refused not absorbed", async () => {
    const h = harness(profile({ linkGrant: null }));
    const other = `prj_${"99999999-9999-4999-8999-999999999999".replace(/-/g, "")}`;
    const res = await route(
      req(`${BASE}/${PROFILE_PUBLIC}/link-grant`, "PUT", { grant: await grantBlob({ projectId: other }) }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
    expect(h.calls).not.toContain("setLinkGrant:tok_listed_door_secret");
  });
});

describe("the listing decides, and a stranger decides nothing (OX4)", () => {
  const OPERATOR = "usr_operator456789abcdef0123456789ab";

  it("lets a listing owner read a draft — no platform involved", async () => {
    const h = harness(profile());
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}`, "GET"), env(), h.deps);
    expect(res.status).toBe(200);
  });

  // The stranger with a valid platform token: the whole platform may know
  // them; this listing does not.
  it("refuses a stranger's write with a resource-hiding 404", async () => {
    const h = harness(profile(), {}, {});
    const res = await route(
      req(`${BASE}/${PROFILE_PUBLIC}`, "PATCH", { tagline: "mine now" }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(404);
    expect(h.calls).not.toContain("updateProfile");
  });

  // A maintainer may author and publish; only an OPERATOR may review (OX-J).
  // Otherwise the curation gate is one person deciding their own case — the
  // property OD's admin review carried, kept under the new model.
  // PP3 — pricing takes the same road as the two facets before it: a
  // maintainer's spelling is canonicalised, a value outside the vocabulary is
  // refused with the vocabulary in the refusal, and null clears.
  it("stores a canonicalised pricing answer, and refuses one the vocabulary lacks", async () => {
    const seen: unknown[] = [];
    const h = harness(profile(), {
      async updateProfile(_o: string, _p: string, input: unknown) {
        seen.push(input);
        return profile();
      },
    });
    const ok = await route(
      req(`${BASE}/${PROFILE_PUBLIC}`, "PATCH", { pricing: "Freemium" }),
      env(),
      h.deps,
    );
    expect(ok.status).toBe(200);
    expect((seen[0] as { pricing?: unknown }).pricing).toBe("open-core");

    const refused = await route(
      req(`${BASE}/${PROFILE_PUBLIC}`, "PATCH", { pricing: "$9/month" }),
      env(),
      h.deps,
    );
    expect(refused.status).toBe(422);
    const body = (await refused.json()) as {
      error: { details: { fields?: Record<string, string[]> } };
    };
    expect(body.error.details.fields?.pricing?.[0]).toMatch(/free, open-core, paid, self-host/);
    expect(seen).toHaveLength(1);

    const cleared = await route(
      req(`${BASE}/${PROFILE_PUBLIC}`, "PATCH", { pricing: null }),
      env(),
      h.deps,
    );
    expect(cleared.status).toBe(200);
    expect((seen[1] as { pricing?: unknown }).pricing).toBeNull();
  });

  it("lets a maintainer author but never review", async () => {
    const roles = { [ACTOR.subjectId]: "maintainer" as const };
    const authoring = harness(profile(), {}, roles);
    const wrote = await route(
      req(`${BASE}/${PROFILE_PUBLIC}`, "PATCH", { tagline: "new" }),
      env(),
      authoring.deps,
    );
    expect(wrote.status).toBe(200);

    const reviewing = harness(profile(), {}, roles);
    const reviewed = await route(req(`${BASE}/${PROFILE_PUBLIC}/review`, "POST"), env(), reviewing.deps);
    expect(reviewed.status).toBe(404);
    expect(reviewing.calls).not.toContain("reviewProfile");
  });

  it("an OWNER cannot wave their own listing through review either", async () => {
    const h = harness(profile());
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/review`, "POST"), env(), h.deps);
    expect(res.status).toBe(404);
    expect(h.calls).not.toContain("reviewProfile");
  });

  // The console must not keep its own copy of the role model, so the API
  // answers "may this caller review?" on the profile read (OD6) — and since
  // OX4 the answer is exactly the operator bit.
  it("reports canReview=false for owners and maintainers, true for operators", async () => {
    const asOwner = harness(profile());
    const ownerRes = await route(req(`${BASE}/${PROFILE_PUBLIC}`, "GET"), env(), asOwner.deps);
    expect(((await ownerRes.json()) as { data: { capabilities: { canReview: boolean } } }).data.capabilities.canReview).toBe(false);

    const asOperator = harness(profile(), {}, {});
    const operatorRes = await route(
      req(`${BASE}/${PROFILE_PUBLIC}`, "GET", undefined, { subjectId: OPERATOR, subjectType: "user" }),
      env(OPERATOR),
      asOperator.deps,
    );
    expect(((await operatorRes.json()) as { data: { capabilities: { canReview: boolean } } }).data.capabilities.canReview).toBe(true);
  });

  it("lets an operator review, and audits it", async () => {
    const h = harness(profile(), {}, {});
    const res = await route(
      req(`${BASE}/${PROFILE_PUBLIC}/review`, "POST", undefined, { subjectId: OPERATOR, subjectType: "user" }),
      env(OPERATOR),
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(h.audited).toContain("openproduct.profile.reviewed");
  });

  it("an operator list is exact — a lookalike subject is not an operator", async () => {
    const h = harness(profile(), {}, {});
    const res = await route(
      req(`${BASE}/${PROFILE_PUBLIC}/review`, "POST", undefined, { subjectId: `${OPERATOR}x`, subjectType: "user" }),
      env(OPERATOR),
      h.deps,
    );
    expect(res.status).toBe(404);
  });
});

describe("the publish gates", () => {
  const owner = () => env();

  // ─── the workspace gate is the STORED link grant (OW4, restated at OX5) ───

  it("refuses an UNLINKED listing first, whatever the profile says (OX5)", async () => {
    const h = harness(
      profile({ linkGrant: null, repoVisibility: "public", reviewedAt: "2026-08-17T00:00:00.000Z" }),
    );
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: { details: { blockers: string[] } } };
    expect(body.error.details.blockers).toEqual(["workspace_link_required"]);
    expect(h.calls).not.toContain("publishProfile");
  });

  it("publishes a LINKED listing — the stored grant is the whole workspace fact, no read left to fail", async () => {
    const h = harness(
      profile({ repoVisibility: "public", reviewedAt: "2026-08-17T00:00:00.000Z" }),
    );
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(200);
    expect(h.calls).toContain("publishProfile");
  });

  it("an ESTABLISHED maker publishes an unreviewed listing — no human (TS1)", async () => {
    // The rule OD had: every publish waited for an admin. That is a fine
    // lever at fifteen listings and an outage at 1,284. TS1 moves the human
    // cost to where the risk is, and THIS is the assertion that says so.
    const h = harness(profile({ repoVisibility: "public" }), {}, undefined, { level: "established" });
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(200);
    expect(h.calls).toContain("publishProfile");
  });

  it("refuses a private repo and says which remedy", async () => {
    const h = harness(profile({ repoVisibility: "private", reviewedAt: "2026-08-17T00:00:00.000Z" }));
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: { details: { blockers: string[] } } };
    expect(body.error.details.blockers).toEqual(["repo_private"]);
  });

  it("publishes a listing with no repository at all — a listing without a repo is a listing", async () => {
    // Decided 2026-09-03 (openproduct-account): a founder lists a product
    // before its code has a home; the repository attaches when one is linked.
    // `repo_unlinked` is retired — only a LINKED repo that reads back private
    // still blocks (the case above).
    const h = harness(profile({ reviewedAt: "2026-08-17T00:00:00.000Z" }));
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(200);
    expect(h.calls).toContain("publishProfile");
  });

  it("refuses a listing with no pitch — an empty page is not a listing", async () => {
    const h = harness(
      profile({ pitchBody: null, repoVisibility: "public", reviewedAt: "2026-08-17T00:00:00.000Z" }),
    );
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    const body = (await res.json()) as { error: { details: { blockers: string[] } } };
    expect(body.error.details.blockers).toEqual(["pitch_missing"]);
  });

  it("reports every blocker at once, so a maintainer fixes them in one pass", async () => {
    // A restricted maker with a broken listing gets BOTH sets of reasons in
    // one answer, not one per round trip. `awaiting_review` is gone from this
    // list since TS1: an established maker never sees it, and a restricted
    // one gets the appealable blocker instead.
    const h = harness(profile({ pitchBody: null, repoVisibility: "private" }), {}, undefined, {
      level: "restricted",
    });
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    const body = (await res.json()) as { error: { details: { blockers: string[] } } };
    expect(body.error.details.blockers).toEqual(["pitch_missing", "repo_private", "restricted"]);
  });

  it("publishes when every gate is satisfied, and audits it", async () => {
    const h = harness(profile({ repoVisibility: "public", reviewedAt: "2026-08-17T00:00:00.000Z" }));
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(200);
    expect(h.audited).toEqual(["openproduct.profile.published"]);
  });

  // The repository re-asserts both gates in SQL. If it declines after the
  // handler's check passed, the row changed underneath — answer with the real
  // reason, not a generic conflict.
  it("re-reads and reports the real reason when the row changed underneath", async () => {
    const h = harness(profile({ repoVisibility: "public", reviewedAt: "2026-08-17T00:00:00.000Z" }), {
      async publishProfile() {
        return null;
      },
    });
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(412);
    expect(h.audited).toEqual([]);
  });

  it("unpublishes on DELETE and audits it", async () => {
    const h = harness(profile({ visibility: "public", publishedAt: "2026-08-17T00:00:00.000Z" }));
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "DELETE"), owner(), h.deps);
    expect(res.status).toBe(200);
    expect(h.audited).toEqual(["openproduct.profile.unpublished"]);
  });
});

describe("validation at the boundary", () => {
  const owner = () => env();

  it.each([
    ["Acme Thing", "spaces"],
    ["-leading", "a leading hyphen"],
    ["trailing-", "a trailing hyphen"],
    ["double--hyphen", "a doubled hyphen"],
    ["../etc", "path characters"],
  ])("refuses the slug %s (%s)", async (slug) => {
    const h = harness(null);
    const res = await route(req(BASE, "POST", { projectId: PROJECT_PUBLIC, slug }), owner(), h.deps);
    expect(res.status).toBe(422);
  });

  // A global slug namespace means the console's own words must not become
  // project URLs (OD-M). The public host also claims some paths for itself —
  // /me (contributor home), /auth, /oauth, /sitemap.xml, /robots.txt,
  // /favicon, and /create (the founder funnel) — a product slugged any of
  // those would appear in the directory but never render at its own URL.
  it.each([
    "admin",
    "login",
    "settings",
    "openproduct",
    "me",
    "oauth",
    "favicon",
    "sitemap",
    "robots",
    "create",
    "start",
  ])("reserves %s", async (slug) => {
    const h = harness(null);
    const res = await route(req(BASE, "POST", { projectId: PROJECT_PUBLIC, slug }), owner(), h.deps);
    expect(res.status).toBe(422);
  });

  it("accepts a well-formed slug and lowercases it", async () => {
    const h = harness(null);
    const res = await route(
      req(BASE, "POST", { grant: await grantBlob(), slug: "Acme-Thing" }),
      owner(),
      h.deps,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { profile: { slug: string } } };
    expect(body.data.profile.slug).toBe("acme-thing");
  });

  // These links are printed on a public page, where an http downgrade is
  // something a visitor cannot see coming.
  it.each(["http://acme.test", "javascript:alert(1)", "not-a-url", "ftp://acme.test"])(
    "refuses %s as a repo URL",
    async (repoUrl) => {
      const h = harness(null);
      const res = await route(
        req(BASE, "POST", { projectId: PROJECT_PUBLIC, slug: "acme-thing", repoUrl }),
        owner(),
        h.deps,
      );
      expect(res.status).toBe(422);
    },
  );

  it("maps a lost slug race to 409, not 500", async () => {
    const h = harness(null, {
      async createProfile() {
        throw new Error('duplicate key value violates unique constraint "openproduct_profiles_slug_idx"');
      },
    });
    const res = await route(
      req(BASE, "POST", { grant: await grantBlob(), slug: "acme-thing" }),
      owner(),
      h.deps,
    );
    expect(res.status).toBe(409);
  });
});

describe("published maintainers", () => {
  const owner = () => env();

  it("stores subject ids and returns no email field at all", async () => {
    const h = harness(profile());
    const res = await route(
      req(`${BASE}/${PROFILE_PUBLIC}/maintainers`, "PUT", {
        maintainers: [{ subjectId: "usr_aaaa", roleLabel: "maintainer" }],
      }),
      owner(),
      h.deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { maintainers: Array<Record<string, unknown>> } };
    expect(Object.keys(body.data.maintainers[0]!).sort()).toEqual(["displayName", "roleLabel", "subjectId"]);
    expect(h.audited).toContain("openproduct.maintainers.updated");
  });

  // The table feeds a public page. An address must not be able to enter it,
  // even by a caller that means well.
  it("refuses an email in the subjectId field", async () => {
    const h = harness(profile());
    const res = await route(
      req(`${BASE}/${PROFILE_PUBLIC}/maintainers`, "PUT", {
        maintainers: [{ subjectId: "someone@example.com" }],
      }),
      owner(),
      h.deps,
    );
    expect(res.status).toBe(422);
    expect(h.calls).not.toContain("setMaintainers");
  });

  // openproduct-studio OSD7 — people are named by the handle a maker can see.
  describe("by handle (OSD7)", () => {
    const ADA = "usr_ada00000000000000000000000000000";
    function byHandle(holders: Record<string, string>) {
      const saved: Array<{ subjectId: string; roleLabel?: string | null }> = [];
      const asked: string[][] = [];
      const h = harness(profile(), {
        async getSubjectsForHandles(handles: readonly string[]) {
          asked.push([...handles]);
          return new Map(handles.flatMap((x) => (holders[x] ? [[x, holders[x]] as [string, string]] : [])));
        },
        async setMaintainers(_id: string, list: Array<{ subjectId: string; roleLabel?: string | null }>) {
          saved.push(...list);
          return list.map((m, i) => ({ profileId: PROFILE_UUID, subjectId: m.subjectId, roleLabel: m.roleLabel ?? null, sortOrder: i }));
        },
      } as Partial<OpenproductRepository>);
      return { h, saved, asked };
    }

    it("resolves a handle to its holder in core, beside a plain id, in order", async () => {
      const { h, saved, asked } = byHandle({ ada: ADA });
      const res = await route(
        req(`${BASE}/${PROFILE_PUBLIC}/maintainers`, "PUT", {
          maintainers: [
            { handle: "Ada", roleLabel: "maintainer" },
            { subjectId: "usr_bbbb", roleLabel: null },
          ],
        }),
        owner(),
        h.deps,
      );
      expect(res.status).toBe(200);
      // Folded to canonical form before the lookup, and asked in ONE read.
      expect(asked).toEqual([["ada"]]);
      expect(saved.map((m) => [m.subjectId, m.roleLabel])).toEqual([
        [ADA, "maintainer"],
        ["usr_bbbb", null],
      ]);
    });

    it("422s a handle nobody holds, naming it, and saves nothing", async () => {
      const { h, saved } = byHandle({ ada: ADA });
      const res = await route(
        req(`${BASE}/${PROFILE_PUBLIC}/maintainers`, "PUT", {
          maintainers: [{ handle: "ada" }, { handle: "nobody-here" }],
        }),
        owner(),
        h.deps,
      );
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { details: { fields: { maintainers: string[] } } } };
      expect(body.error.details.fields.maintainers).toEqual(["No one here goes by @nobody-here"]);
      expect(saved).toEqual([]);
    });

    it("still refuses an email, even written as a handle", async () => {
      const { h, asked } = byHandle({});
      const res = await route(
        req(`${BASE}/${PROFILE_PUBLIC}/maintainers`, "PUT", {
          maintainers: [{ handle: "@someone@example.com" }],
        }),
        owner(),
        h.deps,
      );
      expect(res.status).toBe(422);
      expect(asked).toEqual([]);
      expect(h.calls).not.toContain("setMaintainers");
    });

    it("the editor's read carries each maintainer's active handle, or null", async () => {
      const h = harness(profile(), {
        async listMaintainers() {
          return [
            { profileId: PROFILE_UUID, subjectId: ADA, displayName: null, roleLabel: "maintainer", sortOrder: 0 },
            { profileId: PROFILE_UUID, subjectId: "usr_bbbb", displayName: null, roleLabel: null, sortOrder: 1 },
          ];
        },
        async listMaintainerHandles() {
          return new Map([[ADA, "ada"]]);
        },
      } as Partial<OpenproductRepository>);
      const res = await route(req(`${BASE}/${PROFILE_PUBLIC}`, "GET"), owner(), h.deps);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { profile: { maintainers: Array<{ subjectId: string; handle: string | null }> } } };
      expect(body.data.profile.maintainers.map((m) => [m.subjectId, m.handle])).toEqual([
        [ADA, "ada"],
        ["usr_bbbb", null],
      ]);
    });
  });
});

describe("TS1 — the ladder replaces OD's per-publish review", () => {
  const owner = () => env();
  const publishable = () => profile({ repoVisibility: "public" });

  it("a NEW maker publishes — unindexed, not blocked", async () => {
    // The decision that matters most in this milestone. Blocking would punish
    // the honest first-timer, who is the overwhelming majority, to
    // inconvenience the spammer, who will make another account anyway. So the
    // page is live and readable by anyone sent the link; crawlers just do not
    // amplify it yet.
    const h = harness(publishable(), {}, undefined, { level: "new", unreviewed: 0 });
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(200);
    expect(h.published[0]).toMatchObject({ indexable: false, allowWithoutReview: true });
  });

  it("an ESTABLISHED maker publishes, indexed, without consulting the cap", async () => {
    const h = harness(publishable(), {}, undefined, { level: "established" });
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(200);
    expect(h.published[0]).toMatchObject({ indexable: true, allowWithoutReview: true });
    // The cap only exists for a maker nobody has cleared. Counting it for
    // everyone would be a query on every publish for a rule that applies to
    // almost nobody.
    expect(h.calls).not.toContain("countUnreviewedPublished");
  });

  it("a NEW maker at the cap is refused, with the number in the copy", async () => {
    const h = harness(publishable(), {}, undefined, {
      level: "new",
      unreviewed: UNREVIEWED_LISTING_CAP,
    });
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: { details: { blockers: string[] } } };
    expect(body.error.details.blockers).toEqual(["unreviewed_listing_cap"]);
    // A cap nobody can see is a cap a person experiences as the product being
    // broken, so the number is stated rather than implied.
    expect(
      publishStateCopy({
        allowed: false,
        blockers: ["unreviewed_listing_cap"],
        indexable: false,
        requiresReview: true,
      }),
    ).toContain(String(UNREVIEWED_LISTING_CAP));
  });

  it("a RESTRICTED maker is refused, and told it is appealable", async () => {
    const h = harness(publishable(), {}, undefined, { level: "restricted" });
    const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: { details: { blockers: string[] } } };
    expect(body.error.details.blockers).toEqual(["restricted"]);
    const copy = publishStateCopy({
      allowed: false,
      blockers: ["restricted"],
      indexable: false,
      requiresReview: true,
    });
    // Reading is never restricted (OPX-2) and an appeal is always available
    // (TS-4) — both said, in the maker's own terms.
    expect(copy).toContain("appeal");
    expect(copy).toContain("nothing you have already published has been removed");
  });

  it("OD's REVIEW PATH SURVIVES: a cleared listing publishes at any level", async () => {
    // The exception route, still there and still exercised. A human looking
    // at a specific listing answers every question the ladder exists to ask —
    // including for a restricted maker, because the point of restriction is
    // that a person decides, not that nothing may ever ship.
    for (const level of ["new", "restricted"] as const) {
      const h = harness(
        profile({ repoVisibility: "public", reviewedAt: "2026-08-17T00:00:00.000Z" }),
        {},
        undefined,
        { level },
      );
      const res = await route(req(`${BASE}/${PROFILE_PUBLIC}/publish`, "POST"), owner(), h.deps);
      expect([level, res.status]).toEqual([level, 200]);
      expect(h.published[0]).toMatchObject({ indexable: true });
    }
  });
});
