// The report door (openproduct-commons TS0): /internal/openproduct/reports
//
// What is pinned here is mostly about what a reporter does NOT learn, because
// that is where the design decisions are:
//
//   - a duplicate is answered exactly as a first report is, so an error code
//     cannot be used to probe the queue;
//   - the response carries an id and a state and nothing about how many
//     others reported the same thing — that is a brigading signal;
//   - the queue is refused to everyone but a named operator;
//   - only people report, and only into the closed vocabularies.
//
// The SQL half — the partial unique index, the append-only trail, the
// no-automated-removal CHECK — is pinned against a live engine in
// packages/db/src/repository-pg.test.ts.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REPORT_REASONS, REPORT_SUBJECT_KINDS } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = resolve(__dirname, "../../../core/src");

const SUBJECT = "usr_0123456789abcdef0123456789abcdef";
const OPERATOR = "usr_ffffffffffffffffffffffffffffffff";
const BASE = "https://openproduct.internal/internal/openproduct/reports";

function env(operators?: string): Env {
  return { ENVIRONMENT: "test", ...(operators ? { OPENPRODUCT_OPERATORS: operators } : {}) } as Env;
}

function req(
  url: string,
  method: string,
  body?: unknown,
  subjectId: string = SUBJECT,
  subjectType = "user",
): Request {
  return new Request(url, {
    method,
    headers: {
      "x-request-id": "req_report",
      "content-type": "application/json",
      "x-actor-subject-id": subjectId,
      "x-actor-subject-type": subjectType,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

interface Harness {
  deps: ProfileHandlerDeps;
  filed: Array<{ subjectKind: string; subjectRef: string; reporterSubjectId: string; reason: string }>;
  /** Set to make the next createReport answer as the unique index would. */
  refuseNext: { value: boolean };
}

function harness(): Harness {
  const filed: Harness["filed"] = [];
  const refuseNext = { value: false };
  const repo = {
    async createReport(input: {
      id: string;
      subjectKind: string;
      subjectRef: string;
      reporterSubjectId: string;
      reason: string;
      detail?: string | null;
    }) {
      if (refuseNext.value) return null;
      filed.push({
        subjectKind: input.subjectKind,
        subjectRef: input.subjectRef,
        reporterSubjectId: input.reporterSubjectId,
        reason: input.reason,
      });
      return {
        id: input.id,
        subjectKind: input.subjectKind,
        subjectRef: input.subjectRef,
        reporterSubjectId: input.reporterSubjectId,
        reason: input.reason,
        detail: input.detail ?? null,
        state: "open",
        resolvedAt: null,
        resolvedBy: null,
        createdAt: "2026-08-25T10:00:00.000Z",
        updatedAt: "2026-08-25T10:00:00.000Z",
      };
    },
    async listOpenReports() {
      return filed.map((f, i) => ({
        id: `rep_${i}`,
        ...f,
        detail: null,
        state: "open",
        resolvedAt: null,
        resolvedBy: null,
        createdAt: "2026-08-25T10:00:00.000Z",
        updatedAt: "2026-08-25T10:00:00.000Z",
        alsoReported: 0,
      }));
    },
  } as unknown as OpenproductRepository;
  return { deps: { repo } as ProfileHandlerDeps, filed, refuseNext };
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("filing a report", () => {
  it("accepts a signed-in person's report against a listing", async () => {
    const h = harness();
    const res = await route(
      req(BASE, "POST", { subjectKind: "listing", subjectRef: "acme-thing", reason: "spam" }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(202);
    const payload = (await body(res)).data as Record<string, unknown>;
    expect(payload.state).toBe("open");
    expect(typeof payload.id).toBe("string");
    expect(h.filed).toEqual([
      {
        subjectKind: "listing",
        subjectRef: "acme-thing",
        reporterSubjectId: SUBJECT,
        reason: "spam",
      },
    ]);
  });

  it("answers a duplicate exactly as it answers a first report", async () => {
    // The queue is not a thing a reporter gets to probe. If a duplicate 409'd,
    // anyone could learn whether their earlier report was still open — and,
    // by filing as themselves against a subject, whether it had been resolved.
    const h = harness();
    h.refuseNext.value = true;
    const res = await route(
      req(BASE, "POST", { subjectKind: "listing", subjectRef: "acme-thing", reason: "spam" }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(202);
    const payload = (await body(res)).data as Record<string, unknown>;
    expect(payload.state).toBe("open");
    expect(Object.keys(payload).sort()).toEqual(["id", "state"]);
  });

  it("tells a reporter nothing about the queue", async () => {
    const h = harness();
    const res = await route(
      req(BASE, "POST", { subjectKind: "profile", subjectRef: "@ada", reason: "impersonation" }),
      env(),
      h.deps,
    );
    const payload = (await body(res)).data as Record<string, unknown>;
    // No count, no "others also reported", no subject state. Every one of
    // those is a brigading signal we would be handing out for free.
    expect(Object.keys(payload).sort()).toEqual(["id", "state"]);
  });

  it("refuses a service principal — reports come from people", async () => {
    const h = harness();
    const res = await route(
      req(
        BASE,
        "POST",
        { subjectKind: "listing", subjectRef: "acme-thing", reason: "spam" },
        "sp_0123456789abcdef0123456789abcdef",
        "service_principal",
      ),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
    expect(h.filed).toEqual([]);
  });

  it("refuses anonymity — the door needs an actor", async () => {
    // TS-1's first layer is standing, and OPX-2 already settles that login
    // gates interaction. Anonymous visitors keep the footer report address.
    const h = harness();
    const res = await route(
      new Request(BASE, {
        method: "POST",
        headers: { "x-request-id": "req_anon", "content-type": "application/json" },
        body: JSON.stringify({ subjectKind: "listing", subjectRef: "a", reason: "spam" }),
      }),
      env(),
      h.deps,
    );
    expect(res.status).toBe(401);
    expect(h.filed).toEqual([]);
  });

  it("refuses anything outside the closed vocabularies", async () => {
    const h = harness();
    for (const bad of [
      { subjectKind: "the-whole-internet", subjectRef: "x", reason: "spam" },
      { subjectKind: "listing", subjectRef: "x", reason: "i-dislike-it" },
      { subjectKind: "listing", subjectRef: "../../etc/passwd", reason: "spam" },
      { subjectKind: "listing", subjectRef: "", reason: "spam" },
      { subjectKind: "listing", subjectRef: "x", reason: "spam", detail: "x".repeat(2001) },
    ]) {
      const res = await route(req(BASE, "POST", bad), env(), h.deps);
      expect(res.status).toBe(422);
    }
    expect(h.filed).toEqual([]);
  });

  it("the vocabularies the door enforces are the ones the contract publishes", () => {
    expect([...REPORT_SUBJECT_KINDS]).toEqual([
      "listing",
      "profile",
      "thread",
      "post",
      "collection",
    ]);
    // No "this is not open source" reason: OPC-I settles that this directory
    // shows the licence it observed and does not adjudicate which qualify,
    // and a report reason is not the place to relitigate a locked decision.
    expect(REPORT_REASONS).not.toContain("not-open-source");
  });
});

describe("the queue", () => {
  it("is refused to everyone but a named operator", async () => {
    const h = harness();
    const denied = await route(req(`${BASE}/queue`, "GET"), env(), h.deps);
    expect(denied.status).toBe(403);

    // And with no operators configured, to everyone — the correct default for
    // a surface that shows what people reported about each other.
    const noneConfigured = await route(req(`${BASE}/queue`, "GET", undefined, OPERATOR), env(), h.deps);
    expect(noneConfigured.status).toBe(403);

    const allowed = await route(
      req(`${BASE}/queue`, "GET", undefined, OPERATOR),
      env(OPERATOR),
      h.deps,
    );
    expect(allowed.status).toBe(200);
  });
});

describe("the record is append-only, and the absence is the mechanism", () => {
  it("no update or delete path to moderation_acts exists anywhere in core", () => {
    // A restore is a NEW act, never an edit of the removal — because the
    // question an appeal has to answer is "what did you do, and when did you
    // undo it", and an edited row cannot answer it. The claim is absence, so
    // it is a source scan.
    const sources = ["handlers/reports.ts", "router.ts"].map((f) =>
      readFileSync(resolve(CORE_SRC, f), "utf-8"),
    );
    for (const source of sources) {
      expect(source).not.toMatch(/UPDATE\s+openproduct\.moderation_acts/i);
      expect(source).not.toMatch(/DELETE\s+FROM\s+openproduct\.moderation_acts/i);
      expect(source).not.toMatch(/updateModerationAct|deleteModerationAct/);
    }
  });

  it("the repository interface offers no way to rewrite one", () => {
    const types = readFileSync(
      resolve(__dirname, "../../../packages/db/src/types.ts"),
      "utf-8",
    );
    expect(types).toContain("appendModerationAct");
    // Match a METHOD DECLARATION, not the bare name: the interface's own
    // comment names the absent methods on purpose, so that a reader adding
    // one has already been told not to.
    expect(types).not.toMatch(/^\s*(update|delete|clear)ModerationActs?\s*\(/m);
  });
});
