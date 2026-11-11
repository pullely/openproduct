// Shared by the scale suite: a migrated pglite, and the probe context the
// public routes would compute for the corpus (openproduct-scale OS0).

import type { PGlite } from "@electric-sql/pglite";

import type { SqlExecutor } from "../executor.js";
import { executorOf, freshEngine } from "../pg/harness.js";
import { createOpenproductRepository } from "../repository.js";
import type { OpenproductRepository } from "../types.js";
import { CORPUS_NOW, corpusSlug } from "./corpus.js";
import type { ProbeContext } from "./probes.js";

export interface ScaleDb {
  readonly db: PGlite;
  readonly sql: SqlExecutor;
  readonly repo: OpenproductRepository;
}

/**
 * A fresh, fully migrated engine — from the template OV3's global setup
 * dumps once per run, the way every pg test starts (six seconds of ladder
 * became half a second of restore; the scale suites were the last to build
 * their own engine, and now none does).
 */
export async function migratedDb(): Promise<ScaleDb> {
  const db = await freshEngine();
  const sql: SqlExecutor = executorOf(db);
  return { db, sql, repo: createOpenproductRepository(sql) };
}

const dayOf = (iso: string) => iso.slice(0, 10);
const shift = (iso: string, days: number) => new Date(Date.parse(iso) - days * 24 * 60 * 60 * 1000).toISOString();

/**
 * What the routes would hand the reads for this corpus: the front page's
 * slugs from the directory read itself, a listing that has a launch, an
 * opening and a hero (listing 60 — see the corpus's rotations), its launch
 * thread, yesterday's board, the digest's week.
 */
export async function contextFor(repo: OpenproductRepository): Promise<ProbeContext> {
  const now = CORPUS_NOW;
  // Listing 60: divisible by 3 (an opening), 4 (a hero) and 10 (a question
  // thread), and inside the first `launches` listings (a launch, so a launch
  // thread) at every corpus size.
  const slug = corpusSlug(60);
  const profileId = await repo.getPublicProfileId(slug);
  if (!profileId) throw new Error(`corpus listing ${slug} is not public`);
  const thread = await repo.getLaunchThread(profileId);
  if (!thread) throw new Error(`corpus listing ${slug} has no launch thread`);
  const slugs = (await repo.listPublicCards(100)).map((c) => c.slug);
  // OS5 — the catalogue, computed at the corpus's instant with the same
  // freshness rule the live read is probed with, so the materialised page is
  // a probe against a table the sweep would have written.
  await repo.rebuildCatalogue({ now, mergesSince: shift(now, 2), endorsementsSince: shift(now, 2) });
  const days = Array.from({ length: 7 }, (_, i) => dayOf(shift(now, i)));
  return {
    now,
    mergesSince: shift(now, 2),
    endorsementsSince: shift(now, 2),
    today: dayOf(now),
    weekAgo: shift(now, 7),
    weekAgoDay: dayOf(shift(now, 7)),
    monthAgo: shift(now, 30),
    slugs,
    days,
    day: dayOf(shift(now, 1)),
    slug,
    profileId,
    threadId: thread.id,
    handle: "maker-1",
    collectionSlug: "collection-1",
  };
}
