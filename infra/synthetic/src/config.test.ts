// The synthetic's own allowlist (OO1; OO-1, OO-5).
//
// The gateway's binding test exists so that a resource is taken
// deliberately. This worker's rule is stricter and simpler: it holds ONE
// resource, its own memory, and nothing that belongs to the thing it watches.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SYNTHETIC_CRON } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(__dirname, "../wrangler.jsonc"), "utf-8");
const component = readFileSync(resolve(__dirname, "../component.yaml"), "utf-8");
const entry = readFileSync(resolve(__dirname, "./index.ts"), "utf-8");

function executable(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

const config = JSON.parse(executable(raw)) as {
  name: string;
  compatibility_flags?: string[];
  triggers?: unknown;
  env?: Record<
    string,
    {
      vars?: Record<string, string>;
      triggers?: { crons?: string[] };
      durable_objects?: unknown;
      migrations?: unknown;
      services?: unknown;
      r2_buckets?: unknown;
      kv_namespaces?: unknown;
      d1_databases?: unknown;
      queues?: unknown;
      hyperdrive?: unknown;
      ai?: unknown;
    }
  >;
};

const envs = Object.keys(config.env ?? {}).sort();

describe("the watcher is not the watched", () => {
  it("declares dev, stage and prod, and holds no binding to anything but its own memory", () => {
    expect(envs).toEqual(["dev", "prod", "stage"]);
    for (const name of envs) {
      const env = config.env![name]!;
      for (const key of ["services", "r2_buckets", "kv_namespaces", "d1_databases", "queues", "hyperdrive", "ai"] as const) {
        expect([name, key, env[key] ?? null]).toEqual([name, key, null]);
      }
      expect([name, JSON.stringify(env.durable_objects)]).toEqual([name, JSON.stringify({ bindings: [{ name: "SYNTHETIC_STATE", class_name: "SyntheticState" }] })]);
      expect([name, JSON.stringify(env.migrations)]).toEqual([name, JSON.stringify([{ tag: "v1", new_sqlite_classes: ["SyntheticState"] }])]);
    }
    expect(executable(raw).includes("script_name")).toBe(false);
    expect(entry).toMatch(/export \{ SyntheticState \} from "\.\/state\.js";/);
    // And no edge in the component graph either: it reaches the product by URL.
    expect(component).not.toMatch(/^\s*dependsOn:/m);
  });

  it("reaches the product by public https URL in every environment, with the flag that makes an own-zone fetch work", () => {
    for (const name of envs) {
      const vars = config.env![name]!.vars ?? {};
      expect([name, vars.API_ORIGIN]).toEqual([name, expect.stringMatching(/^https:\/\//)]);
      expect([name, vars.SITE_ORIGIN]).toEqual([name, expect.stringMatching(/^https:\/\//)]);
      expect(vars.ENVIRONMENT).toBe(name);
    }
    expect(config.env!.prod!.vars!.API_ORIGIN).toBe("https://api.openproduct.live");
    expect(config.env!.prod!.vars!.SITE_ORIGIN).toBe("https://openproduct.live");
    expect(config.compatibility_flags).toContain("global_fetch_strictly_public");
  });
});

describe("the schedule is the whole point", () => {
  it("every environment declares the contract's cron, and only that; never a top-level default", () => {
    expect(config.triggers).toBeUndefined();
    for (const name of envs) {
      expect([name, config.env![name]!.triggers?.crons]).toEqual([name, [SYNTHETIC_CRON]]);
    }
    expect(SYNTHETIC_CRON.trim().split(/\s+/)).toHaveLength(5);
  });
});

describe("OO-A is not answered here", () => {
  it("commits no channel, no secret, no operator and no window", () => {
    for (const name of ["ALERT_DELIVERY_URL", "ALERT_SEAM_SECRET", "OPERATOR_SUBJECT_ID", "MAINTENANCE_UNTIL"]) {
      expect([name, executable(raw).includes(name)]).toEqual([name, false]);
    }
    expect(/"id":\s*"[0-9a-f]{32}"/.test(raw)).toBe(false);
    expect(config.name).toBe("openproduct-synthetic");
  });
});
