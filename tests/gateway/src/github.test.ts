// The S8 repo read's parsing and observation semantics (OX3).

import { observeRepo, parseGithubRepo } from "@openproduct-gateway/github";

describe("parseGithubRepo — the host is pinned, the slugs are strict", () => {
  it("accepts the canonical shape, with .git and trailing slash tolerated", () => {
    expect(parseGithubRepo("https://github.com/acme/thing")).toEqual({ owner: "acme", repo: "thing" });
    expect(parseGithubRepo("https://github.com/acme/thing.git")).toEqual({ owner: "acme", repo: "thing" });
    expect(parseGithubRepo("https://github.com/acme/thing/")).toEqual({ owner: "acme", repo: "thing" });
  });

  it("refuses every other host, protocol, and shape — the SSRF answer is structural", () => {
    expect(parseGithubRepo("https://evil.test/acme/thing")).toBeNull();
    expect(parseGithubRepo("http://github.com/acme/thing")).toBeNull();
    expect(parseGithubRepo("https://github.com/acme")).toBeNull();
    expect(parseGithubRepo("https://github.com/acme/thing/tree/main")).toBeNull();
    expect(parseGithubRepo("https://github.com/../thing")).toBeNull();
    expect(parseGithubRepo("not a url")).toBeNull();
  });
});

describe("observeRepo", () => {
  it("200 → public, with the declared licence", async () => {
    const fetchImpl = (async () =>
      Response.json({ private: false, license: { spdx_id: "Apache-2.0" } })) as typeof fetch;
    expect(await observeRepo("a", "b", undefined, fetchImpl)).toEqual({
      ok: true,
      observation: { linked: true, visibility: "public", licence: "Apache-2.0", name: null, description: null, topics: null, language: null, pushedAt: null, openIssues: null },
    });
  });

  it("NOASSERTION is not a licence", async () => {
    const fetchImpl = (async () =>
      Response.json({ private: false, license: { spdx_id: "NOASSERTION" } })) as typeof fetch;
    const result = await observeRepo("a", "b", undefined, fetchImpl);
    expect(result).toEqual({
      ok: true,
      observation: { linked: true, visibility: "public", licence: null, name: null, description: null, topics: null, language: null, pushedAt: null, openIssues: null },
    });
  });

  it("404 is an ANSWER: private-or-nonexistent, which the publish gate treats alike", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    expect(await observeRepo("a", "b", undefined, fetchImpl)).toEqual({
      ok: true,
      observation: { linked: true, visibility: "private", licence: null, name: null, description: null, topics: null, language: null, pushedAt: null, openIssues: null },
    });
  });

  it("an outage (or the anonymous rate limit) is NOT an observation", async () => {
    const rateLimited = (async () => new Response("limit", { status: 403 })) as typeof fetch;
    expect(await observeRepo("a", "b", undefined, rateLimited)).toEqual({ ok: false });
    const down = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    expect(await observeRepo("a", "b", undefined, down)).toEqual({ ok: false });
  });

  it("sends the optional token when configured (OX-D headroom)", async () => {
    let auth: string | null = null;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("authorization");
      return Response.json({ private: false, license: null });
    }) as typeof fetch;
    await observeRepo("a", "b", "ghs_token", fetchImpl);
    expect(auth).toBe("Bearer ghs_token");
  });
});

describe("IN2 — what the repository says about itself", () => {
  it("reads the name, description and topics that were already in the response", async () => {
    // No extra request: this shape was always coming back, and the first
    // version of `observeRepo` simply did not read three of its fields.
    const fetchImpl = (async () =>
      Response.json({
        private: false,
        license: { spdx_id: "MIT" },
        name: "kettleworks",
        description: "Boils  water,\ncarefully",
        topics: ["TypeScript", "Cloudflare"],
      })) as typeof fetch;
    const result = await observeRepo("a", "b", undefined, fetchImpl);
    expect(result).toEqual({
      ok: true,
      observation: {
        linked: true,
        visibility: "public",
        licence: "MIT",
        name: "kettleworks",
        // Collapsed: a GitHub description carries newlines, and this string
        // is rendered.
        description: "Boils water, carefully",
        topics: ["typescript", "cloudflare"],
        language: null,
        pushedAt: null,
        openIssues: null,
      },
    });
  });

  it("repeats nothing a private repository says", async () => {
    // THE PRIVACY RULE. A token that can see a private repo gets this whole
    // shape back; copying its description onto a public listing would
    // publish something nobody chose to publish. The visibility is the
    // observation here — the words are not ours to take.
    const fetchImpl = (async () =>
      Response.json({
        private: true,
        license: { spdx_id: "MIT" },
        name: "secret-thing",
        description: "The unannounced product",
        topics: ["stealth"],
      })) as typeof fetch;
    const result = await observeRepo("a", "b", "tok", fetchImpl);
    expect(result).toEqual({
      ok: true,
      observation: {
        linked: true,
        visibility: "private",
        licence: "MIT",
        name: null,
        description: null,
        topics: null,
        language: null,
        pushedAt: null,
        openIssues: null,
      },
    });
  });

  it("bounds what it takes from somebody else's API", async () => {
    // An unbounded list from an external API is an unbounded page, and a
    // description is free text a stranger wrote.
    const fetchImpl = (async () =>
      Response.json({
        private: false,
        description: "x".repeat(900),
        topics: [...Array(40).keys()].map((i) => `topic-${i}`).concat(["y".repeat(80)]),
      })) as typeof fetch;
    const result = await observeRepo("a", "b", undefined, fetchImpl);
    if (!result.ok) throw new Error("expected an observation");
    expect(result.observation.description).toHaveLength(500);
    expect(result.observation.topics).toHaveLength(20);
    expect(result.observation.topics!.every((t) => t.length <= 64)).toBe(true);
  });

  it("distinguishes a repository with no topics from one that answered none", async () => {
    // `[]` is an answer, `null` is the absence of one (OPC-C).
    const withNone = (async () => Response.json({ private: false, topics: [] })) as typeof fetch;
    const withoutField = (async () => Response.json({ private: false })) as typeof fetch;
    const a = await observeRepo("a", "b", undefined, withNone);
    const b = await observeRepo("a", "b", undefined, withoutField);
    expect(a.ok && a.observation.topics).toEqual([]);
    expect(b.ok && b.observation.topics).toBeNull();
  });
});
