// The pg suite's shared engine and fixtures (openproduct-verification OV3).
//
// One file held every test against the live engine — 8,751 lines, sixty-three
// `describe` blocks, twelve and a half minutes. OV3 cut it by cluster into the
// files beside this one; this is what they share: the engine each test gets,
// the ids every fixture uses, and the two seeds the suite has always had.
//
// `usePgEngine()` is called once at the top of each file. Before every test it
// restores the template `global-setup.ts` built — the real ladder, applied
// once per run — into a FRESH engine, so a test still starts from exactly the
// schema the migrations produce and nothing else; after it, the engine is
// closed. The bindings below are live ESM exports: a test reads `repo` and
// gets the engine of the test it is in.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, inject } from "vitest";

import type { SqlExecutor } from "../executor.js";
import { asUuid } from "../ids.js";
import { createOpenproductRepository } from "../repository.js";
import type { OpenproductRepository } from "../types.js";

import { ladder } from "./global-setup.js";

/** The ladder's files, in manifest order — for the one test that re-applies it after a DROP SCHEMA. */
export const MIGRATIONS = ladder();

export const ORG = asUuid("11111111-1111-4111-8111-111111111111");
export const ORG_OTHER = asUuid("22222222-2222-4222-8222-222222222222");
export const PROJECT = asUuid("33333333-3333-4333-8333-333333333333");
export const PROJECT_TWO = asUuid("44444444-4444-4444-8444-444444444444");
export const PROFILE = asUuid("55555555-5555-4555-8555-555555555555");
export const PROFILE_TWO = asUuid("66666666-6666-4666-8666-666666666666");
export const OPENING = asUuid("77777777-7777-4777-8777-777777777777");
export const ACTOR = "usr_0123456789abcdef0123456789abcdef";
export const ADMIN = "usr_fedcba9876543210fedcba9876543210";
export const NOW = "2026-08-17T12:00:00.000Z";

/**
 * TS1 — what a publish looked like before the ladder: a human had already
 * cleared it, so it needs no waiver and is indexable. Every test written
 * against OD's rules means this, and naming it keeps them readable rather
 * than sprinkling two booleans through forty call sites.
 */
export const REVIEWED_PUBLISH = { allowWithoutReview: false, indexable: true } as const;

/**
 * The discount reasons EN3's sweep owns.
 *
 * `restateIntegrity` reverses only discounts carrying one of these, so a
 * sweep undoes its own opinions and leaves everybody else's alone. TS4 writes
 * `cohort` from a different sweep on a different cadence, to endorsements
 * inside EN3's own window; without the bound the two would undo each other
 * forever.
 */
export const EN3_REASONS = ["ring", "burst", "burst-new-account"] as const;

export let db: PGlite;
export let sql: SqlExecutor;
export let repo: OpenproductRepository;

let template: Blob | null = null;

/** A fresh engine with the ladder applied, from the template — what every test starts from. */
export async function freshEngine(): Promise<PGlite> {
  if (template === null) {
    template = new Blob([readFileSync(inject("pgTemplate"))]);
  }
  const engine = new PGlite({ loadDataDir: template });
  await engine.waitReady;
  return engine;
}

export function executorOf(engine: PGlite): SqlExecutor {
  return {
    async execute(text: string, params?: unknown[]) {
      const res = await engine.query(text, params ?? []);
      return { rows: (res.rows ?? []) as never[], rowCount: res.affectedRows ?? (res.rows?.length ?? 0) };
    },
  };
}

/** Register the per-test engine for the calling file. */
export function usePgEngine(): void {
  beforeEach(async () => {
    db = await freshEngine();
    sql = executorOf(db);
    repo = createOpenproductRepository(sql);
  });
  afterEach(async () => {
    await db.close();
  });
}

/** Author a profile the way OD2 will: private, unreviewed, unobserved. */
export async function seedDraft(id = PROFILE, projectId = PROJECT, slug = "acme-thing") {
  return repo.createProfile({
    id,
    orgId: ORG,
    projectId,
    slug,
    createdBy: ACTOR,
    tagline: "A thing, built in the open",
    pitchBody: "We are building a thing.",
    pitchDigest: "sha256:abc",
    repoUrl: "https://github.com/acme/thing",
    stack: ["typescript", "cloudflare"],
  });
}

/** Walk a draft all the way to published, through every gate in order. */
export async function seedPublished(id = PROFILE, projectId = PROJECT, slug = "acme-thing") {
  await seedDraft(id, projectId, slug);
  await repo.recordRepoObservation(id, {
    repoVisibility: "public",
    repoLicence: "Apache-2.0",
    observedAt: NOW,
  });
  await repo.reviewProfile(id, ADMIN, NOW);
  return repo.publishProfile(ORG, id, NOW, ACTOR, REVIEWED_PUBLISH);
}
