// THE BINDING ALLOWLIST (saas-openproduct OD1, design.md §3).
//
// This is the test that converts the epic's central security claim from a
// review comment into a build failure.
//
// openproduct-worker serves a surface anyone on the internet can read without
// authenticating. The claim is not that identity, config, events, state,
// agents, metering and billing are *guarded* from it — it is that they are
// UNREACHABLE from this isolate. A claim like that is only worth what enforces
// it, and what enforces it is the binding list in wrangler.template.jsonc.
//
// So this file reads that file and fails if a binding appears that is not on
// the list below. A future contributor who needs the audit log on the public
// page has to argue with CI first, which is the point.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(__dirname, "../../../core/wrangler.template.jsonc");

/**
 * The complete set of service bindings this worker may hold: NONE, since OX5.
 *
 * (PROJECTS_WORKER left the list at OX1 — declared for OD3, called by
 * nothing. MEMBERSHIP_WORKER — the last entry — left at OX5: the link grant
 * carries the platform's one attestation per RELATIONSHIP, and the S6 webhook
 * replaced the live JR read. The empty list is the epic's repo-cut property
 * stated as configuration.)
 *
 * Adding to this list is not a code change, it is a change to the epic's
 * threat model. design.md §3 and README §Decisions locked both name it.
 */
const ALLOWED_SERVICE_BINDINGS: string[] = [];

/** Bindings that would each, on their own, defeat the epic's thesis. */
const FORBIDDEN_BINDINGS = [
  "MEMBERSHIP_WORKER",
  "PROJECTS_WORKER",
  "IDENTITY_WORKER",
  "CONFIG_WORKER",
  "EVENTS_WORKER",
  "STATE_WORKER",
  "AGENTS_WORKER",
  "METERING_WORKER",
  "BILLING_WORKER",
  "INTEGRATIONS_WORKER",
  "NOTIFICATIONS_WORKER",
  "WEBHOOKS_WORKER",
  "CHAT_WORKER",
  "POLICY_WORKER",
];

const template = readFileSync(TEMPLATE, "utf-8");

/** Strip `//` comments so the doc block above the config is not parsed as config. */
function executable(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

const config = JSON.parse(executable(template)) as {
  services?: Array<{ binding: string; service: string }>;
  hyperdrive?: Array<{ binding: string; id: string }>;
  vars?: Record<string, string>;
  workers_dev?: boolean;
  env?: Record<
    string,
    {
      services?: Array<{ binding: string; service: string }>;
      hyperdrive?: Array<{ binding: string; id: string }>;
      vars?: Record<string, string>;
      workers_dev?: boolean;
    }
  >;
};

const environments = Object.entries(config.env ?? {});

describe("openproduct-worker binding allowlist (design.md §3)", () => {
  it("declares at least the deployed environments", () => {
    expect(environments.map(([name]) => name).sort()).toEqual(["dev", "prod", "stage"]);
  });

  it("holds no service binding outside the allowlist, in any environment", () => {
    const offenders: string[] = [];
    for (const [name, env] of [["<top-level>", config] as const, ...environments]) {
      for (const service of env.services ?? []) {
        if (!ALLOWED_SERVICE_BINDINGS.includes(service.binding)) {
          offenders.push(`${name}: ${service.binding}`);
        }
      }
    }
    // Named rather than counted, so a failure says which binding and where.
    expect(offenders).toEqual([]);
  });

  it("holds none of the bindings that would defeat the thesis", () => {
    const found = FORBIDDEN_BINDINGS.filter((binding) => template.includes(`"binding": "${binding}"`));
    expect(found).toEqual([]);
  });

  it("binds only PLATFORM_DB as a data resource — no KV, no DO, no R2, no queues", () => {
    const parsed = JSON.parse(executable(template)) as Record<string, unknown> & {
      env?: Record<string, Record<string, unknown>>;
    };
    const dataKeys = ["kv_namespaces", "durable_objects", "r2_buckets", "queues", "d1_databases", "ai"];
    for (const [name, env] of [["<top-level>", parsed] as const, ...Object.entries(parsed.env ?? {})]) {
      for (const key of dataKeys) {
        expect(`${name}.${key}: ${JSON.stringify((env as Record<string, unknown>)[key] ?? null)}`).toBe(
          `${name}.${key}: null`,
        );
      }
    }
    for (const [, env] of environments) {
      for (const hyperdrive of env.hyperdrive ?? []) {
        expect(hyperdrive.binding).toBe("PLATFORM_DB");
      }
    }
  });

  // The public surface is api-edge's facade and the console. A workers.dev
  // hostname on this worker would be a second, unfronted public door — no rate
  // limit, no cache policy, no facade.
  it("is not published on workers.dev in any deployed environment", () => {
    for (const [name, env] of environments) {
      if (name === "dev") continue;
      expect(`${name}: ${String(env.workers_dev)}`).toBe(`${name}: false`);
    }
  });

  it("commits no resource ids — every id is a wiring token", () => {
    for (const [, env] of environments) {
      for (const hyperdrive of env.hyperdrive ?? []) {
        expect(hyperdrive.id).toMatch(/^@@wiring\(.+\)@@$/);
      }
    }
  });
});

describe("openproduct-worker serving posture (the flag is retired)", () => {
  // Prod serves openproduct directly. The OPENPRODUCT_ENABLED mechanism was
  // removed once that decision landed — a reappearing flag would mean the
  // posture regressed to launch-gated without anyone deciding it, so its
  // absence is asserted the same way its values used to be.
  it("declares no OPENPRODUCT_ENABLED var, in any environment", () => {
    expect(config.vars?.OPENPRODUCT_ENABLED).toBeUndefined();
    for (const [name, env] of environments) {
      expect(`${name}: ${String(env.vars?.OPENPRODUCT_ENABLED)}`).toBe(`${name}: undefined`);
    }
  });
});
