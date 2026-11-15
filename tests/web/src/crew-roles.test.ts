// Crew roles on the page (openproduct-stages-crew SC-3, design §2; boards
// `Crew`, `PhoneCrew`, `Product`).
//
// What is pinned: the page offers a Member no write (core refuses them
// anyway) and the Manage switch only to the crew who write; the crew tab
// keeps the consent roster for everybody and adds the roles card (the
// counts, the leads, Edit crew for a Lead) for the crew after load; the
// popup's rules (filters with the whole crew's counts, "Show more · n left",
// "Save n changes", a changed row, a refusal beside its row); the popup is a
// dialog that behaves like one, full screen with a role chooser on a phone;
// and the route reads and saves through core with one request per save.
// The lane is module-level, so the components are pinned from source.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CREW_API, CREW_NAMELESS, type OverlayCrew } from "@openproduct/contracts";

import {
  CREW_NONE_MATCH,
  EDIT_CREW_TITLE,
  crewChanges,
  crewErrorsBySubject,
  crewFilters,
  crewPersonName,
  saveCrewLabel,
  showMoreLabel,
  shownRole,
} from "@openproduct-web/app/[slug]/maker/crew-model";
import { isManaging } from "@openproduct-web/app/[slug]/maker/gate";
import { handleCrewRead, handleCrewSave, type CrewCall } from "@openproduct-web/app/posts/crew-handler";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const crew = (role: OverlayCrew["role"]): OverlayCrew => ({ slug: "ackstack", org: "org_1", profile: "opp_1", role });

describe("the page offers each role what core allows it", () => {
  it("a Lead and a Maintainer manage; a Member never does, on either setting", () => {
    expect(isManaging(crew("lead"), "manage")).toBe(true);
    expect(isManaging(crew("maintainer"), "manage")).toBe(true);
    expect(isManaging(crew("member"), "manage")).toBe(false);
    expect(isManaging(crew("lead"), "visitor")).toBe(false);
    expect(isManaging(null, "manage")).toBe(false);
  });

  it("the gate says who writes and who leads, from the overlay's role", () => {
    const gate = code("[slug]/maker/use-maker.ts");
    expect(gate).toContain("writes: crewRoleWrites(crew?.role),");
    expect(gate).toContain("leads: crewRoleLeads(crew?.role),");
  });
});

describe("the crew tab: the consent roster for everybody, the roles for the crew", () => {
  const page = code("[slug]/product-page.tsx");

  it("the public card says how many are on it, and is the same for everybody", () => {
    expect(page).toContain('<CardHead id="crew-heading" title={`On the crew · ${profile.maintainers.length}`} />');
    // The roles are not in the cached page: no role word, no count of roles.
    expect(page).not.toMatch(/Edit crew|crewSummaryLine|maintainers ·/);
  });

  it("the roles card comes last in the column, after the seats, so nothing under it moves", () => {
    expect(page).toMatch(/<OpenSeatsCard slug=\{slug\} openRoles=\{openRoles\} always \/>\s*(?:\{\}\s*)?<CrewRoles slug=\{slug\} \/>/);
  });

  it("draws the avatar stack, N on the crew, the counts and the leads; Edit crew a Lead's, opening the popup", () => {
    const card = code("[slug]/maker/crew-roles.tsx");
    expect(card).toContain('crewRead<CrewList>(slug, "crew")');
    expect(card).toContain("{crewTotalLine(list.total)}");
    expect(card).toContain("{crewSummaryLine(list.counts)}");
    expect(card).toContain("list.people.slice(0, 6)");
    expect(card).toContain('list.people.filter((person) => person.role === "lead")');
    expect(card).toContain('aria-haspopup="dialog"');
    expect(card).toContain("{leads ? (");
    expect(card).toContain("{EDIT_CREW_TITLE}");
    expect(EDIT_CREW_TITLE).toBe("Edit crew");
  });
});

describe("the popup's rules", () => {
  it("filters All · Leads · Maintainers · Members with the whole crew's counts", () => {
    expect(crewFilters({ lead: 3, maintainer: 12, member: 113 })).toEqual([
      { key: "all", label: "All", count: 128 },
      { key: "lead", label: "Leads", count: 3 },
      { key: "maintainer", label: "Maintainers", count: 12 },
      { key: "member", label: "Members", count: 113 },
    ]);
  });

  it("a save sends only the roles that differ from what each person holds", () => {
    const held = new Map([
      ["usr_a", "member" as const],
      ["usr_b", "maintainer" as const],
      ["usr_c", "lead" as const],
    ]);
    const draft = new Map([
      ["usr_a", "maintainer" as const],
      ["usr_b", "maintainer" as const],
      ["usr_unknown", "lead" as const],
    ]);
    expect(crewChanges(draft, held)).toEqual([{ subjectId: "usr_a", role: "maintainer" }]);
    expect(shownRole({ subjectId: "usr_a", role: "member" }, draft)).toBe("maintainer");
    expect(shownRole({ subjectId: "usr_c", role: "lead" }, draft)).toBe("lead");
  });

  it("says the board's words", () => {
    expect([saveCrewLabel(0), saveCrewLabel(1), saveCrewLabel(3)]).toEqual(["Save", "Save 1 change", "Save 3 changes"]);
    expect(showMoreLabel(98)).toBe("Show more · 98 left");
    expect(CREW_NONE_MATCH).toBe("No one matches");
    expect(crewPersonName({ name: " Ada ", handle: "ada" })).toBe("Ada");
    expect(crewPersonName({ name: null, handle: "ada" })).toBe("@ada");
    expect(crewPersonName({ name: "", handle: null })).toBe(CREW_NAMELESS);
  });

  it("puts each refusal beside its row: core keys them changes.<subjectId>", () => {
    expect([...crewErrorsBySubject({ "changes.usr_a": ["Changed only on Orunbase"], changes: ["x"], role: ["y"] })]).toEqual([
      ["usr_a", "Changed only on Orunbase"],
    ]);
  });
});

describe("the popup is a dialog that behaves like one", () => {
  const dialog = code("[slug]/maker/crew-dialog.tsx");

  it("is named, modal, closed by Escape, ✕, Cancel and the scrim, and keeps and returns focus", () => {
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain("aria-labelledby={titleId}");
    expect(dialog).toContain('if (event.key === "Escape") {');
    expect(dialog).toContain('aria-label="Close"');
    expect(dialog).toMatch(/onClick=\{onClose\}[\s\S]*?Cancel/);
    expect(dialog).toContain("if (event.target === event.currentTarget) onClose();");
    expect(dialog).toContain("if (event.shiftKey && document.activeElement === head) {");
    expect(dialog).toContain("opener?.focus();");
    expect(dialog).toContain("createPortal(");
  });

  it("is centred over a scrim on a desktop and the whole screen on a phone, footer pinned", () => {
    expect(dialog).toContain("fixed inset-0 z-50 grid place-items-center bg-scrim/45");
    expect(dialog).toContain("max-sm:h-[100dvh]");
    expect(dialog).toContain("sticky bottom-0");
  });

  it("searches, filters, pages 30 at a time, and says Save n changes", () => {
    expect(dialog).toContain('type="search"');
    expect(dialog).toContain("{CREW_SEARCH_LABEL}");
    expect(dialog).toContain('crewQueryString({ q: query, role: filter === "all" ? null : filter, cursor })');
    expect(dialog).toContain("crewFilters(counts).map(");
    expect(dialog).toContain("aria-pressed={filter === option.key}");
    expect(dialog).toContain("{showMoreLabel(left)}");
    expect(dialog).toContain("onClick={() => void load(next)}");
    expect(dialog).toContain("{saveCrewLabel(changes.length)}");
    expect(dialog).toContain("disabled={busy || changes.length === 0}");
    expect(dialog).toContain('crewWrite<CrewRolesAnswer>(slug, "crew", { changes })');
  });

  it("each row: a role picker named for the person, a lock and Lead for a locked one, a changed row highlighted, a refusal beside it", () => {
    expect(dialog).toContain("aria-label={`Role for ${name}`}");
    expect(dialog).toContain("{person.locked ? (");
    expect(dialog).toContain("{CREW_ROLE_LABELS.lead}");
    expect(dialog).toContain("data-changed={changed || undefined}");
    expect(dialog).toContain('changed ? "bg-amber-soft text-endorse-ink" : "bg-well text-foreground"');
    expect(dialog).toMatch(/role="alert"[\s\S]*?\{error\}/);
  });

  it("on a phone a row opens the chooser: three roles, each with what it can do", () => {
    expect(dialog).toContain("max-sm:hidden");
    expect(dialog).toContain("sm:hidden");
    expect(dialog).toContain("onOpen={() => setChooser(person)}");
    expect(dialog).toContain('role="radiogroup"');
    expect(dialog).toContain("{CREW_ROLE_CAN[option]}");
  });
});

describe("GET and POST /{slug}/manage/crew go through core, one request each", () => {
  function gateway(answers: { list?: { status?: number; body: unknown }; save?: { status?: number; body: unknown } }) {
    const calls: Array<{ method: string; path: string; search: string; body: unknown }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const method = init?.method ?? "GET";
      calls.push({ method, path: parsed.pathname, search: parsed.search, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      const said =
        parsed.pathname === "/v1/openproduct/me/overlay"
          ? { body: { data: { overlay: { crew: [{ slug: "ackstack", org: "org_9", profile: "opp_9", role: "lead" }] } } } }
          : parsed.pathname === CREW_API.crew("org_9", "opp_9") && method === "GET"
            ? (answers.list ?? { body: {} })
            : parsed.pathname === CREW_API.crew("org_9", "opp_9") && method === "PUT"
              ? (answers.save ?? { body: {} })
              : { status: 404, body: { error: { code: "not_found", message: "Not found" } } };
      return new Response(JSON.stringify(said.body), { status: said.status ?? 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return { calls, fetchImpl };
  }
  const call = (over: Partial<CrewCall> & { fetchImpl: typeof fetch }): CrewCall => ({ slug: "ackstack", token: "tok", fields: {}, json: true, ...over });
  const LIST = { people: [], counts: { lead: 1, maintainer: 0, member: 0 }, total: 1, matching: 0, next: null };

  it("reads the list with the page's own query, bounded, and answers core's data", async () => {
    const g = gateway({ list: { body: { data: LIST } } });
    const answer = await handleCrewRead(call({ fetchImpl: g.fetchImpl, search: "?q=%20ada%20&role=member&cursor=o30&org=org_x" }));
    expect(answer).toEqual({ kind: "json", status: 200, body: { data: LIST } });
    expect(g.calls.at(-1)).toMatchObject({ method: "GET", path: "/v1/organizations/org_9/openproduct/profiles/opp_9/crew", search: "?q=ada&role=member&cursor=o30" });
  });

  it("saves every change in ONE request, and passes a refusal back with its rows", async () => {
    const ok = gateway({ save: { body: { data: { changed: [], counts: LIST.counts, refused: {} } } } });
    const changes = [
      { subjectId: "usr_a", role: "maintainer" },
      { subjectId: "usr_b", role: "lead" },
    ];
    expect(await handleCrewSave(call({ fetchImpl: ok.fetchImpl, fields: { changes } }))).toMatchObject({ kind: "json", status: 200 });
    expect(ok.calls.filter((c) => c.method === "PUT")).toEqual([
      { method: "PUT", path: "/v1/organizations/org_9/openproduct/profiles/opp_9/crew", search: "", body: { changes } },
    ]);

    const refused = gateway({
      save: { status: 409, body: { error: { code: "conflict", message: "No role was changed", details: { fields: { "changes.usr_a": ["Changed only on Orunbase"] } } } } },
    });
    expect(await handleCrewSave(call({ fetchImpl: refused.fetchImpl, fields: { changes: [changes[0]] } }))).toEqual({
      kind: "json",
      status: 409,
      body: { error: { code: "conflict", message: "No role was changed", fields: { "changes.usr_a": ["Changed only on Orunbase"] } } },
    });
  });

  it("refuses a malformed save before asking anybody, and a signed-out caller gets 401", async () => {
    const g = gateway({});
    expect(await handleCrewSave(call({ fetchImpl: g.fetchImpl, fields: { changes: [{ subjectId: "usr_a", role: "owner" }] } }))).toMatchObject({
      kind: "json",
      status: 422,
    });
    expect(await handleCrewSave(call({ fetchImpl: g.fetchImpl, token: null, fields: { changes: [] } }))).toEqual({ kind: "json", status: 401, body: null });
    expect(await handleCrewRead(call({ fetchImpl: g.fetchImpl, token: null }))).toEqual({ kind: "json", status: 401, body: null });
    expect(g.calls).toEqual([]);
  });
});
