#!/usr/bin/env node
// BF6 deploy-time wiring renderer (zero-dependency).
//
// Renders a wrangler config from a committed template by substituting wiring
// tokens of the form:
//
//   @@wiring(<component>/<env>:<key>)@@
//
// Token values come from one of two sources:
//   --map <file>          a single JSON file: { "<component>/<env>": { "<key>": "..." } }
//                         (the committed wiring.fixture.json — offline PR dry-runs)
//   --secrets-dir <dir>   one JSON file per component/env named <component>__<env>.json,
//                         each containing that environment's payload (fetched from
//                         AWS Secrets Manager by the composition's wire-live step)
//
// Fails loudly listing every unresolved token — a missing wiring key must
// never produce a deployable config.
//
// It also substitutes per-environment SETTINGS (saas-workspace-deletion WD9):
//
//   @@env(<NAME>|<default>)@@
//
// The value is the deploy job's environment variable NAME — set per
// environment in intent.yaml's `environments.<env>.env`, which orun exports to
// every job of that environment — or <default> when it is unset or empty. This
// makes intent.yaml the one place a switch like WORKSPACE_PURGE_ENABLED is
// decided, instead of a variable set by hand in a dashboard that the next
// deploy silently wipes. The default is required and should be the SAFE value
// ("false" for anything that destroys data), so a job that does not carry the
// variable deploys the switch off rather than on. Each resolution is logged
// with its source, and a value that would break the JSON string it lands in is
// refused.
//
// Usage:
//   node render.mjs --template wrangler.template.jsonc --out wrangler.jsonc --map wiring.fixture.json
//   node render.mjs --template wrangler.template.jsonc --out wrangler.jsonc --secrets-dir /tmp/wiring

import * as fs from "node:fs";
import * as path from "node:path";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const templatePath = arg("template");
const outPath = arg("out");
const mapPath = arg("map");
const secretsDir = arg("secrets-dir");

if (!templatePath || !outPath || (!mapPath && !secretsDir)) {
  console.error(
    "usage: render.mjs --template <file> --out <file> (--map <file> | --secrets-dir <dir>)",
  );
  process.exit(2);
}

const template = fs.readFileSync(templatePath, "utf8");
const TOKEN_RE = /@@wiring\(([a-z0-9-]+)\/([a-z0-9-]+):([a-zA-Z0-9_]+)\)@@/g;

/** "component/env" -> payload object */
const sources = new Map();

function payloadFor(component, env) {
  const id = `${component}/${env}`;
  if (sources.has(id)) return sources.get(id);
  let payload;
  if (mapPath) {
    const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    payload = map[id];
  } else {
    const file = path.join(secretsDir, `${component}__${env}.json`);
    if (fs.existsSync(file)) payload = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  sources.set(id, payload);
  return payload;
}

const ENV_TOKEN_RE = /@@env\(([A-Z][A-Z0-9_]*)\|([^)@"\\]*)\)@@/g;
const SAFE_VALUE_RE = /^[^"\\\n\r]*$/;
const envResolutions = new Map();
const badEnvValues = [];
const withEnv = template.replace(ENV_TOKEN_RE, (_token, name, fallback) => {
  const fromEnv = process.env[name];
  const value = typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : fallback;
  if (!SAFE_VALUE_RE.test(value)) badEnvValues.push(name);
  envResolutions.set(name, `${value} (${value === fromEnv ? "from environment" : "default"})`);
  return value;
});
if (badEnvValues.length > 0) {
  console.error(`wire: refusing env values that would break the config: ${badEnvValues.join(", ")}`);
  process.exit(1);
}
if (/@@env\(/.test(withEnv)) {
  console.error("wire: rendered output still contains malformed @@env(...)@@ tokens (each needs NAME|default)");
  process.exit(1);
}

const unresolved = [];
const rendered = withEnv.replace(TOKEN_RE, (token, component, env, key) => {
  const payload = payloadFor(component, env);
  const value = payload?.[key];
  if (typeof value !== "string" || value.length === 0) {
    unresolved.push(token);
    return token;
  }
  return value;
});

if (unresolved.length > 0) {
  console.error("wire: unresolved wiring tokens:");
  for (const t of unresolved) console.error(`  ${t}`);
  process.exit(1);
}

// Guard: a rendered config must contain no leftover *well-formed* tokens.
// (A fresh regex — TOKEN_RE is /g-stateful; doc comments describing the token
// shape with <placeholders> intentionally do not match.)
if (/@@wiring\([a-z0-9-]+\/[a-z0-9-]+:[a-zA-Z0-9_]+\)@@/.test(rendered)) {
  console.error("wire: rendered output still contains wiring tokens");
  process.exit(1);
}

for (const [name, resolution] of envResolutions) {
  console.log(`wire: env ${name} = ${resolution}`);
}

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, rendered);
console.log(
  `wire: rendered ${path.basename(outPath)} from ${path.basename(templatePath)} (${sources.size} wiring source(s))`,
);
