// CS2 — `DELETE /me` on the OS0 fixture, for a subject who has done everything
// the corpus lets a maker do (openproduct-consumers CS2).
//
// The corpus's makers maintain listings, sit on rosters, carry credit lines,
// hold handles and curate collections. Pick one, measure where they appear by
// the registry's read, erase them by the registry's write, and assert by the
// registry's classes — then check the public surface still answers.

import { beforeAll, describe, expect, it } from "vitest";

import { SUITE_CORPUS, loadCorpus } from "./corpus.js";
import { migratedDb, type ScaleDb } from "./harness.js";
import { OPENPRODUCT_SUBJECT_REGISTRY, subjectEntryKey } from "../subject-registry.js";

describe("CS2 — a maker leaves the corpus", () => {
  let scale: ScaleDb;
  let subject: string;

  beforeAll(async () => {
    scale = await migratedDb();
    await loadCorpus(scale.sql, SUITE_CORPUS);
    const res = await scale.sql.execute<{ subject_id: string }>(
      `SELECT subject_id FROM openproduct.handles WHERE handle = 'maker-1'`,
    );
    subject = res.rows[0]!.subject_id;
  }, 180_000);

  it("appears where a maker appears, leaves nothing behind, and the catalogue still answers", async () => {
    const before = await scale.repo.subjectFootprint(subject);
    process.stdout.write(`CS2 footprint of maker-1: ${JSON.stringify([...before.entries()])}\n`);
    for (const key of [
      "contributors.subject_id",
      "handles.subject_id",
      "listing_maintainers.subject_id",
      "product_people.subject_id",
      "published_maintainers.subject_id",
    ]) {
      expect(before.get(key) ?? 0).toBeGreaterThan(0);
    }
    const cardsBefore = (await scale.repo.listPublicCards(100)).length;

    const t = Date.now();
    const erased = await scale.repo.eraseSubject(subject, "2026-09-09T12:00:00.000Z");
    const ms = Date.now() - t;
    expect(erased.deleted + erased.anonymised).toBe([...before.values()].reduce((a, b) => a + b, 0));
    expect(await scale.repo.subjectFootprint(subject)).toEqual(new Map());

    // Their listings stay listed — a listing belongs to its workspace.
    expect((await scale.repo.listPublicCards(100)).length).toBe(cardsBefore);
    // The handle is released, never re-issued.
    const handle = await scale.sql.execute<{ subject_id: string | null; released_at: string | null }>(
      `SELECT subject_id, released_at FROM openproduct.handles WHERE handle = 'maker-1'`,
    );
    expect(handle.rows[0]!.subject_id).toMatch(/^usr_gone_/);
    expect(handle.rows[0]!.released_at).not.toBeNull();

    process.stdout.write(
      `CS2 corpus=${SUITE_CORPUS.listings}: maker-1 appeared in ${before.size} of ${OPENPRODUCT_SUBJECT_REGISTRY.length} classified columns (${[...before.entries()].map(([k, n]) => `${k}=${n}`).join(" ")}); erased ${erased.deleted} rows, kept ${erased.anonymised} without them, in ${ms} ms over ${OPENPRODUCT_SUBJECT_REGISTRY.length} statements\n`,
    );
    void subjectEntryKey;
  });
});
