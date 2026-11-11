// The two-sided roster, routed (openproduct-commons CG3).
//
// The permission TABLE is tested in packages/contracts; the SQL in
// packages/db. What is pinned here is that the routes ask the table and
// nothing else — and, above all, that no route publishes a name its owner
// did not publish (OPC-5).

import { PENDING_SUBJECT_NOTE, ROSTER_MEMBER_KEYS } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { RosterHandlerDeps } from "@openproduct-worker/handlers/roster";

const BASE = "https://openproduct.internal";
const OWNER = "usr_0000000000000000000000000000own0";
const ADA = "usr_0000000000000000000000000000ada0";
const BOB = "usr_0000000000000000000000000000bob0";
const PROFILE = "55555555-5555-4555-8555-555555555555";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(path: string, method = "GET", actor: string | null = OWNER, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      "x-request-id": "req_cg3",
      "content-type": "application/json",
      ...(actor ? { "x-actor-subject-id": actor, "x-actor-subject-type": "user" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

interface Edge {
  state: "pending" | "confirmed" | "retired";
  origin: "confirmed_by_subject" | "grandfathered";
  roleLabel: string | null;
}

interface Harness {
  deps: RosterHandlerDeps;
  edges: Map<string, Edge>;
  /** Which subjects the maintainer's publication list holds. */
  published: Set<string>;
  visibility: { current: "public" | "private" };
}

function harness(): Harness {
  const edges = new Map<string, Edge>();
  const published = new Set<string>([ADA, BOB]);
  const visibility: Harness["visibility"] = { current: "public" };

  const repo = {
    async getPublicProfileId(slug: string) {
      return slug === "acme-thing" && visibility.current === "public" ? PROFILE : null;
    },
    async getProfileIdBySlug(slug: string) {
      return slug === "acme-thing" ? PROFILE : null;
    },
    // OX4's authority table: the owner maintains, nobody else does.
    async getListingRole(_profileId: string, subjectId: string) {
      return subjectId === OWNER ? "owner" : null;
    },
    async getRosterEdge(_profileId: string, subjectId: string) {
      const edge = edges.get(subjectId);
      return edge ? { profileId: PROFILE, subjectId, ...edge } : null;
    },
    async inviteToRoster(input: { subjectId: string; roleLabel: string | null }) {
      const existing = edges.get(input.subjectId);
      if (existing && existing.state !== "retired") return { ...existing, subjectId: input.subjectId };
      const edge: Edge = { state: "pending", origin: "confirmed_by_subject", roleLabel: input.roleLabel };
      edges.set(input.subjectId, edge);
      return { ...edge, subjectId: input.subjectId };
    },
    async confirmRosterEdge(_profileId: string, subjectId: string) {
      const edge = edges.get(subjectId);
      if (!edge || edge.state !== "pending") return null;
      edge.state = "confirmed";
      edge.origin = "confirmed_by_subject";
      return { ...edge, subjectId };
    },
    async declineRosterEdge(_profileId: string, subjectId: string) {
      const edge = edges.get(subjectId);
      if (!edge || edge.state !== "pending") return false;
      edges.delete(subjectId);
      return true;
    },
    async retireRosterEdge(_profileId: string, subjectId: string) {
      const edge = edges.get(subjectId);
      if (!edge || edge.state === "retired") return null;
      edge.state = "retired";
      return { ...edge, subjectId };
    },
    async listRoster() {
      // The real query filters in SQL; the fake mirrors the reconciliation so
      // a handler that tried to widen it would fail here.
      return [...edges.entries()]
        .filter(([subjectId, edge]) => edge.state === "confirmed" && published.has(subjectId))
        .map(([subjectId, edge]) => ({
          subjectId,
          roleLabel: edge.roleLabel,
          handle: null,
          displayName: null,
          since: "2026-08-17T12:00:00.000Z",
        }));
    },
    async listRosterForSubject(subjectId: string) {
      const edge = edges.get(subjectId);
      return {
        confirmed:
          edge?.state === "confirmed"
            ? [{ slug: "acme-thing", tagline: null, roleLabel: edge.roleLabel, since: "2026-08-17T12:00:00.000Z" }]
            : [],
        invitations:
          edge?.state === "pending"
            ? [{ slug: "acme-thing", tagline: null, roleLabel: edge.roleLabel, invitedAt: "2026-08-17T12:00:00.000Z" }]
            : [],
        grandfathered: edge?.origin === "grandfathered" && edge.state === "confirmed" ? ["acme-thing"] : [],
      };
    },
  } as unknown as OpenproductRepository;

  return { deps: { repo } as RosterHandlerDeps, edges, published, visibility };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

const LISTING = "/internal/openproduct/listings/acme-thing/people";
const PUBLIC = "/internal/public/openproduct/projects/acme-thing/people";
const ME = "/internal/openproduct/me/roster";

describe("no route publishes a name its owner did not publish (OPC-5)", () => {
  it("a pending edge never reaches the public roster", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    expect(h.edges.get(ADA)!.state).toBe("pending");

    const public_ = await json(await route(req(PUBLIC), env(), h.deps as never));
    expect(public_.roster).toEqual([]);
  });

  it("confirming is what publishes them, and only they can do it", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);

    // The maintainer tries to confirm on Ada's behalf. This is the single
    // most important refusal in the milestone: if it succeeded, the edge
    // would mean nothing.
    const forged = await route(
      req("/internal/openproduct/me/roster/acme-thing/confirm", "POST", OWNER),
      env(),
      h.deps as never,
    );
    // The owner has no edge of their own, so there is nothing for them to
    // confirm — and Ada's is untouched.
    expect(forged.status).toBe(403);
    expect(h.edges.get(ADA)!.state).toBe("pending");

    const answered = await route(
      req("/internal/openproduct/me/roster/acme-thing/confirm", "POST", ADA),
      env(),
      h.deps as never,
    );
    expect(answered.status).toBe(200);
    expect(h.edges.get(ADA)!.state).toBe("confirmed");
    const public_ = (await json(await route(req(PUBLIC), env(), h.deps as never))).roster as Array<
      Record<string, unknown>
    >;
    expect(public_.map((r) => r.subjectId)).toEqual([ADA]);
  });

  it("the public roster carries EXACTLY the pinned key set", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    await route(req("/internal/openproduct/me/roster/acme-thing/confirm", "POST", ADA), env(), h.deps as never);
    const roster = (await json(await route(req(PUBLIC), env(), h.deps as never))).roster as Array<
      Record<string, unknown>
    >;
    // On this surface a silent widening is a disclosure about a person.
    expect(Object.keys(roster[0]!).sort()).toEqual([...ROSTER_MEMBER_KEYS]);
  });

  it("a draft's roster is not public", async () => {
    const h = harness();
    h.visibility.current = "private";
    const res = await route(req(PUBLIC), env(), h.deps as never);
    // Unknown and unpublished answer identically.
    expect(res.status).toBe(404);
    expect(
      (await route(req("/internal/public/openproduct/projects/nope/people"), env(), h.deps as never))
        .status,
    ).toBe(404);
  });

  it("the public roster resolves no actor", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    await route(req("/internal/openproduct/me/roster/acme-thing/confirm", "POST", ADA), env(), h.deps as never);
    const anonymous = await route(req(PUBLIC, "GET", null), env(), h.deps as never);
    const withActor = await route(req(PUBLIC, "GET", ADA), env(), h.deps as never);
    expect(anonymous.status).toBe(200);
    expect(await anonymous.text()).toBe(await withActor.text());
  });
});

describe("only a maintainer may name somebody", () => {
  it("refuses a stranger", async () => {
    const h = harness();
    const res = await route(req(LISTING, "POST", BOB, { subjectId: ADA }), env(), h.deps as never);
    expect(res.status).toBe(403);
    expect(h.edges.size).toBe(0);
  });

  it("refuses somebody adding THEMSELVES", async () => {
    // The mirror of the problem this table fixes, arrow reversed.
    const h = harness();
    const res = await route(req(LISTING, "POST", ADA, { subjectId: ADA }), env(), h.deps as never);
    expect(res.status).toBe(403);
  });

  it("validates the subject id and the label before touching the repository", async () => {
    const h = harness();
    for (const body of [{}, { subjectId: "nope" }, { subjectId: 42 }]) {
      expect((await route(req(LISTING, "POST", OWNER, body), env(), h.deps as never)).status).toBe(422);
    }
    const long = { subjectId: ADA, roleLabel: "x".repeat(81) };
    expect((await route(req(LISTING, "POST", OWNER, long), env(), h.deps as never)).status).toBe(422);
    expect(h.edges.size).toBe(0);
  });

  it("cannot re-invite somebody who already confirmed", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    await route(req("/internal/openproduct/me/roster/acme-thing/confirm", "POST", ADA), env(), h.deps as never);

    // `invite` requires the edge to be ABSENT, so this is refused — which is
    // the stronger version of the property that matters: a maintainer cannot
    // silently un-publish somebody who agreed, because they cannot reach the
    // invitation path at all.
    //
    // Editing a role LABEL is a different act on a different table: the
    // publication list is the maintainer's own and needs nobody's consent.
    const again = await route(
      req(LISTING, "POST", OWNER, { subjectId: ADA, roleLabel: "new" }),
      env(),
      h.deps as never,
    );
    expect(again.status).toBe(403);
    expect(h.edges.get(ADA)!.state).toBe("confirmed");
    // And they are still on the public roster throughout.
    const roster = (await json(await route(req(PUBLIC), env(), h.deps as never))).roster as unknown[];
    expect(roster).toHaveLength(1);
  });

  it("cannot re-invite somebody whose invitation is still pending", async () => {
    // Re-sending would reset `invited_at` and make an old, ignored invitation
    // look new — which is how a maintainer nags somebody who has already
    // decided not to answer.
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    const again = await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    expect(again.status).toBe(403);
  });

  it("CAN invite somebody back after they retired", async () => {
    // Leaving is not a ban. Asking somebody back is a new invitation they
    // get to answer again, and the public sees nothing until they do.
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    await route(req("/internal/openproduct/me/roster/acme-thing/confirm", "POST", ADA), env(), h.deps as never);
    await route(req("/internal/openproduct/me/roster/acme-thing/leave", "POST", ADA), env(), h.deps as never);

    const back = await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    expect(back.status).toBe(200);
    expect((await json(back)).invitation).toEqual({ state: "pending" });
    expect((await json(await route(req(PUBLIC), env(), h.deps as never))).roster).toEqual([]);
  });
});

describe("the named person answers, and either side can end it", () => {
  it("declining removes the edge entirely", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    const res = await route(
      req("/internal/openproduct/me/roster/acme-thing/decline", "POST", ADA),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(200);
    expect(h.edges.has(ADA)).toBe(false);
  });

  it("a maintainer cannot decline for somebody", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    const res = await route(
      req(`${LISTING}/${ADA}`, "POST", OWNER),
      env(),
      h.deps as never,
    );
    // There is no decline door for a maintainer at all — the only thing they
    // may do to somebody else's edge is retire it, and that is a DELETE.
    expect(res.status).toBe(405);
    expect(h.edges.get(ADA)!.state).toBe("pending");
  });

  it("the person can leave, without asking", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    await route(req("/internal/openproduct/me/roster/acme-thing/confirm", "POST", ADA), env(), h.deps as never);
    const res = await route(
      req("/internal/openproduct/me/roster/acme-thing/leave", "POST", ADA),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(200);
    expect(h.edges.get(ADA)!.state).toBe("retired");
    expect((await json(await route(req(PUBLIC), env(), h.deps as never))).roster).toEqual([]);
  });

  it("the maintainer can end it, without asking", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    await route(req("/internal/openproduct/me/roster/acme-thing/confirm", "POST", ADA), env(), h.deps as never);
    const res = await route(req(`${LISTING}/${ADA}`, "DELETE", OWNER), env(), h.deps as never);
    expect(res.status).toBe(200);
    expect(h.edges.get(ADA)!.state).toBe("retired");
  });

  it("a stranger can end nothing", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    const res = await route(req(`${LISTING}/${ADA}`, "DELETE", BOB), env(), h.deps as never);
    expect(res.status).toBe(403);
    expect(h.edges.get(ADA)!.state).toBe("pending");
  });

  it("refuses every act anonymously, before the route is even matched", async () => {
    const h = harness();
    for (const [path, method] of [
      [LISTING, "POST"],
      [`${LISTING}/${ADA}`, "DELETE"],
      [ME, "GET"],
      ["/internal/openproduct/me/roster/acme-thing/confirm", "POST"],
    ] as const) {
      const res = await route(req(path, method, null), env(), h.deps as never);
      expect([path, res.status]).toEqual([path, 401]);
    }
  });
});

describe("the named person's own view", () => {
  it("shows what they are on and what they have been asked", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    const pending = (await json(await route(req(ME, "GET", ADA), env(), h.deps as never)))
      .roster as Record<string, unknown>;
    expect((pending.invitations as unknown[]).length).toBe(1);
    expect(pending.confirmed).toEqual([]);

    await route(req("/internal/openproduct/me/roster/acme-thing/confirm", "POST", ADA), env(), h.deps as never);
    const confirmed = (await json(await route(req(ME, "GET", ADA), env(), h.deps as never)))
      .roster as Record<string, unknown>;
    expect((confirmed.confirmed as unknown[]).length).toBe(1);
    expect(confirmed.invitations).toEqual([]);
  });

  it("NAMES the grandfathered listings rather than counting them (OPC-G)", async () => {
    const h = harness();
    h.edges.set(ADA, { state: "confirmed", origin: "grandfathered", roleLabel: null });
    const view = (await json(await route(req(ME, "GET", ADA), env(), h.deps as never)))
      .roster as Record<string, unknown>;
    // A person told "3 of your listings were carried over" cannot act on it,
    // and acting on it is the whole point.
    expect(view.grandfathered).toEqual(["acme-thing"]);
  });

  it("shows only THEIR OWN edges", async () => {
    const h = harness();
    await route(req(LISTING, "POST", OWNER, { subjectId: ADA }), env(), h.deps as never);
    const bobsView = (await json(await route(req(ME, "GET", BOB), env(), h.deps as never)))
      .roster as Record<string, unknown>;
    // Somebody else's pending invitation is not Bob's business — and a view
    // that leaked it would make `/me` an oracle for who has been asked what.
    expect(bobsView.invitations).toEqual([]);
    expect(bobsView.confirmed).toEqual([]);
  });

  it("the copy tells them exactly what confirming does", () => {
    expect(PENDING_SUBJECT_NOTE).toMatch(/only if you confirm/);
  });
});
