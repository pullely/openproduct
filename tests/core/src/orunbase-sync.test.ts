// Synced from Orunbase (openproduct-stages-crew SC-4, design §3) — core's
// half of seam S14 and the crew's Orunbase card.
//
// Pinned here: the receiver applies a `project.roster` / `project.deploy` to
// EVERY listing whose stored grant names the project, ignores a stale or
// repeated roster, refuses (and says) an empty one or one with no admin,
// audits each change with no subject id, answers an unknown project with the
// S6 fail-soft `{recorded: false}`, and reads the fixtures byte for byte.
// What `applyCrewRoster` does to a crew (add, re-lock, unlock, keep a chosen
// role, remove the unlisted, retire their consent edge) is the SQL's, and is
// pinned against a live engine in packages/db (`pg/orunbase-sync.test.ts`).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ORUNBASE_SYNC_KEYS, SYNCED_DEPLOY_KEYS, type OrunbaseSync } from "@openproduct/contracts";
import type { CrewSyncChange, ProductDeployRecord, ProductSyncRecord, ProfileRecord, RosterMemberInput } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../seam-fixtures");
const fixture = (name: string) => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf-8")) as Record<string, unknown> & { data: Record<string, unknown> };

const ENV = { ENVIRONMENT: "test" } as Env;
const PATH = "https://openproduct.internal/internal/openproduct/seam/project-event";
const NOW = "2026-11-15T10:00:00.000Z";

const ORG_UUID = "11111111-1111-4111-8111-111111111111";
const PROJECT_UUID = "33333333-3333-4333-8333-333333333333";
const PROFILE_A = "55555555-5555-4555-8555-555555555555";
const PROFILE_B = "66666666-6666-4666-8666-666666666666";

interface Harness {
  deps: never;
  linked: Array<{ id: string; slug: string }>;
  syncs: Map<string, ProductSyncRecord>;
  applied: Array<{ profileId: string; members: RosterMemberInput[]; at: string }>;
  deploys: Array<{ profileId: string; deploy: Record<string, unknown>; at: string }>;
  audits: Array<{ type: string; actorType: string; actorId: string; orgId: string; profileId: string; payload: Record<string, unknown>; description: string }>;
  asked: Array<[string, string]>;
  logs: Array<{ reason: string; eventId: string }>;
}

function harness(options: { linked?: Array<{ id: string; slug: string }>; changes?: CrewSyncChange[]; syncs?: Record<string, ProductSyncRecord> } = {}): Harness {
  const h: Omit<Harness, "deps"> = {
    linked: options.linked ?? [{ id: PROFILE_A, slug: "acme-thing" }],
    syncs: new Map(Object.entries(options.syncs ?? {})),
    applied: [],
    deploys: [],
    audits: [],
    asked: [],
    logs: [],
  };
  const repo = {
    async listProfilesLinkedToProject(orgId: string, projectId: string) {
      h.asked.push([orgId, projectId]);
      return orgId === ORG_UUID && projectId === PROJECT_UUID ? h.linked : [];
    },
    async getProductSync(profileId: string) {
      return h.syncs.get(profileId) ?? null;
    },
    async applyCrewRoster(profileId: string, members: RosterMemberInput[], at: string) {
      h.applied.push({ profileId, members, at });
      return options.changes ?? [];
    },
    async recordRosterSync(profileId: string, input: { issuedAt: string; eventId: string; at: string }) {
      h.syncs.set(profileId, { rosterIssuedAt: input.issuedAt, rosterEventId: input.eventId, syncedAt: input.at });
      return true;
    },
    async upsertProductDeploy(profileId: string, deploy: Record<string, unknown>, at: string) {
      h.deploys.push({ profileId, deploy, at });
      return true;
    },
    async appendAudit(input: Harness["audits"][number]) {
      h.audits.push(input);
    },
  };
  return { ...h, deps: { repo, now: () => new Date(NOW), log: (entry: { reason: string; eventId: string }) => h.logs.push(entry) } as never } as Harness;
}

async function deliver(h: Harness, body: unknown) {
  const res = await route(
    new Request(PATH, { method: "POST", headers: { "content-type": "application/json", "x-request-id": "req_s14" }, body: JSON.stringify(body) }),
    ENV,
    h.deps,
  );
  return { status: res.status, body: (await res.json()) as { data?: Record<string, unknown>; error?: unknown } };
}

const roster = (members: unknown[], over: Record<string, unknown> = {}) => {
  const fx = fixture("project.roster.json");
  return { ...fx, ...over, data: { ...fx.data, members, ...((over.data as object) ?? {}) } };
};

describe("S14 — the receiver reads the platform's fixtures, byte for byte", () => {
  it("project.roster: the PUBLIC ids parse to the grant's UUIDs, and the snapshot is applied and recorded", async () => {
    const h = harness();
    const fx = fixture("project.roster.json");
    const res = await deliver(h, fx);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ recorded: true, listings: 1, applied: 1 });
    expect(h.asked).toEqual([[ORG_UUID, PROJECT_UUID]]);
    expect(h.applied).toEqual([
      {
        profileId: PROFILE_A,
        members: [{ subjectId: "usr_0123456789abcdef0123456789abcdef", displayName: "Ada Lovelace", access: "admin" }],
        at: NOW,
      },
    ]);
    expect(h.syncs.get(PROFILE_A)).toEqual({ rosterIssuedAt: "2026-11-15T09:00:00.000Z", rosterEventId: fx.eventId, syncedAt: NOW });
  });

  it("project.deploy: one environment upserted, the url null as the platform sends it today", async () => {
    const h = harness();
    const res = await deliver(h, fixture("project.deploy.json"));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ recorded: true, listings: 1, applied: 1 });
    expect(h.deploys).toEqual([
      {
        profileId: PROFILE_A,
        deploy: { environment: "production", url: null, version: "v1.4.0", runRef: "01JD0000000000000000000000", deployedAt: "2026-11-15T09:05:00.000Z" },
        at: NOW,
      },
    ]);
    // A deploy is the platform's fact, not an act on the listing.
    expect(h.audits).toEqual([]);
  });
});

describe("S14 — which listings, and the fail-soft", () => {
  it("an unknown project (or one no stored grant names) answers 200 {recorded: false} and writes nothing", async () => {
    const h = harness({ linked: [] });
    for (const name of ["project.roster.json", "project.deploy.json"]) {
      const res = await deliver(h, fixture(name));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ recorded: false });
    }
    expect(h.applied).toEqual([]);
    expect(h.deploys).toEqual([]);
  });

  it("applies to EVERY listing the project's grant names", async () => {
    const h = harness({ linked: [{ id: PROFILE_A, slug: "acme-thing" }, { id: PROFILE_B, slug: "acme-two" }] });
    await deliver(h, fixture("project.roster.json"));
    await deliver(h, fixture("project.deploy.json"));
    expect(h.applied.map((a) => a.profileId)).toEqual([PROFILE_A, PROFILE_B]);
    expect(h.deploys.map((d) => d.profileId)).toEqual([PROFILE_A, PROFILE_B]);
  });

  it("refuses a malformed delivery with 422 and touches nothing: an unknown type, a bad id, an unreadable person", async () => {
    const h = harness();
    const fx = fixture("project.roster.json");
    expect((await deliver(h, { ...fx, type: "project.renamed" })).status).toBe(422);
    expect((await deliver(h, { ...fx, seam: "v2" })).status).toBe(422);
    expect((await deliver(h, { ...fx, eventId: undefined })).status).toBe(422);
    expect((await deliver(h, { ...fx, data: { ...fx.data, orgId: "11111111-1111-4111-8111-111111111111" } })).status).toBe(422);
    expect((await deliver(h, roster([{ subjectId: "usr_a", displayName: null, access: "owner" }]))).status).toBe(422);
    expect(h.applied).toEqual([]);
  });
});

describe("S14 — the roster's safety nets", () => {
  const ADMIN = { subjectId: "usr_admin", displayName: "Ada", access: "admin" };

  it("a roster OLDER than the last applied is ignored", async () => {
    const h = harness({ syncs: { [PROFILE_A]: { rosterIssuedAt: "2026-11-15T09:30:00.000Z", rosterEventId: "evt_newer", syncedAt: NOW } } });
    const res = await deliver(h, fixture("project.roster.json"));
    expect(res.body.data).toMatchObject({ recorded: false, applied: 0, skipped: ["stale"] });
    expect(h.applied).toEqual([]);
    expect(h.syncs.get(PROFILE_A)!.rosterEventId).toBe("evt_newer");
  });

  it("the same event again is ignored, whatever its time says", async () => {
    const h = harness();
    await deliver(h, fixture("project.roster.json"));
    const again = await deliver(h, fixture("project.roster.json"));
    expect(again.body.data).toMatchObject({ recorded: false, skipped: ["duplicate"] });
    expect(h.applied).toHaveLength(1);
  });

  it("a newer roster (or one issued at the same moment under a new event) is applied", async () => {
    const h = harness({ syncs: { [PROFILE_A]: { rosterIssuedAt: "2026-11-15T09:00:00.000Z", rosterEventId: "evt_before", syncedAt: NOW } } });
    expect((await deliver(h, fixture("project.roster.json"))).body.data).toMatchObject({ recorded: true });
    expect(h.applied).toHaveLength(1);
  });

  it("an EMPTY roster is ignored and said — applying it would remove everybody", async () => {
    const h = harness();
    const res = await deliver(h, roster([]));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ recorded: false, ignored: "empty" });
    expect(h.applied).toEqual([]);
    expect(h.logs).toEqual([{ reason: "empty", eventId: fixture("project.roster.json").eventId }]);
  });

  it("a roster with no admin is ignored and said — applying it could leave the product with no Lead", async () => {
    const h = harness();
    const res = await deliver(h, roster([{ subjectId: "usr_b", displayName: null, access: "builder" }]));
    expect(res.body.data).toEqual({ recorded: false, ignored: "no_admin" });
    expect(h.applied).toEqual([]);
    expect(h.logs).toEqual([{ reason: "no_admin", eventId: fixture("project.roster.json").eventId }]);
  });

  it("audits every change in the local log, by role and never by subject id", async () => {
    const h = harness({
      changes: [
        { change: "added", subjectId: "usr_new", role: "maintainer", locked: false },
        { change: "relocked", subjectId: "usr_admin", from: "member", role: "lead" },
        { change: "unlocked", subjectId: "usr_former", from: "lead", role: "member" },
        { change: "removed", subjectId: "usr_gone", role: "member" },
      ],
    });
    await deliver(h, roster([ADMIN]));
    expect(h.audits.map((a) => [a.type, a.payload])).toEqual([
      ["openproduct.crew.synced_added", { slug: "acme-thing", role: "maintainer", locked: false }],
      ["openproduct.crew.synced_relocked", { slug: "acme-thing", from: "member", to: "lead" }],
      ["openproduct.crew.synced_unlocked", { slug: "acme-thing", from: "lead", to: "member" }],
      ["openproduct.crew.synced_removed", { slug: "acme-thing", role: "member" }],
    ]);
    for (const audit of h.audits) {
      expect(audit).toMatchObject({ actorType: "system", actorId: "platform-seam", orgId: ORG_UUID, profileId: PROFILE_A });
      expect(JSON.stringify(audit)).not.toMatch(/usr_/);
    }
  });
});

// ─── the crew's Orunbase card ──────────────────────────────────────────────

describe("GET …/orunbase — the crew's card", () => {
  const ORG = `org_${ORG_UUID.replace(/-/g, "")}`;
  const PROFILE = `opp_${PROFILE_A.replace(/-/g, "")}`;
  const URL_ = `https://openproduct.internal/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}/orunbase`;
  const MEMBER = "usr_000000000000000000000000member";

  function cardHarness(linked = true) {
    const profile = {
      id: PROFILE_A,
      orgId: ORG_UUID,
      slug: "acme-thing",
      linkGrant: linked ? { doorRef: "jl_1", grantedBy: "usr_x", grantedAt: NOW, workspaceVisibility: "public" } : null,
    } as unknown as ProfileRecord;
    const deploys: ProductDeployRecord[] = [
      { environment: "production", url: null, version: "v1.4.0", runRef: "run_p", deployedAt: NOW, firstDeployedAt: "2026-11-02T09:05:00.000Z" },
    ];
    const repo = {
      async getProfileForOrg(orgId: string, profileId: string) {
        return orgId === ORG_UUID && profileId === PROFILE_A ? profile : null;
      },
      async getListingRole(_p: string, subjectId: string) {
        return subjectId === MEMBER ? "member" : null;
      },
      async listCrew() {
        return { people: [], counts: { lead: 2, maintainer: 3, member: 7 }, matching: 0, nextOffset: null };
      },
      async getProductSync() {
        return { rosterIssuedAt: NOW, rosterEventId: "evt", syncedAt: NOW };
      },
      async listProductDeploys() {
        return deploys;
      },
    };
    return { deps: { repo } as never };
  }

  async function get(h: { deps: never }, actor: string) {
    const res = await route(
      new Request(URL_, { headers: { "x-request-id": "req_card", "x-actor-subject-id": actor, "x-actor-subject-type": "user" } }),
      ENV,
      h.deps,
    );
    return { status: res.status, body: (await res.json()) as { data: OrunbaseSync } };
  }

  it("any role reads it: the sync time, the crew count, the deploys, the workspace ref — exactly its keys", async () => {
    const res = await get(cardHarness(), MEMBER);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      linked: true,
      syncedAt: NOW,
      crew: 12,
      stage: null,
      production: { url: null, version: "v1.4.0", runRef: "run_p", deployedAt: NOW, firstDeployedAt: "2026-11-02T09:05:00.000Z" },
      workspaceRef: ORG,
    });
    expect(Object.keys(res.body.data).sort()).toEqual([...ORUNBASE_SYNC_KEYS]);
    expect(Object.keys(res.body.data.production!).sort()).toEqual([...SYNCED_DEPLOY_KEYS]);
  });

  it("a listing with no link grant says so, and names no workspace", async () => {
    const res = await get(cardHarness(false), MEMBER);
    expect(res.body.data).toMatchObject({ linked: false, workspaceRef: null });
  });

  it("somebody not on the crew gets the crew routes' 404", async () => {
    expect((await get(cardHarness(), "usr_00000000000000000000000strange")).status).toBe(404);
  });
});
