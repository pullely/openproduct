// The forum index (openproduct-worldclass-v2 FO1): public, anonymous, two
// published orders, six categories, and a refusal for anything else.
import { FORUM_THREAD_KEYS } from "@openproduct/contracts";

import type { Env } from "../../../core/src/env";
import { route } from "../../../core/src/router";

const PATH = "https://openproduct.internal/internal/public/openproduct/threads";

function env(): Env {
  return { ENVIRONMENT: "stage" } as Env;
}

function harness() {
  const asked: Array<{ tag: string | null; order: string; limit: number }> = [];
  const repo = {
    async listForumThreads(input: { tag: string | null; order: string; limit: number }) {
      asked.push(input);
      return [
        {
          id: "t1",
          tag: "question",
          title: "How do I run this?",
          state: "open",
          authorSubjectId: "usr_secret",
          authorHandle: "ada",
          authorName: "Ada",
          createdAt: "2026-09-10T01:00:00.000Z",
          lastPostAt: "2026-09-10T02:00:00.000Z",
          postCount: 3,
          profileId: "p1",
          answerPostId: null,
          slug: "acme-thing",
        },
      ];
    },
  };
  return { deps: { repo } as never, asked };
}

const get = (qs = "") => new Request(`${PATH}${qs}`, { method: "GET", headers: { "x-request-id": "req_fo1" } });

describe("the forum index", () => {
  it("answers the latest by default, with every row projected to the public shape plus the slug", async () => {
    const h = harness();
    const res = await route(get(), env(), undefined, h.deps);
    expect(res.status).toBe(200);
    const data = ((await res.json()) as { data: Record<string, unknown> }).data;
    expect(data.order).toBe("latest");
    expect(data.tag).toBeNull();
    expect(data.formula).toBe("threads.latest");
    expect(h.asked).toEqual([{ tag: null, order: "latest", limit: 50 }]);
    const rows = data.threads as Array<Record<string, unknown>>;
    expect(Object.keys(rows[0]!).sort()).toEqual([...FORUM_THREAD_KEYS].sort());
    // I3 — the subject id never reaches the wire.
    expect(JSON.stringify(data)).not.toContain("usr_secret");
  });

  it("passes the order and the tag through, and names the order's formula", async () => {
    const h = harness();
    const res = await route(get("?order=replied&tag=question"), env(), undefined, h.deps);
    const data = ((await res.json()) as { data: Record<string, unknown> }).data;
    expect(data.order).toBe("replied");
    expect(data.tag).toBe("question");
    expect(data.formula).toBe("threads.most-replied");
    expect(h.asked).toEqual([{ tag: "question", order: "replied", limit: 50 }]);
  });

  it("REFUSES an unknown order or tag rather than coercing it", async () => {
    const h = harness();
    expect((await route(get("?order=hot"), env(), undefined, h.deps)).status).toBe(400);
    expect((await route(get("?tag=launch"), env(), undefined, h.deps)).status).toBe(400);
    expect((await route(get("?tag=nope"), env(), undefined, h.deps)).status).toBe(400);
    expect(h.asked).toEqual([]);
  });
});
