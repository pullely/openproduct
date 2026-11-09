// THE GATEWAY BINDING ALLOWLIST (openproduct-independence OX3).
//
// The gateway is internet-facing and fronts the product's data plane, so it
// carries the same class of guard core does: its wrangler config is read and
// the build fails if a binding appears that is not on the list. Exactly ONE
// service binding — CORE, inside the product boundary — and no data resource
// of any kind. The platform appears only as public URLS in vars (seam edges
// S2/S8): a platform binding appearing here is the seam being violated.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG = resolve(__dirname, "../../../gateway/wrangler.jsonc");

import { KNOWN_SWEEP_CRONS, SWEEP_CRON } from "@openproduct/contracts";

const ALLOWED_SERVICE_BINDINGS = ["CORE"];

/** Bindings that would each, on their own, breach the seam. */
const FORBIDDEN_BINDINGS = [
  "PLATFORM_DB",
  "OPENPRODUCT_WORKER", // the binding is named CORE; the old facade name reappearing means a copy-paste from api-edge
  "IDENTITY_WORKER",
  "MEMBERSHIP_WORKER",
  "PROJECTS_WORKER",
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

const raw = readFileSync(CONFIG, "utf-8");

function executable(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

const config = JSON.parse(executable(raw)) as {
  /** RS0 — asserted ABSENT at the top level; see the schedule suite below. */
  triggers?: { crons?: string[] };
  /** OPP4a — Workers Caching, asserted PRESENT in every environment. */
  cache?: { enabled?: boolean };
  env?: Record<
    string,
    {
      services?: Array<{ binding: string; service: string }>;
      triggers?: { crons?: string[] };
      cache?: { enabled?: boolean };
      kv_namespaces?: unknown;
      durable_objects?: unknown;
      migrations?: unknown;
      version_metadata?: unknown;
      r2_buckets?: unknown;
      queues?: unknown;
      d1_databases?: unknown;
      ai?: unknown;
      hyperdrive?: unknown;
    }
  >;
};

describe("openproduct-gateway binding allowlist", () => {
  const envs = Object.keys(config.env ?? {}).sort();

  it("declares exactly the dev/stage/prod environments", () => {
    expect(envs).toEqual(["dev", "prod", "stage"]);
  });

  it("holds exactly one service binding per environment: CORE", () => {
    for (const name of envs) {
      const services = config.env![name]!.services ?? [];
      expect(services.map((s) => s.binding)).toEqual(ALLOWED_SERVICE_BINDINGS);
      // The binding targets core's per-env worker and nothing else.
      expect(services[0]!.service).toBe(`openproduct-worker-${name}`);
    }
  });

  it("names no forbidden binding anywhere in the file", () => {
    for (const forbidden of FORBIDDEN_BINDINGS) {
      expect(raw.includes(`"${forbidden}"`)).toBe(false);
    }
  });

  it("holds no data resource of any kind — except the ONE MD1 names", () => {
    // MD-4: the media bucket is the first data resource this worker has ever
    // held, and it joins this test as a NAMED EXCEPTION rather than by
    // deleting the assertion. Every other resource kind stays forbidden, and
    // the bucket must be exactly the one, with exactly the name — an R2
    // binding called anything else, or a second bucket, is a copy-paste from
    // another worker and fails here.
    for (const name of envs) {
      const env = config.env![name]!;
      // Stage and prod bind the bucket terraform made for them; dev binds
      // nothing, because no dev bucket exists and a binding to a bucket that
      // does not exist is a deploy that fails (state-worker's convention).
      expect(JSON.stringify(env.r2_buckets ?? null)).toBe(
        name === "dev"
          ? "null"
          : JSON.stringify([{ binding: "MEDIA", bucket_name: `openproduct-media-${name}` }]),
      );
      for (const key of [
        "kv_namespaces",
        "queues",
        "d1_databases",
        "ai",
        "hyperdrive",
      ] as const) {
        expect(JSON.stringify(env[key] ?? null)).toBe("null");
      }
    }
  });

  it("CS1 — holds exactly one Durable Object, its own: the rate-limit bucket, in every environment", () => {
    // CS-B: the limiter's header planned "a Durable Object added to THIS
    // worker — never a platform binding", and this is the allowlist seeing
    // it and being updated deliberately, the way MD1's bucket was. Exactly
    // one binding, exactly this class, no `script_name` (an object in
    // another worker would be a binding across the seam), the migration
    // that creates it beside it, and the class exported from the entry —
    // a binding to a class the script does not export is a deploy that
    // fails.
    for (const name of envs) {
      const env = config.env![name]!;
      expect([name, JSON.stringify(env.durable_objects ?? null)]).toEqual([
        name,
        JSON.stringify({ bindings: [{ name: "RATE_LIMIT", class_name: "RateLimitBucket" }] }),
      ]);
      expect([name, JSON.stringify(env.migrations ?? null)]).toEqual([
        name,
        JSON.stringify([{ tag: "v1", new_sqlite_classes: ["RateLimitBucket"] }]),
      ]);
    }
    // In the config itself, not the comment that explains why it is absent.
    expect(executable(raw).includes("script_name")).toBe(false);
    const entry = readFileSync(resolve(__dirname, "../../../gateway/src/index.ts"), "utf-8");
    expect(entry).toMatch(/export \{ RateLimitBucket \} from "\.\/ratelimit\.js";/);
  });

  it("OO3 — carries the runtime's account of its own version, and nothing else of that shape", () => {
    // `version_metadata` is the runtime telling this worker which version it
    // is — not a data resource, not a platform binding — and it is named here
    // as exactly one binding with exactly this name, the way the bucket and
    // the rate-limit object are, so a second one is a copy-paste and fails.
    for (const name of envs) {
      expect([name, JSON.stringify(config.env![name]!.version_metadata ?? null)]).toEqual([
        name,
        JSON.stringify({ binding: "CF_VERSION_METADATA" }),
      ]);
    }
  });

  it("reaches the platform by URL, never by binding", () => {
    for (const name of envs) {
      const vars = (config.env![name] as { vars?: Record<string, string> }).vars ?? {};
      expect(vars.PLATFORM_API_URL).toMatch(/^https:\/\//);
      expect(vars.SITE_ORIGIN).toMatch(/^https:\/\//);
      // CONSOLE_ORIGIN retired at OX5b: no console browser call remains, so
      // its absence is now the asserted state.
      expect(vars.CONSOLE_ORIGIN).toBeUndefined();
    }
  });

  it("TS2 — commits no velocity override, which is the whole point of one", () => {
    // `OPENPRODUCT_VELOCITY` is deliberately absent from this file. A
    // committed value would mean changing a limit during an incident needs a
    // commit, a review and a deploy — which is exactly the thing TS2's
    // done-when says it must not need. Absent means the code's defaults
    // apply, and an operator sets the var in the dashboard when they need to
    // move one.
    expect(raw.includes("OPENPRODUCT_VELOCITY")).toBe(false);
  });

  it("MD4 — commits neither capture setting, and takes no browser binding: absent means off", () => {
    // The endpoint carries an account id and the token is a token; both are
    // set in the dashboard, per environment, and their absence is the
    // opt-out `/health` reports as `configured: false`. And the browser is
    // reached by URL, never by binding — the allowlist above stays exactly as
    // MD1 left it.
    expect(raw.includes("SCREENSHOT_CAPTURE_URL")).toBe(false);
    expect(raw.includes("SCREENSHOT_CAPTURE_TOKEN")).toBe(false);
    expect(raw.includes('"browser"')).toBe(false);
  });

  it("commits no resource ids (the no-committed-ids rule, BF6)", () => {
    expect(/"id":\s*"[0-9a-f]{32}"/.test(raw)).toBe(false);
  });
});

// THE SCHEDULE (openproduct-worldclass RS0).
//
// `src/index.ts` exports a `scheduled()` handler that rebuilds the search
// index, sweeps the endorsement counts, ranks the launch board and cuts the
// digest. For the life of the product this file declared no `triggers`, so
// that handler never fired: `/search` returned nothing for a slug linked from
// the front page, every count rendered `—`, the leaderboard was empty and the
// digest said nothing had launched. Nobody noticed, because a product with no
// numbers is exactly what a product with honestly-unmeasured numbers looks
// like from the outside.
//
// WC-1 is the rule that came out of it: a scheduled job with no schedule is
// an outage, not a safe default. This suite is that rule made mechanical.
describe("openproduct-gateway schedule (RS0)", () => {
  const envs = Object.keys(config.env ?? {}).sort();

  it("declares a cron in every environment that serves traffic", () => {
    for (const name of envs) {
      const crons = config.env![name]!.triggers?.crons ?? [];
      expect(crons.length).toBeGreaterThan(0);
    }
  });

  it("declares the schedule per environment, never as a top-level default", () => {
    // Wrangler would inherit a top-level `triggers` block into every named
    // environment, and that inheritance is exactly the wrong shape here: the
    // failure this suite exists to prevent was a schedule nobody could see
    // while reading the environment it was missing from. Declared per env,
    // the schedule is visible wherever somebody is looking; declared once at
    // the top, its absence from an env block means nothing at all.
    expect(config.triggers).toBeUndefined();
  });

  it("declares only well-formed five-field cron expressions", () => {
    for (const name of envs) {
      for (const cron of config.env![name]!.triggers!.crons!) {
        expect(cron.trim().split(/\s+/)).toHaveLength(5);
      }
    }
  });

  // RS2 — the two schedules, and the seam between this file and the code.
  //
  // `scheduled()` decides which HALF of the sweep to run by matching the cron
  // that fired against `contracts/sweep-schedule.ts`. So an expression here
  // that file does not name would not fail: it would silently run
  // materialisation, and whoever wrote it would be waiting for an ingestion
  // that never happens. That is the missing-block failure RS0 fixed, arriving
  // through a different door, and these two assertions are the door.

  it("commits no cron the contract does not name", () => {
    for (const name of envs) {
      for (const cron of config.env![name]!.triggers!.crons!) {
        expect(KNOWN_SWEEP_CRONS).toContain(cron);
      }
    }
  });

  it("runs materialisation in every environment that serves traffic", () => {
    // Mandatory, unlike ingestion. It reaches nothing outside the estate and
    // its absence is precisely what the 7 Sep audit measured: an empty
    // search, a dash on every row, a blank leaderboard, and a digest saying
    // nothing had launched.
    for (const name of envs) {
      expect(config.env![name]!.triggers!.crons!).toContain(SWEEP_CRON.materialisation);
    }
  });
});

// WORKERS CACHING (openproduct-performance OPP4a).
//
// This is the same rule as the schedule above, applied to the same kind of
// block. `router.ts` no longer contains a cache: Cloudflare consults one
// BEFORE the worker runs, and the only thing that turns it on is this flag.
// If it went missing from an environment, every public read there would
// quietly go back to costing a worker invocation and a database round trip —
// with no error, no failing test and no visible difference except latency and
// a bill. That is the shape of the outage RS0 already had once, so it gets the
// same treatment: stated per environment, never inherited, and asserted here.
describe("openproduct-gateway cache (OPP4a)", () => {
  const envs = Object.keys(config.env ?? {}).sort();

  it("enables Workers Caching in every environment that serves traffic", () => {
    expect(envs.length).toBeGreaterThan(0);
    for (const name of envs) {
      expect([name, config.env?.[name]?.cache?.enabled]).toEqual([name, true]);
    }
  });

  it("declares it at the top level too, so a bare deploy is not uncached", () => {
    expect(config.cache?.enabled).toBe(true);
  });
});
