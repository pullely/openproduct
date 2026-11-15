// Synced from Orunbase against a live engine (openproduct-stages-crew SC-4,
// migration 2295).
//
// What the SQL is trusted for: a roster snapshot becomes the crew in one
// statement — the missing added at their access's role, admins locked as
// Lead, former admins unlocked, every other chosen role kept, the unlisted
// removed (any source) with their consent edge retired so the public page
// drops them — and a deploy is upserted per environment, newer wins, the
// first deploy kept. Both tables leave with the listing.

import { describe, expect, it } from "vitest";

import { db, sql, repo, ORG, ORG_OTHER, PROJECT, PROJECT_TWO, PROFILE, PROFILE_TWO, ACTOR, NOW, seedDraft, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

const ADA = "usr_0000000000000000000000000000ada0";
const BOB = "usr_0000000000000000000000000000bob0";
const CY = "usr_00000000000000000000000000000c10";
const DEE = "usr_000000000000000000000000000000d0";
const AT = "2026-11-15T09:00:00.000Z";
const GRANT = { doorRef: "jl_1", grantedBy: ACTOR, grantedAt: NOW, workspaceVisibility: "public" as const };

async function crew() {
  const res = await sql.execute<{ subject_id: string; role: string; source: string; locked: boolean; synced_name: string | null }>(
    `SELECT subject_id, role, source, locked, synced_name FROM openproduct.listing_maintainers WHERE profile_id = $1 ORDER BY subject_id`,
    [PROFILE],
  );
  return res.rows
    .map((r) => [r.subject_id, r.role, r.source, r.locked, r.synced_name])
    .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
}

describe("SC-4 — which listings a project event reaches", () => {
  it("only those whose stored link grant names the workspace and the project", async () => {
    await seedDraft();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "second-thing");
    expect(await repo.listProfilesLinkedToProject(ORG, PROJECT)).toEqual([]);
    await repo.setProfileLinkGrant(PROFILE, GRANT);
    await repo.setProfileLinkGrant(PROFILE_TWO, GRANT);
    expect(await repo.listProfilesLinkedToProject(ORG, PROJECT)).toEqual([{ id: PROFILE, slug: "acme-thing" }]);
    expect(await repo.listProfilesLinkedToProject(ORG_OTHER, PROJECT)).toEqual([]);
    // A workspace gone private clears the grant, and with it the sync.
    await repo.revokeWorkspaceEligibility(ORG);
    expect(await repo.listProfilesLinkedToProject(ORG, PROJECT)).toEqual([]);
  });
});

describe("SC-4 — a roster becomes the crew (design §3.1, §3.2)", () => {
  it("adds the missing at their access's role, an admin as a LOCKED Lead, with the synced name, crew-only", async () => {
    await seedDraft();
    const changes = await repo.applyCrewRoster(
      PROFILE,
      [
        { subjectId: ACTOR, displayName: "The Creator", access: "admin" },
        { subjectId: ADA, displayName: "Ada Lovelace", access: "builder" },
        { subjectId: BOB, displayName: null, access: "viewer" },
      ],
      AT,
    );
    expect(changes).toEqual([
      { change: "added", subjectId: ADA, role: "maintainer", locked: false },
      { change: "added", subjectId: BOB, role: "member", locked: false },
      // The creator was an unlocked Lead; an Orunbase admin is a locked one.
      { change: "relocked", subjectId: ACTOR, from: "lead", role: "lead" },
    ]);
    expect(await crew()).toEqual([
      [ADA, "maintainer", "orunbase", false, "Ada Lovelace"],
      [BOB, "member", "orunbase", false, null],
      [ACTOR, "lead", "creator", true, "The Creator"],
    ]);
    // The crew's own list names a synced person by the synced name...
    const list = await repo.listCrew(PROFILE, { q: "lovel", role: null, offset: 0, limit: 30 });
    expect(list.people.map((p) => [p.subjectId, p.displayName])).toEqual([[ADA, "Ada Lovelace"]]);
    // ...and the public roster names nobody who has not agreed.
    await seedPublishedOver();
    expect(await repo.listPublicMaintainers(PROFILE)).toEqual([]);
  });

  it("keeps the role the crew chose, re-locks an admin, unlocks a former admin to their access's role", async () => {
    await seedDraft();
    await repo.applyCrewRoster(
      PROFILE,
      [
        { subjectId: ACTOR, displayName: null, access: "admin" },
        { subjectId: ADA, displayName: null, access: "viewer" },
        { subjectId: CY, displayName: null, access: "admin" },
      ],
      AT,
    );
    // A Lead moves ADA up; CY (locked) cannot be moved here.
    expect(await repo.setCrewRole(PROFILE, ADA, "maintainer")).toMatchObject({ outcome: "changed" });
    expect(await repo.setCrewRole(PROFILE, CY, "member")).toEqual({ outcome: "locked" });

    const changes = await repo.applyCrewRoster(
      PROFILE,
      [
        { subjectId: ACTOR, displayName: null, access: "admin" },
        { subjectId: ADA, displayName: null, access: "viewer" },
        { subjectId: CY, displayName: null, access: "builder" },
      ],
      "2026-11-15T09:10:00.000Z",
    );
    expect(changes).toEqual([{ change: "unlocked", subjectId: CY, from: "lead", role: "maintainer" }]);
    expect(await crew()).toEqual([
      [CY, "maintainer", "orunbase", false, null],
      [ADA, "maintainer", "orunbase", false, null],
      [ACTOR, "lead", "creator", true, null],
    ]);

    // ADA made admin on Orunbase: Lead, locked, whatever the crew chose.
    const again = await repo.applyCrewRoster(
      PROFILE,
      [
        { subjectId: ACTOR, displayName: null, access: "admin" },
        { subjectId: ADA, displayName: null, access: "admin" },
        { subjectId: CY, displayName: null, access: "builder" },
      ],
      "2026-11-15T09:20:00.000Z",
    );
    expect(again).toEqual([{ change: "relocked", subjectId: ADA, from: "maintainer", role: "lead" }]);
    // The same snapshot again changes nothing.
    expect(
      await repo.applyCrewRoster(
        PROFILE,
        [
          { subjectId: ACTOR, displayName: null, access: "admin" },
          { subjectId: ADA, displayName: null, access: "admin" },
          { subjectId: CY, displayName: null, access: "builder" },
        ],
        "2026-11-15T09:30:00.000Z",
      ),
    ).toEqual([]);
  });

  it("removes everybody not listed, whatever brought them, and retires their consent edge so the page drops them", async () => {
    await seedPublished();
    await repo.addSeatMember(PROFILE, ADA, "seam:jr_1");
    await repo.addListingMaintainer(PROFILE, BOB, "maintainer", ACTOR);
    // BOB agreed to be shown; DEE is credited on the page but not on the crew.
    await repo.setMaintainers(PROFILE, [
      { subjectId: BOB, displayName: "Bob Babbage", roleLabel: null, sortOrder: 0 },
      { subjectId: DEE, displayName: "Dee", roleLabel: null, sortOrder: 1 },
    ]);
    for (const subject of [BOB, DEE]) {
      await repo.inviteToRoster({ profileId: PROFILE, subjectId: subject, roleLabel: null, invitedBy: ACTOR, at: NOW });
      await repo.confirmRosterEdge(PROFILE, subject, NOW);
    }
    expect((await repo.listPublicMaintainers(PROFILE)).map((m) => m.subjectId)).toEqual([BOB, DEE]);

    const changes = await repo.applyCrewRoster(PROFILE, [{ subjectId: ACTOR, displayName: null, access: "admin" }], AT);
    expect(changes).toEqual([
      { change: "relocked", subjectId: ACTOR, from: "lead", role: "lead" },
      { change: "removed", subjectId: ADA, role: "member" },
      { change: "removed", subjectId: BOB, role: "maintainer" },
    ]);
    expect(await crew()).toEqual([[ACTOR, "lead", "creator", true, null]]);
    expect(await repo.getListingRole(PROFILE, BOB)).toBeNull();
    // BOB's edge is retired by the sync; DEE was never on the crew and stays.
    expect(await repo.getRosterEdge(PROFILE, BOB)).toMatchObject({ state: "retired", retiredAt: AT });
    expect(await repo.getRosterEdge(PROFILE, DEE)).toMatchObject({ state: "confirmed" });
    expect((await repo.listPublicMaintainers(PROFILE)).map((m) => m.subjectId)).toEqual([DEE]);
  });

  it("an empty list writes nothing (the receiver refuses one before it gets here)", async () => {
    await seedDraft();
    expect(await repo.applyCrewRoster(PROFILE, [], AT)).toEqual([]);
    expect(await crew()).toEqual([[ACTOR, "lead", "creator", false, null]]);
  });

  it("records an applied roster forward only", async () => {
    await seedDraft();
    expect(await repo.getProductSync(PROFILE)).toBeNull();
    expect(await repo.recordRosterSync(PROFILE, { issuedAt: AT, eventId: "evt_1", at: NOW })).toBe(true);
    expect(await repo.recordRosterSync(PROFILE, { issuedAt: "2026-11-15T08:00:00.000Z", eventId: "evt_0", at: NOW })).toBe(false);
    expect(await repo.getProductSync(PROFILE)).toEqual({ rosterIssuedAt: AT, rosterEventId: "evt_1", syncedAt: NOW });
    expect(await repo.recordRosterSync(PROFILE, { issuedAt: "2026-11-15T09:30:00.000Z", eventId: "evt_2", at: "2026-11-15T09:31:00.000Z" })).toBe(true);
    expect(await repo.getProductSync(PROFILE)).toMatchObject({ rosterEventId: "evt_2", syncedAt: "2026-11-15T09:31:00.000Z" });
  });
});

describe("SC-4 — deploys, per environment", () => {
  const deploy = (deployedAt: string, over: Partial<{ url: string | null; version: string | null; runRef: string }> = {}) => ({
    environment: "production" as const,
    url: null,
    version: "v1.4.0",
    runRef: `run_${deployedAt.slice(11, 13)}`,
    deployedAt,
    ...over,
  });

  it("newer deployedAt wins, a late older one only moves the first deploy earlier, and the sync time moves", async () => {
    await seedDraft();
    expect(await repo.upsertProductDeploy(PROFILE, deploy("2026-11-15T09:00:00.000Z"), NOW)).toBe(true);
    expect(await repo.upsertProductDeploy(PROFILE, deploy("2026-11-15T10:00:00.000Z", { version: "v1.5.0", url: "https://acme.app/" }), NOW)).toBe(true);
    // Late: older than the row. Nothing about the row changes but the first day.
    expect(await repo.upsertProductDeploy(PROFILE, deploy("2026-11-02T08:00:00.000Z", { version: "v0.9.0" }), "2026-11-15T12:00:00.000Z")).toBe(false);
    // The same delivery again writes the same values.
    expect(await repo.upsertProductDeploy(PROFILE, deploy("2026-11-15T10:00:00.000Z", { version: "v1.5.0", url: "https://acme.app/" }), NOW)).toBe(true);
    await repo.upsertProductDeploy(PROFILE, { ...deploy("2026-11-15T07:00:00.000Z"), environment: "stage", version: null }, NOW);
    expect(await repo.listProductDeploys(PROFILE)).toEqual([
      { environment: "stage", url: null, version: null, runRef: "run_07", deployedAt: "2026-11-15T07:00:00.000Z", firstDeployedAt: "2026-11-15T07:00:00.000Z" },
      {
        environment: "production",
        url: "https://acme.app/",
        version: "v1.5.0",
        runRef: "run_10",
        deployedAt: "2026-11-15T10:00:00.000Z",
        firstDeployedAt: "2026-11-02T08:00:00.000Z",
      },
    ]);
    expect(await repo.getProductSync(PROFILE)).toEqual({ rosterIssuedAt: null, rosterEventId: null, syncedAt: "2026-11-15T12:00:00.000Z" });
  });

  it("the schema refuses an address that is not https and an unknown environment", async () => {
    await seedDraft();
    await expect(repo.upsertProductDeploy(PROFILE, deploy(AT, { url: "http://acme.app/" }), NOW)).rejects.toThrow();
    await expect(repo.upsertProductDeploy(PROFILE, { ...deploy(AT), environment: "preview" as never }, NOW)).rejects.toThrow();
  });

  it("leaves with the listing", async () => {
    await seedDraft();
    await repo.upsertProductDeploy(PROFILE, deploy(AT), NOW);
    await repo.recordRosterSync(PROFILE, { issuedAt: AT, eventId: "evt_1", at: NOW });
    await db.exec(`DELETE FROM openproduct.profiles WHERE id = '${PROFILE}'`);
    const left = await sql.execute<{ n: number }>(
      `SELECT (SELECT count(*) FROM openproduct.product_deploys) + (SELECT count(*) FROM openproduct.product_syncs) AS n`,
    );
    expect(Number(left.rows[0]!.n)).toBe(0);
  });
});

/** The draft above, published, so a public read can be asked of it. */
async function seedPublishedOver() {
  await repo.recordRepoObservation(PROFILE, { repoVisibility: "public", repoLicence: "Apache-2.0", observedAt: NOW });
  await repo.reviewProfile(PROFILE, "usr_fedcba9876543210fedcba9876543210", NOW);
  await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, { allowWithoutReview: false, indexable: true });
}
