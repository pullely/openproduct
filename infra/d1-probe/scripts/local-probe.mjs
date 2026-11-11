// The probe Worker on LOCAL D1 (openproduct-standalone OPN-2) — for the
// Worker's tests and for regenerating the expected snapshots.
//
// It runs the BUILT artifact, not the sources: `wrangler deploy --dry-run
// --outdir` bundles exactly what a deploy uploads (the slice migration rides
// along as a Text module), and miniflare serves that bundle on real workerd
// with a real local D1 database behind `DB`. Development tooling only — the
// smoke script (`probe-run.mjs`) uses Node built-ins and nothing from here.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const here = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_DIR = resolve(here, "..");
const REPO_ROOT = resolve(PACKAGE_DIR, "../..");

function run(command, args, cwd) {
  const res = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" },
  });
  if (res.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${res.status}):\n${res.stdout}\n${res.stderr}`);
  }
  return res.stdout;
}

/**
 * Bundle the Worker into `outdir` (a fresh temp dir by default). The config
 * is the rendered `wrangler.jsonc`: rendered from the committed fixture when
 * it is absent (a dry-run needs a config, not real IDs), used as it is when a
 * wire step already rendered it.
 */
export function buildProbe(outdir = mkdtempSync(join(tmpdir(), "d1-probe-dist-"))) {
  if (!existsSync(join(PACKAGE_DIR, "wrangler.jsonc"))) {
    run(process.execPath, [
      join(REPO_ROOT, "tooling/wire/render.mjs"),
      "--template", "wrangler.template.jsonc",
      "--out", "wrangler.jsonc",
      "--map", "wiring.fixture.json",
    ], PACKAGE_DIR);
  }
  run(join(PACKAGE_DIR, "node_modules/.bin/wrangler"), ["deploy", "--dry-run", "--config", "wrangler.jsonc", "--env", "", "--outdir", outdir], PACKAGE_DIR);
  return outdir;
}

/**
 * Serve a built probe on an ephemeral port with an empty in-memory D1 as `DB`.
 * `token` becomes PROBE_TOKEN (omit it to start a Worker that was never given one).
 */
export async function startLocalProbe({ outdir, token } = {}) {
  const dist = outdir ?? buildProbe();
  const bindings = { ENVIRONMENT: "local" };
  if (token !== undefined) bindings.PROBE_TOKEN = token;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      // The bundle's modules, as wrangler wrote them: the entry, and the
      // migration it imports as text (`./<hash>-slice.sql`).
      modulesRoot: dist,
      modules: [
        { type: "ESModule", path: join(dist, "index.js") },
        ...readdirSync(dist)
          .filter((file) => file.endsWith(".sql"))
          .map((file) => ({ type: "Text", path: join(dist, file) })),
      ],
      compatibilityDate: "2025-05-01",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "openproduct-probe-local" },
      bindings,
      host: "127.0.0.1",
      port: 0,
    }),
  );
  const url = await mf.ready;
  return {
    url: url.toString().replace(/\/$/, ""),
    mf,
    async dispose() {
      await mf.dispose();
      if (!outdir) rmSync(dist, { recursive: true, force: true });
    },
  };
}
