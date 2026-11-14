// The crew's route handlers and the reaction route (openproduct-redesign
// OPR-3).
//
// The browser posts a form to `/{slug}/manage/…`; the handler answers a 303
// back, or JSON to an enhanced caller. What is pinned here is the ORDER the
// handler works in, because the order is the security argument:
//
//   no session        → sign in, and NOTHING has been asked of the gateway
//   a malformed form  → field errors, and nothing has been asked
//   the ids           → resolved from the slug and the caller's token; a form
//                       that names an `org` or a `profile` is ignored
//   core's refusal    → passed through: the status, the field errors
//
// The handler is exercised directly (it touches no request object); the
// route files import `next/server`, which this lane does not run, so their
// shape is pinned from source.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCT_POST_API } from "@openproduct/contracts";

import {
  blockField,
  blocksFromFields,
  readMilestoneAct,
  readPostAct,
  readProfilePatch,
} from "@openproduct-web/app/posts/crew-forms";
import {
  CREW_ERRORS,
  CREW_NOTICES,
  crewError,
  crewNotice,
  handleMilestoneWrite,
  handleMilestonesRead,
  handleNeedsYouRead,
  handlePostWrite,
  handlePostsRead,
  handleProfileWrite,
  returnTarget,
  withQuery,
  type CrewCall,
} from "@openproduct-web/app/posts/crew-handler";
import { REACTION_NONE, reactAnchor, reactOutcome, reactPath, readReactAct } from "@openproduct-web/app/posts/react-act";
import { decodePending, encodePending } from "@openproduct-web/app/me/pending";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PPO = `ppo_${"0".repeat(31)}1`;
const PMS = `pms_${"0".repeat(31)}1`;
const PMS2 = `pms_${"0".repeat(31)}2`;
const OPR = `opr_${"0".repeat(31)}1`;
const A = PRODUCT_POST_API;

interface Call {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

/**
 * A gateway that knows one crew: `tok` is on the crew of `ackstack`
 * (org_9 / opp_9). Everything else is answered by `routes`, keyed
 * `METHOD path`; an unlisted call is a 404, which is what core says to
 * anybody addressing a product they are not on the crew of.
 */
function gateway(routes: Record<string, { status?: number; body: unknown }> = {}, overlay?: { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname + parsed.search;
    const method = init?.method ?? "GET";
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ method, path, auth, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    const said =
      parsed.pathname === "/v1/openproduct/me/overlay"
        ? (overlay ?? {
            body: {
              data: {
                overlay: {
                  crew: parsed.searchParams.get("ids") === "ackstack" ? [{ slug: "ackstack", org: "org_9", profile: "opp_9" }] : [],
                },
              },
            },
          })
        : (routes[`${method} ${path}`] ?? { status: 404, body: { error: { code: "not_found", message: "Not found" } } });
    return new Response(JSON.stringify(said.body), { status: said.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl, writes: () => calls.filter((c) => !c.path.startsWith("/v1/openproduct/me/overlay")) };
}

const call = (over: Partial<CrewCall> & { fetchImpl: typeof fetch }): CrewCall => ({
  slug: "ackstack",
  token: "tok",
  fields: {},
  json: false,
  ...over,
});

const crewPost = (over: Record<string, unknown> = {}) => ({
  id: PPO,
  kind: "feature",
  state: "draft",
  blocks: [],
  publishedAt: null,
  milestoneId: null,
  roleOpeningId: null,
  threadId: null,
  createdAt: "2026-05-30T10:00:00.000Z",
  updatedAt: "2026-05-30T10:00:00.000Z",
  ...over,
});

describe("a form's blocks", () => {
  it("come out in CATALOGUE order whatever order the form sent them in", () => {
    const fields = { [blockField("try")]: "https://example.com", [blockField("what")]: "It exports.", [blockField("feature")]: "Exports" };
    expect(blocksFromFields(fields, "feature")).toEqual([
      { block: "feature", value: "Exports" },
      { block: "what", value: "It exports." },
      { block: "try", value: "https://example.com" },
    ]);
  });

  it("leave out a block left empty, which is how an optional one is removed", () => {
    expect(blocksFromFields({ [blockField("feature")]: "Exports", [blockField("for")]: "   " }, "feature")).toEqual([
      { block: "feature", value: "Exports" },
    ]);
  });

  it("take the wire's own list too, as JSON or as a JSON string, and refuse anything else", () => {
    const list = [{ block: "version", value: "v1" }, { block: "added", value: "One\r\nTwo" }];
    const expected = [{ block: "version", value: "v1" }, { block: "added", value: "One\nTwo" }];
    expect(blocksFromFields({ blocks: list }, "version")).toEqual(expected);
    expect(blocksFromFields({ blocks: JSON.stringify(list) }, "version")).toEqual(expected);
    expect(blocksFromFields({ blocks: "not json" }, "version")).toBeNull();
    expect(blocksFromFields({ blocks: [{ block: "version" }] }, "version")).toBeNull();
    expect(blocksFromFields({ blocks: { block: "version", value: "v1" } }, "version")).toBeNull();
  });

  it("keep a block the kind does not have, so core names it rather than this dropping it", () => {
    expect(blocksFromFields({ [blockField("mystery")]: "x", [blockField("role")]: "Advisor" }, "seat")).toEqual([
      { block: "role", value: "Advisor" },
      { block: "mystery", value: "x" },
    ]);
  });
});

describe("a form is read into an act, or into field errors", () => {
  it("reads the four post intents", () => {
    expect(readPostAct({ intent: "create", kind: "idea", [blockField("problem")]: "Nobody can." })).toEqual({
      intent: "create",
      kind: "idea",
      blocks: [{ block: "problem", value: "Nobody can." }],
    });
    expect(readPostAct({ intent: "save", post: PPO, kind: "idea", [blockField("who")]: "Vendors" })).toEqual({
      intent: "save",
      postId: PPO,
      blocks: [{ block: "who", value: "Vendors" }],
    });
    expect(readPostAct({ intent: "publish", post: PPO, milestone: PMS, opening: OPR })).toEqual({
      intent: "publish",
      postId: PPO,
      kind: null,
      // No blocks were sent: the draft is published as it stands.
      blocks: null,
      milestoneId: PMS,
      roleOpeningId: OPR,
    });
    expect(readPostAct({ intent: "remove", post: PPO })).toEqual({ intent: "remove", postId: PPO });
  });

  it("refuses a post act that is not well-formed, naming the field", () => {
    const fieldsOf = (fields: Record<string, unknown>) => {
      const act = readPostAct(fields);
      return "fields" in act ? Object.keys(act.fields) : null;
    };
    expect(fieldsOf({})).toEqual(["intent"]);
    expect(fieldsOf({ intent: "obliterate" })).toEqual(["intent"]);
    expect(fieldsOf({ intent: "save" })).toEqual(["post"]);
    expect(fieldsOf({ intent: "remove", post: "../etc" })).toEqual(["post"]);
    expect(fieldsOf({ intent: "create" })).toEqual(["kind"]);
    // A demo is recorded, never typed: it is not an authored kind.
    expect(fieldsOf({ intent: "create", kind: "demo" })).toEqual(["kind"]);
    expect(fieldsOf({ intent: "publish", post: PPO, milestone: "first" })).toEqual(["milestone"]);
    expect(fieldsOf({ intent: "publish", post: PPO, opening: "seat-1" })).toEqual(["opening"]);
    expect(fieldsOf({ intent: "publish" })).toEqual(["kind"]);
    expect(fieldsOf({ intent: "save", post: PPO, blocks: "{" })).toEqual(["blocks"]);
  });

  it("reads the six milestone intents", () => {
    expect(readMilestoneAct({ intent: "create", code: " AS1 ", title: "First run", summary: "" })).toEqual({
      intent: "create",
      body: { code: "AS1", title: "First run", summary: null },
    });
    expect(readMilestoneAct({ intent: "update", milestone: PMS, title: "Renamed" })).toEqual({
      intent: "update",
      milestoneId: PMS,
      body: { title: "Renamed" },
    });
    expect(readMilestoneAct({ intent: "reorder", order: `${PMS2}, ${PMS}` })).toEqual({ intent: "reorder", order: [PMS2, PMS] });
    expect(readMilestoneAct({ intent: "reorder", order: [PMS, PMS2] })).toEqual({ intent: "reorder", order: [PMS, PMS2] });
    for (const intent of ["delete", "ship", "unship"] as const) {
      expect(readMilestoneAct({ intent, milestone: PMS })).toEqual({ intent, milestoneId: PMS });
    }
  });

  it("refuses a milestone act that is not well-formed", () => {
    const fieldsOf = (fields: Record<string, unknown>) => {
      const act = readMilestoneAct(fields);
      return "fields" in act ? Object.keys(act.fields) : null;
    };
    expect(fieldsOf({ intent: "launch" })).toEqual(["intent"]);
    expect(fieldsOf({ intent: "create", title: "No code" })).toEqual(["code"]);
    expect(fieldsOf({ intent: "create", code: "AS1" })).toEqual(["title"]);
    expect(fieldsOf({ intent: "ship" })).toEqual(["milestone"]);
    expect(fieldsOf({ intent: "delete", milestone: PPO })).toEqual(["milestone"]);
    expect(fieldsOf({ intent: "reorder", order: "" })).toEqual(["order"]);
    expect(fieldsOf({ intent: "reorder", order: `${PMS},${PMS}` })).toEqual(["order"]);
    expect(fieldsOf({ intent: "reorder", order: `${PMS},nope` })).toEqual(["order"]);
  });

  it("patches only the listing fields the form sent, and clears with an empty one", () => {
    expect(readProfilePatch({ tryUrl: " https://example.com " })).toEqual({ tryUrl: "https://example.com" });
    expect(readProfilePatch({ tryUrl: "", tagline: "A line" })).toEqual({ tryUrl: null, tagline: "A line" });
    expect(readProfilePatch({ slug: "renamed" })).toEqual({ slug: "renamed" });
    expect(readProfilePatch({ slug: " " })).toEqual({ kind: "invalid", fields: { slug: ["A product needs a name"] } });
    expect(readProfilePatch({ return_to: "/ackstack" })).toEqual({ kind: "invalid", fields: { form: ["Nothing to change"] } });
  });
});

describe("no session: sign in, and nothing has been asked", () => {
  it("every write bounces, carrying where to come back to", async () => {
    const g = gateway();
    const signedOut = { token: null, fetchImpl: g.fetchImpl };
    expect(await handlePostWrite(call({ ...signedOut, fields: { intent: "remove", post: PPO, return_to: "/ackstack?tab=updates" } }))).toEqual({
      kind: "signin",
      returnTo: "/ackstack?tab=updates",
    });
    expect(await handleMilestoneWrite(call({ ...signedOut, fields: { intent: "ship", milestone: PMS } }))).toEqual({
      kind: "signin",
      returnTo: "/ackstack",
    });
    expect(await handleProfileWrite(call({ ...signedOut, fields: { tryUrl: "https://example.com" } }))).toEqual({
      kind: "signin",
      returnTo: "/ackstack",
    });
    // Signed out is decided BEFORE the form is read and before any request.
    expect(await handlePostWrite(call({ ...signedOut, fields: {} }))).toEqual({ kind: "signin", returnTo: "/ackstack" });
    expect(g.calls).toEqual([]);
  });

  it("a read answers an empty 401, so a fetch cannot mistake a sign-in page for data", async () => {
    const g = gateway();
    for (const handler of [handlePostsRead, handleMilestonesRead, handleNeedsYouRead]) {
      expect(await handler(call({ token: null, fetchImpl: g.fetchImpl }))).toEqual({ kind: "json", status: 401, body: null });
    }
    expect(g.calls).toEqual([]);
  });

  it("a token that died on the way is the same sign-in", async () => {
    const dead = gateway({}, { status: 401, body: {} });
    expect(await handlePostWrite(call({ fetchImpl: dead.fetchImpl, fields: { intent: "remove", post: PPO } }))).toEqual({
      kind: "signin",
      returnTo: "/ackstack",
    });
    // …and so is one that dies between the crew check and the act.
    const late = gateway({ [`DELETE ${A.crewPost("org_9", "opp_9", PPO)}`]: { status: 401, body: {} } });
    expect(await handlePostWrite(call({ fetchImpl: late.fetchImpl, fields: { intent: "remove", post: PPO } }))).toEqual({
      kind: "signin",
      returnTo: "/ackstack",
    });
    expect(await handleNeedsYouRead(call({ fetchImpl: dead.fetchImpl }))).toEqual({ kind: "json", status: 401, body: null });
  });

  it("the return address is only ever a path on this origin", () => {
    expect(returnTarget({ return_to: "/ackstack#updates" }, "/x")).toBe("/ackstack#updates");
    for (const bad of ["https://evil.example", "//evil.example", "/auth/callback", "/signin?return_to=/", "", 7]) {
      expect(returnTarget({ return_to: bad }, "/ackstack")).toBe("/ackstack");
    }
  });
});

describe("the ids come from the slug and the caller's token, never from the form", () => {
  it("addresses the crew routes with what core's crew check returned", async () => {
    const g = gateway({ [`DELETE ${A.crewPost("org_9", "opp_9", PPO)}`]: { body: { data: { removed: true } } } });
    const answer = await handlePostWrite(
      call({
        fetchImpl: g.fetchImpl,
        // A forged form: somebody else's workspace and listing.
        fields: { intent: "remove", post: PPO, org: "org_victim", profile: "opp_victim", orgId: "org_victim", profileId: "opp_victim" },
      }),
    );
    expect(answer).toEqual({ kind: "redirect", to: "/ackstack?notice=removed" });
    // First the crew check, for THIS slug, with the caller's token…
    expect(g.calls[0]).toEqual({ method: "GET", path: "/v1/openproduct/me/overlay?ids=ackstack", auth: "Bearer tok", body: undefined });
    // …then the act, at the ids that came back.
    expect(g.writes().map((c) => c.path)).toEqual([A.crewPost("org_9", "opp_9", PPO)]);
    expect(JSON.stringify(g.calls)).not.toContain("victim");
    // And there is no field the handler could have read them from.
    for (const file of ["posts/crew-forms.ts", "posts/crew-handler.ts"]) {
      expect([file, /fields\.(org|profile|orgId|profileId)\b|text\(fields, "(org|profile)"\)/.test(code(file))]).toEqual([file, false]);
    }
  });

  it("answers somebody who is not on the crew exactly as it answers a product that is not there", async () => {
    const g = gateway();
    const stranger = call({ slug: "someone-elses", fetchImpl: g.fetchImpl, fields: { intent: "remove", post: PPO } });
    expect(await handlePostWrite(stranger)).toEqual({ kind: "redirect", to: "/someone-elses?error=not-found" });
    expect(await handlePostWrite({ ...stranger, json: true })).toEqual({
      kind: "json",
      status: 404,
      body: { error: { code: "not_found", message: "Not found", fields: {} } },
    });
    expect(await handleNeedsYouRead(stranger)).toEqual({
      kind: "json",
      status: 404,
      body: { error: { code: "not_found", message: "Not found", fields: {} } },
    });
    // Nothing was ever sent to a crew route.
    expect(g.writes()).toEqual([]);
  });

  it("says unavailable when the crew check itself could not be made", async () => {
    const g = gateway({}, { status: 503, body: {} });
    expect(await handleMilestoneWrite(call({ fetchImpl: g.fetchImpl, fields: { intent: "ship", milestone: PMS } }))).toEqual({
      kind: "redirect",
      to: "/ackstack?error=unavailable",
    });
    expect(await handleMilestoneWrite(call({ fetchImpl: g.fetchImpl, json: true, fields: { intent: "ship", milestone: PMS } }))).toEqual({
      kind: "json",
      status: 502,
      body: { error: { code: "unavailable", message: CREW_ERRORS.unavailable } },
    });
  });
});

describe("validation errors are surfaced, not swallowed", () => {
  it("a malformed form is a 422 with its fields, and the gateway is never asked", async () => {
    const g = gateway();
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, json: true, fields: { intent: "create" } }))).toEqual({
      kind: "json",
      status: 422,
      body: { error: { code: "validation_failed", message: CREW_ERRORS.invalid, fields: { kind: ["Choose a kind of post"] } } },
    });
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, fields: { intent: "create", return_to: "/ackstack/new" } }))).toEqual({
      kind: "redirect",
      to: "/ackstack/new?error=invalid&fields=kind",
    });
    expect(g.calls).toEqual([]);
  });

  it("passes core's field errors through to an enhanced caller, word for word", async () => {
    const fields = { "blocks.try": ["Try it must be an http(s) address"], "blocks.what": ["What it does is required"] };
    const g = gateway({
      [`POST ${A.crewPublish("org_9", "opp_9", PPO)}`]: {
        status: 422,
        body: { error: { code: "validation_failed", message: "Some blocks need another look", details: { fields } } },
      },
    });
    const act = { intent: "publish", post: PPO, kind: "feature", [blockField("feature")]: "Exports", [blockField("try")]: "ftp://x" };
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, json: true, fields: act }))).toEqual({
      kind: "json",
      status: 422,
      body: { error: { code: "validation_failed", message: "Some blocks need another look", fields } },
    });
    // What was sent is what the form held, in catalogue order.
    expect(g.writes()[0]!.body).toEqual({
      blocks: [{ block: "feature", value: "Exports" }, { block: "try", value: "ftp://x" }],
      milestoneId: null,
      roleOpeningId: null,
    });
    // A form cannot carry sentences in an address: it carries WHICH fields.
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, fields: { ...act, return_to: `/ackstack/new?draft=${PPO}` } }))).toEqual({
      kind: "redirect",
      to: `/ackstack/new?draft=${PPO}&error=invalid&fields=blocks.try%2Cblocks.what`,
    });
  });

  it("a conflict keeps its status and says so", async () => {
    const g = gateway({
      [`POST ${A.crewPublish("org_9", "opp_9", PPO)}`]: { status: 409, body: { error: { code: "conflict", message: "This post is already published" } } },
    });
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, json: true, fields: { intent: "publish", post: PPO } }))).toEqual({
      kind: "json",
      status: 409,
      body: { error: { code: "conflict", message: "This post is already published", fields: {} } },
    });
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, fields: { intent: "publish", post: PPO } }))).toEqual({
      kind: "redirect",
      to: "/ackstack?error=conflict",
    });
  });
});

describe("what a write answers with", () => {
  it("create goes to the builder on the new draft; an enhanced caller gets the post", async () => {
    const created = crewPost();
    const g = gateway({ [`POST ${A.crewPosts("org_9", "opp_9")}`]: { status: 201, body: { data: { post: created } } } });
    const fields = { intent: "create", kind: "feature", [blockField("feature")]: "Exports" };
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, fields }))).toEqual({
      kind: "redirect",
      to: `/ackstack/new?draft=${PPO}&notice=draft&post=${PPO}`,
    });
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, json: true, fields }))).toEqual({
      kind: "json",
      status: 200,
      body: { data: { post: created } },
    });
    expect(g.writes()[0]!.body).toEqual({ kind: "feature", blocks: [{ block: "feature", value: "Exports" }] });
  });

  it("publish goes to the post's own page", async () => {
    const published = crewPost({ state: "published", publishedAt: "2026-06-01T00:00:00.000Z" });
    const g = gateway({ [`POST ${A.crewPublish("org_9", "opp_9", PPO)}`]: { body: { data: { post: published } } } });
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, fields: { intent: "publish", post: PPO } }))).toEqual({
      kind: "redirect",
      to: `/ackstack/posts/${PPO}?notice=posted&post=${PPO}`,
    });
    // The draft was published as it stands: no blocks were sent.
    expect(g.writes()[0]!.body).toEqual({ milestoneId: null, roleOpeningId: null });
  });

  it("Post pressed before anything was saved writes the draft, then publishes it", async () => {
    const g = gateway({
      [`POST ${A.crewPosts("org_9", "opp_9")}`]: { status: 201, body: { data: { post: crewPost() } } },
      [`POST ${A.crewPublish("org_9", "opp_9", PPO)}`]: { body: { data: { post: crewPost({ state: "published" }) } } },
    });
    const fields = { intent: "publish", kind: "seat", [blockField("role")]: "Advisor", [blockField("what")]: "Advise.", opening: OPR };
    const answer = await handlePostWrite(call({ fetchImpl: g.fetchImpl, fields }));
    expect(answer).toEqual({ kind: "redirect", to: `/ackstack/posts/${PPO}?notice=posted&post=${PPO}` });
    expect(g.writes().map((c) => [c.method, c.path])).toEqual([
      ["POST", A.crewPosts("org_9", "opp_9")],
      ["POST", A.crewPublish("org_9", "opp_9", PPO)],
    ]);
    expect(g.writes()[1]!.body).toEqual({ milestoneId: null, roleOpeningId: OPR });
  });

  it("…and if that publish is refused, the draft it wrote is named so nothing typed is lost", async () => {
    const g = gateway({
      [`POST ${A.crewPosts("org_9", "opp_9")}`]: { status: 201, body: { data: { post: crewPost() } } },
      [`POST ${A.crewPublish("org_9", "opp_9", PPO)}`]: {
        status: 422,
        body: { error: { code: "validation_failed", message: "Invalid", details: { fields: { "blocks.what": ["What you'd do is required"] } } } },
      },
    });
    const fields = { intent: "publish", kind: "seat", [blockField("role")]: "Advisor" };
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, fields }))).toEqual({
      kind: "redirect",
      to: `/ackstack/new?draft=${PPO}&error=invalid&fields=blocks.what%2Cdraft`,
    });
    expect(await handlePostWrite(call({ fetchImpl: g.fetchImpl, json: true, fields }))).toEqual({
      kind: "json",
      status: 422,
      body: { error: { code: "validation_failed", message: "Invalid", fields: { "blocks.what": ["What you'd do is required"], draft: [PPO] } } },
    });
  });

  it("shipping a milestone tells the form which draft core prepared", async () => {
    const offered = crewPost({ id: `ppo_${"0".repeat(31)}7`, milestoneId: PMS });
    const data = { milestone: { id: PMS, position: 0, code: "AS1", title: "First", summary: null, shippedAt: "2026-06-01T00:00:00.000Z" }, stage: "shipping", offeredPost: offered };
    const g = gateway({
      [`PUT ${A.crewMilestoneShipped("org_9", "opp_9", PMS)}`]: { body: { data } },
      [`DELETE ${A.crewMilestoneShipped("org_9", "opp_9", PMS)}`]: { body: { data: { ...data, offeredPost: null } } },
    });
    expect(await handleMilestoneWrite(call({ fetchImpl: g.fetchImpl, fields: { intent: "ship", milestone: PMS } }))).toEqual({
      kind: "redirect",
      to: `/ackstack?notice=shipped&offered=${offered.id}`,
    });
    expect(await handleMilestoneWrite(call({ fetchImpl: g.fetchImpl, fields: { intent: "unship", milestone: PMS } }))).toEqual({
      kind: "redirect",
      to: "/ackstack?notice=unshipped",
    });
    expect(await handleMilestoneWrite(call({ fetchImpl: g.fetchImpl, json: true, fields: { intent: "ship", milestone: PMS } }))).toEqual({
      kind: "json",
      status: 200,
      body: { data },
    });
  });

  it("every milestone intent reaches its own route", async () => {
    const ok = { body: { data: { milestone: {}, milestones: [], stage: "idea", deleted: true } } };
    const g = gateway({
      [`POST ${A.crewMilestones("org_9", "opp_9")}`]: ok,
      [`PATCH ${A.crewMilestone("org_9", "opp_9", PMS)}`]: ok,
      [`PUT ${A.crewMilestones("org_9", "opp_9")}`]: ok,
      [`DELETE ${A.crewMilestone("org_9", "opp_9", PMS)}`]: ok,
    });
    const notices: string[] = [];
    for (const fields of [
      { intent: "create", code: "AS1", title: "First" },
      { intent: "update", milestone: PMS, title: "Renamed" },
      { intent: "reorder", order: `${PMS2},${PMS}` },
      { intent: "delete", milestone: PMS },
    ]) {
      const answer = await handleMilestoneWrite(call({ fetchImpl: g.fetchImpl, fields }));
      notices.push(answer.kind === "redirect" ? answer.to : answer.kind);
    }
    expect(notices).toEqual([
      "/ackstack?notice=milestone-added",
      "/ackstack?notice=milestone-saved",
      "/ackstack?notice=reordered",
      "/ackstack?notice=milestone-removed",
    ]);
    expect(g.writes().map((c) => c.body)).toEqual([
      { code: "AS1", title: "First" },
      { title: "Renamed" },
      { order: [PMS2, PMS] },
      undefined,
    ]);
  });

  it("saving the try address patches only that, and a rename lands on the new address", async () => {
    const root = "/v1/organizations/org_9/openproduct/profiles/opp_9";
    const g = gateway({ [`PATCH ${root}`]: { body: { data: { profile: { slug: "ackstack", tryUrl: "https://example.com/" } } } } });
    expect(await handleProfileWrite(call({ fetchImpl: g.fetchImpl, fields: { tryUrl: "https://example.com", return_to: "/ackstack#about" } }))).toEqual({
      kind: "redirect",
      to: "/ackstack?notice=profile-saved#about",
    });
    expect(g.writes()[0]!.body).toEqual({ tryUrl: "https://example.com" });
    expect(await handleProfileWrite(call({ fetchImpl: g.fetchImpl, json: true, fields: { tryUrl: "" } }))).toEqual({
      kind: "json",
      status: 200,
      body: { data: { profile: { slug: "ackstack", tryUrl: "https://example.com/" } } },
    });

    const renamed = gateway({ [`PATCH ${root}`]: { body: { data: { profile: { slug: "ackstack-two", tryUrl: null } } } } });
    expect(await handleProfileWrite(call({ fetchImpl: renamed.fetchImpl, fields: { slug: "ackstack-two", return_to: "/ackstack#about" } }))).toEqual({
      kind: "redirect",
      to: "/ackstack-two?notice=profile-saved",
    });
  });

  it("the crew's reads hand back core's data, drafts and all", async () => {
    const needsYou = { requests: [], drafts: [crewPost()] };
    const g = gateway({
      [`GET ${A.crewNeedsYou("org_9", "opp_9")}`]: { body: { data: { needsYou } } },
      [`GET ${A.crewPosts("org_9", "opp_9")}`]: { body: { data: { posts: [crewPost()] } } },
      [`GET ${A.crewMilestones("org_9", "opp_9")}`]: { body: { data: { milestones: [], stage: "idea" } } },
    });
    expect(await handleNeedsYouRead(call({ fetchImpl: g.fetchImpl }))).toEqual({ kind: "json", status: 200, body: { data: { needsYou } } });
    expect(await handlePostsRead(call({ fetchImpl: g.fetchImpl }))).toEqual({ kind: "json", status: 200, body: { data: { posts: [crewPost()] } } });
    expect(await handleMilestonesRead(call({ fetchImpl: g.fetchImpl }))).toEqual({
      kind: "json",
      status: 200,
      body: { data: { milestones: [], stage: "idea" } },
    });
  });

  it("a notice or an error in an address is a code from a closed list, never a sentence", () => {
    expect(crewNotice("posted")).toBe(CREW_NOTICES.posted);
    expect(crewError("invalid")).toBe(CREW_ERRORS.invalid);
    for (const made of ["<script>", "toString", "constructor", "", null, undefined]) {
      expect(crewNotice(made)).toBeNull();
      expect(crewError(made)).toBeNull();
    }
    expect(withQuery("/a?x=1#frag", { notice: "saved", post: null })).toBe("/a?x=1&notice=saved#frag");
  });
});

describe("the route files are adapters", () => {
  const ROUTES = ["posts", "milestones", "profile", "needs-you"].map((name) => `[slug]/manage/${name}/route.ts`);

  it("exist, one per crew surface, each beside no page", () => {
    for (const file of ROUTES) {
      expect([file, existsSync(resolve(APP_DIR, file))]).toEqual([file, true]);
      expect([file, existsSync(resolve(APP_DIR, file.replace("route.ts", "page.tsx")))]).toEqual([file, false]);
    }
  });

  it("decide nothing: they build the call, hand it to the handler, and respond", () => {
    for (const file of ROUTES) {
      const src = code(file);
      expect(src).toContain("crewCall(request, params");
      expect(src).toMatch(/respond\(request, await handle\w+\(call\)\)/);
      // No second sign-in redirect, no session read, no id of its own.
      expect([file, /\/signin|NextResponse\.redirect|decodeSession|org|profileId/.test(src.replace(/handleProfileWrite|manage\/profile/g, ""))]).toEqual([
        file,
        false,
      ]);
    }
    expect(code("[slug]/manage/posts/route.ts")).toMatch(/export async function GET[\s\S]*export async function POST/);
    expect(code("[slug]/manage/milestones/route.ts")).toMatch(/export async function GET[\s\S]*export async function POST/);
    expect(code("[slug]/manage/profile/route.ts")).not.toContain("export async function GET");
    expect(code("[slug]/manage/needs-you/route.ts")).not.toContain("export async function POST");
  });

  it("the one adapter takes the token from the session and answers sign-in through the one place that builds it", () => {
    const adapter = code("posts/crew-route.ts");
    expect(adapter).toContain("decodeSession(request.cookies.get(SESSION_COOKIE)?.value)");
    expect(adapter).toContain("session.accessToken");
    expect(adapter).not.toContain("subjectId");
    expect(adapter).toContain('actAnswer(request, "signin", { returnTo: answer.returnTo })');
    expect(adapter).not.toContain("/signin");
    // 303, so a reload cannot re-submit; and never cached.
    expect(adapter).toContain("NextResponse.redirect(new URL(answer.to, request.url), 303)");
    expect(adapter).toContain('"cache-control": "no-store"');
    // The handler itself never touches Next, which is why it is testable here.
    expect(code("posts/crew-handler.ts")).not.toContain("next/server");
    expect(code("posts/crew-forms.ts")).not.toContain("next/server");
  });
});

describe("the reaction act", () => {
  it("is addressed by the reaction to hold afterwards, and read back the same", () => {
    const params = (path: string) => new URL(path, "https://openproduct.live").searchParams;
    expect(readReactAct(params(reactPath(PPO, "would_use", "/")))).toEqual({ postId: PPO, reaction: "would_use" });
    expect(readReactAct(params(reactPath(PPO, null, "/")))).toEqual({ postId: PPO, reaction: null });
    expect(reactPath(PPO, null, "/")).toContain(`reaction=${REACTION_NONE}`);
    expect(readReactAct(params(`/me/react?post=${PPO}`))).toEqual({ postId: PPO, reaction: null });
    // A reaction outside the vocabulary, or a post id that is not one.
    expect(readReactAct(params(`/me/react?post=${PPO}&reaction=love`))).toBeNull();
    expect(readReactAct(params("/me/react?post=thr_1&reaction=useful"))).toBeNull();
    expect(readReactAct(params("/me/react?reaction=useful"))).toBeNull();
    // Sign-in returns to the control itself.
    expect(reactPath(PPO, "useful", `/feed#${reactAnchor(PPO)}`)).toContain(encodeURIComponent(`#react-${PPO}`));
  });

  it("treats your own post as its own outcome: not a failure, not a sign-in", () => {
    expect(reactOutcome({ kind: "ok" })).toBe("ok");
    expect(reactOutcome({ kind: "unauthorized" })).toBe("signin");
    expect(reactOutcome({ kind: "refused", status: 409 })).toBe("own-post");
    expect(reactOutcome({ kind: "refused", status: 404 })).toBe("failed");
    expect(reactOutcome({ kind: "unavailable" })).toBe("failed");
  });

  it("the route bounces a signed-out press through sign-in, carrying the reaction only when it sets one", () => {
    const route = code("me/react/route.ts");
    expect(route).toContain("const act = readReactAct(params);");
    expect(route).toContain("sanitizeReturnTo(params.get(\"return_to\"))");
    // Before the session is used for anything, a missing one is the bounce.
    expect(route).toMatch(/if \(!session\) \{\s*return actAnswer\(request, "signin", \{ returnTo, \.\.\.\(pending \? \{ pending \} : \{\}\) \}\);/);
    expect(route).toContain('act.reaction !== null ? ({ act: "react", postId: act.postId, reaction: act.reaction } as const) : undefined');
    // The gateway decides; the cookie is only where the token is.
    expect(route).toContain("setReaction(session.accessToken, act.postId, act.reaction)");
    expect(route).toContain("clearReaction(session.accessToken, act.postId)");
    // It builds no redirect of its own.
    expect(route).not.toContain("/signin");
    expect(route).not.toContain("NextResponse.redirect");
    // Your own post: a quiet 409 for the enhanced caller, the page for a form.
    expect(route).toMatch(/outcome === "own-post" && wantsJson\(request\)[\s\S]*status: 409/);
    expect(route).toContain('return actAnswer(request, "ok", { returnTo });');
  });

  it("survives sign-in as a record that can only set", () => {
    const record = { act: "react", postId: PPO, reaction: "impressive" } as const;
    expect(decodePending(encodePending(record))).toEqual(record);
    for (const bad of [
      { act: "react", postId: PPO, reaction: "none" },
      { act: "react", postId: PPO, reaction: null },
      { act: "react", postId: PPO },
      { act: "react", postId: "thr_1", reaction: "useful" },
      { act: "unreact", postId: PPO },
    ]) {
      expect(decodePending(btoa(JSON.stringify(bad)))).toBeNull();
    }
    // The replay calls the same function the route calls.
    expect(code("me/resume/route.ts")).toContain("setReaction(token, act.postId, act.reaction)");
  });
});
