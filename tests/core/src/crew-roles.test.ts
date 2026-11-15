// Crew roles (openproduct-stages-crew SC-3, design §2).
//
// Two things are pinned here: the ONE decision table, cell by cell (every
// role and the operator against every action), and the crew routes that
// read and change roles — Lead only, a locked row refused, the last Lead
// refused, the list paged, filtered and searched. The SQL behind
// `setCrewRole` and `listCrew` is pinned against a live engine in
// packages/db; the fake below keeps the same three refusals so the route's
// answers can be read here.

import {
  CREW_LIST_KEYS,
  CREW_PAGE_SIZE,
  CREW_PERSON_KEYS,
  CREW_ROLES,
  CREW_ROLE_REFUSALS,
  crewRoleLeads,
  crewRoleWrites,
  type CrewList,
  type CrewRole,
  type CrewRolesAnswer,
} from "@openproduct/contracts";
import type { CrewPageRecord, CrewRoleChange, ProfileRecord } from "@openproduct/db";
import { LISTING_ACTIONS, LISTING_DECISIONS, listingActionAllowed, type ListingAction } from "@openproduct-worker/authorize";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";

const ORG_UUID = "11111111-1111-4111-8111-111111111111";
const PROFILE_UUID = "55555555-5555-4555-8555-555555555555";
const ORG = `org_${ORG_UUID.replace(/-/g, "")}`;
const PROFILE = `opp_${PROFILE_UUID.replace(/-/g, "")}`;
const BASE = `https://openproduct.internal/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}/crew`;

const LEAD = "usr_000000000000000000000000000lead";
const MAINTAINER = "usr_0000000000000000000000000maint";
const MEMBER = "usr_000000000000000000000000member";
const ADMIN = "usr_000000000000000000000000admin0";
const STRANGER = "usr_00000000000000000000000strange";
const OPERATOR = "usr_000000000000000000000000oper00";

// ─── the decision table ────────────────────────────────────────────────────

describe("the decision table — every role, and the operator, against every action", () => {
  // Written out cell by cell, so a change to the table is a change to this.
  const EXPECTED: Record<ListingAction, Record<CrewRole | "operator" | "nobody", boolean>> = {
    read: { lead: true, maintainer: true, member: true, operator: true, nobody: false },
    write: { lead: true, maintainer: true, member: false, operator: false, nobody: false },
    read_crew: { lead: true, maintainer: true, member: true, operator: false, nobody: false },
    manage_crew: { lead: true, maintainer: false, member: false, operator: false, nobody: false },
    read_private: { lead: true, maintainer: true, member: true, operator: false, nobody: false },
    review: { lead: false, maintainer: false, member: false, operator: true, nobody: false },
  };

  it("names exactly these actions", () => {
    expect([...LISTING_ACTIONS].sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(Object.keys(LISTING_DECISIONS).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const action of Object.keys(EXPECTED) as ListingAction[]) {
    for (const role of CREW_ROLES) {
      it(`${action} × ${role} → ${EXPECTED[action][role]}`, () => {
        expect(listingActionAllowed(action, role, false)).toBe(EXPECTED[action][role]);
      });
    }
    it(`${action} × operator (on no crew) → ${EXPECTED[action].operator}`, () => {
      expect(listingActionAllowed(action, null, true)).toBe(EXPECTED[action].operator);
    });
    it(`${action} × nobody → false`, () => {
      expect(listingActionAllowed(action, null, false)).toBe(false);
    });
  }

  it("an operator on a crew holds the role's actions and the operator's, never fewer", () => {
    for (const action of LISTING_ACTIONS) {
      for (const role of CREW_ROLES) {
        expect([action, role, listingActionAllowed(action, role, true)]).toEqual([
          action,
          role,
          EXPECTED[action][role] || EXPECTED[action].operator,
        ]);
      }
    }
  });

  it("denies by default: OX4's owner, an unknown role and an unknown action", () => {
    for (const action of LISTING_ACTIONS) {
      expect(listingActionAllowed(action, "owner" as never, false)).toBe(false);
      expect(listingActionAllowed(action, "admin" as never, false)).toBe(false);
    }
    expect(listingActionAllowed("publish" as never, "lead", true)).toBe(false);
    expect(listingActionAllowed("toString" as never, "lead", true)).toBe(false);
  });

  it("the page's helpers draw what the table allows, for every role", () => {
    for (const role of CREW_ROLES) {
      expect([role, crewRoleWrites(role)]).toEqual([role, listingActionAllowed("write", role, false)]);
      expect([role, crewRoleLeads(role)]).toEqual([role, listingActionAllowed("manage_crew", role, false)]);
    }
    expect(crewRoleWrites(null)).toBe(false);
    expect(crewRoleLeads(null)).toBe(false);
  });
});

// ─── the crew routes ───────────────────────────────────────────────────────

interface Person {
  subjectId: string;
  role: CrewRole;
  locked: boolean;
  name: string | null;
}

function harness(extra: Person[] = []) {
  const people: Person[] = [
    { subjectId: ADMIN, role: "lead", locked: true, name: "Admin on Orunbase" },
    { subjectId: LEAD, role: "lead", locked: false, name: "Lena Lead" },
    { subjectId: MAINTAINER, role: "maintainer", locked: false, name: "Max Maintainer" },
    { subjectId: MEMBER, role: "member", locked: false, name: "Mia Member" },
    ...extra,
  ];
  const audits: Array<{ type: string; actorId: string; payload: Record<string, unknown> }> = [];
  const queries: Array<{ q: string | null; role: CrewRole | null; offset: number; limit: number }> = [];
  const profile = { id: PROFILE_UUID, orgId: ORG_UUID, slug: "acme-thing", visibility: "public" } as unknown as ProfileRecord;
  const rank = (role: CrewRole) => CREW_ROLES.indexOf(role);
  const repo = {
    async getProfileForOrg(orgId: string, profileId: string) {
      return orgId === ORG_UUID && profileId === PROFILE_UUID ? profile : null;
    },
    async getListingRole(_profileId: string, subjectId: string) {
      return people.find((p) => p.subjectId === subjectId)?.role ?? null;
    },
    async listCrew(_profileId: string, query: { q: string | null; role: CrewRole | null; offset: number; limit: number }): Promise<CrewPageRecord> {
      queries.push(query);
      const needle = query.q?.toLowerCase() ?? null;
      const matching = people
        .filter((p) => (query.role === null || p.role === query.role) && (needle === null || (p.name ?? "").toLowerCase().includes(needle)))
        .sort((a, b) => rank(a.role) - rank(b.role) || (a.name ?? "").localeCompare(b.name ?? ""));
      const page = matching.slice(query.offset, query.offset + query.limit);
      const counts = { lead: 0, maintainer: 0, member: 0 };
      for (const p of people) counts[p.role] += 1;
      return {
        people: page.map((p) => ({ subjectId: p.subjectId, role: p.role, source: "creator", locked: p.locked, displayName: p.name, handle: null, addedAt: "2026-11-01T00:00:00.000Z" })),
        counts,
        matching: matching.length,
        nextOffset: query.offset + page.length < matching.length ? query.offset + page.length : null,
      };
    },
    async setCrewRole(_profileId: string, subjectId: string, role: CrewRole): Promise<CrewRoleChange> {
      const person = people.find((p) => p.subjectId === subjectId);
      if (!person) return { outcome: "absent" };
      if (person.role === role) return { outcome: "unchanged", from: role, to: role };
      if (person.locked) return { outcome: "locked" };
      if (person.role === "lead" && !people.some((p) => p !== person && p.role === "lead")) return { outcome: "last_lead" };
      const from = person.role;
      person.role = role;
      return { outcome: "changed", from, to: role };
    },
    async appendAudit(input: { type: string; actorId: string; payload: Record<string, unknown> }) {
      audits.push(input);
    },
  };
  return { deps: { repo } as never, people, audits, queries };
}

const env = (over: Partial<Env> = {}) => ({ ENVIRONMENT: "test", ...over }) as Env;

async function call<T>(h: ReturnType<typeof harness>, method: string, url: string, actor: string | null, body?: unknown, e = env()) {
  const headers: Record<string, string> = { "x-request-id": "req_sc3" };
  if (actor) {
    headers["x-actor-subject-id"] = actor;
    headers["x-actor-subject-type"] = "user";
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await route(new Request(url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), e, h.deps);
  const json = (await res.json()) as { data?: T; error?: { code: string; message: string; details?: { fields?: Record<string, string[]> } } };
  return { status: res.status, data: json.data as T, error: json.error };
}

describe("GET …/crew — the crew's own list", () => {
  it("answers every role on the crew with the pinned keys, the whole crew's counts and a page cursor", async () => {
    for (const reader of [LEAD, MAINTAINER, MEMBER]) {
      const h = harness();
      const res = await call<CrewList>(h, "GET", BASE, reader);
      expect([reader, res.status]).toEqual([reader, 200]);
      expect(Object.keys(res.data).sort()).toEqual([...CREW_LIST_KEYS]);
      expect(Object.keys(res.data.people[0]!).sort()).toEqual([...CREW_PERSON_KEYS]);
      expect(res.data.counts).toEqual({ lead: 2, maintainer: 1, member: 1 });
      expect(res.data.total).toBe(4);
      expect(res.data.people.map((p) => p.role)).toEqual(["lead", "lead", "maintainer", "member"]);
      expect(res.data.people.find((p) => p.subjectId === ADMIN)?.locked).toBe(true);
      expect(res.data.next).toBeNull();
    }
  });

  it("is 404 to somebody off the crew, to an operator, and on another workspace's address — one answer", async () => {
    const h = harness();
    const stranger = await call(h, "GET", BASE, STRANGER);
    const operator = await call(h, "GET", BASE, OPERATOR, undefined, env({ OPENPRODUCT_OPERATORS: OPERATOR } as never));
    const elsewhere = await call(h, "GET", BASE.replace(ORG, `org_${"2".repeat(32)}`), LEAD);
    expect([stranger.status, operator.status, elsewhere.status]).toEqual([404, 404, 404]);
    expect((await call(h, "GET", BASE, null)).status).toBe(401);
  });

  it("pages 30 at a time, filters by role and searches names; the counts never follow the search", async () => {
    const extra = Array.from({ length: 40 }, (_, i) => ({
      subjectId: `usr_${String(i).padStart(32, "0")}`,
      role: "member" as const,
      locked: false,
      name: `Seat ${String(i).padStart(2, "0")}`,
    }));
    const h = harness(extra);
    const first = await call<CrewList>(h, "GET", BASE, MEMBER);
    expect(first.data.people).toHaveLength(CREW_PAGE_SIZE);
    expect(first.data.matching).toBe(44);
    expect(first.data.next).toBe("o30");
    const second = await call<CrewList>(h, "GET", `${BASE}?cursor=${first.data.next}`, MEMBER);
    expect(second.data.people).toHaveLength(14);
    expect(second.data.next).toBeNull();

    const members = await call<CrewList>(h, "GET", `${BASE}?role=member`, LEAD);
    expect(members.data.matching).toBe(41);
    const found = await call<CrewList>(h, "GET", `${BASE}?q=${encodeURIComponent("  max ")}`, LEAD);
    expect(found.data.people.map((p) => p.subjectId)).toEqual([MAINTAINER]);
    expect(found.data.counts).toEqual({ lead: 2, maintainer: 1, member: 41 });
    // An unknown role is no filter, and a search is bounded before it is asked.
    await call(h, "GET", `${BASE}?role=owner&q=${"x".repeat(500)}`, LEAD);
    expect(h.queries.at(-1)).toMatchObject({ role: null, offset: 0, limit: CREW_PAGE_SIZE });
    expect(h.queries.at(-1)!.q).toHaveLength(80);
  });
});

describe("PUT …/crew/{subjectId} — one role, Lead only", () => {
  const one = (subjectId: string) => `${BASE}/${subjectId}`;

  it("a Lead changes a role, audited without the person's id", async () => {
    const h = harness();
    const res = await call<CrewRolesAnswer>(h, "PUT", one(MEMBER), LEAD, { role: "maintainer" });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ changed: [{ subjectId: MEMBER, from: "member", to: "maintainer" }], counts: { lead: 2, maintainer: 2, member: 0 }, refused: {} });
    expect(h.audits).toEqual([
      expect.objectContaining({ type: "openproduct.crew.role_changed", actorId: LEAD, payload: { slug: "acme-thing", from: "member", to: "maintainer" } }),
    ]);
    expect(JSON.stringify(h.audits)).not.toContain(MEMBER);
  });

  it("a Maintainer, a Member, an operator and a stranger are all 404, and nothing changes", async () => {
    for (const actor of [MAINTAINER, MEMBER, OPERATOR, STRANGER]) {
      const h = harness();
      const res = await call(h, "PUT", one(MEMBER), actor, { role: "lead" }, env({ OPENPRODUCT_OPERATORS: OPERATOR } as never));
      expect([actor, res.status]).toEqual([actor, 404]);
      expect(h.people.find((p) => p.subjectId === MEMBER)?.role).toBe("member");
      expect(h.audits).toEqual([]);
    }
  });

  it("refuses a locked Lead and the last Lead with 409 and the popup's words; an unknown role 422; somebody off the crew 404", async () => {
    const h = harness();
    const locked = await call(h, "PUT", one(ADMIN), LEAD, { role: "member" });
    expect([locked.status, locked.error?.details?.fields]).toEqual([409, { role: [CREW_ROLE_REFUSALS.locked] }]);

    // With no other Lead, LEAD cannot step down: nobody would be left to
    // change roles.
    const solo = harness();
    solo.people.splice(0, 1); // no Orunbase admin: LEAD is the only Lead
    const last = await call(solo, "PUT", one(LEAD), LEAD, { role: "member" });
    expect([last.status, last.error?.message]).toEqual([409, CREW_ROLE_REFUSALS.last_lead]);
    expect(solo.people.find((p) => p.subjectId === LEAD)?.role).toBe("lead");

    expect((await call(h, "PUT", one(MEMBER), LEAD, { role: "owner" })).status).toBe(422);
    expect((await call(h, "PUT", one(STRANGER), LEAD, { role: "member" })).status).toBe(404);
    expect((await call(h, "PUT", one("not%20an%20id"), LEAD, { role: "member" })).status).toBe(404);
    expect(h.audits).toEqual([]);
  });

  it("the same role again is a 200 that changes and audits nothing", async () => {
    const h = harness();
    const res = await call<CrewRolesAnswer>(h, "PUT", one(MAINTAINER), LEAD, { role: "maintainer" });
    expect([res.status, res.data.changed, h.audits]).toEqual([200, [], []]);
  });
});

describe("PUT …/crew — one save from Edit crew", () => {
  it("applies promotions to Lead first, so a Lead can hand over in one save", async () => {
    const h = harness();
    h.people.splice(0, 1); // LEAD is the only Lead
    const res = await call<CrewRolesAnswer>(h, "PUT", BASE, LEAD, {
      changes: [
        { subjectId: LEAD, role: "maintainer" },
        { subjectId: MEMBER, role: "lead" },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data.changed).toEqual([
      { subjectId: MEMBER, from: "member", to: "lead" },
      { subjectId: LEAD, from: "lead", to: "maintainer" },
    ]);
    expect(res.data.refused).toEqual({});
    expect(h.audits).toHaveLength(2);
  });

  it("a refused change is said beside its person; the others stand", async () => {
    const h = harness();
    const res = await call<CrewRolesAnswer>(h, "PUT", BASE, LEAD, {
      changes: [
        { subjectId: ADMIN, role: "member" },
        { subjectId: MAINTAINER, role: "member" },
        { subjectId: STRANGER, role: "member" },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data.changed).toEqual([{ subjectId: MAINTAINER, from: "maintainer", to: "member" }]);
    expect(res.data.refused).toEqual({
      [`changes.${ADMIN}`]: [CREW_ROLE_REFUSALS.locked],
      [`changes.${STRANGER}`]: [CREW_ROLE_REFUSALS.absent],
    });
    expect(res.data.counts).toEqual({ lead: 2, maintainer: 0, member: 2 });
  });

  it("409 when nothing stood; 422 for a malformed save; 404 for anybody but a Lead", async () => {
    const h = harness();
    const none = await call(h, "PUT", BASE, LEAD, { changes: [{ subjectId: ADMIN, role: "member" }] });
    expect([none.status, none.error?.details?.fields]).toEqual([409, { [`changes.${ADMIN}`]: [CREW_ROLE_REFUSALS.locked] }]);
    for (const body of [{}, { changes: [] }, { changes: [{ subjectId: MEMBER, role: "owner" }] }, { changes: [{ subjectId: MEMBER, role: "lead" }, { subjectId: MEMBER, role: "member" }] }, { changes: Array.from({ length: 101 }, (_, i) => ({ subjectId: `usr_${i}`, role: "member" })) }]) {
      expect((await call(h, "PUT", BASE, LEAD, body)).status).toBe(422);
    }
    for (const actor of [MAINTAINER, MEMBER, STRANGER]) {
      expect((await call(h, "PUT", BASE, actor, { changes: [{ subjectId: MEMBER, role: "lead" }] })).status).toBe(404);
    }
    expect(h.audits).toEqual([]);
  });
});
