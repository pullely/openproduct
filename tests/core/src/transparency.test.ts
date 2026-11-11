// The public record (openproduct-commons TS5).
//
// What is pinned here is the four things that would make this page dishonest
// if a refactor lost them:
//
//   - it is PUBLIC and anonymous, and refuses a write
//   - the window is the contract's, computed from the moment asked
//   - every figure comes from a repository read, never from a literal
//   - nothing in the response names a listing or a person

import {
  TRANSPARENCY_REPORT_KEYS,
  TRANSPARENCY_WINDOW_DAYS,
  transparencySince,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { TransparencyHandlerDeps } from "@openproduct-worker/handlers/transparency";

const PUBLIC = "https://openproduct.internal/internal/public/openproduct/transparency";
const NOW = Date.parse("2026-08-26T12:00:00.000Z");

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

interface Harness {
  deps: TransparencyHandlerDeps;
  asked: string[];
}

function harness(): Harness {
  const asked: string[] = [];
  const remember = (since: string) => {
    asked.push(since);
  };
  const repo = {
    async countModerationActsSince(since: string) {
      remember(since);
      return [
        { act: "delist", count: 5 },
        { act: "relist", count: 2 },
        { act: "report_declined", count: 40 },
      ];
    },
    async countReportsSince(since: string) {
      remember(since);
      return [
        { state: "open", count: 3 },
        { state: "declined", count: 40 },
      ];
    },
    async countAppealsSince(since: string) {
      remember(since);
      return [
        { state: "upheld", count: 2 },
        { state: "refused", count: 1 },
      ];
    },
    async countAppealReversalsSince(since: string) {
      remember(since);
      return 2;
    },
    async integrityDisclosure(since: string) {
      remember(since);
      return [{ reason: "ring", discounted: 11 }];
    },
    async flagDisclosure(since: string) {
      remember(since);
      return [{ kind: "filler", state: "dismissed", count: 1 }];
    },
  } as unknown as OpenproductRepository;

  return { deps: { repo, now: () => NOW } as TransparencyHandlerDeps, asked };
}

function get(url = PUBLIC): Request {
  return new Request(url, { method: "GET", headers: { "x-request-id": "req_ts5" } });
}

async function body(res: Response): Promise<Record<string, unknown>> {
  const parsed = (await res.json()) as { data?: Record<string, unknown> };
  return parsed.data ?? {};
}

describe("the transparency record", () => {
  it("is readable with no actor at all", async () => {
    // A page of numbers about how an intermediary uses its power over
    // people's visibility is worth very little if only the people who already
    // signed up to that intermediary can read it.
    const h = harness();
    const res = await route(get(), env(), undefined, h.deps as never);
    expect(res.status).toBe(200);
  });

  it("asks EVERY read for the contract's window, not its own", async () => {
    const h = harness();
    await route(get(), env(), undefined, h.deps as never);
    expect(h.asked).toHaveLength(6);
    expect(new Set(h.asked).size).toBe(1);
    expect(h.asked[0]).toBe(transparencySince(NOW));
    expect(Date.parse(h.asked[0]!)).toBe(NOW - TRANSPARENCY_WINDOW_DAYS * 86_400_000);
  });

  it("carries exactly the report's keys, and the window it covers", async () => {
    const h = harness();
    const res = await route(get(), env(), undefined, h.deps as never);
    const data = await body(res);
    const report = data.transparency as Record<string, unknown>;
    expect(Object.keys(report).sort()).toEqual([...TRANSPARENCY_REPORT_KEYS].sort());
    expect(report.since).toBe(transparencySince(NOW));
    expect(report.until).toBe(new Date(NOW).toISOString());
    expect(data.windowDays).toBe(TRANSPARENCY_WINDOW_DAYS);
  });

  it("returns what the repository returned, with nothing computed on the way", async () => {
    // The arithmetic lives in the contract where a test pins it. A handler
    // that rounded, filtered or "tidied" a count on the way out would be a
    // second place the published number could differ from the ledger.
    const h = harness();
    const report = (await body(await route(get(), env(), undefined, h.deps as never)))
      .transparency as Record<string, unknown>;
    expect(report.acts).toEqual([
      { act: "delist", count: 5 },
      { act: "relist", count: 2 },
      { act: "report_declined", count: 40 },
    ]);
    expect(report.appealsReversed).toBe(2);
    expect(report.discounts).toEqual([{ reason: "ring", discounted: 11 }]);
  });

  it("names no listing and no person anywhere in the response", async () => {
    const h = harness();
    const raw = await (await route(get(), env(), undefined, h.deps as never)).text();
    for (const forbidden of ["slug", "subjectId", "handle", "usr_"]) {
      expect({ forbidden, present: raw.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });

  it("is cached for longer than the directory, because these are quarterly figures", async () => {
    const h = harness();
    const res = await route(get(), env(), undefined, h.deps as never);
    // EXACTLY `public, max-age=N` — the gateway honours a downstream cache
    // directive only in that shape and otherwise falls back to its own sixty
    // seconds, so an `s-maxage` appended here would be discarded and this
    // page would quietly cache for a minute.
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("refuses a write", async () => {
    const h = harness();
    const res = await route(
      new Request(PUBLIC, { method: "POST", headers: { "x-request-id": "req_ts5" } }),
      env(),
      undefined,
      h.deps as never,
    );
    expect(res.status).toBe(405);
  });
});
