// The catalogue phase's route (openproduct-scale OS5).

import { ENDORSEMENT_REPUBLISH_MS, FRESHNESS_WINDOW_MS } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { CatalogueHandlerDeps } from "@openproduct-worker/handlers/catalogue";

const ENV = { ENVIRONMENT: "test" } as Env;
const REBUILD = "https://openproduct.internal/internal/openproduct/catalogue/rebuild";
const NOW = Date.parse("2026-09-10T12:00:00.000Z");

const post = () => new Request(REBUILD, { method: "POST", headers: { "x-request-id": "req_cat", accept: "application/json" } });

describe("POST /internal/openproduct/catalogue/rebuild", () => {
  it("asks the repository for the rebuild at the moment, with the contract's freshness cutoff, and answers the counts", async () => {
    const inputs: unknown[] = [];
    const calls: string[] = [];
    const deps: CatalogueHandlerDeps = {
      now: () => NOW,
      repo: {
        async refreshEndorsementCounts(input: unknown) {
          calls.push("recount");
          inputs.push(input);
          return 6;
        },
        async rebuildCatalogue(input: unknown) {
          calls.push("rebuild");
          inputs.push(input);
          return { computedAt: new Date(NOW).toISOString(), cards: 5000, written: 12, removed: 1 };
        },
      } as unknown as OpenproductRepository,
    };
    const res = await route(post(), ENV, deps as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toEqual({
      rebuilt: true,
      computedAt: "2026-09-10T12:00:00.000Z",
      cards: 5000,
      written: 12,
      removed: 1,
      upvotesRecounted: 6,
    });
    // OB3 — the upvotes are re-counted BEFORE the order is computed from them.
    expect(calls).toEqual(["recount", "rebuild"]);
    expect(inputs).toEqual([
      { now: "2026-09-10T12:00:00.000Z", republishBefore: new Date(NOW - ENDORSEMENT_REPUBLISH_MS).toISOString() },
      {
        now: "2026-09-10T12:00:00.000Z",
        mergesSince: new Date(NOW - 2 * FRESHNESS_WINDOW_MS.merges).toISOString(),
        endorsementsSince: new Date(NOW - 2 * FRESHNESS_WINDOW_MS.endorsements).toISOString(),
      },
    ]);
  });

  it("a failed re-count costs the catalogue nothing: it rebuilds, and says the count is unknown", async () => {
    const original = console.warn;
    const warned: string[] = [];
    console.warn = (line: unknown) => {
      warned.push(String(line));
    };
    try {
      const deps: CatalogueHandlerDeps = {
        now: () => NOW,
        repo: {
          async refreshEndorsementCounts() {
            throw new Error("deadlock detected");
          },
          async rebuildCatalogue() {
            return { computedAt: new Date(NOW).toISOString(), cards: 2, written: 0, removed: 0 };
          },
        } as unknown as OpenproductRepository,
      };
      const res = await route(post(), ENV, deps as never);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Record<string, unknown> };
      expect(body.data.upvotesRecounted).toBeNull();
      expect(warned.map((l) => (JSON.parse(l) as { msg: string }).msg)).toEqual(["endorsement_recount_failed"]);
    } finally {
      console.warn = original;
    }
  });

  it("a rebuild that throws is a 503 naming the class, one vocabulary line, and the previous catalogue stands", async () => {
    const warned: string[] = [];
    const original = console.warn;
    console.warn = (line: unknown) => {
      warned.push(String(line));
    };
    try {
      const deps: CatalogueHandlerDeps = {
        now: () => NOW,
        repo: {
          async refreshEndorsementCounts() {
            return 0;
          },
          async rebuildCatalogue() {
            const error = new Error("relation openproduct.catalog_cards does not exist") as Error & { code: string };
            error.code = "42P01";
            throw error;
          },
        } as unknown as OpenproductRepository,
      };
      const res = await route(post(), ENV, deps as never);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: { message: string } };
      expect(body.error.message).toBe("Catalogue rebuild failed (42P01)");
      expect(body.error.message).not.toContain("relation");
      expect(warned).toHaveLength(1);
      const line = JSON.parse(warned[0]!) as { msg: string; reason: string; requestId: string; level: string };
      expect(line.msg).toBe("catalogue_rebuild_failed");
      expect(line.level).toBe("warn");
      expect(line.reason).toContain("Error:");
      expect(line.requestId).toBe("req_cat");
    } finally {
      console.warn = original;
    }
  });

  it("is POST only, like every sweep route", async () => {
    const deps = { repo: {} as unknown as OpenproductRepository } as CatalogueHandlerDeps;
    const res = await route(new Request(REBUILD, { method: "GET" }), ENV, deps as never);
    expect(res.status).toBe(405);
  });
});
