// The demand signal, on the wire (openproduct-commons CB2 / OPC-F).
//
// THE DEANONYMISATION WALK-THROUGH, ATTEMPTED AND FAILED — which the plan's
// done-when asks to be recorded rather than assumed.
//
// The attack: a maintainer posts one opening. One person offers. The page
// renders "1 waiting on a decision" (the mock's own string) beside a recent
// activity feed showing one new arrival. A reader joins the two and now knows
// who applied for a job — a fact that person told nobody but us.
//
// Three things have to be true for it to fail, and each is tested here:
//
//   1. the exact number below three NEVER CROSSES THE SEAM — not in a field
//      the page ignores, not in one it renders differently;
//   2. one waiting and two waiting are INDISTINGUISHABLE in the response;
//   3. the count is never joined to the activity stream.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PUBLIC_ROLE_OPENING_KEYS } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { PublicHandlerDeps } from "@openproduct-worker/handlers/public";

const OPENING = "77777777-7777-4777-8777-777777777777";
const APPLICANT = "usr_0123456789abcdef0123456789abcdef";
const NOW = Date.parse("2026-09-01T09:00:00.000Z");
const OPENED = "2026-06-01T09:00:00.000Z";
const URL_ = "https://openproduct.internal/internal/public/openproduct/projects/acme-thing";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function deps(pending: number, openedAt = OPENED): PublicHandlerDeps {
  const repo = {
    async getPublicProfile() {
      return {
        id: "55555555-5555-4555-8555-555555555555",
        slug: "acme-thing",
        tagline: "A thing",
        stack: [],
        stackCanonical: [],
        components: null,
        moderationState: "visible" as const,
        moderatedAt: null,
        moderationActId: null,
        publishedAt: OPENED,
        updatedAt: OPENED,
        indexable: true,
      } as unknown as Awaited<ReturnType<OpenproductRepository["getPublicProfile"]>>;
    },
    // MD2 — the media rows; none on these fixtures.
    async listPublicMedia() {
      return [];
    },
    async listPublicMaintainers() {
      return [];
    },
    // PP1 — the follower count the profile now carries (WC2-7: a number, never a list).
    async countFollowers() {
      return new Map<string, number>();
    },
    async latestSnapshotBefore() {
      return null;
    },
    async listPublicRoleOpenings() {
      return [
        {
          id: OPENING,
          title: "Someone who likes tests",
          description: null,
          commitment: null,
          status: "open" as const,
          joinLinkRef: "jl_abc",
        },
      ];
    },
    async latestMetrics() {
      return [];
    },
    async countOpeningDemand() {
      return [{ roleOpeningId: OPENING, pending, openedAt }];
    },
    // UV1 — the placement's two reads. Empty by default: a listing that has
    // never launched is the common case, and the ABSENT `launch` key is what
    // the pinned key set asserts.
    async listLaunchesForProfile() {
      return [];
    },
    async readBoardRanks() {
      return [];
    },
  } as unknown as OpenproductRepository;
  return { repo, now: () => new Date(NOW) } as unknown as PublicHandlerDeps;
}

async function openingOf(pending: number, openedAt = OPENED) {
  const res = await route(new Request(URL_), env(), undefined, deps(pending, openedAt));
  const body = (await res.json()) as {
    data: { profile: { roleOpenings: Array<Record<string, unknown>> } };
  };
  return body.data.profile.roleOpenings[0]!;
}

describe("the walk-through: attempted, and failed", () => {
  it("never puts an exact count below three anywhere in the response", async () => {
    // Not in a field the page ignores, not in one it renders differently.
    // The response IS the surface — anybody can open the network tab.
    for (const pending of [1, 2]) {
      const opening = await openingOf(pending);
      const json = JSON.stringify(opening);
      expect(json).not.toContain(`"pending":${pending}`);
      expect(opening.demand).toEqual({ kind: "few" });
    }
  });

  it("makes one waiting and two waiting BYTE-IDENTICAL", async () => {
    // The whole attack is arithmetic on a small set. If the two answers
    // differ at all — a field, a word, a length — the arithmetic is back.
    const one = JSON.stringify(await openingOf(1));
    const two = JSON.stringify(await openingOf(2));
    expect(one).toBe(two);
  });

  it("gives an exact number only at three and above", async () => {
    expect((await openingOf(3)).demand).toEqual({ kind: "counted", pending: 3 });
    expect((await openingOf(9)).demand).toEqual({ kind: "counted", pending: 9 });
  });

  it("says nothing at all about a brand new empty opening", async () => {
    // OPC-C: absence is not zero, and a new listing announcing its own
    // emptiness is a listing arguing against itself.
    const fresh = await openingOf(0, new Date(NOW - 3 * 86_400_000).toISOString());
    expect(fresh.demand).toEqual({ kind: "none" });
  });

  it("carries no applicant identity, and no timestamp to join against", async () => {
    const opening = await openingOf(5);
    const json = JSON.stringify(opening);
    expect(json).not.toContain(APPLICANT);
    // No `appliedAt`, no `since`: a moment is joinable against an activity
    // feed even when the count is not.
    expect(json).not.toContain("appliedAt");
    expect(json).not.toContain("openedAt");
  });

  it("carries exactly the pinned key set (I2)", async () => {
    const opening = await openingOf(4);
    expect(Object.keys(opening).sort()).toEqual([...PUBLIC_ROLE_OPENING_KEYS].sort());
  });
});

describe("the count is never joined to the activity stream", () => {
  it("does not read activity_events in the demand query", () => {
    // The join IS the attack, so the join does not exist anywhere it could be
    // made by somebody adding a column. Asserted against the SQL itself.
    const here = dirname(fileURLToPath(import.meta.url));
    const repo = readFileSync(
      resolve(here, "../../../packages/db/src/repository.ts"),
      "utf-8",
    );
    const start = repo.indexOf("async countOpeningDemand(");
    expect(start).toBeGreaterThan(-1);
    const body = repo.slice(start, repo.indexOf("\n    },", start));
    expect(body).not.toContain("activity_events");
    expect(body).not.toContain("listActivity");
  });
});
