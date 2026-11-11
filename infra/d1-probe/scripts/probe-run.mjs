#!/usr/bin/env node
// The D1 probe's smoke (openproduct-standalone OPN-2, milestone OPN1) — the
// component's `smokeCommand` on the stage deploy lane. Node built-ins only.
//
// It drives the deployed `openproduct-d1-probe` Worker through the remote
// test PROOF.md specifies, and prints ONE JSON report to stdout (progress
// goes to stderr):
//
//   schema (twice: idempotent) → reset → load (a statement per request, until
//   done) → bench (each op, split over requests) → negative (one probe per
//   request) → export (compared with expected/<size>.json, made on LOCAL D1
//   for the same deterministic corpus) → reset (the database is emptied after
//   each run, design §5.2)
//
// EXIT CODE. Non-zero if any result differs from local D1, any negative probe
// is accepted (or cannot be decided), the 5,000-document replace batch is
// refused, or any timed call returned a wrong answer. The design §5.3 budgets
// are REPORTED as met / missed — they never fail the smoke: the go/no-go is a
// human call on the report.
//
// ENVIRONMENT
//   PROBE_TOKEN                   the Worker's bearer (secretEnv). Required. Never printed.
//   PROBE_URL                     the base URL, when given (a local miniflare / wrangler dev)
//   CLOUDFLARE_WORKERS_SUBDOMAIN  otherwise, the account's workers.dev subdomain, when set — the
//                                 target is https://<PROBE_WORKER_NAME>.<subdomain>.workers.dev
//   CLOUDFLARE_API_TOKEN,         otherwise, the deploy lane's own credentials (bound by the
//   CLOUDFLARE_ACCOUNT_ID         deploy profile) ask Cloudflare for that subdomain
//   CLOUDFLARE_API_BASE           default https://api.cloudflare.com/client/v4 (tests point it local)
//   PROBE_WORKER_NAME             default openproduct-d1-probe-stage
//   PROBE_SIZE                    full (default: 5,000 listings, 365 days) | suite | smoke
//   PROBE_RUNS                    timed runs per op, default 50
//   PROBE_PHASES                  default schema,reset,load,bench,negative,export,cleanup
//   PROBE_EXPECTED_FILE           default expected/<size>.json beside this package
//   PROBE_WRITE_EXPECTED=1        write the export to the expected file instead of comparing
//   PROBE_SAMPLES=1               include every raw sample in the report
//   PROBE_FIRST_CALL_ATTEMPTS     default 6: how long the first call waits out a fresh route (~75 s)
//   PROBE_MARKER=off              see "RETRIES" below
//
// RETRIES. The composition runs `smokeCommand` up to ten times, retrying on
// any non-zero exit (a fresh workers.dev route can 404 for a few seconds).
// A probe that ran to a VERDICT must not be re-run nine times — that is ten
// loads and ten benches. So in a runner (CI, GITHUB_ACTIONS or ORUN_ENV set) a finished run leaves a marker
// keyed by the retrying shell's pid; a retry from the same shell re-prints
// that verdict and exits with its code at once. A run that never reached a
// verdict (unreachable, a transport error mid-flight) leaves no marker and
// is retried from the start.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(here, "..");

const SIZES = ["full", "suite", "smoke"];
const ALL_PHASES = ["schema", "reset", "load", "bench", "negative", "export", "cleanup"];
const SLICE_TABLES = [
  "catalog_cards", "catalog_state", "metrics", "product_media", "profiles",
  "role_openings", "search_index", "search_index_state", "search_index_terms",
];
const BENCH_OPS = [
  "rebuildCatalogue.cold", "rebuildCatalogue.quiet",
  "listCataloguePage.first", "listCataloguePage.deep",
  "searchCandidates.common", "searchCandidates.rare", "searchCandidates.multi",
  "replaceSearchIndex.cold", "replaceSearchIndex.unchanged",
  "sessions",
];
/** Runs per request: writes and the Sessions pass are split finely (each request stays short and far inside the query limit). */
const CHUNK = { write: 10, read: 50, sessions: 10 };
const WRITE_OPS = new Set(["rebuildCatalogue.cold", "rebuildCatalogue.quiet", "replaceSearchIndex.cold", "replaceSearchIndex.unchanged"]);
const NEGATIVE_PROBES = ["args34", "string2mb", "result50mb", "like51"];
const D1_QUERY_LIMIT_MS = 30_000;

/** Design §5.3 — measured on remote D1, from the probe. */
const BUDGETS = [
  { op: "rebuildCatalogue.cold", stat: "p95", limitMs: 30_000, why: "one sweep phase; D1 caps a query at 30 s" },
  { op: "rebuildCatalogue.cold", stat: "maxStatementSqlMs", limitMs: 10_000, why: "every statement ≤ 10 s" },
  { op: "rebuildCatalogue.quiet", stat: "p95", limitMs: 3_000, why: "runs every 10 minutes" },
  { op: "replaceSearchIndex.cold", stat: "p95", limitMs: 30_000, why: "rebuilt behind a floor; same cap" },
  { op: "replaceSearchIndex.unchanged", stat: "p95", limitMs: 5_000, why: "no change" },
  ...["listCataloguePage.first", "listCataloguePage.deep", "searchCandidates.common", "searchCandidates.rare", "searchCandidates.multi"].flatMap((op) => [
    { op, stat: "p50", limitMs: 50, why: "cache misses / per-query search" },
    { op, stat: "p95", limitMs: 150, why: "cache misses / per-query search" },
  ]),
];

const log = (line) => process.stderr.write(`probe: ${line}\n`);

// ─── numbers (the Worker's rule: nearest-rank) ──────────────────────────────

const r2 = (v) => Math.round(v * 100) / 100;
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1];
}
function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: r2(percentile(sorted, 50)),
    p95: r2(percentile(sorted, 95)),
    min: r2(sorted[0]),
    max: r2(sorted[sorted.length - 1]),
    mean: r2(sorted.reduce((a, b) => a + b, 0) / sorted.length),
  };
}
function summaryOf(samples) {
  return {
    wallMs: summarize(samples.map((s) => s.wallMs)),
    sqlMs: summarize(samples.map((s) => s.sqlMs)),
    durationMs: summarize(samples.map((s) => s.durationMs)),
    maxStatementSqlMs: samples.reduce((m, s) => Math.max(m, s.maxStatementSqlMs ?? 0), 0),
    statementsPerRun: samples[0]?.statements ?? null,
    servedByPrimary: {
      primary: samples.filter((s) => s.servedByPrimary === true).length,
      replica: samples.filter((s) => s.servedByPrimary === false).length,
      unreported: samples.filter((s) => s.servedByPrimary === null).length,
    },
    regions: [...new Set(samples.map((s) => s.servedByRegion).filter(Boolean))].sort(),
  };
}

// ─── configuration ──────────────────────────────────────────────────────────

class ConfigError extends Error {}
/** The Worker answered, with an answer: deterministic, recorded, not retried. */
class WorkerAnswer extends Error {
  constructor(path, status, message) {
    super(`${path} → ${status}: ${message}`);
    this.status = status;
  }
}
/** No answer from the Worker (network, timeout, an edge error page): worth a retry. */
class Transport extends Error {}

/**
 * The account's workers.dev subdomain, asked of Cloudflare with the deploy
 * lane's own credentials (the deploy profile binds CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID for every step of the job, this smoke included).
 *
 * This is the fallback that keeps the probe off the `workers-subdomain`
 * brokered fact: on an account that has not registered a workers.dev
 * subdomain, the broker answers `fact_unavailable` and orun fails the WHOLE
 * job at secret resolution, before a single step runs. The first OPN-2 CI run
 * died exactly that way, on a verify lane that never needs the subdomain.
 * Asking here means only the smoke needs the subdomain, and it can say what
 * is wrong in words.
 */
async function subdomainFromCloudflare(env) {
  const apiToken = (env.CLOUDFLARE_API_TOKEN ?? "").trim();
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  if (apiToken.length === 0 || accountId.length === 0) return null;
  const apiBase = (env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");
  let res;
  try {
    res = await fetch(`${apiBase}/accounts/${encodeURIComponent(accountId)}/workers/subdomain`, {
      headers: { authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new ConfigError(`could not ask Cloudflare for the account's workers.dev subdomain: ${error?.message ?? error}`);
  }
  const body = await res.json().catch(() => null);
  const subdomain = body?.result?.subdomain;
  if (res.ok && typeof subdomain === "string" && subdomain.length > 0) return subdomain;
  const codes = (body?.errors ?? []).map((e) => e?.code).filter((c) => c !== undefined).join(", ");
  throw new ConfigError(
    `the Cloudflare account has no workers.dev subdomain registered (HTTP ${res.status}${codes ? `, codes ${codes}` : ""}): ` +
      "register one under Workers & Pages in the dashboard, then bump infra/d1-probe/RUN",
  );
}

async function config(env) {
  const token = env.PROBE_TOKEN ?? "";
  if (token.length === 0) throw new ConfigError("PROBE_TOKEN is not set (secret://ws_VTNEQKAP/openproduct/stage/PROBE_TOKEN)");
  const size = env.PROBE_SIZE || "full";
  if (!SIZES.includes(size)) throw new ConfigError(`PROBE_SIZE must be one of ${SIZES.join(", ")}`);
  const runs = Number(env.PROBE_RUNS || 50);
  if (!Number.isInteger(runs) || runs < 1 || runs > 1000) throw new ConfigError("PROBE_RUNS must be a whole number from 1 to 1000");
  const phases = (env.PROBE_PHASES || ALL_PHASES.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  for (const phase of phases) if (!ALL_PHASES.includes(phase)) throw new ConfigError(`unknown phase ${phase}`);
  const workerName = env.PROBE_WORKER_NAME || "openproduct-d1-probe-stage";
  let base;
  let target;
  if (env.PROBE_URL) {
    base = env.PROBE_URL.replace(/\/+$/, "");
    target = base;
  } else {
    const fromEnv = (env.CLOUDFLARE_WORKERS_SUBDOMAIN ?? "").trim();
    const raw = fromEnv.length > 0 ? fromEnv : ((await subdomainFromCloudflare(env)) ?? "");
    const subdomain = raw
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/\.workers\.dev$/, "")
      .replace(/^\.+|\.+$/g, "");
    if (!/^[a-z0-9-]+$/i.test(subdomain)) {
      throw new ConfigError(
        "no probe target: PROBE_URL is not set, CLOUDFLARE_WORKERS_SUBDOMAIN is not set to a workers.dev subdomain, " +
          "and CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID (the deploy lane's own credentials) are not there to ask Cloudflare for it",
      );
    }
    base = `https://${workerName}.${subdomain}.workers.dev`;
    // The subdomain is an orun secret: the report names the shape, not the value.
    target = `https://${workerName}.<CLOUDFLARE_WORKERS_SUBDOMAIN>.workers.dev`;
  }
  const expectedFile = env.PROBE_EXPECTED_FILE ? resolve(env.PROBE_EXPECTED_FILE) : join(PACKAGE_DIR, "expected", `${size}.json`);
  return {
    token,
    size,
    runs,
    phases,
    base,
    target,
    expectedFile,
    writeExpected: env.PROBE_WRITE_EXPECTED === "1",
    samples: env.PROBE_SAMPLES === "1",
    firstCallAttempts: Math.max(1, Number(env.PROBE_FIRST_CALL_ATTEMPTS || 6) || 6),
  };
}

// ─── the Worker ─────────────────────────────────────────────────────────────

function client(cfg) {
  return async function call(path, { timeoutMs = 300_000 } = {}) {
    let res;
    try {
      res = await fetch(`${cfg.base}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Transport(`${path}: ${error?.cause?.code ?? error?.name ?? "error"} ${error?.message ?? ""}`.trim());
    }
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (res.ok && body !== null) return body;
    // The probe's own answers are JSON with an `error`; anything else came from the edge.
    if (body && typeof body.error === "string") throw new WorkerAnswer(path, res.status, body.error);
    if (res.status === 404) throw new Transport(`${path}: 404 — the Worker is not reachable at the target yet, or it refuses this token`);
    throw new Transport(`${path}: HTTP ${res.status}${text ? ` ${text.slice(0, 160).replace(/\s+/g, " ")}` : ""}`);
  };
}

/** The first call waits out a fresh workers.dev route (and a cold start): ~75 s over six attempts. */
async function firstCall(call, path, attempts) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await call(path);
    } catch (error) {
      if (!(error instanceof Transport)) throw error;
      last = error;
      log(`${error.message} — attempt ${attempt}/${attempts}`);
      if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 5_000));
    }
  }
  throw last;
}

// ─── the phases ─────────────────────────────────────────────────────────────

async function schemaPhase(call, cfg, report, failures) {
  const first = await firstCall(call, "/schema", cfg.firstCallAttempts);
  const second = await call("/schema");
  const missing = [...SLICE_TABLES, "d1_probe_meta"].filter((t) => !second.tables.includes(t));
  const idempotent =
    JSON.stringify([first.tables, first.indexes, first.triggers, first.singletonRows]) ===
    JSON.stringify([second.tables, second.indexes, second.triggers, second.singletonRows]);
  if (missing.length > 0) failures.push(`schema: tables missing after apply: ${missing.join(", ")}`);
  if (!idempotent) failures.push("schema: a second apply changed the schema objects or the singleton rows");
  if (JSON.stringify(second.singletonRows) !== JSON.stringify({ search_index_state: 1, catalog_state: 1 })) {
    failures.push(`schema: singleton rows ${JSON.stringify(second.singletonRows)}, expected one each`);
  }
  report.schema = {
    statements: second.statements,
    tables: second.tables.length,
    indexes: second.indexes.length,
    triggers: second.triggers.length,
    idempotent,
    apply: { first: first.d1, second: second.d1 },
  };
  log(`schema: ${second.statements} statements, ${second.tables.length} tables, idempotent=${idempotent}`);
}

async function loadPhase(call, cfg, report) {
  const statements = [];
  let step = 0;
  let total = null;
  const started = Date.now();
  for (let guard = 0; guard < 10_000; guard += 1) {
    const res = await call(`/load?size=${cfg.size}&step=${step}`);
    total = res.total;
    for (const s of res.executed) {
      statements.push(s);
      log(`load ${s.index + 1}/${res.total} ${s.table}: ${s.wallMs} ms wall, ${s.sqlMs} ms SQL`);
    }
    if (res.done) break;
    step = res.nextStep;
  }
  const byTable = {};
  for (const s of statements) {
    const t = (byTable[s.table] ??= { statements: 0, rows: 0, wallMs: 0, sqlMs: 0, maxSqlMs: 0 });
    t.statements += 1;
    t.rows += s.rows;
    t.wallMs += s.wallMs;
    t.sqlMs = r2(t.sqlMs + s.sqlMs);
    t.maxSqlMs = Math.max(t.maxSqlMs, s.sqlMs);
  }
  const maxSqlMs = statements.reduce((m, s) => Math.max(m, s.sqlMs), 0);
  const maxWallMs = statements.reduce((m, s) => Math.max(m, s.wallMs), 0);
  report.load = {
    size: cfg.size,
    statements: statements.length,
    total,
    wallMs: Date.now() - started,
    sqlMs: r2(statements.reduce((a, s) => a + s.sqlMs, 0)),
    maxStatementSqlMs: maxSqlMs,
    maxStatementWallMs: maxWallMs,
    everyStatementUnder30s: maxSqlMs < D1_QUERY_LIMIT_MS && maxWallMs < D1_QUERY_LIMIT_MS,
    databaseBytes: statements.at(-1)?.databaseBytes ?? null,
    byTable,
    ...(cfg.samples ? { perStatement: statements } : {}),
  };
}

function mergeSessions(chunks) {
  const out = { supported: true, requested: 0, completed: 0, accepted: true, error: null, checkFailures: [], bookmarkObtained: true, writes: [], constraints: {} };
  for (const c of chunks) {
    if (c.supported === false) return { supported: false };
    out.requested += c.requested;
    out.completed += c.completed;
    out.accepted &&= c.accepted;
    out.error ??= c.error;
    out.checkFailures.push(...c.checkFailures);
    out.bookmarkObtained &&= c.bookmarkObtained;
    out.writes.push(c.write);
    for (const [constraint, slot] of Object.entries(c.constraints)) {
      const into = (out.constraints[constraint] ??= { staleMarker: 0, marker: [], reads: {} });
      into.staleMarker += slot.staleMarker;
      into.marker.push(...slot.marker.samples);
      for (const [name, read] of Object.entries(slot.reads)) (into.reads[name] ??= []).push(...read.samples);
    }
  }
  return out;
}

async function benchPhase(call, cfg, report, failures) {
  const bench = {};
  for (const op of BENCH_OPS) {
    const chunk = op === "sessions" ? CHUNK.sessions : WRITE_OPS.has(op) ? CHUNK.write : CHUNK.read;
    const chunks = [];
    let done = 0;
    while (done < cfg.runs) {
      const runs = Math.min(chunk, cfg.runs - done);
      const res = await call(`/bench?op=${encodeURIComponent(op)}&runs=${runs}`);
      const result = res.ops[op];
      chunks.push(result);
      done += runs;
      if (!result.accepted || result.supported === false) break;
    }

    if (op === "sessions") {
      const merged = mergeSessions(chunks);
      if (merged.supported === false) {
        bench.sessions = { supported: false };
        log("bench sessions: withSession() is not available on this binding");
        continue;
      }
      const constraints = Object.fromEntries(
        Object.entries(merged.constraints).map(([constraint, slot]) => [
          constraint,
          {
            staleMarker: slot.staleMarker,
            firstQuery: summaryOf(slot.marker),
            reads: Object.fromEntries(Object.entries(slot.reads).map(([name, samples]) => [name, summaryOf(samples)])),
            ...(cfg.samples ? { samples: slot } : {}),
          },
        ]),
      );
      bench.sessions = {
        supported: true,
        requested: merged.requested,
        completed: merged.completed,
        accepted: merged.accepted,
        error: merged.error,
        checkFailures: merged.checkFailures.slice(0, 10),
        bookmarkObtained: merged.bookmarkObtained,
        write: summaryOf(merged.writes),
        constraints,
      };
      if (!merged.accepted) failures.push(`bench sessions: ${merged.error}`);
      if (merged.checkFailures.length > 0) failures.push(`bench sessions: ${merged.checkFailures[0]}`);
      log(`bench sessions: ${merged.completed}/${merged.requested} runs, stale first reads ${Object.entries(merged.constraints).map(([c, s]) => `${c}=${s.staleMarker}`).join(" ")}`);
      continue;
    }

    const samples = chunks.flatMap((c) => c.samples);
    const error = chunks.find((c) => !c.accepted)?.error ?? null;
    const checkFailures = chunks.flatMap((c) => c.checkFailures).slice(0, 10);
    const info = Object.assign({}, ...chunks.map((c) => c.info));
    bench[op] = {
      requested: cfg.runs,
      completed: samples.length,
      accepted: error === null,
      ...(op.startsWith("replaceSearchIndex") ? { batch: error === null ? "accepted" : "refused" } : {}),
      error,
      checkFailures,
      info,
      summary: summaryOf(samples),
      ...(cfg.samples ? { samples } : {}),
    };
    if (error !== null) {
      failures.push(
        op.startsWith("replaceSearchIndex")
          ? `bench ${op}: the ${info.payload?.statements ?? "?"}-statement, ${info.payload?.totalBytes ?? "?"}-byte replace batch was REFUSED: ${error}`
          : `bench ${op}: ${error}`,
      );
    }
    if (checkFailures.length > 0) failures.push(`bench ${op}: wrong result — ${checkFailures[0]}`);
    const s = bench[op].summary.wallMs;
    log(`bench ${op}: ${samples.length}/${cfg.runs} runs, wall p50 ${s?.p50 ?? "-"} ms p95 ${s?.p95 ?? "-"} ms${error ? ` — ${error}` : ""}`);
  }
  report.bench = bench;
}

async function negativePhase(call, report, failures) {
  const probes = [];
  for (const name of NEGATIVE_PROBES) {
    try {
      const res = await call(`/negative?probe=${name}`, { timeoutMs: 120_000 });
      probes.push(res.probes[0]);
    } catch (error) {
      // A Worker that died on an accepted 56 MB result answers with an edge error, not JSON.
      probes.push({ probe: name, expected: "refused", outcome: "inconclusive", error: error.message });
    }
    const p = probes.at(-1);
    log(`negative ${name}: ${p.outcome}${p.error ? ` — ${p.error}` : ""}`);
    if (p.outcome === "accepted") failures.push(`negative ${name}: ACCEPTED (${p.limit}) — remote D1 should refuse it`);
    if (p.outcome === "inconclusive") failures.push(`negative ${name}: no decision — ${p.error}`);
  }
  report.negative = probes;
}

/** Where two snapshots differ, as `path: expected → actual` lines (bounded). */
function differences(expected, actual, path = "sections", out = []) {
  if (out.length >= 20) return out;
  if (JSON.stringify(expected) === JSON.stringify(actual)) return out;
  if (expected && actual && typeof expected === "object" && typeof actual === "object" && !Array.isArray(expected) === !Array.isArray(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of keys) differences(expected[key], actual[key], `${path}.${key}`, out);
    return out;
  }
  const show = (v) => (v === undefined ? "absent" : JSON.stringify(v).slice(0, 120));
  out.push(`${path}: expected ${show(expected)}, got ${show(actual)}`);
  return out;
}

async function exportPhase(call, cfg, report, failures) {
  const res = await call("/export", { timeoutMs: 300_000 });
  const sections = res.sections;
  if (cfg.writeExpected) {
    mkdirSync(dirname(cfg.expectedFile), { recursive: true });
    const snapshot = {
      "//": `Expected /export sections for PROBE_SIZE=${cfg.size}, generated on LOCAL D1 (miniflare/workerd) by scripts/expected.mjs. Regenerate with: pnpm --filter @openproduct/d1-probe expected -- --size ${cfg.size}`,
      size: cfg.size,
      sections,
    };
    writeFileSync(cfg.expectedFile, `${JSON.stringify(snapshot, null, 2)}\n`);
    report.export = { wrote: cfg.expectedFile, prep: res.prep };
    log(`export: wrote ${cfg.expectedFile}`);
    return;
  }
  if (!existsSync(cfg.expectedFile)) {
    failures.push(`export: no expected snapshot at ${cfg.expectedFile} (generate it on local D1: pnpm --filter @openproduct/d1-probe expected -- --size ${cfg.size})`);
    report.export = { matched: false, prep: res.prep, sections };
    return;
  }
  const expected = JSON.parse(readFileSync(cfg.expectedFile, "utf8"));
  const diff = expected.size === cfg.size ? differences(expected.sections, sections) : [`size: expected file is for ${expected.size}, the run is ${cfg.size}`];
  const matched = diff.length === 0;
  if (!matched) failures.push(`export: remote D1 differs from local D1 — ${diff[0]}${diff.length > 1 ? ` (+${diff.length - 1} more)` : ""}`);
  report.export = {
    matched,
    expectedFile: cfg.expectedFile.slice(PACKAGE_DIR.length + 1) || cfg.expectedFile,
    prep: res.prep,
    catalogue: { pages: sections.catalogue.pages, cards: sections.catalogue.cards, digest: sections.catalogue.digest },
    searchIndex: sections.searchIndex.rows,
    searchIndexTerms: sections.searchIndexTerms.rows,
    ...(matched ? {} : { differences: diff }),
  };
  log(`export: ${matched ? "matches" : "DIFFERS FROM"} local D1 (${sections.catalogue.cards} cards, ${sections.searchIndex.rows} documents)`);
}

function budgets(bench) {
  const rows = [];
  for (const b of BUDGETS) {
    const summary = bench?.[b.op]?.summary;
    const observed = summary ? (b.stat === "maxStatementSqlMs" ? summary.maxStatementSqlMs : summary.wallMs?.[b.stat]) : null;
    const status =
      observed === null || observed === undefined
        ? "not measured"
        : observed <= b.limitMs
          ? "met"
          : observed <= 2 * b.limitMs
            ? "missed (within 2×)"
            : "missed (over 2×)";
    rows.push({ op: b.op, stat: b.stat === "maxStatementSqlMs" ? "slowest statement (SQL)" : `wall ${b.stat}`, budgetMs: b.limitMs, observedMs: observed ?? null, status, why: b.why });
  }
  const statuses = rows.map((r) => r.status);
  const call = statuses.some((s) => s === "missed (over 2×)")
    ? "no-go by §5.3 (a budget missed by more than 2×)"
    : statuses.some((s) => s === "not measured")
      ? "incomplete (a budget was not measured)"
      : statuses.some((s) => s.startsWith("missed"))
        ? "go by §5.3, with the slow statement named and fixed in OPN2 (missed inside 2×)"
        : "go by §5.3 (every budget met)";
  return { rows, reading: call, note: "Reported only: the budgets never fail the smoke. The go/no-go is a human call." };
}

// ─── the run ────────────────────────────────────────────────────────────────

function markerPath(env) {
  if (env.PROBE_MARKER === "off") return null;
  if (env.PROBE_MARKER_FILE) return resolve(env.PROBE_MARKER_FILE);
  // In a runner (GitHub Actions sets CI and GITHUB_ACTIONS; the orun runner gives every step ORUN_ENV).
  const inRunner = Boolean(env.CI || env.GITHUB_ACTIONS || env.ORUN_ENV);
  return inRunner ? join(tmpdir(), `openproduct-d1-probe-smoke-${process.ppid}.json`) : null;
}

export async function main(env = process.env) {
  const marker = markerPath(env);
  if (marker && existsSync(marker) && Date.now() - statSync(marker).mtimeMs < 3 * 60 * 60 * 1000) {
    const previous = JSON.parse(readFileSync(marker, "utf8"));
    log(`this step already ran the probe to a verdict (${previous.report.verdict}) — re-printing it instead of loading again`);
    process.stdout.write(`${JSON.stringify(previous.report, null, 2)}\n`);
    return previous.exitCode;
  }

  const startedAt = new Date();
  const report = { probe: "openproduct-d1-probe", startedAt: startedAt.toISOString() };
  const failures = [];
  let cfg;
  try {
    cfg = await config(env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // A missing secret will be missing on every retry: a verdict.
    report.verdict = "fail";
    report.failures = [`config: ${error.message}`];
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (marker) writeFileSync(marker, JSON.stringify({ exitCode: 2, report }));
    return 2;
  }
  Object.assign(report, { target: cfg.target, size: cfg.size, runs: cfg.runs, phases: cfg.phases });
  const call = client(cfg);
  const has = (phase) => cfg.phases.includes(phase);

  try {
    if (has("schema")) await schemaPhase(call, cfg, report, failures);
    if (has("reset")) report.reset = (await call("/reset")).reset;
    let loaded = !has("load");
    if (has("load")) {
      try {
        await loadPhase(call, cfg, report);
        loaded = true;
      } catch (error) {
        if (!(error instanceof WorkerAnswer)) throw error;
        failures.push(`load: ${error.message}`);
      }
    }
    if (has("bench") && loaded) await benchPhase(call, cfg, report, failures);
    if (has("negative")) await negativePhase(call, report, failures);
    if (has("export") && loaded) await exportPhase(call, cfg, report, failures);
    if (has("bench")) report.budgets = budgets(report.bench);
    if (has("cleanup")) {
      const cleanup = await call("/reset");
      report.cleanup = { emptied: true, databaseBytes: cleanup.databaseBytes };
    }
  } catch (error) {
    if (error instanceof WorkerAnswer) {
      failures.push(error.message);
    } else {
      // No verdict: let the composition's retry run the whole probe again.
      log(`no verdict: ${error.message}`);
      report.verdict = "error";
      report.failures = [...failures, `transport: ${error.message}`];
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return 3;
    }
  }

  const finishedAt = new Date();
  report.finishedAt = finishedAt.toISOString();
  report.durationMs = finishedAt.getTime() - startedAt.getTime();
  report.verdict = failures.length === 0 ? "pass" : "fail";
  report.failures = failures;
  const exitCode = failures.length === 0 ? 0 : 1;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  log(`verdict: ${report.verdict}${failures.length ? ` — ${failures.length} failure(s); first: ${failures[0]}` : ""}`);
  if (marker) writeFileSync(marker, JSON.stringify({ exitCode, report }));
  return exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      log(`crashed: ${error?.stack ?? error}`);
      process.exit(4);
    },
  );
}
