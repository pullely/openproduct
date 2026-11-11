// The migration ladder, applied ONCE per run (openproduct-verification OV3).
//
// The pg suite used to build a fresh pglite engine and apply the manifest's
// whole ladder — fifty migrations, about six seconds — before EVERY test.
// Five hundred tests made that the twelve minutes the component file
// declined to spend in CI. The ladder is the same fifty files every time, so
// it is applied here, once, and the resulting data directory is dumped to a
// file; each test restores that file into a fresh engine in half a second
// (`harness.ts`). What a test sees is unchanged — an engine that has run the
// real ladder and nothing else — and what it costs is what it should.
//
// `provide`/`inject` carries the path to the test files; the file lives in
// the OS temp dir under a name that carries the ladder's checksums, so two
// runs of different ladders cannot hand each other a stale template.

import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

import { manifest } from "../manifest.js";

declare module "vitest" {
  export interface ProvidedContext {
    pgTemplate: string;
  }
}

const here = dirname(fileURLToPath(import.meta.url));

/** The openproduct ladder, in manifest order — exactly what the suite applied per test. */
export function ladder(): string[] {
  return manifest.migrations
    .filter((m) => m.context === "openproduct")
    .map((m) => resolve(here, "../migrations", m.path));
}

export default async function setup(project: TestProject): Promise<void> {
  const files = ladder();
  const digest = createHash("sha256");
  for (const file of files) digest.update(readFileSync(file));
  const dir = resolve(tmpdir(), "openproduct-pg-template");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${digest.digest("hex").slice(0, 16)}.tar`);
  const started = Date.now();
  const db = new PGlite();
  for (const file of files) await db.exec(readFileSync(file, "utf-8"));
  const dump = await db.dumpDataDir("none");
  writeFileSync(path, Buffer.from(await dump.arrayBuffer()));
  await db.close();
  process.stdout.write(`pg template: ${files.length} migrations in ${Date.now() - started} ms → ${path}\n`);
  project.provide("pgTemplate", path);
}
