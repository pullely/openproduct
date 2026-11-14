// The authenticated half's API client (openproduct-home OH2).
//
// The mirror-image claim of OD5's: where the anonymous client has no code
// path that can ATTACH a credential, this one has no code path that can OMIT
// it — the token is a required argument. The header set is closed (accept,
// authorization, content-type on writes), nothing is copied from any inbound
// request, and every read is no-store.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OVERLAY_BOUND_KEYS,
  claimHandle,
  fetchExport,
  fetchMe,
  fetchOverlay,
  fetchMyApplications,
  fetchSaved,
  meHeaders,
  saveProduct,
  setProfileVisibility,
  unsaveProduct,
  updateMe,
} from "@openproduct-web/app/me/me-api";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../web/src/app");

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  cache: RequestCache | undefined;
}

function recordingFetch(body: unknown, status = 200): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
      cache: init?.cache,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("the header set is CLOSED and the token is required", () => {
  it("a read sends exactly accept + authorization, no-store", async () => {
    const { fetchImpl, calls } = recordingFetch({ data: { contributor: null, subjectId: "usr_1" } });
    await fetchMe("tok", fetchImpl);
    expect(calls[0]!.headers).toEqual({
      accept: "application/json",
      authorization: "Bearer tok",
    });
    expect(calls[0]!.cache).toBe("no-store");
    expect(calls[0]!.url).toContain("/v1/openproduct/me");
  });

  it("a write adds exactly content-type and serializes the body it was given", async () => {
    const { fetchImpl, calls } = recordingFetch({ data: { contributor: {} } });
    await updateMe("tok", { displayName: "Ada", bio: null }, fetchImpl);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.headers).toEqual({
      accept: "application/json",
      authorization: "Bearer tok",
      "content-type": "application/json",
    });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ displayName: "Ada", bio: null });
  });

  it("the closed set is what makes 'no cookie, no forwarded header' checkable", () => {
    // Absence is asserted against the complete object, not a denylist.
    expect(meHeaders("tok", false)).toEqual({
      accept: "application/json",
      authorization: "Bearer tok",
    });
  });
});

describe("routes and failure posture", () => {
  it("addresses the me family exactly", async () => {
    const { fetchImpl, calls } = recordingFetch({ data: {} });
    await fetchMyApplications("t", fetchImpl);
    await fetchSaved("t", fetchImpl);
    await saveProduct("t", "acme-thing", fetchImpl);
    await unsaveProduct("t", "acme-thing", fetchImpl);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "GET /v1/openproduct/me/applications",
      "GET /v1/openproduct/me/saved",
      "PUT /v1/openproduct/me/saved",
      "DELETE /v1/openproduct/me/saved/acme-thing",
    ]);
  });

  it("distinguishes a dead token from a service outage — the pages react differently", async () => {
    // 401/403 → unauthorized (reads as signed out, redirects into sign-in).
    const unauth = recordingFetch({ error: { code: "unauthenticated" } }, 401);
    expect(await fetchMe("stale", unauth.fetchImpl)).toEqual({ kind: "unauthorized" });
    const forbidden = recordingFetch({ error: { code: "forbidden" } }, 403);
    expect(await fetchMe("t", forbidden.fetchImpl)).toEqual({ kind: "unauthorized" });

    // Any other non-ok → unavailable (an error state, NEVER a redirect loop
    // through the authorization server).
    const down = recordingFetch({ error: { code: "internal" } }, 503);
    expect(await fetchMe("t", down.fetchImpl)).toEqual({ kind: "unavailable" });

    // A malformed 200 (no data envelope) is an outage, not a session.
    const empty = recordingFetch({}, 200);
    expect(await fetchMe("t", empty.fetchImpl)).toEqual({ kind: "unavailable" });

    // The happy path carries the payload.
    const ok = recordingFetch({ data: { contributor: null, subjectId: "usr_1" } }, 200);
    expect(await fetchMe("t", ok.fetchImpl)).toEqual({
      kind: "ok",
      data: { contributor: null, subjectId: "usr_1" },
    });
  });
});

/** The one call a probe made, or a failure that names the absence rather than
 *  a `TypeError` three lines later. */
function onlyCall(calls: Call[]): Call {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (!call) throw new Error("no request was made");
  return call;
}

describe("the overlay forwards every bound the page sent (OPP8)", () => {
  // THE BUG THIS PINS. `overlayPath()` has always sent three parameters and
  // core has always parsed three; this client took `ids` alone, so `follows`
  // and `posts` were dropped at the one hop between them. Nothing failed —
  // every follow button simply rendered unfollowed and every comment vote
  // unvoted, for a visitor who had done both, because the lists they read
  // were always empty.
  //
  // The reason no test caught it is worth as much as the fix: `follows.test.ts`
  // asserts that `overlayPath()` SENDS `follows`, and it passed throughout.
  // The browser half and the core half were each tested against the contract,
  // and the proxy between them was tested against neither.

  it("names all three bounds in the query string", async () => {
    const { fetchImpl, calls } = recordingFetch({ data: { overlay: {} } });
    await fetchOverlay(
      "t",
      { ids: "acme-thing,other-thing", follows: "topic:dev-tools", posts: "pst_1" },
      fetchImpl,
    );
    const url = new URL(onlyCall(calls).url);
    expect(url.pathname).toBe("/v1/openproduct/me/overlay");
    expect(url.searchParams.get("ids")).toBe("acme-thing,other-thing");
    expect(url.searchParams.get("follows")).toBe("topic:dev-tools");
    expect(url.searchParams.get("posts")).toBe("pst_1");
  });

  it("omits a bound the page did not ask about, and the query entirely when it asked nothing", async () => {
    const some = recordingFetch({ data: { overlay: {} } });
    await fetchOverlay("t", { ids: null, follows: "person:ada", posts: null }, some.fetchImpl);
    const url = new URL(onlyCall(some.calls).url);
    expect(url.searchParams.get("follows")).toBe("person:ada");
    expect(url.searchParams.has("ids")).toBe(false);
    expect(url.searchParams.has("posts")).toBe(false);

    // The account chip asks about nothing on a page with no cards — one
    // request for the badge and the identity block, and no parameters at all.
    const none = recordingFetch({ data: { overlay: {} } });
    await fetchOverlay("t", { ids: null, follows: null, posts: null }, none.fetchImpl);
    const bare = onlyCall(none.calls).url;
    expect(bare).toContain("/v1/openproduct/me/overlay");
    expect(bare).not.toContain("?");
  });

  it("keeps the wire names in ONE place, so the route and the client cannot drift", () => {
    // The route builds its bounds object from this list rather than naming
    // three strings of its own. That is the property that makes a fourth
    // bound impossible to add on one side only.
    expect([...OVERLAY_BOUND_KEYS]).toEqual(["ids", "follows", "posts"]);
  });
});

describe("the profile's writes (CG1)", () => {
  it("sends every authored field the form carries, links and the open-to-project flag included", async () => {
    const { fetchImpl, calls } = recordingFetch({ data: { contributor: {} } });
    await updateMe(
      "tok",
      { displayName: "Ada", bio: null, githubUrl: "https://github.com/ada", siteUrl: null, openToProject: true },
      fetchImpl,
    );
    expect(JSON.parse(calls[0]!.body!)).toEqual({
      displayName: "Ada",
      bio: null,
      githubUrl: "https://github.com/ada",
      siteUrl: null,
      openToProject: true,
    });
  });

  it("claims and releases a handle over the one endpoint, null meaning release", async () => {
    const { fetchImpl, calls } = recordingFetch({ data: { handle: "ada" } });
    await claimHandle("tok", "ada", fetchImpl);
    await claimHandle("tok", null, fetchImpl);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "PUT /v1/openproduct/me/handle",
      "PUT /v1/openproduct/me/handle",
    ]);
    expect(JSON.parse(calls[0]!.body!)).toEqual({ handle: "ada" });
    expect(JSON.parse(calls[1]!.body!)).toEqual({ handle: null });
  });

  it("turns the public page on and off with the API's own field name", async () => {
    const { fetchImpl, calls } = recordingFetch({ data: { contributor: {} } });
    await setProfileVisibility("tok", true, fetchImpl);
    await setProfileVisibility("tok", false, fetchImpl);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "PUT /v1/openproduct/me/profile-visibility",
      "PUT /v1/openproduct/me/profile-visibility",
    ]);
    expect(JSON.parse(calls[0]!.body!)).toEqual({ public: true });
    expect(JSON.parse(calls[1]!.body!)).toEqual({ public: false });
  });

  it("a 422 is a REFUSAL carrying the field's reason — not an outage, not a sign-out", async () => {
    // The reason is the whole answer the form owes the person. Collapsing it
    // into `unavailable` tells somebody whose handle is taken that the
    // service is down.
    const refused = recordingFetch(
      {
        error: {
          code: "validation_error",
          message: "Validation failed",
          details: { fields: { handle: ["That handle is taken."] } },
        },
      },
      422,
    );
    expect(await claimHandle("tok", "taken", refused.fetchImpl)).toEqual({
      kind: "refused",
      status: 422,
      message: "Validation failed",
      fields: { handle: ["That handle is taken."] },
    });

    // A dead token is still a sign-out, and a 5xx is still an outage.
    const unauth = recordingFetch({ error: { code: "unauthenticated" } }, 401);
    expect(await setProfileVisibility("stale", true, unauth.fetchImpl)).toEqual({ kind: "unauthorized" });
    const down = recordingFetch({ error: { code: "internal" } }, 503);
    expect(await updateMe("tok", { displayName: null, bio: null }, down.fetchImpl)).toEqual({
      kind: "unavailable",
    });
  });
});

describe("CS3 — everything they may take with them, as a file", () => {
  it("asks the API for the export with the closed header set, and nothing else", async () => {
    const { fetchImpl, calls } = recordingFetch({ data: { tables: {} } });
    const result = await fetchExport("t", fetchImpl);
    expect(result.kind).toBe("ok");
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(["GET /v1/openproduct/me/export"]);
  });

  it("the website answers /me/export as an attachment from the session's bearer, and settings links to it as a plain link", () => {
    const route = readFileSync(resolve(APP_DIR, "me/export/route.ts"), "utf-8");
    expect(route).toContain("fetchExport(session.accessToken)");
    expect(route).toContain('"content-disposition": `attachment; filename="openproduct-${day}.json"`');
    expect(route).toContain('"cache-control": "no-store"');
    expect(route).toContain("/signin?return_to=%2Fme%2Fexport");
    // The link moved with the account card: it is on `/me/settings` since
    // openproduct-redesign OPR1, and `/me` is the profile.
    const page = readFileSync(resolve(APP_DIR, "me/settings/page.tsx"), "utf-8");
    expect(page).toMatch(/<a\s+href="\/me\/export"\s+data-me-export/);
    expect(page).toContain("Download your data");
    expect(readFileSync(resolve(APP_DIR, "me/page.tsx"), "utf-8")).not.toContain("/me/export");
  });
});
