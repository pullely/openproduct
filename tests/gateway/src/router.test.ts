// The gateway router's behavioral guards (OX3): the properties the facade
// held, proven against the worker that replaced it.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { internalPath, isAuthenticatedRoute, route } from "@openproduct-gateway/router";
import type { Env } from "@openproduct-gateway/env";
import { resetSubjectCache } from "@openproduct-gateway/subject";
import { resetBuckets } from "@openproduct-gateway/ratelimit";

interface CapturedFetch {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function coreStub(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
  captured: CapturedFetch[] = [],
): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
      const record: CapturedFetch = {
        url,
        method: init?.method ?? "GET",
        headers: Object.fromEntries([...headers.entries()]),
      };
      captured.push(record);
      return respond(url, init);
    },
  } as unknown as Fetcher;
}

function envWith(core: Fetcher | undefined): Env {
  return {
    CORE: core,
    ENVIRONMENT: "test",
    PLATFORM_API_URL: "https://platform.test",
    SITE_ORIGIN: "https://openproduct.live",
  } as Env;
}

const realFetch = globalThis.fetch;

function stubIdentity(subjectId: string | null, status = 200): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://platform.test/v1/identity/me")) {
      if (subjectId === null) return new Response("{}", { status: 401 });
      return Response.json({ data: { subjectId, displayName: "Ada" } }, { status });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  resetSubjectCache();
  resetBuckets();
});

describe("the public read", () => {
  it("forwards NOTHING from the request — a bearer arrives and dies here", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { projects: [] } }), captured);
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/projects", {
        headers: {
          authorization: "Bearer topsecret",
          cookie: "op_session=abc",
          "x-actor-subject-id": "usr_forged",
        },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    const forwarded = captured[0]!.headers;
    expect(Object.keys(forwarded).sort()).toEqual(["x-request-id"]);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("never passes a core failure body through — only the status survives", async () => {
    const core = coreStub(
      () => Response.json({ error: { message: "no route: /internal/public/…" } }, { status: 404 }),
    );
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/projects/some-slug"),
      envWith(core),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe("Not found");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("DS0 search is public — anonymous, no bearer, and edge-cached", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { query: "queue", results: [] } }), captured);
    const res = await route(
      new Request("https://gw.test/v1/search?q=queue&limit=5", {
        // A request that ARRIVES carrying a bearer is served exactly as one
        // that does not: the order is a published formula with no personal
        // input, so one visitor's results are every visitor's results.
        headers: { authorization: "Bearer tok" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(captured[0]!.url).toContain("/internal/public/openproduct/search?q=queue&limit=5");
    // The empty header set: nothing forwarded, so no credential can reach
    // core by being forgotten in a denylist.
    expect(captured[0]!.headers.authorization).toBeUndefined();
    expect(captured[0]!.headers["x-actor-subject-id"]).toBeUndefined();
  });

  it("the search REBUILD is not reachable from outside at all", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({}), captured);
    for (const path of ["/v1/search/rebuild", "/internal/openproduct/search/rebuild"]) {
      const res = await route(new Request(`https://gw.test${path}`, { method: "POST" }), envWith(core));
      // A read that writes is a read somebody can turn into a write amplifier
      // by holding down refresh. The rebuild is called by the sweep, over the
      // service binding, and has no front door.
      expect([path, res.status]).not.toEqual([path, 200]);
    }
  });

  it("CG1 — a contributor page is public, anonymous and edge-cached", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { contributor: { handle: "ada" } } }), captured);
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/people/ada", {
        // A profile is a page ABOUT a person, not a page FOR a viewer, so a
        // request carrying a bearer is served exactly as one that does not.
        headers: { authorization: "Bearer tok" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(captured[0]!.url).toContain("/internal/public/openproduct/people/ada");
    expect(captured[0]!.headers.authorization).toBeUndefined();
    expect(captured[0]!.headers["x-actor-subject-id"]).toBeUndefined();
  });

  it("MP0 — a maker's tab is public, anonymous, and its own route", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { tab: "upvoted" } }), captured);
    for (const tab of ["launched", "upvoted", "comments"]) {
      const res = await route(
        new Request(`https://gw.test/v1/public/openproduct/people/ada/tab/${tab}`, {
          // A maker page is a page ABOUT a person. A bearer changes nothing,
          // so the answer is edge-cacheable and identical for everyone (I6).
          headers: { authorization: "Bearer tok" },
        }),
        envWith(core),
      );
      expect([tab, res.status]).toEqual([tab, 200]);
    }
    expect(captured).toHaveLength(3);
    expect(captured[1]!.url).toContain("/internal/public/openproduct/people/ada/tab/upvoted");
    expect(captured[1]!.headers.authorization).toBeUndefined();
    expect(captured[1]!.headers["x-actor-subject-id"]).toBeUndefined();
  });

  it("MP0 — a FOURTH tab is not a route, and never reaches core", async () => {
    // The vocabulary is closed at the gateway as well as in the handler.
    // There is no `saved` tab and there is not going to be one, so a request
    // for it is not a request this estate answers.
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({}), captured);
    for (const bad of ["saved", "endorsed", "..", "launched/extra"]) {
      const res = await route(
        new Request(`https://gw.test/v1/public/openproduct/people/ada/tab/${bad}`),
        envWith(core),
      );
      expect([bad, res.status]).not.toEqual([bad, 200]);
    }
    expect(captured).toHaveLength(0);
  });

  it("FO1 — the forum index is public, anonymous, and carries its order and tag to core", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { threads: [] } }), captured);
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/threads?order=replied&tag=question", {
        headers: { authorization: "Bearer tok" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(captured[0]!.url).toContain("/internal/public/openproduct/threads?order=replied&tag=question");
    expect(captured[0]!.headers.authorization).toBeUndefined();
    expect(captured[0]!.headers["x-actor-subject-id"]).toBeUndefined();
    expect(res.headers.get("cache-control")).toContain("max-age");
  });

  it("DS4 — the people INDEX is public, anonymous, and its own route", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { people: [] } }), captured);
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/people", {
        // Same rule as the page it indexes: a bearer changes nothing, so the
        // answer is edge-cacheable and identical for everyone (I6).
        headers: { authorization: "Bearer tok" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(captured[0]!.url).toContain("/internal/public/openproduct/people");
    // The COLLECTION, not a member called "people".
    expect(captured[0]!.url).not.toContain("/people/");
    expect(captured[0]!.headers.authorization).toBeUndefined();
    expect(captured[0]!.headers["x-actor-subject-id"]).toBeUndefined();
    expect(res.headers.get("cache-control")).toContain("max-age");
  });

  it("CG2 — the contributors directory is public, anonymous, and passes its limit", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { contributors: [] } }), captured);
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/contributors?limit=25", {
        // Who is in the directory does not depend on who is asking, so a
        // bearer changes nothing and the answer is edge-cacheable (I6).
        headers: { authorization: "Bearer tok" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(captured[0]!.url).toContain("/internal/public/openproduct/contributors?limit=25");
    expect(captured[0]!.headers.authorization).toBeUndefined();
    expect(captured[0]!.headers["x-actor-subject-id"]).toBeUndefined();
    expect(res.headers.get("cache-control")).toContain("max-age");
  });

  it("CG2 — the directory and the sitemap index are DIFFERENT upstreams", async () => {
    // Two reads with two projections. A gateway that folded them onto one
    // core path would make the union of their fields reachable from both.
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: {} }), captured);
    await route(new Request("https://gw.test/v1/public/openproduct/contributors"), envWith(core));
    await route(new Request("https://gw.test/v1/public/openproduct/people"), envWith(core));
    expect(captured[0]!.url).toContain("/internal/public/openproduct/contributors");
    expect(captured[1]!.url).toContain("/internal/public/openproduct/people");
    expect(captured[1]!.url).not.toContain("contributors");
  });

  it("DS4 — the index refuses writes like every other public read", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({}), captured);
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const res = await route(
        new Request("https://gw.test/v1/public/openproduct/people", { method }),
        envWith(core),
      );
      expect(res.status).toBe(405);
    }
    expect(captured).toHaveLength(0);
  });

  it("a handle outside the grammar never reaches core", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({}), captured);
    for (const bad of ["a", "Ada", "ada_b", "a".repeat(40), "../secrets"]) {
      const res = await route(
        new Request(`https://gw.test/v1/public/openproduct/people/${encodeURIComponent(bad)}`),
        envWith(core),
      );
      // The gateway's pattern is the CG0 grammar. Anything else is not a
      // public route at all, so it never reaches the authenticated plane
      // either — it is simply not a route.
      expect([bad, res.status]).not.toEqual([bad, 200]);
    }
    expect(captured).toHaveLength(0);
  });

  it("refuses writes", async () => {
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/projects", { method: "POST" }),
      envWith(coreStub(() => Response.json({}))),
    );
    expect(res.status).toBe(405);
  });
});

describe("the authenticated planes (S2)", () => {
  it("401s with no bearer, before any core call", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({}), captured);
    const res = await route(new Request("https://gw.test/v1/openproduct/me"), envWith(core));
    expect(res.status).toBe(401);
    expect(captured).toHaveLength(0);
  });

  it("resolves the subject via the platform's public identity read and forwards fresh actor headers", async () => {
    stubIdentity("usr_0123456789abcdef0123456789abcdef");
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: {} }), captured);
    const res = await route(
      new Request("https://gw.test/v1/openproduct/me", {
        headers: {
          authorization: "Bearer tok",
          "x-actor-subject-id": "usr_forged",
          "x-actor-subject-type": "user",
        },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    const forwarded = captured[0]!.headers;
    expect(forwarded["x-actor-subject-id"]).toBe("usr_0123456789abcdef0123456789abcdef");
    expect(forwarded["x-actor-subject-type"]).toBe("user");
    // The forged inbound actor headers died at the door.
    expect(forwarded.authorization).toBeUndefined();
    expect(captured[0]!.url).toContain("/internal/openproduct/me");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("derives service_principal from the sp_ prefix", async () => {
    stubIdentity("sp_0123456789abcdef0123456789abcdef");
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: {} }), captured);
    await route(
      new Request("https://gw.test/v1/organizations/org_1/openproduct/profiles", {
        headers: { authorization: "Bearer tok" },
      }),
      envWith(core),
    );
    expect(captured[0]!.headers["x-actor-subject-type"]).toBe("service_principal");
    expect(captured[0]!.url).toContain("/internal/openproduct/orgs/org_1/profiles");
  });

  it("the XP2 overlay rides the authenticated plane, query string intact", async () => {
    stubIdentity("usr_0123456789abcdef0123456789abcdef");
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { overlay: {} } }), captured);
    const res = await route(
      new Request("https://gw.test/v1/openproduct/me/overlay?ids=acme-thing,beta-thing", {
        headers: { authorization: "Bearer tok" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    // The ids ARE the request — a passthrough that dropped the query string
    // would turn every per-slug answer into a silent empty one, which looks
    // exactly like "you have saved nothing".
    expect(captured[0]!.url).toContain("/internal/openproduct/me/overlay?ids=acme-thing,beta-thing");
    // Per-subject, and it must never be cached by anything in between.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("the overlay is NOT a public route — no bearer, no answer", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({}), captured);
    const res = await route(
      new Request("https://gw.test/v1/openproduct/me/overlay?ids=acme-thing"),
      envWith(core),
    );
    // The one per-subject read on a public page still resolves a subject. A
    // widened `isPublicRoute` that let this through would hand one visitor
    // an edge-cached copy of another's saved list.
    expect(res.status).toBe(401);
    expect(captured).toHaveLength(0);
  });

  it("EN1 — the endorsement is NEVER ANONYMOUS, and that is enforced HERE", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: {} }), captured);
    for (const path of [
      "/v1/openproduct/me/endorsements",
      "/v1/openproduct/me/endorsements/acme-thing",
    ]) {
      const res = await route(
        new Request(`https://gw.test${path}`, { method: "PUT" }),
        envWith(core),
      );
      // THE POINT IS THE LAYER, not the status code. An anonymous vote is an
      // unbounded vote, and the refusal lives in the ROUTING — an
      // unauthenticated request never reaches the handler, so no check inside
      // it can be forgotten, reordered, or deleted by a refactor. The core
      // handler has no anonymous branch at all because it cannot be called
      // without a subject.
      expect(res.status).toBe(401);
    }
    expect(captured).toHaveLength(0);
  });

  it("EN1 — an authenticated endorsement forwards to core with a RESOLVED subject", async () => {
    stubIdentity("usr_0123456789abcdef0123456789abcdef");
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: {} }), captured);
    const res = await route(
      new Request("https://gw.test/v1/openproduct/me/endorsements", {
        method: "PUT",
        headers: {
          authorization: "Bearer tok",
          "content-type": "application/json",
          // Forged, and it dies at the door like every other one.
          "x-actor-subject-id": "usr_forged",
        },
        body: JSON.stringify({ slug: "acme-thing" }),
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(captured[0]!.url).toContain("/internal/openproduct/me/endorsements");
    expect(captured[0]!.headers["x-actor-subject-id"]).toBe(
      "usr_0123456789abcdef0123456789abcdef",
    );
    // A public act carries the endorser's name, so the name had better be the
    // one the platform resolved rather than the one the caller typed.
    expect(captured[0]!.headers["x-actor-subject-id"]).not.toBe("usr_forged");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("a platform outage is a 503, never a silent anonymous pass", async () => {
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({}), captured);
    const res = await route(
      new Request("https://gw.test/v1/openproduct/me", {
        headers: { authorization: "Bearer tok" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(503);
    expect(captured).toHaveLength(0);
  });
});

describe("the repo check (S8)", () => {
  function coreForRepoCheck(repoUrl: string | null, captured: CapturedFetch[]): Fetcher {
    return coreStub((url, init) => {
      if ((init?.method ?? "GET") === "GET") {
        return Response.json({ data: { profile: { repoUrl } } });
      }
      return Response.json({ data: { recorded: true } });
    }, captured);
  }

  it("observes a public repo via GitHub's public API and writes the observation itself", async () => {
    const captured: CapturedFetch[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://platform.test/v1/identity/me")) {
        return Response.json({ data: { subjectId: "usr_1", displayName: "Ada" } });
      }
      if (url === "https://api.github.com/repos/acme/thing") {
        return Response.json({ private: false, license: { spdx_id: "MIT" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const core = coreForRepoCheck("https://github.com/acme/thing", captured);
    const res = await route(
      new Request("https://gw.test/v1/organizations/org_1/openproduct/profiles/prof_1/repo-check", {
        method: "POST",
        headers: { authorization: "Bearer tok" },
        // A caller-supplied body must never become the observation.
        body: JSON.stringify({ linked: true, visibility: "public", licence: "WTFPL" }),
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    const put = captured.find((c) => c.method === "PUT");
    expect(put).toBeDefined();
    expect(put!.url).toContain("/repo-observation");
  });

  it("a GitHub outage is a 502, never recorded as private", async () => {
    const captured: CapturedFetch[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://platform.test/v1/identity/me")) {
        return Response.json({ data: { subjectId: "usr_1", displayName: "Ada" } });
      }
      return new Response("rate limited", { status: 403 });
    }) as typeof fetch;
    const core = coreForRepoCheck("https://github.com/acme/thing", captured);
    const res = await route(
      new Request("https://gw.test/v1/organizations/org_1/openproduct/profiles/prof_1/repo-check", {
        method: "POST",
        headers: { authorization: "Bearer tok" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(502);
    expect(captured.some((c) => c.method === "PUT")).toBe(false);
  });
});

describe("routing", () => {
  it("serves health with the three configured checks, the one that is HAPPENING, and the outward budget (LI4)", async () => {
    // RS1 added `sweep`, and it is a different kind of check from the other
    // three: those ask whether a binding or a secret is present — questions
    // answerable without leaving the isolate, and all three answered `true`
    // throughout the entire period the product was broken. `sweep` is the
    // first one here that can only be answered by asking what actually ran.
    const res = await route(new Request("https://gw.test/health"), envWith(undefined));
    const body = (await res.json()) as { data: { checks: Record<string, unknown> } };
    expect(Object.keys(body.data.checks).sort()).toEqual(["core", "ingestion", "platform", "screenshots", "seam", "sweep"]);
  });

  it("OO3 — says which build is answering: the version and its upload moment from the binding, nulls without it", async () => {
    const without = (await (await route(new Request("https://gw.test/health"), envWith(undefined))).json()) as {
      data: { build: { version: string | null; deployedAt: string | null; tag: string | null } };
    };
    expect(without.data.build).toEqual({ version: null, deployedAt: null, tag: null });
    const env = {
      ...envWith(undefined),
      CF_VERSION_METADATA: { id: "7b3c9f2e-0000-4000-8000-000000000001", tag: "", timestamp: "2026-09-10T11:00:00.000Z" },
    } as Env;
    const bound = (await (await route(new Request("https://gw.test/health"), env)).json()) as typeof without;
    expect(bound.data.build).toEqual({ version: "7b3c9f2e-0000-4000-8000-000000000001", deployedAt: "2026-09-10T11:00:00.000Z", tag: null });
  });

  it("reports the sweep unreachable, not healthy, when there is no core binding", async () => {
    const res = await route(new Request("https://gw.test/health"), envWith(undefined));
    const body = (await res.json()) as {
      data: { status: string; checks: { sweep: { reachable: boolean; healthy: boolean } } };
    };
    expect(body.data.checks.sweep.reachable).toBe(false);
    expect(body.data.checks.sweep.healthy).toBe(false);
    expect(body.data.status).toBe("degraded");
  });

  it("answers 200 even when degraded, because liveness and correctness are different questions", async () => {
    // A 5xx here would take the gateway out of rotation, and a stale digest
    // taking the public read plane down is a cure worse than the disease: the
    // pages still render correctly, from data that is merely older than it
    // should be. The body carries the truth; the status code answers "should
    // traffic come here", which is what the thing reading it is asking.
    const res = await route(new Request("https://gw.test/health"), envWith(undefined));
    expect(res.status).toBe(200);
  });

  it("reports degraded when a phase has never run — the state the product was in before RS0", async () => {
    const core = coreStub((url) =>
      url.includes("/internal/openproduct/sweep/state")
        ? new Response(
            JSON.stringify({ data: { searchIndex: null, integrity: null, defence: null } }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        : new Response("{}", { status: 404 }),
    );
    const res = await route(new Request("https://gw.test/health"), envWith(core));
    const body = (await res.json()) as {
      data: {
        status: string;
        checks: { sweep: { reachable: boolean; phases: Array<{ reason: string | null }> } };
      };
    };
    expect(body.data.status).toBe("degraded");
    expect(body.data.checks.sweep.reachable).toBe(true);
    expect(body.data.checks.sweep.phases.map((p) => p.reason)).toEqual([
      "never_run",
      "never_run",
      "never_run",
      "never_run",
      "never_run",
      "never_run",
      "never_run",
    ]);
  });

  it("reports ok when every phase has run recently", async () => {
    const justNow = new Date().toISOString();
    const core = coreStub((url) =>
      url.includes("/internal/openproduct/sweep/state")
        ? new Response(
            JSON.stringify({
              data: {
                catalogue: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
                searchIndex: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
                integrity: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
                defence: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
                board: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
                digest: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
                snapshots: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        : new Response("{}", { status: 404 }),
    );
    const res = await route(new Request("https://gw.test/health"), envWith(core));
    const body = (await res.json()) as { data: { status: string } };
    expect(body.data.status).toBe("ok");
  });

  it("reports whether the outward phase is authenticated — the presence of the token, never its value (LI4)", async () => {
    const core = coreStub(() => new Response("{}", { status: 404 }));
    const without = (await (await route(new Request("https://gw.test/health"), envWith(core))).json()) as {
      data: { checks: { ingestion: { authenticated: boolean; maxSourcesPerRun: number } } };
    };
    expect(without.data.checks.ingestion).toEqual({
      authenticated: false,
      maxSourcesPerRun: 25,
      unauthenticatedReadsPerHour: 60,
    });

    const env = { ...envWith(core), GITHUB_TOKEN: "ghp_secret_value" } as Env;
    const res = await route(new Request("https://gw.test/health"), env);
    const text = await res.text();
    expect((JSON.parse(text) as typeof without).data.checks.ingestion.authenticated).toBe(true);
    expect(text).not.toContain("ghp_secret_value");
  });

  it("MD4 — reports whether captures are configured: the presence of the two settings, never their values", async () => {
    const core = coreStub(() => new Response("{}", { status: 404 }));
    const without = (await (await route(new Request("https://gw.test/health"), envWith(core))).json()) as {
      data: { checks: { screenshots: { configured: boolean; maxPerRun: number; refreshAfterDays: number; withdrawnAfterDays: number } } };
    };
    expect(without.data.checks.screenshots).toEqual({
      configured: false,
      maxPerRun: 5,
      refreshAfterDays: 7,
      withdrawnAfterDays: 30,
    });

    const env = {
      ...envWith(core),
      SCREENSHOT_CAPTURE_URL: "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef/browser-rendering/screenshot",
      SCREENSHOT_CAPTURE_TOKEN: "cf-token-value",
    } as Env;
    const text = await (await route(new Request("https://gw.test/health"), env)).text();
    expect((JSON.parse(text) as typeof without).data.checks.screenshots.configured).toBe(true);
    expect(text).not.toContain("cf-token-value");
    expect(text).not.toContain("0123456789abcdef");
  });

  it("MD4 — the capture queue and the ledger are not reachable from outside at all", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { captures: [] } }), captured);
    for (const path of [
      "/v1/media/captures",
      "/v1/media/captures/due",
      "/v1/openproduct/media/captures",
      "/v1/openproduct/media/captures/due",
      "/internal/openproduct/media/captures",
      "/internal/openproduct/media/captures/due",
    ]) {
      for (const method of ["GET", "POST"]) {
        const res = await route(new Request(`https://gw.test${path}`, { method }), envWith(core));
        // A page view has no path to the capture: it runs on the sweep's
        // schedule, over the binding, and nothing a visitor sends can start
        // a browser on a maker's behalf.
        expect([path, method, res.status]).not.toEqual([path, method, 200]);
      }
    }
    expect(captured.filter((c) => c.url.includes("captures"))).toEqual([]);
  });

  it("reports a phase that fails as failed, with its reason — not as never_run (LI0)", async () => {
    const justNow = new Date().toISOString();
    const core = coreStub((url) =>
      url.includes("/internal/openproduct/sweep/state")
        ? new Response(
            JSON.stringify({
              data: {
                searchIndex: {
                  lastRunAt: null,
                  lastError: "internal_error: Search index rebuild failed (503)",
                  lastErrorAt: justNow,
                },
                integrity: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
                defence: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
                board: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
                digest: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
                snapshots: { lastRunAt: justNow, lastError: null, lastErrorAt: null },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
        : new Response("{}", { status: 404 }),
    );
    const res = await route(new Request("https://gw.test/health"), envWith(core));
    const body = (await res.json()) as {
      data: {
        status: string;
        checks: { sweep: { phases: Array<{ phase: string; reason: string | null; error: string | null }> } };
      };
    };
    expect(body.data.status).toBe("degraded");
    const index = body.data.checks.sweep.phases.find((p) => p.phase === "searchIndex")!;
    expect(index.reason).toBe("failed");
    expect(index.error).toBe("internal_error: Search index rebuild failed (503)");
  });

  it("does not let a failing core turn health into an error", async () => {
    // Health must answer when its dependency does not — that is the one
    // condition under which somebody is definitely reading it.
    const core = coreStub(() => new Response("nope", { status: 500 }));
    const res = await route(new Request("https://gw.test/health"), envWith(core));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { status: string; checks: { sweep: { reachable: boolean } } };
    };
    expect(body.data.checks.sweep.reachable).toBe(false);
    expect(body.data.status).toBe("degraded");
  });

  it("404s everything else", async () => {
    const res = await route(new Request("https://gw.test/v1/anything"), envWith(undefined));
    expect(res.status).toBe(404);
  });
});

describe("OL2 — the feed, the front page's one read", () => {
  it("is public, anonymous, edge-cached, and maps to core's feed", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { today: "2026-08-26", groups: [] } }), captured);
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/feed", {
        headers: { authorization: "Bearer topsecret", cookie: "op_session=abc" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(new URL(captured[0]!.url).pathname).toBe("/internal/public/openproduct/feed");
    // The bearer arrives and dies here. The front page is one document for
    // everybody (OPC-1, I6) — a feed that could see who was asking would not
    // be cacheable and would not be arguable.
    expect(Object.keys(captured[0]!.headers).sort()).toEqual(["x-request-id"]);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("every path the gateway CLAIMS is public is a path it can MAP", async () => {
    // The public plane's own version of the DQ0 table. `isPublicRoute` says
    // "this is ours"; the mapping table inside `handlePublicRead` says where
    // it goes. A path that reaches the first and is missing from the second
    // falls off the end of the ternary chain as `null` and answers 500 — the
    // router's own comment says that is exactly how one of these was caught
    // before, so this walks them instead of trusting the next author to
    // remember.
    const publicPaths = [
      "/v1/public/openproduct/feed",
      "/v1/public/openproduct/leaderboard",
      "/v1/public/openproduct/topics",
      "/v1/public/openproduct/topics/dev-tools",
      "/v1/public/openproduct/projects",
      "/v1/public/openproduct/projects/acme-thing",
      "/v1/public/openproduct/launches",
      "/v1/public/openproduct/launches/2026-08-26",
      "/v1/public/openproduct/collections",
      "/v1/public/openproduct/collections/worth-a-look",
      "/v1/public/openproduct/digest",
      "/v1/public/openproduct/digest/2026-w21",
      "/v1/public/openproduct/transparency",
      "/v1/public/openproduct/people",
      "/v1/public/openproduct/contributors",
    ];
    for (const path of publicPaths) {
      const captured: CapturedFetch[] = [];
      const core = coreStub(() => Response.json({ data: {} }), captured);
      const res = await route(new Request(`https://gw.test${path}`), envWith(core));
      expect([path, res.status]).toEqual([path, 200]);
      // And it reached core at a real internal address rather than at
      // `/internal/public/openproduct/null`.
      expect([path, captured]).toHaveLength(2);
      expect(new URL(captured[0]!.url).pathname).toMatch(/^\/internal\/public\/openproduct\//);
    }
  });
});

describe("UV2 — the leaderboard, and its range", () => {
  it("is public and anonymous, and maps to core's leaderboard", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { range: "week", entries: [] } }), captured);
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/leaderboard", {
        headers: { authorization: "Bearer topsecret", cookie: "op_session=abc" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(new URL(captured[0]!.url).pathname).toBe("/internal/public/openproduct/leaderboard");
    expect(Object.keys(captured[0]!.headers).sort()).toEqual(["x-request-id"]);
  });

  it("FORWARDS the range rather than parsing it", async () => {
    // The gateway's job on a public read is to decide whether the address is
    // public, not to second-guess its parameters. Core refuses an unknown
    // range with a 400, in one place — two range lists is two things to keep
    // in step.
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: {} }), captured);
    await route(
      new Request("https://gw.test/v1/public/openproduct/leaderboard?range=month"),
      envWith(core),
    );
    expect(new URL(captured[0]!.url).search).toBe("?range=month");
  });

  it("forwards a range it does not recognise, and lets core refuse it", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: {} }), captured);
    await route(
      new Request("https://gw.test/v1/public/openproduct/leaderboard?range=year"),
      envWith(core),
    );
    expect(new URL(captured[0]!.url).search).toBe("?range=year");
  });
});

describe("TP0 — the topic index and one topic", () => {
  it("both are public, anonymous, and map to core's topics", async () => {
    for (const [path, internal] of [
      ["/v1/public/openproduct/topics", "/internal/public/openproduct/topics"],
      ["/v1/public/openproduct/topics/dev-tools", "/internal/public/openproduct/topics/dev-tools"],
    ]) {
      const captured: CapturedFetch[] = [];
      const core = coreStub(() => Response.json({ data: { topics: [] } }), captured);
      const res = await route(
        new Request(`https://gw.test${path}`, {
          headers: { authorization: "Bearer topsecret", cookie: "op_session=abc" },
        }),
        envWith(core),
      );
      expect([path, res.status]).toEqual([path, 200]);
      expect(new URL(captured[0]!.url).pathname).toBe(internal);
      // The bearer arrives and dies here.
      expect(Object.keys(captured[0]!.headers).sort()).toEqual(["x-request-id"]);
    }
  });

  it("refuses a segment that could never be a facet value", async () => {
    // The value shape is pinned at this layer too, so a path that cannot be a
    // topic never reaches core. Canonical values are lower-case, digits and
    // dashes; CT1 canonicalises on the way in, so anything else is not a topic
    // that exists.
    for (const bad of [
      "/v1/public/openproduct/topics/Dev-Tools",
      "/v1/public/openproduct/topics/dev tools",
      "/v1/public/openproduct/topics/-leading",
      "/v1/public/openproduct/topics/dev/tools",
      `/v1/public/openproduct/topics/${"x".repeat(200)}`,
    ]) {
      const res = await route(
        new Request(`https://gw.test${bad}`),
        envWith(coreStub(() => Response.json({ data: {} }))),
      );
      expect([bad, res.status]).not.toEqual([bad, 200]);
    }
  });
});

describe("a path the gateway can MAP is a path it DISPATCHES", () => {
  // THE BUG THIS TABLE EXISTS TO STOP, found while planning openproduct-launch
  // and live in production when it was: `internalPath` mapped
  // `/v1/openproduct/threads…` and `/v1/openproduct/reports…`, and `route`'s
  // dispatch condition listed three other regexes and not those two. Both
  // families answered 404 — so nobody could post a reply or start a thread,
  // and every studio moderation screen was a 404 behind a page that rendered.
  //
  // The two lists are one list now (`isAuthenticatedRoute`). This walks it, so
  // the next family added to the map cannot be forgotten by the dispatcher.
  const authenticated = [
    "/v1/openproduct/me",
    "/v1/openproduct/me/saved",
    "/v1/openproduct/me/endorsements/acme-thing",
    "/v1/openproduct/listings/acme-thing/people",
    "/v1/openproduct/listings/acme-thing/people/usr_1",
    "/v1/openproduct/threads",
    "/v1/openproduct/threads/thr_1",
    "/v1/openproduct/threads/thr_1/posts",
    // DQ0b — the comment box's act. In THIS table rather than in a test of
    // its own, because this table is the guard that exists for exactly the
    // bug a new write family invites: mapped and never dispatched.
    "/v1/openproduct/comments",
    "/v1/openproduct/reports",
    "/v1/openproduct/reports/queue",
    "/v1/openproduct/reports/acts",
    "/v1/openproduct/reports/appeals/decide",
    "/v1/organizations/org_1/openproduct/profiles",
    "/v1/organizations/org_1/openproduct/profiles/p_1/publish",
  ];

  it("maps every path it dispatches, and dispatches every path it maps", () => {
    for (const path of authenticated) {
      expect([path, isAuthenticatedRoute(path)]).toEqual([path, true]);
      expect([path, internalPath(path)]).not.toEqual([path, null]);
    }
  });

  it("asks for a bearer rather than answering 404 — on every one of them", async () => {
    // 401 is the load-bearing assertion. A 404 here is the failure mode:
    // it says "no such door" about a door the product ships a button for.
    for (const path of authenticated) {
      const res = await route(
        new Request(`https://gw.test${path}`, { method: "POST" }),
        envWith(coreStub(() => Response.json({ data: {} }))),
      );
      expect([path, res.status]).toEqual([path, 401]);
    }
  });

  it("still refuses what it does not serve", () => {
    for (const path of ["/v1/anything", "/v1/openproduct", "/v1/openproduct/nope", "/internal/openproduct/me"]) {
      expect([path, isAuthenticatedRoute(path)]).toEqual([path, false]);
    }
  });

  it("AC1 opened two of AC0's seven doors, and they are a THIRD class", async () => {
    // AC0 asserted all seven were closed and predicted that "these paths move
    // up into `authenticated` above and this list shrinks". Half right: the
    // list shrank, and they did NOT move up.
    //
    // Sign-up and verify are neither public nor authenticated. There is no
    // bearer to present — having one is the OUTCOME of verify, not its
    // precondition — and they are writes, so they must never be cached or
    // fanned out to core's public reads. They are dispatched before both
    // branches, beside the seam receivers, where the ordering is part of the
    // guarantee.
    //
    // So they are absent from BOTH tables below and still served, which is why
    // this assertion exists rather than an entry in `authenticated`.
    for (const path of ["/v1/openproduct/auth/sign-up", "/v1/openproduct/auth/verify"]) {
      expect([path, isAuthenticatedRoute(path)]).toEqual([path, false]);
      expect([path, internalPath(path)]).toEqual([path, null]);
      const res = await route(
        new Request(`https://gw.test${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
        envWith(coreStub(() => Response.json({ data: {} }))),
      );
      // Served, not 404. What it answers is `auth.test.ts`'s business; what
      // matters here is that the door exists.
      expect([path, res.status]).not.toEqual([path, 404]);
    }
  });

  it("AC2's and AC3's five doors are still shut", async () => {
    // The other half of AC0's list, unchanged. A door half-open is worse here
    // than anywhere else on the estate: a mapped-but-undispatched PASSWORD
    // path is a 404 in front of a table that exists.
    for (const path of [
      "/v1/openproduct/auth/sign-in",
      "/v1/openproduct/auth/reset",
      "/v1/openproduct/auth/reset/confirm",
      "/v1/openproduct/credentials",
      "/v1/public/openproduct/auth/sign-up",
    ]) {
      expect([path, isAuthenticatedRoute(path)]).toEqual([path, false]);
      expect([path, internalPath(path)]).toEqual([path, null]);
      const res = await route(
        new Request(`https://gw.test${path}`, { method: "POST" }),
        envWith(coreStub(() => Response.json({ data: {} }))),
      );
      expect([path, res.ok]).toEqual([path, false]);
    }
  });
});

describe("LC1 — the digest, and core's own idea of how long it stays true", () => {
  it("routes both the digest and its index as PUBLIC reads", async () => {
    const captured: CapturedFetch[] = [];
    const core = coreStub(() => Response.json({ data: { digest: {} } }), captured);
    for (const [from, to] of [
      ["/v1/public/openproduct/digest/2026-w33", "/internal/public/openproduct/digest/2026-w33"],
      ["/v1/public/openproduct/digest", "/internal/public/openproduct/digest"],
    ] as const) {
      captured.length = 0;
      const res = await route(
        new Request(`https://gw.test${from}`, {
          headers: { authorization: "Bearer topsecret", "x-actor-subject-id": "usr_forged" },
        }),
        envWith(core),
      );
      expect([from, res.status]).toEqual([from, 200]);
      expect([from, captured[0]!.url]).toEqual([from, `https://openproduct.internal${to}`]);
      // A bearer arrives and dies here, like every other public read.
      expect([from, Object.keys(captured[0]!.headers).sort()]).toEqual([from, ["x-request-id"]]);
    }
  });

  it("HONOURS a longer cache core asked for", async () => {
    // CORE KNOWS MORE THAN THIS LAYER DOES about how long one document stays
    // true. A digest for a week that ended is immutable, and serving it with
    // sixty seconds of freshness makes every crawler re-fetch an archive.
    const core = coreStub(
      () =>
        new Response(JSON.stringify({ data: { digest: {} } }), {
          status: 200,
          headers: { "cache-control": "public, max-age=86400" },
        }),
    );
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/digest/2026-w33"),
      envWith(core),
    );
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
  });

  it("refuses anything from downstream that is not a plain public max-age", async () => {
    // A downstream that could set `no-store` here would be a downstream that
    // could make a public read uncacheable, and this gateway's whole shape is
    // that public reads are one document for everybody.
    for (const hostile of ["no-store", "private, max-age=60", "public, max-age=60, private", "max-age=99999"]) {
      const core = coreStub(
        () =>
          new Response(JSON.stringify({ data: { projects: [] } }), {
            status: 200,
            headers: { "cache-control": hostile },
          }),
      );
      const res = await route(
        new Request("https://gw.test/v1/public/openproduct/projects"),
        envWith(core),
      );
      expect([hostile, res.headers.get("cache-control")]).toEqual([hostile, "public, max-age=60"]);
    }
  });

  it("applies its own default when core says nothing", async () => {
    const core = coreStub(() => Response.json({ data: { projects: [] } }));
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/projects"),
      envWith(core),
    );
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });
});

describe("TS5 — the transparency record, and the appeal door", () => {
  it("is a PUBLIC route: a bearer arrives and dies at this layer", async () => {
    // A page of numbers about how an intermediary uses its power over
    // people's visibility is worth very little if it can only be read by
    // people who have already signed up to that intermediary. So it takes the
    // same branch OD3's directory does — the one that returns before any auth
    // code is reachable.
    const captured: CapturedFetch[] = [];
    const core = coreStub(
      () => Response.json({ data: { transparency: { acts: [] }, windowDays: 90 } }),
      captured,
    );
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/transparency", {
        headers: { authorization: "Bearer topsecret", "x-actor-subject-id": "usr_forged" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(Object.keys(captured[0]!.headers).sort()).toEqual(["x-request-id"]);
  });

  it("honours core's own longer cache, because these are quarterly figures", async () => {
    const core = coreStub(() =>
      Response.json(
        { data: { transparency: {}, windowDays: 90 } },
        { headers: { "cache-control": "public, max-age=3600" } },
      ),
    );
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/transparency"),
      envWith(core),
    );
    expect(res.headers.get("cache-control")).toContain("3600");
  });

  it("refuses a write to it", async () => {
    const core = coreStub(() => Response.json({ data: {} }));
    const res = await route(
      new Request("https://gw.test/v1/public/openproduct/transparency", { method: "POST" }),
      envWith(core),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── OPP4a: the header contract Workers Caching reads ─────────────────────
//
// The cache is no longer in this worker's code — `wrangler.jsonc` turns on
// Workers Caching, Cloudflare consults it BEFORE the worker runs, and the
// entire configuration surface is the headers this router returns. So what a
// test can pin moved with it: not "does a second read hit" (unobservable from
// here — on a hit this code never executes) but **whether the headers say the
// right thing**, which is the only input the cache has.
//
// The safety half is the important half, and it got sharper rather than
// softer. Workers Caching keys on path and query and **not on the
// `Authorization` header**, so "cacheable because nobody said otherwise" is
// one route away from handing one visitor another visitor's answer. RFC 9111
// makes a `200` with no `Cache-Control` heuristically cacheable, which is
// exactly what every envelope in `http.ts` used to be.
describe("only the public read plane is cacheable (OPP4a)", () => {
  it("makes public reads cacheable, and says what a write must purge", async () => {
    const core = coreStub(() => Response.json({ data: { projects: [] } }));
    const res = await route(
      new Request("https://api.openproduct.live/v1/public/openproduct/projects"),
      envWith(core),
    );

    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    // Cloudflare strips `Cache-Tag` before the visitor sees it; it exists so
    // the sweep can purge what it changed.
    expect(res.headers.get("Cache-Tag")).toBe("op-public,op-listing");
  });

  it("still honours a longer cache core asked for, and tags it too", async () => {
    const core = coreStub(() =>
      Response.json({ data: { digest: {} } }, { headers: { "cache-control": "public, max-age=86400" } }),
    );
    const res = await route(
      new Request("https://api.openproduct.live/v1/public/openproduct/digest/2026-w33"),
      envWith(core),
    );

    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("Cache-Tag")).toBe("op-public,op-digest");
  });

  it("NEVER lets an authenticated route look cacheable — on every one of them", async () => {
    // The property the whole milestone rests on. A 401 with no `Cache-Control`
    // is heuristically cacheable under RFC 9111, and the cache key ignores the
    // bearer, so this must hold for every authenticated path the router knows
    // — not for a sample of them.
    const core = coreStub(() => Response.json({ data: {} }));
    const paths = [
      "/v1/openproduct/me",
      "/v1/openproduct/me/endorsements",
      "/v1/openproduct/me/saves",
      "/v1/openproduct/me/follows",
      "/v1/organizations/org_1/openproduct/profiles",
    ];
    for (const path of paths) {
      const res = await route(new Request(`https://api.openproduct.live${path}`), envWith(core));
      expect([path, res.headers.get("cache-control")]).toEqual([path, "no-store"]);
    }
  });

  it("never lets an authenticated 200 be cached either", async () => {
    // The 401s above are the easy half. THIS is the dangerous one: a
    // successful, personal answer, returned to a request the cache key does
    // not distinguish from anybody else's.
    stubIdentity("usr_ada");
    const core = coreStub(() => Response.json({ data: { me: { id: "usr_ada" } } }));
    const res = await route(
      new Request("https://api.openproduct.live/v1/openproduct/me", {
        headers: { authorization: "Bearer t" },
      }),
      envWith(core),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("Cache-Tag")).toBeNull();
  });

  it("never lets `/health` be cached — a cached `ok` outlives the truth", async () => {
    // RS1's whole point is that this answers a question that CHANGES. A cached
    // 200 would keep reporting a healthy sweep through the outage it exists to
    // reveal.
    const res = await route(new Request("https://api.openproduct.live/health"), envWith(undefined));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("never lets a 404 or a method refusal be cached", async () => {
    const core = coreStub(() => Response.json({ data: {} }));
    const notFound = await route(
      new Request("https://api.openproduct.live/v1/nope"),
      envWith(core),
    );
    const refused = await route(
      new Request("https://api.openproduct.live/v1/public/openproduct/feed", { method: "POST" }),
      envWith(core),
    );

    expect(notFound.headers.get("cache-control")).toBe("no-store");
    expect(refused.headers.get("cache-control")).toBe("no-store");
  });

  it("never tags anything that is not a public document", async () => {
    // A `Cache-Tag` on a private response would enrol it in a purge — which
    // would mean it had been cached in the first place.
    const core = coreStub(() => Response.json({ data: {} }));
    for (const path of ["/health", "/v1/openproduct/me", "/v1/nope"]) {
      const res = await route(new Request(`https://api.openproduct.live${path}`), envWith(core));
      expect([path, res.headers.get("Cache-Tag")]).toEqual([path, null]);
    }
  });
});

describe("a discussion write purges what it changed, after it has answered (OPP14)", () => {
  // The writer never waits on a purge: the response leaves, and the purge
  // rides `ctx.waitUntil`. A refused write purges nothing — the documents
  // did not change — and a request that arrives with no context (a test, a
  // caller that does not care) is simply not purged, never failed.

  const SUBJECT = "usr_0123456789abcdef0123456789abcdef";

  /** The slice of the execution context the router uses, recording both. */
  function fakeContext(purge?: () => Promise<{ success: boolean; errors?: unknown }>) {
    const scheduled: Promise<unknown>[] = [];
    const purged: string[][] = [];
    return {
      scheduled,
      purged,
      ctx: {
        waitUntil: (promise: Promise<unknown>) => {
          scheduled.push(promise);
        },
        cache: {
          purge: async ({ tags }: { tags: string[] }) => {
            purged.push(tags);
            return purge ? purge() : { success: true };
          },
        },
      },
    };
  }

  function write(path: string, body: unknown = { body: "A comment." }) {
    return new Request(`https://gw.test${path}`, {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("purges `op-threads` once a comment has landed, and does not make the writer wait", async () => {
    stubIdentity(SUBJECT);
    let released: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      released = resolve;
    });
    const { ctx, scheduled, purged } = fakeContext(async () => {
      await gate;
      return { success: true };
    });
    const core = coreStub(() => Response.json({ data: { postId: "p1", threadId: "t1" } }, { status: 201 }));

    const res = await route(write("/v1/openproduct/comments", { slug: "acme-thing", body: "A comment." }), envWith(core), {
      ctx,
    });

    // The answer is back — status, body and `no-store` intact — while the
    // purge is still held open.
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(scheduled).toHaveLength(1);
    expect(purged).toEqual([["op-threads"]]);
    released();
    await Promise.all(scheduled);
  });

  it("purges for a reply and for a new thread too", async () => {
    for (const path of ["/v1/openproduct/threads/thr_1/posts", "/v1/openproduct/threads"]) {
      stubIdentity(SUBJECT);
      resetSubjectCache();
      const { ctx, scheduled, purged } = fakeContext();
      const core = coreStub(() => Response.json({ data: {} }, { status: 201 }));
      const res = await route(write(path), envWith(core), { ctx });
      await Promise.all(scheduled);
      expect([path, res.status, purged]).toEqual([path, 201, [["op-threads"]]]);
    }
  });

  it("purges for an upvote on a post — a count a thread document carries", async () => {
    stubIdentity(SUBJECT);
    const { ctx, scheduled, purged } = fakeContext();
    const core = coreStub(() => Response.json({ data: { votes: 3 } }));
    const res = await route(
      write("/v1/openproduct/posts/0d5e1f2a-1111-2222-3333-444455556666/vote", {}),
      envWith(core),
      { ctx },
    );
    await Promise.all(scheduled);
    expect(res.status).toBe(200);
    expect(purged).toEqual([["op-threads"]]);
  });

  it("purges NOTHING for a write that was refused — the documents did not change", async () => {
    stubIdentity(SUBJECT);
    const { ctx, scheduled, purged } = fakeContext();
    const core = coreStub(() =>
      Response.json({ error: { code: "thread_locked", message: "locked" } }, { status: 409 }),
    );
    const res = await route(write("/v1/openproduct/comments"), envWith(core), { ctx });
    expect(res.status).toBe(409);
    expect(scheduled).toEqual([]);
    expect(purged).toEqual([]);
  });

  it("purges nothing for a write outside the discussion — a save, an endorsement of a listing", async () => {
    for (const path of ["/v1/openproduct/me/saved/acme-thing", "/v1/openproduct/me/endorsements/acme-thing"]) {
      stubIdentity(SUBJECT);
      resetSubjectCache();
      const { ctx, scheduled, purged } = fakeContext();
      const core = coreStub(() => Response.json({ data: {} }));
      const res = await route(write(path, {}), envWith(core), { ctx });
      expect([path, res.status]).toEqual([path, 200]);
      expect([path, scheduled.length, purged]).toEqual([path, 0, []]);
    }
  });

  it("answers exactly the same with no context at all", async () => {
    stubIdentity(SUBJECT);
    const core = coreStub(() => Response.json({ data: { postId: "p1" } }, { status: 201 }));
    const res = await route(write("/v1/openproduct/comments"), envWith(core));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("a purge that fails changes nothing about the answer", async () => {
    const realWarn = console.warn;
    const warned: string[] = [];
    console.warn = (line: unknown) => {
      warned.push(String(line));
    };
    try {
      stubIdentity(SUBJECT);
      const { ctx, scheduled } = fakeContext(async () => {
        throw new Error("purge exploded");
      });
      const core = coreStub(() => Response.json({ data: { postId: "p1" } }, { status: 201 }));
      const res = await route(write("/v1/openproduct/comments"), envWith(core), { ctx });
      expect(res.status).toBe(201);
      await expect(Promise.all(scheduled)).resolves.toBeDefined();
      expect(warned.map((line) => (JSON.parse(line) as { msg: string }).msg)).toEqual(["cache_purge_threw"]);
    } finally {
      console.warn = realWarn;
    }
  });

  it("the worker hands the router its context", () => {
    // Without this line the whole purge path is a function nobody calls.
    const index = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../gateway/src/index.ts"), "utf-8");
    expect(index).toContain("route(request, env, { ctx })");
  });
});
