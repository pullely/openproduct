// Synced from Orunbase on the page (openproduct-stages-crew SC-4, design §3;
// boards `Product`, `Stage`, `PhoneStage`).
//
// What is pinned: the crew-only Orunbase card at the top of the right rail
// (in sync and when, the crew, the two deploys, Manage on Orunbase — and NO
// Sync now button), arriving after load and never in the cached page; its
// route reads core through the crew's door and adds where Manage on Orunbase
// goes; the stage form pre-fills from what Orunbase synced, says so in green,
// and says "Changed by you · Orunbase has …" with Use synced once the crew
// changed a field; Where it runs says "Deployed by Orun" for a synced link
// and shows the stage deploy's version. The fixture gateway answers the card
// with exactly the contract's keys. The lane is module-level, so the
// components are pinned from source.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CREW_API,
  ORUNBASE_SYNC_KEYS,
  SYNCED_DEPLOY_KEYS,
  type OrunbaseCard,
  type OrunbaseSync,
  type WhereItRuns,
} from "@openproduct/contracts";

import { orunbaseRows, orunbaseSyncLine, showsOrunbaseCard } from "@openproduct-web/app/[slug]/maker/orunbase-model";
import { initialStageValues, syncStateOf, syncedValuesOf, withSynced } from "@openproduct-web/app/[slug]/maker/stage-form";
import { DEPLOYED_BY_ORUN, liveAction, setByLine, whereItRunsRows, type StageStart } from "@openproduct-web/app/[slug]/where-it-runs";
import { handleOrunbaseRead, type CrewCall } from "@openproduct-web/app/posts/crew-handler";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const NOW = Date.parse("2026-11-15T12:00:00.000Z");
const SYNC: OrunbaseSync = {
  linked: true,
  syncedAt: "2026-11-15T11:58:00.000Z",
  crew: 12,
  stage: { url: "https://stage.acme.app/", version: "v1.5.0-rc1", runRef: "01JD00000000000000STAGE001", deployedAt: "2026-11-15T09:00:00.000Z", firstDeployedAt: "2026-11-01T09:00:00.000Z" },
  production: null,
  workspaceRef: "org_9",
};

describe("the Orunbase card's words (board `Product`)", () => {
  it("in sync and when; Crew · N people, Stage · version · time, Production · No deploy yet", () => {
    const card: OrunbaseCard = { ...SYNC, manageUrl: "https://console.test/view/org_9?from=openproduct" };
    expect(orunbaseSyncLine(card, NOW)).toBe("In sync · 2m ago");
    expect(orunbaseRows(card, NOW)).toEqual([
      { key: "crew", label: "Crew", value: "12 people" },
      { key: "stage", label: "Stage", value: "v1.5.0-rc1 · 3h ago" },
      { key: "production", label: "Production", value: "No deploy yet" },
    ]);
    expect(orunbaseSyncLine({ syncedAt: null }, NOW)).toBe("Waiting for the first sync");
  });

  it("draws only for a listing linked to an Orunbase project", () => {
    expect(showsOrunbaseCard({ ...SYNC, manageUrl: null })).toBe(true);
    expect(showsOrunbaseCard({ ...SYNC, linked: false, manageUrl: null })).toBe(false);
    expect(showsOrunbaseCard(null)).toBe(false);
  });
});

describe("the card on the page: the crew's own, after load, at the top of the right rail", () => {
  const card = code("[slug]/maker/orunbase-card.tsx");
  const page = code("[slug]/product-page.tsx");

  it("reads the crew's route once the overlay says crew, and draws the board's rows and Manage on Orunbase", () => {
    expect(card).toContain('crewRead<OrunbaseCardData>(slug, "orunbase")');
    expect(card).toContain("const visible = crew !== null && mode === \"manage\";");
    expect(card).toContain("{orunbaseSyncLine(card, now)}");
    expect(card).toContain("orunbaseRows(card, now).map(");
    expect(card).toContain("{MANAGE_ON_ORUNBASE}");
    expect(card).toContain("href={card.manageUrl}");
  });

  it("has no Sync now button (design §3.5): nothing to pull, and a pull would need a platform credential", () => {
    expect(card).not.toMatch(/Sync now|<button/);
  });

  it("is the first thing in each right rail, inside a reserved slot, and nothing of it is in the server render", () => {
    expect(page.match(/<aside className=\{BOARD_STACK\}>\s*(?:\{\}\s*)?<MakerSlot name="orunbase">\s*<OrunbaseCard slug=\{slug\} \/>\s*<\/MakerSlot>/g)).toHaveLength(2);
    // The gate asks useMaker before anything is fetched.
    expect(code("[slug]/maker/lazy.tsx")).toMatch(/export function OrunbaseCard[\s\S]*?if \(crew === null\) return null;[\s\S]*?if \(mode !== "manage"\) return null;/);
    expect(page).not.toMatch(/In sync|Manage on Orunbase|No deploy yet/);
  });
});

describe("GET /{slug}/manage/orunbase goes through core and says where Manage on Orunbase goes", () => {
  function gateway(answer: { status?: number; body: unknown }) {
    const calls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const parsed = new URL(String(url));
      calls.push(parsed.pathname);
      const said =
        parsed.pathname === "/v1/openproduct/me/overlay"
          ? { body: { data: { overlay: { crew: [{ slug: "ackstack", org: "org_9", profile: "opp_9", role: "member" }] } } } }
          : parsed.pathname === CREW_API.orunbase("org_9", "opp_9")
            ? answer
            : { status: 404, body: { error: { code: "not_found", message: "Not found" } } };
      return new Response(JSON.stringify(said.body), { status: said.status ?? 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return { calls, fetchImpl };
  }
  const call = (over: Partial<CrewCall> & { fetchImpl: typeof fetch }): CrewCall => ({ slug: "ackstack", token: "tok", fields: {}, json: true, ...over });

  it("answers core's card with the console's workspace door (the S12 landing)", async () => {
    const g = gateway({ body: { data: SYNC } });
    const answer = await handleOrunbaseRead(call({ fetchImpl: g.fetchImpl }), "https://console.test/");
    expect(answer).toEqual({
      kind: "json",
      status: 200,
      body: { data: { ...SYNC, manageUrl: "https://console.test/view/org_9?from=openproduct" } },
    });
    expect(g.calls.at(-1)).toBe("/v1/organizations/org_9/openproduct/profiles/opp_9/orunbase");
  });

  it("no workspace, no door; signed out, a 401 and nothing asked", async () => {
    const g = gateway({ body: { data: { ...SYNC, linked: false, workspaceRef: null } } });
    expect(await handleOrunbaseRead(call({ fetchImpl: g.fetchImpl }), "")).toMatchObject({ body: { data: { manageUrl: null } } });
    const none = gateway({ body: {} });
    expect(await handleOrunbaseRead(call({ fetchImpl: none.fetchImpl, token: null }))).toEqual({ kind: "json", status: 401, body: null });
    expect(none.calls).toEqual([]);
  });
});

describe("the stage form: synced values, and a crew edit that wins until Use synced (boards `Stage`, `PhoneStage`)", () => {
  const start: StageStart = { stage: "building", repoUrl: "https://github.com/acme/app", tryUrl: null, whereItRuns: { stage: null, production: null } };
  const sync: OrunbaseSync = {
    ...SYNC,
    production: { url: null, version: "v1.4.0", runRef: "01JD0000000000000000000000", deployedAt: "2026-11-14T09:05:00.000Z", firstDeployedAt: "2026-11-02T09:05:00.000Z" },
  };
  const synced = syncedValuesOf(sync);
  const now = new Date(NOW);

  it("pre-fills each empty field a deploy can fill, and never touches what the crew has", () => {
    expect(synced).toEqual({ stageUrl: "https://stage.acme.app/", liveSince: "2026-11-02", version: "v1.4.0" });
    expect(initialStageValues(start, synced)).toMatchObject({ stageUrl: "https://stage.acme.app/", liveSince: "2026-11-02", version: "v1.4.0", productionUrl: "" });
    const typed = { ...initialStageValues(start), version: "1.0.0" };
    expect(withSynced(typed, synced)).toMatchObject({ stageUrl: "https://stage.acme.app/", version: "1.0.0", liveSince: "2026-11-02" });
  });

  it("green while a field holds the synced value; amber with Use synced once the crew changed it", () => {
    expect(syncStateOf("stageUrl", "https://stage.acme.app", synced, sync, now)).toEqual({
      kind: "synced",
      text: "Synced from Orunbase · stage deploy STAGE001 · 3h ago",
      synced: "https://stage.acme.app/",
    });
    expect(syncStateOf("version", "1.0.0", synced, sync, now)).toEqual({ kind: "changed", text: "Changed by you · Orunbase has v1.4.0", synced: "v1.4.0" });
    expect(syncStateOf("liveSince", "2026-11-02", synced, sync, now)).toMatchObject({ kind: "synced", text: "Synced from the first production deploy" });
    // Nothing synced, nothing said: no production link, a field no deploy fills, no sync read.
    expect(syncStateOf("productionUrl", "https://acme.app", synced, sync, now)).toBeNull();
    expect(syncStateOf("tryWhat", "Send a policy", synced, sync, now)).toBeNull();
    expect(syncStateOf("version", "1.0.0", {}, null, now)).toBeNull();
  });

  it("the popup asks for the sync on open and draws the line, Use synced putting the synced value back", () => {
    const dialog = code("[slug]/maker/stage-dialog.tsx");
    expect(dialog).toContain('crewRead<OrunbaseSync>(slug, "orunbase")');
    expect(dialog).toContain("setValues((current) => withSynced(current, syncedValuesOf(result.data)));");
    expect(dialog).toContain("sync={syncStateOf(field.name, values[field.name] ?? \"\", synced, sync, now)}");
    expect(dialog).toContain("onUseSynced={() => onChange(sync.synced)}");
    expect(dialog).toContain('sync.kind === "synced" ? "text-success" : "text-amber-ink"');
    expect(dialog).toContain("{USE_SYNCED}");
  });
});

describe("Where it runs says who set a link: a person, or Orun", () => {
  const synced: WhereItRuns = {
    stage: { url: "https://stage.acme.app/", note: null, version: "v1.5.0-rc1", source: { url: "synced" }, setBy: { kind: "orun", name: null, handle: null }, at: "2026-11-15T09:00:00.000Z" },
    production: null,
  };

  it("Deployed by Orun for a synced link, Link set by … for a person's", () => {
    expect(DEPLOYED_BY_ORUN).toBe("Deployed by Orun");
    expect(setByLine({ kind: "orun", name: null, handle: null }, "2026-11-15T09:00:00.000Z")).toBe("Deployed by Orun · Nov 15, 2026");
    expect(setByLine({ kind: "crew", name: "Ada", handle: null }, null)).toBe("Link set by Ada");
    expect(whereItRunsRows(synced)[0]).toMatchObject({ meta: "v1.5.0-rc1 · Deployed by Orun · Nov 15, 2026" });
  });

  it("Try it goes to the synced stage link when the crew set none", () => {
    expect(liveAction({ stage: "stage", tryUrl: null, whereItRuns: synced })).toEqual({ label: "Try it", href: "https://stage.acme.app/" });
  });
});

describe("the fixture gateway answers the card with exactly the contract's keys", () => {
  const FIXTURE_PATH = "../../web-perf/src/fixture.mjs";
  let gateway: { url: string; close(): Promise<void> };
  let fixture: { startGateway(): Promise<{ url: string; close(): Promise<void> }>; CREW_ORG: string; CREW_PROFILE: string };

  beforeAll(async () => {
    fixture = (await import(FIXTURE_PATH)) as typeof fixture;
    gateway = await fixture.startGateway();
  });
  afterAll(async () => {
    await gateway.close();
  });

  it("GET …/orunbase for the walker's product", async () => {
    const res = await fetch(`${gateway.url}${CREW_API.orunbase(fixture.CREW_ORG, fixture.CREW_PROFILE)}`, { headers: { authorization: "Bearer tok_walk" } });
    expect(res.status).toBe(200);
    const data = ((await res.json()) as { data: OrunbaseSync }).data;
    expect(Object.keys(data).sort()).toEqual([...ORUNBASE_SYNC_KEYS]);
    expect(Object.keys(data.stage!).sort()).toEqual([...SYNCED_DEPLOY_KEYS]);
    expect(data.production).toBeNull();
  });
});
