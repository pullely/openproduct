// The apply door (saas-openproduct OD4, reshaped at OX5).
//
// The exit from the public plane. What is pinned here is that it is as narrow
// as the entrance: the door a role opening prints is the listing's ONE door,
// minted by the platform inside the link grant with `project_viewer` forced —
// this worker no longer speaks to a minting service at all, so it cannot ask
// for a wider door even by accident. An unlinked listing degrades to "no
// apply button" rather than to a failed maintainer edit.
//
// The ceiling itself is enforced in three independent places, and each has its
// own test elsewhere: `join_links_listed_check` in migration 1180
// (tests/db/src/listed-join-links-migration.test.ts), the grant-mint handler
// forcing LISTED_ROLE (tests/membership-worker), and `JOIN_LINK_ROLES` putting
// project_viewer at rank 0 so an approver cannot choose upward.

import type { OpenproductRepository, ProfileRecord, RoleOpeningRecord, StoredLinkGrant } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const ORG_UUID = "11111111-1111-4111-8111-111111111111";
const PROJECT_UUID = "33333333-3333-4333-8333-333333333333";
const PROFILE_UUID = "55555555-5555-4555-8555-555555555555";
const ORG_PUBLIC = `org_${ORG_UUID.replace(/-/g, "")}`;
const PROFILE_PUBLIC = `opp_${PROFILE_UUID.replace(/-/g, "")}`;

const ACTOR = { subjectId: "usr_0123456789abcdef0123456789abcdef", subjectType: "user" };

const GRANT: StoredLinkGrant = {
  doorRef: "jlt_printable_token",
  grantedBy: "usr_admin6789abcdef0123456789abcdef",
  grantedAt: "2026-08-17T11:55:00.000Z",
  workspaceVisibility: "public",
};

function profile(linkGrant: StoredLinkGrant | null = GRANT): ProfileRecord {
  return {
    id: PROFILE_UUID,
    orgId: ORG_UUID,
    projectId: PROJECT_UUID,
    slug: "acme-thing",
    visibility: "public",
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
    repoVisibility: "public",
    repoLicence: null,
    repoCheckedAt: "2026-08-17T11:00:00.000Z",
    // IN2 — observed from the linked repository, never authored. `null` is
    // "not observed", which is what a fixture that never ran a check holds.
    repoName: null,
    repoDescription: null,
    repoTopics: null,
    // PV0 — the rest of the observed row. `null` is "not observed".
    repoLanguage: null,
    repoPushedAt: null,
    repoOpenIssues: null,
    reviewedAt: "2026-08-17T10:00:00.000Z",
    reviewedBy: "usr_admin",
    publishedAt: "2026-08-17T12:00:00.000Z",
    indexable: true,
    // TS3 — the estate's own axis, on every fixture: a listing nobody has
    // acted on. Kept separate from `visibility` above, which is the
    // maintainer's switch and says nothing about moderation.
    moderationState: "visible" as const,
    moderatedAt: null,
    moderationActId: null,
    components: null,
    linkGrant,
    createdBy: "usr_someone",
    updatedBy: null,
    createdAt: "2026-08-17T09:00:00.000Z",
    updatedAt: "2026-08-17T12:00:00.000Z",
  };
}

const ENV = { ENVIRONMENT: "stage", LISTING_SEAM_SECRET: "test-seam-secret" } as unknown as Env;

function harness(stored: ProfileRecord, existingOpening?: Partial<RoleOpeningRecord>) {
  const linked: string[] = [];
  const repo = {
    // OX4 — authority is listing-local: the harness actor owns the listing.
    async getListingRole() {
      return "owner";
    },
    async getProfileForOrg() {
      return stored;
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
    async upsertRoleOpening(input: { id: string; title: string; status?: string }) {
      return {
        id: input.id,
        profileId: PROFILE_UUID,
        title: input.title,
        description: null,
        commitment: null,
        status: (input.status ?? "open") as "open" | "filled" | "closed",
        joinLinkRef: null,
        sortOrder: 0,
        ...existingOpening,
      } as RoleOpeningRecord;
    },
    async setRoleOpeningJoinLink(_id: string, ref: string) {
      linked.push(ref);
      return { joinLinkRef: ref } as RoleOpeningRecord;
    },
    async appendAudit() {},
  } as unknown as OpenproductRepository;

  return {
    linked,
    deps: {
      repo,
      now: () => new Date("2026-08-17T12:00:00.000Z"),
    } as ProfileHandlerDeps,
  };
}

function post(body: unknown): Request {
  return new Request(
    `https://openproduct-worker.internal/internal/openproduct/orgs/${ORG_PUBLIC}/profiles/${PROFILE_PUBLIC}/role-openings`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-subject-id": ACTOR.subjectId,
        "x-actor-subject-type": ACTOR.subjectType,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("the ceiling ladder", () => {
  // The door-role ladder is PLATFORM vocabulary — `JOIN_LINK_ROLES` in
  // `@saas/contracts/membership`, pinned platform-side by migration 1180's
  // check test and the grant-mint handler's tests. This product's stake in it
  // is exactly one seam fact: the grant forces the rank-0 role, and rank 0 is
  // `project_viewer`. Declared locally (OX6a severed the import — the ladder
  // must not become a symbol coupling); the seam fixture card carries the
  // full ladder, byte-synced across the boundary and pinned on both sides
  // (`seam-fixtures.test.ts` here, and the platform's twin), so a platform
  // re-rank fails loudly instead of silently widening what an approver can
  // choose.
  const EXPECTED_DOOR_ROLE_LADDER = ["project_viewer", "viewer", "builder"] as const;

  it("assumes project_viewer at rank 0 — the narrowest grant a door can carry", () => {
    expect(EXPECTED_DOOR_ROLE_LADDER[0]).toBe("project_viewer");
  });

  it("still admits no role above builder", () => {
    for (const forbidden of ["owner", "admin", "billing_admin", "project_admin"]) {
      expect(
        `${forbidden}: ${(EXPECTED_DOOR_ROLE_LADDER as readonly string[]).includes(forbidden)}`,
      ).toBe(`${forbidden}: false`);
    }
  });
});

describe("the listed door rides the link grant (OX5)", () => {
  it("copies the grant's door onto an open role opening — the TOKEN, not a public id", async () => {
    const h = harness(profile());
    const res = await route(post({ title: "Design lead" }), ENV, h.deps);

    expect(res.status).toBe(201);
    // The TOKEN, not the public id: /join/{secret} resolves a token, so
    // storing an id would print an apply button that goes nowhere.
    expect(h.linked).toEqual(["jlt_printable_token"]);
    const body = (await res.json()) as { data: { roleOpening: { joinLinkRef: string | null } } };
    expect(body.data.roleOpening.joinLinkRef).toBe("jlt_printable_token");
  });

  it("attaches no door to an opening that is filled or closed", async () => {
    for (const status of ["filled", "closed"]) {
      const h = harness(profile());
      const res = await route(post({ title: "Design lead", status }), ENV, h.deps);
      expect(res.status).toBe(201);
      expect(h.linked).toEqual([]);
    }
  });

  // A printed URL that visitors may already hold must not be replaced by a
  // maintainer re-saving a title.
  it("keeps an existing door rather than re-copying", async () => {
    const h = harness(profile(), { joinLinkRef: "jl_existing" });
    const res = await route(post({ title: "Renamed" }), ENV, h.deps);

    expect(h.linked).toEqual([]);
    const body = (await res.json()) as { data: { roleOpening: { joinLinkRef: string | null } } };
    expect(body.data.roleOpening.joinLinkRef).toBe("jl_existing");
  });

  // The opening exists and the listing is fine; the apply button is simply
  // absent until the listing is linked. Refusing the maintainer's edit
  // because the link flow has not run would be the worse outcome — exactly
  // the degraded mode the binding-era mint had for a sibling-service blip.
  it("survives an UNLINKED listing without losing the edit", async () => {
    const h = harness(profile(null));
    const res = await route(post({ title: "Design lead" }), ENV, h.deps);

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { roleOpening: { joinLinkRef: string | null } } };
    expect(body.data.roleOpening.joinLinkRef).toBeNull();
    expect(h.linked).toEqual([]);
  });
});
