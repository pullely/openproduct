import { describe, expect, it } from "vitest";

import {
  CREW_API,
  CREW_ROLES,
  CREW_ROLE_CAN,
  CREW_ROLE_LABELS,
  CREW_ROLE_PLURALS,
  CREW_ROLE_REFUSALS,
  CREW_SAVE_MAX,
  crewChangeOrder,
  crewCursor,
  crewOffsetOf,
  crewQueryString,
  crewSummaryLine,
  crewTotalLine,
  isCrewRole,
  readCrewChanges,
  readCrewQuery,
} from "./crew-roles.js";
import { OVERLAY_CREW_KEYS } from "./product-posts.js";

describe("crew roles (SC-3)", () => {
  it("three roles, highest first, each with its words (boards Crew, PhoneCrew)", () => {
    expect(CREW_ROLES).toEqual(["lead", "maintainer", "member"]);
    expect(CREW_ROLE_LABELS).toEqual({ lead: "Lead", maintainer: "Maintainer", member: "Member" });
    expect(CREW_ROLE_PLURALS).toEqual({ lead: "Leads", maintainer: "Maintainers", member: "Members" });
    expect(CREW_ROLE_CAN.lead).toBe("Everything, and decides who does what");
    expect(CREW_ROLE_CAN.member).toBe("On the crew, reads private threads");
    expect(isCrewRole("owner")).toBe(false);
    expect(isCrewRole("lead")).toBe(true);
  });

  it("the overlay's crew entry carries the role", () => {
    expect(OVERLAY_CREW_KEYS).toEqual(["org", "profile", "role", "slug"]);
  });

  it("says the counts the board's way, singular when one", () => {
    expect(crewSummaryLine({ lead: 3, maintainer: 12, member: 113 })).toBe("3 leads · 12 maintainers · 113 members");
    expect(crewSummaryLine({ lead: 1, maintainer: 1, member: 0 })).toBe("1 lead · 1 maintainer · 0 members");
    expect(crewTotalLine(128)).toBe("128 on the crew");
  });

  it("reads a query: search trimmed and bounded, an unknown role no filter, a bad cursor the first page", () => {
    expect(readCrewQuery(new URLSearchParams("q=%20ada%20&role=maintainer&cursor=o30"))).toEqual({ q: "ada", role: "maintainer", offset: 30 });
    expect(readCrewQuery(new URLSearchParams("q=&role=owner&cursor=30"))).toEqual({ q: null, role: null, offset: 0 });
    expect(readCrewQuery(new URLSearchParams(`q=${"x".repeat(200)}`)).q).toHaveLength(80);
    expect(crewOffsetOf(crewCursor(60))).toBe(60);
    expect(crewOffsetOf("o-1")).toBe(0);
    expect(crewQueryString({ q: " ada ", role: "lead", cursor: "o30" })).toBe("?q=ada&role=lead&cursor=o30");
    expect(crewQueryString({})).toBe("");
  });

  it("reads a save: every change a subject and a role, nobody twice, at most 100", () => {
    expect(readCrewChanges([{ subjectId: "usr_a", role: "lead" }])).toEqual({ ok: true, changes: [{ subjectId: "usr_a", role: "lead" }] });
    expect(readCrewChanges([])).toMatchObject({ ok: false });
    expect(readCrewChanges("x")).toMatchObject({ ok: false });
    expect(readCrewChanges([{ subjectId: "usr_a", role: "owner" }])).toEqual({ ok: false, fields: { "changes.usr_a": [CREW_ROLE_REFUSALS.role] } });
    expect(readCrewChanges([{ subjectId: "usr a", role: "lead" }])).toMatchObject({ ok: false, fields: { changes: expect.any(Array) } });
    expect(
      readCrewChanges([
        { subjectId: "usr_a", role: "lead" },
        { subjectId: "usr_a", role: "member" },
      ]),
    ).toEqual({ ok: false, fields: { "changes.usr_a": [CREW_ROLE_REFUSALS.duplicate] } });
    const many = Array.from({ length: CREW_SAVE_MAX + 1 }, (_, i) => ({ subjectId: `usr_${i}`, role: "member" }));
    expect(readCrewChanges(many)).toEqual({ ok: false, fields: { changes: [CREW_ROLE_REFUSALS.too_many] } });
  });

  it("applies whoever becomes a Lead first, keeping the rest in order", () => {
    expect(
      crewChangeOrder([
        { subjectId: "a", role: "maintainer" as const },
        { subjectId: "b", role: "lead" as const },
        { subjectId: "c", role: "member" as const },
      ]).map((c) => c.subjectId),
    ).toEqual(["b", "a", "c"]);
  });

  it("addresses the crew routes at the gateway", () => {
    expect(CREW_API.crew("org_1", "opp_1")).toBe("/v1/organizations/org_1/openproduct/profiles/opp_1/crew");
    expect(CREW_API.member("org_1", "opp_1", "usr_a")).toBe("/v1/organizations/org_1/openproduct/profiles/opp_1/crew/usr_a");
  });
});
