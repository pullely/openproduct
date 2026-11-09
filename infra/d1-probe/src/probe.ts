// What every probe route shares (openproduct-standalone OPN-2): the corpus
// sizes, the one instant everything is dated from, and a per-request context
// holding the instrumented binding and the slice repository over it.

import { createD1Executor, createD1SliceRepository, type D1SliceRepository, type D1SqlExecutor } from "@openproduct/db/d1";
import { CORPUS_NOW, SCALE_CORPUS, SMOKE_CORPUS, SUITE_CORPUS } from "@openproduct/db/d1/corpus";

import type { Env } from "./env.js";
import { createRecorder, instrumentD1, type RawD1, type Recorder } from "./instrument.js";

/**
 * The corpus sizes. `full` is the scale target (OS0's SCALE_CORPUS: 5,000
 * listings, 365 days of ingestion, 449,095 metric rows) and the smoke's
 * default; `suite` is the suite corpus (5,000 listings, 120 days); `smoke`
 * (120 listings) exists so the Worker's own tests can run the whole flow in
 * seconds.
 */
export const SIZES = { smoke: SMOKE_CORPUS, suite: SUITE_CORPUS, full: SCALE_CORPUS } as const;
export type ProbeSize = keyof typeof SIZES;

/** Every instant the corpus, the rebuild and the index carry is an offset from this one. */
export const NOW = CORPUS_NOW;
const DAY_MS = 24 * 60 * 60 * 1000;
const SINCE = new Date(Date.parse(NOW) - 2 * DAY_MS).toISOString();
/** The sweep's catalogue input, as the scale suites call it. */
export const INPUT = { now: NOW, mergesSince: SINCE, endorsementsSince: SINCE } as const;

/** A refusal with a status: the message goes back as `{ error }`. */
export class ProbeError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Instrumented {
  readonly recorder: Recorder;
  readonly sql: D1SqlExecutor;
  readonly repo: D1SliceRepository;
}

export interface ProbeContext extends Instrumented {
  readonly env: Env;
  /** The same instrumentation over another D1 surface (a session), sharing nothing with this one. */
  over(raw: RawD1): Instrumented;
}

export function instrumented(raw: RawD1): Instrumented {
  const recorder = createRecorder();
  const sql = createD1Executor(instrumentD1(raw, recorder));
  return { recorder, sql, repo: createD1SliceRepository(sql) };
}

export function probeContext(env: Env): ProbeContext {
  return { env, ...instrumented(env.DB), over: instrumented };
}

export function sizeParam(url: URL): ProbeSize {
  const raw = url.searchParams.get("size") ?? "full";
  if (!Object.hasOwn(SIZES, raw)) throw new ProbeError(400, `size must be one of ${Object.keys(SIZES).join(", ")}`);
  return raw as ProbeSize;
}

export function intParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new ProbeError(400, `${name} must be a whole number`);
  const value = Number(raw);
  if (value < min || value > max) throw new ProbeError(400, `${name} must be between ${min} and ${max}`);
  return value;
}

/** The probe's own bookkeeping table, beside the slice's (never part of 0001_slice.sql). */
export const PROBE_META_TABLE = "d1_probe_meta";

export async function readMeta(sql: D1SqlExecutor, key: string): Promise<string | null> {
  const res = await sql.execute<{ value: string }>(`SELECT value FROM ${PROBE_META_TABLE} WHERE key = $1`, [key]);
  return res.rows[0]?.value ?? null;
}

export async function writeMeta(sql: D1SqlExecutor, key: string, value: string): Promise<void> {
  await sql.execute(
    `INSERT INTO ${PROBE_META_TABLE} (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

/** The size of the corpus that is fully loaded, or a 409 telling the caller what to do first. */
export async function loadedSize(sql: D1SqlExecutor): Promise<ProbeSize> {
  const [size, loaded] = await Promise.all([readMeta(sql, "size"), readMeta(sql, "loaded")]);
  if (size === null || loaded !== "true" || !Object.hasOwn(SIZES, size)) {
    throw new ProbeError(409, "no corpus is loaded: POST /schema, /reset, then /load until done");
  }
  return size as ProbeSize;
}
