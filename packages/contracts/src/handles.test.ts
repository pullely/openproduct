// The handle namespace's rules (openproduct-commons CG0).
//
// What is pinned: every refusal names WHICH rule was broken; the contract's
// grammar and the migration's CHECK are the same grammar; and `/@ada` and
// `/ada` can never resolve to each other.

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HANDLE_MAX,
  HANDLE_MIN,
  HANDLE_PATTERN,
  HANDLE_REFUSALS,
  HANDLE_REFUSAL_COPY,
  claimRefusal,
  handleFromPath,
  handlePath,
  parseHandle,
} from "./handles.js";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("a refusal names the rule that was broken", () => {
  it("reports the FIRST thing a person would want to be told", () => {
    // Order matters: reporting `bad-characters` for a forty-character handle
    // would be true and useless.
    expect(parseHandle("a")).toMatchObject({ ok: false, reason: "too-short" });
    expect(parseHandle("A".repeat(40))).toMatchObject({ ok: false, reason: "too-long" });
    expect(parseHandle("ada!")).toMatchObject({ ok: false, reason: "bad-characters" });
    expect(parseHandle("ada_b")).toMatchObject({ ok: false, reason: "bad-characters" });
    expect(parseHandle("-ada")).toMatchObject({ ok: false, reason: "edge-dash" });
    expect(parseHandle("ada-")).toMatchObject({ ok: false, reason: "edge-dash" });
  });

  it("every refusal has a sentence, and none of them is 'invalid handle'", () => {
    for (const reason of HANDLE_REFUSALS) {
      const copy = HANDLE_REFUSAL_COPY[reason];
      expect(copy.length).toBeGreaterThan(20);
      expect(copy).toMatch(/\.$/);
      expect(copy.toLowerCase()).not.toContain("invalid");
    }
    // The one that surprises people says WHY, not just no.
    expect(HANDLE_REFUSAL_COPY.released).toContain("never re-issued");
    expect(HANDLE_REFUSAL_COPY.released).toContain("impersonated");
  });

  it("canonicalises rather than merely accepting", () => {
    // The caller must store what this RETURNS, not what the person typed:
    // `Ada` and `ada` are the same handle, and a table holding both spellings
    // has two rows for one person.
    expect(parseHandle("  Ada  ")).toEqual({ ok: true, handle: "ada" });
    expect(parseHandle("@Ada")).toEqual({ ok: true, handle: "ada" });
    // A stray extra sigil cannot become a second address for the same person.
    expect(parseHandle("@@ada")).toEqual({ ok: true, handle: "ada" });
  });

  it("accepts the boundaries and refuses just past them", () => {
    expect(parseHandle("a".repeat(HANDLE_MIN)).ok).toBe(true);
    expect(parseHandle("a".repeat(HANDLE_MAX)).ok).toBe(true);
    expect(parseHandle("a".repeat(HANDLE_MIN - 1)).ok).toBe(false);
    expect(parseHandle("a".repeat(HANDLE_MAX + 1)).ok).toBe(false);
  });
});

describe("the contract's grammar and the migration's CHECK are the same grammar", () => {
  it("byte for byte, and neither admits a one-character handle", () => {
    const sql = readFileSync(
      resolve(HERE, "../../db/src/migrations/1360_openproduct_handles/up.sql"),
      "utf-8",
    );
    const check = /handle ~ '([^']+)'/.exec(sql)?.[1];
    expect(check).toBe(HANDLE_PATTERN.source);
    // THE BUG THIS CATCHES, because it already happened once: writing the
    // tail as `([a-z0-9-]{0,30}[a-z0-9])?` reads as "2–32" and in fact admits
    // a ONE-character handle, so the CHECK enforces nothing about the minimum
    // and a direct INSERT creates `@a`.
    expect(HANDLE_PATTERN.test("a")).toBe(false);
    expect(HANDLE_PATTERN.source).not.toContain("?");
  });

  it("the reserved list is data the API can explain, not a CHECK", () => {
    const sql = readFileSync(
      resolve(HERE, "../../db/src/migrations/1360_openproduct_handles/up.sql"),
      "utf-8",
    );
    expect(sql).toContain("INSERT INTO openproduct.handles (handle, reserved_for)");
    // Every seeded entry must itself satisfy the grammar. A reserved list
    // containing entries that could never be claimed teaches its reader that
    // the list is decorative.
    const seeded = [...sql.matchAll(/^\s*\('([a-z0-9.-]+)', '(?:route|impersonation)'\)/gm)].map(
      (m) => m[1]!,
    );
    expect(seeded.length).toBeGreaterThan(20);
    for (const entry of seeded) {
      expect(`${entry}: ${HANDLE_PATTERN.test(entry)}`).toBe(`${entry}: true`);
    }
    // Both classes are represented: routes we would collide with, and names
    // somebody would use to impersonate this program.
    expect(sql).toContain("('docs', 'route')");
    expect(sql).toContain("('security', 'impersonation')");
  });
});

describe("claiming, against what the database holds", () => {
  const ADA = "usr_ada";

  it("a free handle is claimable", () => {
    expect(claimRefusal("ada", null, ADA)).toEqual({ ok: true, handle: "ada" });
  });

  it("reserved beats released beats taken — the most specific reason wins", () => {
    expect(
      claimRefusal("docs", { reservedFor: "route", subjectId: null, releasedAt: null }, ADA),
    ).toMatchObject({ reason: "reserved" });
    expect(
      claimRefusal("ada", { reservedFor: null, subjectId: null, releasedAt: "2026-01-01" }, ADA),
    ).toMatchObject({ reason: "released" });
    expect(
      claimRefusal("ada", { reservedFor: null, subjectId: "usr_bob", releasedAt: null }, ADA),
    ).toMatchObject({ reason: "taken" });
  });

  it("re-claiming your OWN handle is ok, not taken", () => {
    // The commonest way to reach this path is somebody re-submitting their
    // own form; telling them their own handle is taken is wrong and alarming.
    expect(
      claimRefusal("ada", { reservedFor: null, subjectId: ADA, releasedAt: null }, ADA),
    ).toEqual({ ok: true, handle: "ada" });
  });
});

describe("the two namespaces cannot resolve to each other (OPC-B)", () => {
  it("`/@ada` is a person and `/ada` is a product, with no overlap", () => {
    expect(handleFromPath("/@ada")).toBe("ada");
    expect(handleFromPath("/@ada/")).toBe("ada");
    // A product slug must NEVER resolve as a handle. That separation is what
    // removes the need for a shared uniqueness table between the two.
    expect(handleFromPath("/kettleworks")).toBeNull();
    expect(handleFromPath("/")).toBeNull();
    expect(handleFromPath("/@ada/extra")).toBeNull();
    // And a malformed handle does not resolve at all rather than resolving
    // to something close to it.
    expect(handleFromPath("/@a")).toBeNull();
    expect(handleFromPath("/@-ada")).toBeNull();
  });

  it("the path a handle advertises carries the sigil", () => {
    // The `@` is part of the URL, not decoration — it is what a person hands
    // out and what keeps the namespaces apart.
    expect(handlePath("ada")).toBe("/@ada");
  });
});
