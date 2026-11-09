// The changelog reconciles against the pinned key sets (openproduct-consumers CS0).

import { describe, expect, it } from "vitest";

import {
  API_CHANGELOG,
  API_DEPRECATIONS,
  API_STABILITY_SENTENCE,
  CATALOG_API_VERSION,
  DEPRECATION_NOTICE_DAYS,
  buildOpenApiDocument,
  changelogVersion,
  deprecationHeaders,
  keysAfterChangelog,
  pinnedKeysOf,
  type ApiShape,
} from "./index.js";
import { propsFor } from "./openapi.js";

describe("CS-2 — generated from the pinned key sets, then annotated", () => {
  it.each(["card", "product", "page"] as ApiShape[])("replaying the changelog yields exactly the pinned %s keys", (shape) => {
    expect(keysAfterChangelog(shape)).toEqual(pinnedKeysOf(shape));
  });

  it("every entry carries a sentence and a milestone — a key cannot ship without its line", () => {
    for (const release of API_CHANGELOG) {
      expect(release.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.entries.length).toBeGreaterThan(0);
      for (const entry of release.entries) {
        expect([release.version, entry.key, entry.sentence.trim().length > 20]).toEqual([release.version, entry.key, true]);
        expect([entry.key, entry.milestone]).toEqual([entry.key, expect.stringMatching(/^[A-Z]{2,3}\d+[a-z]?$/)]);
      }
    }
  });

  it("fails on a key with no entry — the guard, exercised", () => {
    // A changelog missing one of the pinned keys does not reconcile.
    const short = API_CHANGELOG.map((r) => ({ ...r, entries: r.entries.filter((e) => e.key !== "media") }));
    expect(keysAfterChangelog("card", short)).not.toEqual(pinnedKeysOf("card"));
    // And a removal takes the key out, so a line cannot outlive its key.
    const removed = [{ version: "1.2.0", date: "2027-01-01", entries: [{ key: "media", shape: "card" as const, change: "removed" as const, sentence: "Gone.", milestone: "CS9" }] }, ...API_CHANGELOG];
    expect(keysAfterChangelog("card", removed)).not.toContain("media");
  });

  it("is newest first, and the API's version is the newest release", () => {
    expect(changelogVersion()).toBe(CATALOG_API_VERSION);
    expect(CATALOG_API_VERSION).toBe("1.3.0");
    const dates = API_CHANGELOG.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    // The first four entries the plan named are in 1.1.0; 1.2.0 is OS5's moment
    // on the page; 1.3.0 is OPR5's door into the workspace.
    const second = API_CHANGELOG.find((r) => r.version === "1.1.0")!.entries.map((e) => e.key);
    for (const key of ["installLine", "cleanVotes", "changes", "media"]) expect(second).toContain(key);
    expect(API_CHANGELOG.find((r) => r.version === "1.2.0")!.entries.map((e) => `${e.shape}.${e.key}`)).toEqual(["page.computedAt"]);
    expect(API_CHANGELOG[0]!.entries.map((e) => `${e.shape}.${e.key}`)).toEqual(["product.workspaceRef"]);
  });
});

describe("CS-1 — additive forever, a dated notice for a removal", () => {
  it("says the period in the sentence, and the sentence is in the OpenAPI document", () => {
    expect(API_STABILITY_SENTENCE).toContain(`${DEPRECATION_NOTICE_DAYS} days`);
    expect(API_STABILITY_SENTENCE).toContain("Additive forever");
    expect(API_STABILITY_SENTENCE).toContain("no 2.0.0");
    const doc = buildOpenApiDocument("https://api.test", "https://site.test/docs/api") as {
      info: { description: string };
      externalDocs?: { url: string };
    };
    expect(doc.info.description).toContain(API_STABILITY_SENTENCE);
    expect(doc.externalDocs?.url).toBe("https://site.test/docs/api");
    expect("externalDocs" in (buildOpenApiDocument("https://api.test") as object)).toBe(false);
  });

  it("nothing is in notice today, and a notice would mark the schema from the same entry", () => {
    expect(API_DEPRECATIONS).toEqual([]);
    const props = propsFor(["media", "slug"], [{ key: "media", shape: "card", since: "2026-10-01", until: "2027-01-01", sentence: "x" }]) as Record<string, Record<string, unknown>>;
    expect(props.media!["x-deprecated"]).toEqual({ since: "2026-10-01", until: "2027-01-01" });
    expect("x-deprecated" in props.slug!).toBe(false);
    for (const notice of API_DEPRECATIONS) {
      const days = (Date.parse(notice.until) - Date.parse(notice.since)) / (24 * 60 * 60 * 1000);
      expect(days).toBeGreaterThanOrEqual(DEPRECATION_NOTICE_DAYS);
    }
  });
});

describe("CS1 — a notice reaches the wire from the same entry", () => {
  const notice = { key: "media", shape: "card" as const, since: "2026-09-01", until: "2026-12-01", sentence: "Gone by winter." };

  it("nothing is in notice today, so there is no header", () => {
    expect(deprecationHeaders(new Date("2026-09-10T12:00:00Z"))).toBeNull();
  });

  it("an open notice is Deprecation (the moment it began) and Sunset (the day it goes)", () => {
    const headers = deprecationHeaders(new Date("2026-09-10T12:00:00Z"), [notice]);
    expect(headers).toEqual({ deprecation: `@${Date.parse("2026-09-01") / 1000}`, sunset: "Tue, 01 Dec 2026 00:00:00 GMT" });
  });

  it("the earliest of several wins on both headers, and a notice not yet begun or already over is not one", () => {
    const later = { ...notice, key: "pricing", since: "2026-10-01", until: "2027-03-01" };
    const future = { ...notice, key: "hosting", since: "2027-01-01", until: "2027-06-01" };
    const past = { ...notice, key: "stack", since: "2026-01-01", until: "2026-06-01" };
    expect(deprecationHeaders(new Date("2026-10-15T00:00:00Z"), [later, notice, future, past])).toEqual({
      deprecation: `@${Date.parse("2026-09-01") / 1000}`,
      sunset: "Tue, 01 Dec 2026 00:00:00 GMT",
    });
    expect(deprecationHeaders(new Date("2026-08-01T00:00:00Z"), [future, past])).toBeNull();
  });
});
