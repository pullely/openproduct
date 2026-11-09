#!/usr/bin/env node
// Regenerate expected/<size>.json — the snapshot the smoke compares remote D1
// against — on LOCAL D1 (openproduct-standalone OPN-2).
//
//   pnpm --filter @openproduct/d1-probe expected                  # smoke, suite and full
//   pnpm --filter @openproduct/d1-probe expected -- --size full   # one size
//
// It builds the Worker, serves the bundle on miniflare (real workerd, real
// local D1), and runs the SAME smoke script against it with
// PROBE_PHASES=schema,reset,load,export and PROBE_WRITE_EXPECTED=1: the
// corpus is deterministic (every value is an offset from CORPUS_NOW), so the
// export of a freshly loaded corpus is a fixed point both engines must reach.
// Regenerate it when the slice's SQL, the schema or the corpus changes — and
// say why in the commit, because a changed snapshot is a changed claim.

import { randomBytes } from "node:crypto";

import { buildProbe, startLocalProbe } from "./local-probe.mjs";
import { main } from "./probe-run.mjs";

const args = process.argv.slice(2);
const sizes = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--size") sizes.push(args[++i]);
  else if (args[i] !== "--") throw new Error(`unknown argument ${args[i]} (use --size smoke|suite|full)`);
}

const token = randomBytes(24).toString("hex");
const dist = buildProbe();
let failed = false;
for (const size of sizes.length > 0 ? sizes : ["smoke", "suite", "full"]) {
  const probe = await startLocalProbe({ outdir: dist, token });
  try {
    const code = await main({
      ...process.env,
      PROBE_URL: probe.url,
      PROBE_TOKEN: token,
      PROBE_SIZE: size,
      PROBE_PHASES: "schema,reset,load,export",
      PROBE_WRITE_EXPECTED: "1",
      PROBE_MARKER: "off",
    });
    if (code !== 0) failed = true;
  } finally {
    await probe.dispose();
  }
}
process.exit(failed ? 1 : 0);
