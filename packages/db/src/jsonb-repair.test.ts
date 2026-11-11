// 1870 puts double-encoded rows back (openproduct-worldclass-v2 LI1).
//
// The ladder is applied up to 1860, rows are written the way production's
// driver wrote every JSON parameter for four months — a JSON string scalar
// whose text is the JSON that was meant — and then 1870 runs. Twice, because
// a repair that is not idempotent is a migration that cannot be re-applied.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { manifest } from "./manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPAIR = "1870_openproduct_jsonb_repair";
const ladder = manifest.migrations.filter((m) => m.context === "openproduct");
const BEFORE = ladder.slice(0, ladder.findIndex((m) => m.id === REPAIR)).map((m) => resolve(__dirname, "migrations", m.path));
const REPAIR_SQL = readFileSync(resolve(__dirname, "migrations", ladder.find((m) => m.id === REPAIR)!.path), "utf-8");

const ORG = "11111111-1111-4111-8111-111111111111";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const PROFILE = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  for (const m of BEFORE) await db.exec(readFileSync(m, "utf-8"));
  // The damaged shape: a jsonb STRING whose text is the JSON that was meant.
  await db.query(
    `INSERT INTO openproduct.profiles (id, org_id, project_id, slug, stack, stack_canonical, link_grant, created_by)
     VALUES ($1, $2, $3, 'damaged', to_jsonb($4::text), to_jsonb($5::text), to_jsonb($6::text), 'usr_a')`,
    [PROFILE, ORG, PROJECT, '["typescript","cloudflare"]', '["typescript"]', '{"doorRef":"door_1","grantedBy":"usr_x","grantedAt":"2026-09-09T19:00:00.000Z","workspaceVisibility":"public"}'],
  );
  // A healthy row, written the way pglite always wrote them.
  await db.query(
    `INSERT INTO openproduct.profiles (id, org_id, project_id, slug, stack, stack_canonical, created_by)
     VALUES ($1, $2, $3, 'healthy', $4::jsonb, $5::jsonb, 'usr_a')`,
    [OTHER, ORG, "66666666-6666-4666-8666-666666666666", '["go"]', '["go"]'],
  );
  await db.query(
    `INSERT INTO openproduct.audit_log (id, org_id, profile_id, actor_type, actor_id, type, description, payload, request_id, occurred_at)
     VALUES ('77777777-7777-4777-8777-777777777777', $1, $2, 'user', 'usr_a', 'profile.created', 'x', to_jsonb($3::text), 'req_1', now())`,
    [ORG, PROFILE, '{"slug":"damaged"}'],
  );
});

async function typeofs() {
  const p = await db.query<{ slug: string; stack: string; canonical: string; grant: string | null }>(
    `SELECT slug, jsonb_typeof(stack) AS stack, jsonb_typeof(stack_canonical) AS canonical, jsonb_typeof(link_grant) AS grant
       FROM openproduct.profiles ORDER BY slug`,
  );
  const a = await db.query<{ t: string }>(`SELECT jsonb_typeof(payload) AS t FROM openproduct.audit_log`);
  return { profiles: p.rows, audit: a.rows[0]!.t };
}

describe("1870 — the double-encoded rows are put back (LI1)", () => {
  it("reproduces the damaged shape before the repair", async () => {
    const before = await typeofs();
    expect(before.profiles.find((r) => r.slug === "damaged")).toEqual({ slug: "damaged", stack: "string", canonical: "string", grant: "string" });
    expect(before.audit).toBe("string");
  });

  it("repairs every damaged column, leaves the healthy row alone, and is idempotent", async () => {
    await db.exec(REPAIR_SQL);
    const after = await typeofs();
    expect(after.profiles.find((r) => r.slug === "damaged")).toEqual({ slug: "damaged", stack: "array", canonical: "array", grant: "object" });
    expect(after.profiles.find((r) => r.slug === "healthy")).toEqual({ slug: "healthy", stack: "array", canonical: "array", grant: null });
    expect(after.audit).toBe("object");

    const stack = await db.query<{ stack: unknown }>(`SELECT stack FROM openproduct.profiles WHERE slug = 'damaged'`);
    expect(stack.rows[0]!.stack).toEqual(["typescript", "cloudflare"]);

    await db.exec(REPAIR_SQL);
    expect(await typeofs()).toEqual(after);
  });

  it("leaves a string scalar that is not JSON exactly as it was", async () => {
    await db.query(`UPDATE openproduct.profiles SET stack = to_jsonb('not json'::text) WHERE slug = 'healthy'`);
    await db.exec(REPAIR_SQL);
    const row = await db.query<{ stack: unknown }>(`SELECT stack FROM openproduct.profiles WHERE slug = 'healthy'`);
    expect(row.rows[0]!.stack).toBe("not json");
  });

  it("drops its helper function behind it", async () => {
    await db.exec(REPAIR_SQL);
    const fn = await db.query(`SELECT 1 FROM pg_proc WHERE proname = 'try_jsonb'`);
    expect(fn.rows).toHaveLength(0);
  });
});
