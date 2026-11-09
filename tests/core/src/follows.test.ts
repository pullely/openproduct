// The follow act (openproduct-launch FL0).
//
// The KEYS and the COPY are tested in packages/contracts. What is pinned here
// is the handler and its route:
//
//   - the target is RESOLVED, and every refusal is the same 404
//   - a handle goes in and a subject id goes to the table, never the reverse
//   - following twice is following once; unfollowing nothing is not an error
//   - nobody follows themselves, and the refusal says so
//   - the answer carries the count it just moved, and never a follower list

import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { FollowsHandlerDeps } from "@openproduct-worker/handlers/follows";

const BASE = "https://openproduct.internal/internal/openproduct/me/follows";
const ME = "usr_0000000000000000000000000000ada0";
const BOB = "usr_0000000000000000000000000000bob0";
const DEV = "dev-tools";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(path: string, method = "PUT"): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      "x-request-id": "req_fl0",
      "x-actor-subject-id": ME,
      "x-actor-subject-type": "user",
    },
  });
}

interface Row {
  subjectId: string;
  kind: string;
  target: string;
}

interface Harness {
  deps: FollowsHandlerDeps;
  rows: Row[];
  /** Every target `countFollowers` was asked about, so a test can see that a
   *  follower LIST was never requested — there is no read to request one. */
  counted: Array<[string, string[]]>;
}

function harness(options?: { topics?: string[]; handles?: Record<string, string>; listings?: string[] }): Harness {
  const rows: Row[] = [];
  const counted: Array<[string, string[]]> = [];
  const topics = options?.topics ?? [DEV];
  const handles = options?.handles ?? { bob: BOB };
  const repo = {
    async follow(subjectId: string, kind: string, target: string) {
      if (kind === "person" && target === subjectId) return false;
      if (!rows.some((r) => r.subjectId === subjectId && r.kind === kind && r.target === target)) {
        rows.push({ subjectId, kind, target });
      }
      return true;
    },
    async unfollow(subjectId: string, kind: string, target: string) {
      const at = rows.findIndex(
        (r) => r.subjectId === subjectId && r.kind === kind && r.target === target,
      );
      if (at < 0) return false;
      rows.splice(at, 1);
      return true;
    },
    async countFollowers(kind: string, targets: readonly string[]) {
      counted.push([kind, [...targets]]);
      const out = new Map<string, number>();
      for (const target of targets) {
        out.set(target, rows.filter((r) => r.kind === kind && r.target === target).length);
      }
      return out;
    },
    async listFollowed(subjectId: string, targets: readonly { kind: string; target: string }[]) {
      return targets.filter((t) =>
        rows.some((r) => r.subjectId === subjectId && r.kind === t.kind && r.target === t.target),
      );
    },
    async listPublicCards() {
      return topics.map((category) => ({ slug: `p-${category}`, category }));
    },
    async getPublicContributor(handle: string) {
      return handles[handle] ? { handle } : null;
    },
    async getHandle(handle: string) {
      return handles[handle] ? { handle, subjectId: handles[handle] } : null;
    },
    // PP1 — a listing resolves by slug while it is public.
    async getPublicProfileId(slug: string) {
      return (options?.listings ?? ["acme-thing"]).includes(slug) ? `id-${slug}` : null;
    },
  } as unknown as OpenproductRepository;
  return { deps: { repo } as FollowsHandlerDeps, rows, counted };
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: { follow: Record<string, unknown> } }).data.follow;
}

describe("the target is resolved, never trusted", () => {
  it("follows a topic some live listing has chosen", async () => {
    const h = harness();
    const res = await route(req(`/topic/${DEV}`), env(), h.deps as never);
    expect(res.status).toBe(200);
    expect(h.rows).toEqual([{ subjectId: ME, kind: "topic", target: DEV }]);
  });

  it("404s a topic the VOCABULARY knows but nobody has chosen", async () => {
    // The same gate TP0's page applies, so a topic you can follow is a topic
    // you can open.
    const h = harness({ topics: [DEV] });
    expect((await route(req("/topic/data"), env(), h.deps as never)).status).toBe(404);
    expect(h.rows).toEqual([]);
  });

  it("404s a value the vocabulary has never heard of", async () => {
    const h = harness();
    expect((await route(req("/topic/not-a-facet"), env(), h.deps as never)).status).toBe(404);
  });

  it("404s an unknown kind and a malformed value identically", async () => {
    const h = harness();
    for (const path of ["/product/acme", `/topic/Dev-Tools`, "/person/-bad"]) {
      expect([path, (await route(req(path), env(), h.deps as never)).status]).toEqual([path, 404]);
    }
  });

  it("404s a handle with no public profile — the same answer as no handle", async () => {
    // A caller must not be able to tell "no such handle" from "that person has
    // no public page"; answering them differently would make this an existence
    // oracle.
    const h = harness({ handles: { bob: BOB } });
    expect((await route(req("/person/nobody"), env(), h.deps as never)).status).toBe(404);
  });
});

describe("a handle on the wire, a subject id in the table", () => {
  it("stores the SUBJECT and answers with the HANDLE", async () => {
    const h = harness();
    const data = await body(await route(req("/person/bob"), env(), h.deps as never));
    expect(h.rows).toEqual([{ subjectId: ME, kind: "person", target: BOB }]);
    // The internal identifier never goes back out.
    expect(data.value).toBe("bob");
    expect(JSON.stringify(data)).not.toContain(BOB);
  });
});

describe("the act", () => {
  it("is idempotent — following twice is following once", async () => {
    const h = harness();
    await route(req(`/topic/${DEV}`), env(), h.deps as never);
    const second = await route(req(`/topic/${DEV}`), env(), h.deps as never);
    expect(second.status).toBe(200);
    expect(h.rows).toHaveLength(1);
    expect(await body(second)).toMatchObject({ following: true, followers: 1 });
  });

  it("unfollows, and unfollowing nothing is the state you asked for", async () => {
    // A refusal here would make a double-click look like an error (the unsave
    // rule, kept).
    const h = harness();
    await route(req(`/topic/${DEV}`), env(), h.deps as never);
    expect((await route(req(`/topic/${DEV}`, "DELETE"), env(), h.deps as never)).status).toBe(200);
    const again = await route(req(`/topic/${DEV}`, "DELETE"), env(), h.deps as never);
    expect(again.status).toBe(200);
    expect(await body(again)).toMatchObject({ following: false, followers: 0 });
  });

  it("refuses a SELF-follow, and says so rather than failing silently", async () => {
    // A maker opening their own page finds the button there, so this is a
    // request a person can honestly make.
    const h = harness({ handles: { me: ME } });
    const res = await route(req("/person/me"), env(), h.deps as never);
    expect(res.status).toBe(409);
    expect(h.rows).toEqual([]);
  });

  it("refuses anything but PUT and DELETE", async () => {
    const h = harness();
    expect((await route(req(`/topic/${DEV}`, "POST"), env(), h.deps as never)).status).toBe(405);
  });
});

describe("the answer", () => {
  it("carries the count it just moved, so the control needs no second read", async () => {
    const h = harness();
    const data = await body(await route(req(`/topic/${DEV}`), env(), h.deps as never));
    expect(data).toEqual({ kind: "topic", value: DEV, following: true, followers: 1 });
  });

  it("never carries a follower LIST — there is no read that could produce one", async () => {
    const h = harness();
    const data = await body(await route(req(`/topic/${DEV}`), env(), h.deps as never));
    // The shape is a number, not an array, and the only follower read the
    // handler makes is a count.
    expect(typeof data.followers).toBe("number");
    expect(h.counted.every(([, targets]) => targets.length <= 1)).toBe(true);
    expect(Object.values(data).some((v) => Array.isArray(v))).toBe(false);
  });
});

describe("PP1 — a listing is a target", () => {
  it("follows a public listing by its slug, stores the slug, and carries the count", async () => {
    const h = harness();
    const res = await route(req("/listing/acme-thing"), env(), h.deps as never);
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ kind: "listing", value: "acme-thing", following: true, followers: 1 });
    expect(h.rows).toEqual([{ subjectId: ME, kind: "listing", target: "acme-thing" }]);
  });

  it("404s a slug that is not public — the same answer as no listing (OD5)", async () => {
    const h = harness({ listings: [] });
    const res = await route(req("/listing/nobody-home"), env(), h.deps as never);
    expect(res.status).toBe(404);
    expect(h.rows).toEqual([]);
  });

  it("unfollows a listing, and the count moves with it", async () => {
    const h = harness();
    await route(req("/listing/acme-thing"), env(), h.deps as never);
    const res = await route(req("/listing/acme-thing", "DELETE"), env(), h.deps as never);
    expect(await body(res)).toEqual({ kind: "listing", value: "acme-thing", following: false, followers: 0 });
  });
});
