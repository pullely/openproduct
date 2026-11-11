// The repo observation (saas-openproduct OD2b, P1).
//
// This is the fact that lets a listing go public, so what is pinned here is
// mostly what happens when the fact is BAD: unknown, unlinked, stale, or a
// service that could not answer. Every one of those must leave the listing
// unpublishable, and none of them may be reported as "public".
//
// The observation arrives from api-edge, which established it over the
// INTEGRATIONS_WORKER binding it already holds. This worker never asks GitHub
// anything — it has no such binding, which is the property the whole epic
// rests on.

import type { OpenproductRepository, ProfileRecord, RepoObservation } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";
import { publishBlockers } from "@openproduct-worker/handlers/profiles";

const ORG_UUID = "11111111-1111-4111-8111-111111111111";
const PROJECT_UUID = "33333333-3333-4333-8333-333333333333";
const PROFILE_UUID = "55555555-5555-4555-8555-555555555555";
const ORG_PUBLIC = `org_${ORG_UUID.replace(/-/g, "")}`;
const PROFILE_PUBLIC = `opp_${PROFILE_UUID.replace(/-/g, "")}`;
const ACTOR = { subjectId: "usr_0123456789abcdef0123456789abcdef", subjectType: "user" };

function profile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: PROFILE_UUID,
    orgId: ORG_UUID,
    projectId: PROJECT_UUID,
    slug: "acme-thing",
    visibility: "private",
    tagline: null,
    pitchBody: "A pitch.",
    pitchDigest: "sha256:abc",
    // PV2 — most listings have no install line, and the fixture's default is
    // the common case rather than the interesting one.
    installLine: null,
    // PV3 — most listings have too few upvotes to check, so `false` is the
    // ordinary case and the fixture's default.
    cleanVotes: false,
    repoUrl: null,
    liveUrl: null,
    stack: [],
    stackCanonical: [],
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
    reviewedAt: "2026-08-17T00:00:00.000Z",
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
    linkGrant: {
      doorRef: "jlt_printable_token",
      grantedBy: "usr_admin6789abcdef0123456789abcdef",
      grantedAt: "2026-08-17T11:55:00.000Z",
      workspaceVisibility: "public",
    },
    createdBy: "usr_someone",
    updatedBy: null,
    createdAt: "2026-08-17T12:00:00.000Z",
    updatedAt: "2026-08-17T12:00:00.000Z",
    ...overrides,
  };
}

interface Harness {
  deps: ProfileHandlerDeps;
  observed: RepoObservation[];
  audited: string[];
}

function harness(stored = profile()): Harness {
  const observed: RepoObservation[] = [];
  const audited: string[] = [];
  let current = stored;
  const repo = {
    // OX4 — authority is listing-local: the harness actor owns the listing.
    async getListingRole() {
      return "owner";
    },
    async getProfileForOrg() {
      return current;
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
    async recordRepoObservation(_id: string, observation: RepoObservation) {
      observed.push(observation);
      current = {
        ...current,
        repoVisibility: observation.repoVisibility,
        repoLicence: observation.repoLicence,
        repoCheckedAt: observation.observedAt,
    // IN2 — observed from the linked repository, never authored. `null` is
    // "not observed", which is what a fixture that never ran a check holds.
    repoName: null,
    repoDescription: null,
    repoTopics: null,
    // PV0 — the rest of the observed row. `null` is "not observed".
    repoLanguage: null,
    repoPushedAt: null,
    repoOpenIssues: null,
      };
      return current;
    },
    async appendAudit(input: { type: string }) {
      audited.push(input.type);
    },
  } as unknown as OpenproductRepository;

  return {
    observed,
    audited,
    deps: {
      repo,
      now: () => new Date("2026-08-17T12:00:00.000Z"),
    },
  };
}

function env(): Env {
  return {
    ENVIRONMENT: "stage",
  } as Env;
}

const PATH = `/internal/openproduct/orgs/${ORG_PUBLIC}/profiles/${PROFILE_PUBLIC}/repo-observation`;

function put(body: unknown): Request {
  return new Request(`https://openproduct-worker.internal${PATH}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-actor-subject-id": ACTOR.subjectId,
      "x-actor-subject-type": ACTOR.subjectType,
    },
    body: JSON.stringify(body),
  });
}

describe("recording what the App observed", () => {
  it("records a public repo and its licence, and audits the check", async () => {
    const h = harness();
    const res = await route(put({ linked: true, visibility: "public", licence: "Apache-2.0" }), env(), h.deps);

    expect(res.status).toBe(200);
    expect(h.observed).toEqual([
      {
        repoVisibility: "public",
        repoLicence: "Apache-2.0",
        observedAt: "2026-08-17T12:00:00.000Z",
        // IN2 — a body that carried none of the three records none of them,
        // and `null` is the honest value: this check read a repository and it
        // told us nothing about its name, description or topics.
        repoName: null,
        repoDescription: null,
        repoTopics: null,
    // PV0 — the rest of the observed row. `null` is "not observed".
    repoLanguage: null,
    repoPushedAt: null,
    repoOpenIssues: null,
      },
    ]);
    expect(h.audited).toEqual(["openproduct.profile.repo_checked"]);
  });

  it("records what the repository says about itself (IN2)", async () => {
    const h = harness();
    await route(
      put({
        linked: true,
        visibility: "public",
        licence: "MIT",
        name: "kettleworks",
        description: "  Boils   water, carefully  ",
        topics: ["TypeScript", " cloudflare ", "", "x".repeat(80)],
      }),
      env(),
      h.deps,
    );
    expect(h.observed[0]).toMatchObject({
      repoName: "kettleworks",
      // Collapsed and trimmed here rather than at the column: this is free
      // text somebody else wrote, arriving over the wire.
      repoDescription: "Boils water, carefully",
      // Lowercased, blanks dropped, and anything past 64 characters refused —
      // an unbounded list from an external API is an unbounded page.
      repoTopics: ["typescript", "cloudflare"],
    });
  });

  it("repeats nothing from a private repository", async () => {
    // THE ONE THAT MATTERS FOR PRIVACY. GitHub answers this shape for a repo
    // a token can see and the public cannot; copying its description onto a
    // public listing would publish something nobody chose to publish. The
    // visibility is the observation there — the words are not ours to take.
    const h = harness();
    await route(
      put({
        linked: true,
        visibility: "private",
        licence: "MIT",
        name: "secret-thing",
        description: "The unannounced product",
        topics: ["stealth"],
      }),
      env(),
      h.deps,
    );
    expect(h.observed[0]).toMatchObject({
      repoVisibility: "private",
      repoName: null,
      repoDescription: null,
      repoTopics: null,
    // PV0 — the rest of the observed row. `null` is "not observed".
    repoLanguage: null,
    repoPushedAt: null,
    repoOpenIssues: null,
    });
  });

  it("clears a stale observation rather than keeping it", async () => {
    // Written, never COALESCEd: a repository whose description has been
    // deleted must not go on being described by the one we hold. A stale
    // observation presented as current is what OPC-2 exists to prevent.
    const h = harness();
    await route(put({ linked: true, visibility: "public", licence: null, name: null }), env(), h.deps);
    expect(h.observed[0]).toMatchObject({ repoName: null, repoDescription: null, repoTopics: null });
  });

  it("returns the remaining blockers, so the console can act on one round trip", async () => {
    const h = harness();
    const res = await route(put({ linked: true, visibility: "public", licence: null }), env(), h.deps);
    const body = (await res.json()) as { data: { blockers: string[] } };
    expect(body.data.blockers).toEqual([]);
  });

  it("records a public repo with no licence as licence-less, not as unlicensed-blocked", async () => {
    const h = harness();
    await route(put({ linked: true, visibility: "public", licence: null }), env(), h.deps);
    expect(h.observed[0]!.repoLicence).toBeNull();
  });

  // Fail closed. This value is what lets a page become readable by anyone, so
  // anything that is not exactly "public" is private.
  it.each([
    ["private", "private"],
    ["internal", "an org-internal repo"],
    ["PUBLIC", "the wrong case"],
    [undefined, "a missing field"],
    [null, "an explicit null"],
    ["", "an empty string"],
  ])("treats %s as private (%s)", async (visibility: string | null | undefined, _why: string) => {
    const h = harness();
    await route(put({ linked: true, visibility }), env(), h.deps);
    expect(h.observed[0]!.repoVisibility).toBe("private");
  });

  // An unlinked project and a private repo are different facts. Writing
  // "private" for an unlinked project would send a maintainer to GitHub to
  // fix a repo that does not exist — and, since 2026-09-03, would block a
  // publish that an unlinked listing is entitled to.
  it("records \"no repository\" when the project has no linked repo, and blocks nothing for it", async () => {
    const h = harness();
    const res = await route(put({ linked: false }), env(), h.deps);

    expect(res.status).toBe(200);
    // Written, not skipped: a check after the link was removed must clear
    // the reading the old link left behind.
    expect(h.observed).toHaveLength(1);
    expect(h.observed[0]!.repoVisibility).toBeNull();
    expect(h.observed[0]!.repoLicence).toBeNull();
    const body = (await res.json()) as { data: { blockers: string[] } };
    expect(body.data.blockers).not.toContain("repo_unlinked");
    expect(body.data.blockers).not.toContain("repo_private");
  });

  it("is refused for a stranger — a platform role buys nothing here (OX4)", async () => {
    const h = harness();
    // Whatever the platform thinks of this caller, the listing has never
    // heard of them: no listing_maintainers row, no write.
    (h.deps.repo as unknown as { getListingRole: () => Promise<string | null> }).getListingRole = async () => null;

    const res = await route(put({ linked: true, visibility: "public" }), env(), h.deps);
    expect(res.status).toBe(404);
    expect(h.observed).toEqual([]);
  });
});

describe("publishBlockers reads the observation the way the gate does", () => {
  it("does not block on an unobserved repo — a listing without a repository is a listing", () => {
    expect(publishBlockers(profile())).toEqual([]);
  });

  it("blocks on a private repo", () => {
    expect(publishBlockers(profile({ repoVisibility: "private" }))).toEqual(["repo_private"]);
  });

  it("clears once the repo is observed public and the listing is reviewed", () => {
    expect(publishBlockers(profile({ repoVisibility: "public" }))).toEqual([]);
  });

  // The sweep (OD-I) can flip this back at any time. A listing that was public
  // yesterday is not evidence about today.
  it("blocks again when a later observation finds the repo private", () => {
    expect(
      publishBlockers(profile({ repoVisibility: "private", publishedAt: "2026-08-01T00:00:00.000Z" })),
    ).toEqual(["repo_private"]);
  });
});
