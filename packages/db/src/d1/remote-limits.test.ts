// The static guard for remote D1 limits local workerd does not enforce
// (OPN D1 slice). The differential suite runs it after every test; this file
// proves it would have caught what it exists to catch.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetSliceSchema, startLocalD1, type LocalD1 } from "./harness.js";
import { recordingD1Executor, remoteLimitBreaches, widestFunctionCall } from "./remote-limits.js";
import { sliceSchemaStatements } from "./schema.js";
import { createD1SliceRepository } from "./slice-repository.js";

describe("widestFunctionCall", () => {
  it("counts a call's arguments, ignoring commas in literals, nested calls and non-calls", () => {
    expect(widestFunctionCall(`SELECT json_object('a', 1, 'b', min(1, 2, 3))`)).toEqual({ name: "json_object", args: 4 });
    expect(widestFunctionCall(`SELECT f('a,b,c', 'd')`)).toEqual({ name: "f", args: 2 });
    expect(widestFunctionCall(`SELECT x FROM t WHERE (a, b, c, d) IS NOT (e, f, g, h) AND y IN (1, 2, 3, 4, 5)`).args).toBe(0);
    expect(widestFunctionCall(`SELECT count(*), now()`)).toEqual({ name: "count", args: 1 });
  });

  it("flags the 34-argument json_object the first draft of the card used — which LOCAL D1 RUNS", async () => {
    const pairs = Array.from({ length: 17 }, (_, i) => `'k${i}', ${i}`).join(", ");
    const text = `SELECT json_object(${pairs}) AS j`;
    expect(remoteLimitBreaches({ text })).toEqual([
      expect.objectContaining({ limit: "functionArguments", detail: "json_object() takes 34" }),
    ]);
    const local = await startLocalD1();
    try {
      expect((await local.sql.execute(text)).rows).toHaveLength(1);
    } finally {
      await local.dispose();
    }
  }, 60_000);

  it("flags a 2 MB parameter, $101, and 100 KB of SQL", () => {
    expect(remoteLimitBreaches({ text: "SELECT $1", params: ["x".repeat(2_000_001)] })[0]!.limit).toBe("valueBytes");
    expect(remoteLimitBreaches({ text: "SELECT $101" })[0]!.limit).toBe("boundParameters");
    expect(remoteLimitBreaches({ text: `SELECT '${"x".repeat(100_001)}'` })[0]!.limit).toBe("statementBytes");
  });

  it("passes every statement of the slice schema (char() takes exactly 32)", () => {
    const widest = sliceSchemaStatements().map((text) => widestFunctionCall(text));
    expect(Math.max(...widest.map((w) => w.args))).toBe(32);
    expect(sliceSchemaStatements().flatMap((text) => remoteLimitBreaches({ text }))).toEqual([]);
  });
});

describe("every statement the slice repository issues, measured", () => {
  let local: LocalD1;
  beforeAll(async () => {
    local = await startLocalD1();
    await resetSliceSchema(local.sql);
  }, 60_000);
  afterAll(async () => {
    await local?.dispose();
  });

  it("stays inside the remote limits, with the widest call named", async () => {
    const recorder = recordingD1Executor(local.sql);
    const repo = createD1SliceRepository(recorder.sql);
    await repo.rebuildCatalogue({ now: "2026-08-17T12:00:00.000Z", mergesSince: "2026-08-15T12:00:00.000Z", endorsementsSince: "2026-08-15T12:00:00.000Z" });
    await repo.listCataloguePage({ cursor: null, limit: 10 });
    await repo.listCataloguePage({ cursor: { activity: 5, publishedAt: "2026-08-01T00:00:00.000Z", slug: "a" }, limit: 10 });
    await repo.listCataloguePage({ cursor: { activity: null, publishedAt: null, slug: "a" }, limit: 10 });
    await repo.replaceSearchIndex("product", [{ kind: "product", entityId: "a", title: "a", summary: null, terms: ["a"], facets: {} }], "2026-08-17T12:00:00.000Z");
    await repo.replaceSearchIndex("product", [], "2026-08-17T12:00:00.000Z");
    await repo.searchCandidates(["a"], 10);
    await repo.getSearchIndexState();
    await repo.markSearchIndexDirty("2026-08-17T12:00:00.000Z");
    await repo.touchSearchIndex();
    expect(recorder.statements.flatMap((s) => remoteLimitBreaches(s))).toEqual([]);
    const widest = recorder.statements
      .map((s) => widestFunctionCall(s.text))
      .reduce((a, b) => (b.args > a.args ? b : a));
    expect(widest).toEqual({ name: "json_insert", args: 19 });
    const longest = Math.max(...recorder.statements.map((s) => Buffer.byteLength(s.text, "utf8")));
    expect(longest).toBeLessThan(10_000);
    const mostParams = Math.max(...recorder.statements.map((s) => (s.params ?? []).length));
    expect(mostParams).toBeLessThanOrEqual(4);
  });
});
