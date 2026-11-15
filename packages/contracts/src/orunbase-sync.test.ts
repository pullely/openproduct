import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CREW_ROLE_OF_ACCESS,
  NO_DEPLOY_YET,
  PROJECT_DEPLOY_KEYS,
  PROJECT_ROSTER_KEYS,
  PROJECT_ROSTER_MEMBER_KEYS,
  changedFieldLine,
  crewCountLine,
  deployLine,
  inSyncLine,
  readProjectDeploy,
  readProjectRoster,
  shortRunRef,
  syncedFieldLine,
  syncedStageValues,
  type SyncedDeploy,
} from "./orunbase-sync.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../seam-fixtures");
const fixture = (name: string) => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf-8")) as { data: Record<string, unknown> };

const ago = (iso: string) => `ago(${iso.slice(0, 10)})`;

describe("S14 — the fixtures read, key for key", () => {
  it("project.roster: exactly the card's keys, and it reads whole", () => {
    const { data } = fixture("project.roster.json");
    expect(Object.keys(data).sort()).toEqual([...PROJECT_ROSTER_KEYS]);
    for (const member of data.members as Record<string, unknown>[]) {
      expect(Object.keys(member).sort()).toEqual([...PROJECT_ROSTER_MEMBER_KEYS]);
    }
    const read = readProjectRoster(data);
    expect(read).toEqual({
      ok: true,
      value: {
        orgId: "org_11111111111141118111111111111111",
        projectId: "prj_33333333333343338333333333333333",
        members: [{ subjectId: "usr_0123456789abcdef0123456789abcdef", displayName: "Ada Lovelace", access: "admin" }],
        issuedAt: "2026-11-15T09:00:00.000Z",
      },
    });
  });

  it("project.deploy: exactly the card's keys, and it reads whole", () => {
    const { data } = fixture("project.deploy.json");
    expect(Object.keys(data).sort()).toEqual([...PROJECT_DEPLOY_KEYS]);
    expect(readProjectDeploy(data)).toEqual({
      ok: true,
      value: {
        orgId: "org_11111111111141118111111111111111",
        projectId: "prj_33333333333343338333333333333333",
        environment: "production",
        url: null,
        version: "v1.4.0",
        runRef: "01JD0000000000000000000000",
        deployedAt: "2026-11-15T09:05:00.000Z",
      },
    });
  });
});

describe("reading a roster", () => {
  const base = { orgId: "org_1", projectId: "prj_1", issuedAt: "2026-11-15T09:00:00.000Z" };

  it("refuses the whole snapshot when one person is unreadable — applying it would remove them", () => {
    const read = readProjectRoster({
      ...base,
      members: [
        { subjectId: "usr_a", displayName: null, access: "viewer" },
        { subjectId: "usr_b", displayName: null, access: "owner" },
        { subjectId: "../x", displayName: null, access: "viewer" },
      ],
    });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(Object.keys(read.fields).sort()).toEqual(["members.1.access", "members.2.subjectId"]);
  });

  it("trims and bounds a name, and an empty one is no name", () => {
    const read = readProjectRoster({
      ...base,
      members: [
        { subjectId: "usr_a", displayName: `  ${"n".repeat(200)}  `, access: "builder" },
        { subjectId: "usr_b", displayName: "   ", access: "viewer" },
      ],
    });
    expect(read.ok && read.value.members.map((m) => m.displayName?.length ?? null)).toEqual([120, null]);
  });

  it("an empty list READS (the receiver decides to ignore it); missing fields do not", () => {
    expect(readProjectRoster({ ...base, members: [] }).ok).toBe(true);
    const read = readProjectRoster({ members: [] });
    expect(read.ok ? [] : Object.keys(read.fields).sort()).toEqual(["issuedAt", "orgId", "projectId"]);
  });

  it("the starting role of each access (design §3.2)", () => {
    expect(CREW_ROLE_OF_ACCESS).toEqual({ admin: "lead", builder: "maintainer", viewer: "member" });
  });
});

describe("reading a deploy", () => {
  const base = { orgId: "org_1", projectId: "prj_1", environment: "stage", runRef: "run_1", deployedAt: "2026-11-15T09:05:00Z" };

  it("keeps an https address and drops anything else, without refusing the deploy", () => {
    expect(readProjectDeploy({ ...base, url: "https://stage.acme.app/", version: null })).toMatchObject({ ok: true, value: { url: "https://stage.acme.app/" } });
    expect(readProjectDeploy({ ...base, url: "http://stage.acme.app/", version: null })).toMatchObject({ ok: true, value: { url: null } });
    expect(readProjectDeploy({ ...base, url: "javascript:alert(1)", version: "x".repeat(41) })).toMatchObject({ ok: true, value: { url: null, version: null } });
  });

  it("refuses an unknown environment or a missing run", () => {
    const read = readProjectDeploy({ ...base, environment: "preview", runRef: "" });
    expect(read.ok ? [] : Object.keys(read.fields).sort()).toEqual(["environment", "runRef"]);
  });
});

describe("the card's and the form's words", () => {
  const deploy: SyncedDeploy = {
    url: null,
    version: "v1.4.0",
    runRef: "01JD0000000000000000ABCDEF",
    deployedAt: "2026-11-15T09:05:00.000Z",
    firstDeployedAt: "2026-11-02T09:05:00.000Z",
  };

  it("the Orunbase card's rows", () => {
    expect(inSyncLine("2026-11-15T09:00:00.000Z", ago)).toBe("In sync · ago(2026-11-15)");
    expect(inSyncLine(null, ago)).toBe("Waiting for the first sync");
    expect(crewCountLine(1)).toBe("1 person");
    expect(crewCountLine(12)).toBe("12 people");
    expect(deployLine(deploy, ago)).toBe("v1.4.0 · ago(2026-11-15)");
    expect(deployLine({ ...deploy, version: null }, ago)).toBe("ago(2026-11-15)");
    expect(deployLine(null, ago)).toBe(NO_DEPLOY_YET);
  });

  it("what a deploy fills in the stage form, and the lines under each field", () => {
    const sync = { stage: { ...deploy, url: "https://stage.acme.app/" }, production: deploy };
    expect(syncedStageValues(sync)).toEqual({ stageUrl: "https://stage.acme.app/", liveSince: "2026-11-02", version: "v1.4.0" });
    expect(syncedStageValues(null)).toEqual({});
    expect(shortRunRef(deploy.runRef)).toBe("00ABCDEF");
    expect(syncedFieldLine("stageUrl", sync, ago)).toBe("Synced from Orunbase · stage deploy 00ABCDEF · ago(2026-11-15)");
    expect(syncedFieldLine("liveSince", sync, ago)).toBe("Synced from the first production deploy");
    expect(syncedFieldLine("version", sync, ago)).toBe("Synced from the last deploy");
    expect(changedFieldLine("v1.4.0")).toBe("Changed by you · Orunbase has v1.4.0");
  });
});
