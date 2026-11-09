// The studio client (openproduct-independence OX5b).
//
// What is pinned: the header set is closed and the token required (the me-api
// discipline, held by the maintainer surface too); refusals below 500 come
// back as ANSWERS carrying code and blockers (the studio's pages render
// remedies from them) while 5xx stays `unavailable`; and the grant-payload
// read is ROUTING only — it decodes without verifying, and garbage decodes to
// null rather than throwing in a page.

import {
  checkRepo,
  createListing,
  decideAppeal,
  fetchAppealQueue,
  fetchMyAppealableActs,
  fileAppeal,
  fetchMyListings,
  publishListing,
  readGrantPayload,
} from "@openproduct-web/app/studio/studio-api";

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function fetchStub(
  respond: Response | (() => Response),
  captured: Captured[] = [],
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? {}).forEach((value, key) => {
      headers[key] = value;
    });
    captured.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: init?.body === undefined ? undefined : String(init.body),
    });
    return typeof respond === "function" ? respond() : respond.clone();
  }) as typeof fetch;
}

function b64url(json: unknown): string {
  const s = JSON.stringify(json);
  return Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("the closed header set and the request shapes", () => {
  it("sends exactly accept + authorization on a read, content-type only with a body", async () => {
    const captured: Captured[] = [];
    await fetchMyListings("tok_abc", fetchStub(Response.json({ data: { listings: [] } }), captured));
    expect(captured[0]!.url).toContain("/v1/openproduct/me/listings");
    expect(Object.keys(captured[0]!.headers).sort()).toEqual(["accept", "authorization"]);
    expect(captured[0]!.headers.authorization).toBe("Bearer tok_abc");

    const writes: Captured[] = [];
    await createListing(
      "tok_abc",
      "org_x",
      { grant: "g.h", slug: "acme" },
      fetchStub(Response.json({ data: { profile: { id: "opp_1" } } }), writes),
    );
    expect(Object.keys(writes[0]!.headers).sort()).toEqual(["accept", "authorization", "content-type"]);
    expect(writes[0]!.method).toBe("POST");
    expect(JSON.parse(writes[0]!.body!)).toEqual({ grant: "g.h", slug: "acme" });
  });

  it("publishes with NO body when no components are chosen — the pre-OH4 shape", async () => {
    const captured: Captured[] = [];
    await publishListing("tok", "org_x", "opp_1", [], fetchStub(Response.json({ data: { profile: {} } }), captured));
    expect(captured[0]!.body).toBeUndefined();

    const withBody: Captured[] = [];
    await publishListing(
      "tok",
      "org_x",
      "opp_1",
      [{ name: "api", kind: "service" }],
      fetchStub(Response.json({ data: { profile: {} } }), withBody),
    );
    expect(JSON.parse(withBody[0]!.body!)).toEqual({ components: [{ name: "api", kind: "service" }] });
  });
});

describe("the three ways to not-succeed", () => {
  it("maps 401 to unauthorized — signed out, never an error state", async () => {
    const result = await fetchMyListings("tok", fetchStub(new Response("{}", { status: 401 })));
    expect(result.kind).toBe("unauthorized");
  });

  it("maps a 412 refusal to an ANSWER carrying its blockers", async () => {
    const result = await publishListing(
      "tok",
      "org_x",
      "opp_1",
      [],
      fetchStub(
        Response.json(
          { error: { code: "precondition_failed", message: "not yet", details: { blockers: ["workspace_link_required", "pitch_missing"] } } },
          { status: 412 },
        ),
      ),
    );
    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result.status).toBe(412);
    expect(result.blockers).toEqual(["workspace_link_required", "pitch_missing"]);
  });

  it("maps 5xx and thrown fetches to unavailable, never a refusal", async () => {
    const down = await checkRepo("tok", "org_x", "opp_1", fetchStub(new Response("{}", { status: 503 })));
    expect(down.kind).toBe("unavailable");
    const dead = await checkRepo("tok", "org_x", "opp_1", (async () => {
      throw new Error("socket");
    }) as unknown as typeof fetch);
    expect(dead.kind).toBe("unavailable");
  });

  it("an outage carries what the upstream said — the hop's sentence and its request id", async () => {
    // The gateway's 5xx sentences each name a different hop ("Platform
    // unreachable", "Openproduct service unavailable", core's "Internal
    // error"); a page that prints one, with the request id, gives a
    // maintainer something to quote and an operator a line to find.
    const down = await checkRepo(
      "tok",
      "org_x",
      "opp_1",
      fetchStub(
        Response.json(
          { error: { code: "internal_error", message: "Openproduct service unavailable", requestId: "req_abc" } },
          { status: 503 },
        ),
      ),
    );
    expect(down).toEqual({
      kind: "unavailable",
      status: 503,
      code: "internal_error",
      message: "Openproduct service unavailable",
      requestId: "req_abc",
    });
    const dead = await checkRepo("tok", "org_x", "opp_1", (async () => {
      throw new Error("socket");
    }) as unknown as typeof fetch);
    expect(dead).toEqual({ kind: "unavailable", code: "fetch_failed", message: "socket" });
  });
});

describe("the grant payload read is routing, not authority", () => {
  it("decodes org and project from a well-shaped blob", () => {
    const blob = `${b64url({ seam: "v1", orgId: "org_abc", projectId: "prj_def", doorRef: "tok" })}.deadbeef`;
    expect(readGrantPayload(blob)).toEqual({ orgId: "org_abc", projectId: "prj_def" });
  });

  it.each([
    ["garbage", "not-a-grant"],
    ["no payload half", ".deadbeef"],
    ["non-JSON payload", "bm90LWpzb24.deadbeef"],
    ["missing fields", `${Buffer.from(JSON.stringify({ seam: "v1" })).toString("base64url")}.x`],
  ])("answers null for %s rather than throwing", (_label, blob) => {
    expect(readGrantPayload(blob)).toBeNull();
  });
});

describe("TS5 — the appeal client", () => {
  it("reads what was done through /me, where standing is the whole authorization", async () => {
    const captured: Captured[] = [];
    await fetchMyAppealableActs("tok", fetchStub(Response.json({ data: { acts: [] } }), captured));
    // NOT an org path. Core derives which listings are the caller's from
    // listing_maintainers; there is no org to scope by, and a maintainer of
    // nothing gets an empty list rather than a refusal.
    expect(captured[0]!.url).toContain("/v1/openproduct/me/appeals");
    expect(captured[0]!.method).toBe("GET");
    expect(captured[0]!.headers.authorization).toBe("Bearer tok");
  });

  it("files with the act id and the argument, and nothing else", async () => {
    const captured: Captured[] = [];
    await fileAppeal(
      "tok",
      { actId: "11111111-1111-4111-8111-111111111111", says: "It is not a mirror." },
      fetchStub(Response.json({ data: { appeal: {} } }), captured),
    );
    expect(captured[0]!.method).toBe("POST");
    expect(JSON.parse(captured[0]!.body!)).toEqual({
      actId: "11111111-1111-4111-8111-111111111111",
      says: "It is not a mirror.",
    });
  });

  it("reads the operator queue under reports, where the other two queues live", async () => {
    const captured: Captured[] = [];
    await fetchAppealQueue("tok", fetchStub(Response.json({ data: { appeals: [] } }), captured));
    // One operator check and one route guard cover all three queues, and a
    // triager has one attention.
    expect(captured[0]!.url).toContain("/v1/openproduct/reports/appeals");
  });

  it("decides on its own path, so a decision never falls through to the queue read", async () => {
    const captured: Captured[] = [];
    await decideAppeal(
      "tok",
      { appealId: "22222222-2222-4222-8222-222222222222", decision: "uphold", reason: "Wrong." },
      fetchStub(Response.json({ data: { appeal: {}, reversed: true } }), captured),
    );
    expect(captured[0]!.url).toContain("/v1/openproduct/reports/appeals/decide");
    expect(captured[0]!.method).toBe("POST");
  });

  it("maps a refusal to a refusal, never to an outage", async () => {
    // A 409 is an ANSWER — "you have already appealed this" — and the page
    // renders the contract's sentence for it. Treating it as unavailable
    // would tell somebody the site was broken when it was talking to them.
    const already = await fileAppeal(
      "tok",
      { actId: "11111111-1111-4111-8111-111111111111", says: "Again." },
      fetchStub(
        Response.json({ error: { code: "already-appealed", message: "x" } }, { status: 409 }),
      ),
    );
    expect(already).toMatchObject({ kind: "refused", code: "already-appealed" });
  });
});
