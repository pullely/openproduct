// The deploy cycle that took openproduct.live down (openproduct-performance,
// 2026-09-09).
//
// ─── WHAT HAPPENED ────────────────────────────────────────────────────────
//
// OPP3 set `NEXT_PUBLIC_OPENPRODUCT_API_URL: https://api.openproduct.live` in
// the prod build. That hostname was created by `openproduct-domain`, and
// `openproduct-domain` dependsOn `openproduct-web` — so the build that needed
// the name ran BEFORE the component that creates it, by declared dependency
// order:
//
//     openproduct-web (prod build)  bakes       api.openproduct.live
//     api.openproduct.live          created by  openproduct-domain
//     openproduct-domain            dependsOn   openproduct-web
//
// The prod bundle shipped pointing at a name with no DNS record, every public
// read failed, and the front page rendered its error boundary with a 404 for
// ~50 minutes. Then it locked itself in: the failure tripped the web
// component's smoke, and that failure blocked `openproduct-domain` from ever
// applying, so the hostname stayed uncreated and no re-run could resolve it.
//
// ─── WHY A TEST, AND WHY THIS ONE ─────────────────────────────────────────
//
// Nothing in CI could have caught it. The PR lane runs `verify` and
// `plan-only`; the apply and the deploy happen only on `main`, so the first
// execution of a new ordering is always in production. The build succeeded
// because a `NEXT_PUBLIC_*` var is a string and no build step asks whether a
// hostname resolves. And dev and stage stayed green because the variable was
// declared in prod only — a decision that is still right, and that excluded
// the one environment which could have shown the failure early.
//
// So the guard cannot be "does the hostname resolve". It is the ORDERING,
// which is a fact about committed files and therefore checkable here.
//
// ─── THE INVARIANT, AFTER THE SPLIT ───────────────────────────────────────
//
// The first version of this test said simply "never both" — do not declare the
// hostname while its creator waits on this worker. That was right while the
// `api.` record lived in `openproduct-domain`, and it is now too blunt: the
// resources moved to `openproduct-api-domain`, which depends on the GATEWAY
// only, so the cycle is gone and the variable can be declared safely.
//
// What has to hold instead is the ordering that makes it safe, in both
// directions:
//
//   1. The component that CREATES the hostname must not wait on the web
//      worker — directly, or through `openproduct-domain`, which does.
//   2. If the web build DECLARES the hostname, it must wait on the component
//      that creates it. Otherwise a fresh estate races: the build can still
//      run first and bake a name that does not exist yet.
//
// Together those are acyclic and complete:
//
//     openproduct-api-domain  ->  openproduct-gateway
//     openproduct-web         ->  openproduct-api-domain
//     openproduct-domain      ->  openproduct-web
//
// A CLEAN-ESTATE PROPERTY, NOT A WARM-ACCOUNT ONE. The tempting reading once
// the hostname exists is that the ordering stops mattering. It does not: a new
// environment, a rebuilt account or a disaster recovery starts from nothing,
// and that is exactly where a wrong ordering deadlocks.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INFRA = resolve(__dirname, "../../../infra");
const WEB_COMPONENT = resolve(__dirname, "../../../web/component.yaml");

/** Lines that are not comments — a commented-out setting is not a setting. */
function activeLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"));
}

function dependsOn(componentYaml: string, name: string): boolean {
  return activeLines(componentYaml).some((line) =>
    new RegExp(`^\\s*-\\s*component:\\s*${name}\\s*$`).test(line),
  );
}

/**
 * Which infra component owns the `api.` record — found by reading the
 * Terraform rather than by hard-coding a directory, so that moving the
 * resources again moves this test's subject with them.
 */
function componentCreatingApiHostname(): { dir: string; yaml: string } {
  const candidates = ["api-domain", "domain"];
  for (const dir of candidates) {
    const tf = resolve(INFRA, dir, "terraform/main.tf");
    if (existsSync(tf) && /resource\s+"cloudflare_record"\s+"openproduct_api"/.test(readFileSync(tf, "utf8"))) {
      return { dir, yaml: resolve(INFRA, dir, "component.yaml") };
    }
  }
  throw new Error("no infra component declares the openproduct_api record");
}

const creator = componentCreatingApiHostname();

const webDeclaresApiUrl = activeLines(WEB_COMPONENT).some((line) =>
  /^\s*NEXT_PUBLIC_OPENPRODUCT_API_URL\s*:/.test(line),
);

describe("the API hostname is created before the build that names it", () => {
  it("is created by a component that does not wait on the web worker", () => {
    // Directly, or through `openproduct-domain` — which does wait on it, and
    // correctly so: a Workers Custom Domain attaches to a Worker by name.
    expect([
      `creator: openproduct-${creator.dir}`,
      `dependsOn openproduct-web: ${dependsOn(creator.yaml, "openproduct-web")}`,
      `dependsOn openproduct-domain: ${dependsOn(creator.yaml, "openproduct-domain")}`,
    ]).toEqual([`creator: openproduct-${creator.dir}`, "dependsOn openproduct-web: false", "dependsOn openproduct-domain: false"]);
  });

  it("is waited on by the web build, whenever that build names it", () => {
    // The other half. Without this edge a fresh estate races: nothing orders
    // the hostname's creation before the build that bakes it in.
    const webWaitsOnCreator = dependsOn(WEB_COMPONENT, `openproduct-${creator.dir}`);
    expect([
      `web declares the hostname: ${webDeclaresApiUrl}`,
      webDeclaresApiUrl && !webWaitsOnCreator,
    ]).toEqual([`web declares the hostname: ${webDeclaresApiUrl}`, false]);
  });

  it("keeps the reasoning next to the variable, not only in the epic", () => {
    // A commented-out line with no explanation is a line the next person
    // uncomments. The rule has to be readable at the point of temptation.
    //
    // Matched with `#` markers and line wrapping flattened, so this does not
    // pass or fail on where the sentence happens to break.
    const flattened = readFileSync(WEB_COMPONENT, "utf8")
      .replace(/^\s*#/gm, " ")
      .replace(/\s+/g, " ");
    expect(flattened).toMatch(
      /NEVER BAKE A HOSTNAME INTO A BUILD IN THE SAME CHANGE THAT CREATES THE HOSTNAME/i,
    );
  });

  it("still lets the fallback be a real address rather than a degraded mode", () => {
    // `openproductApiBase()` falls back to the gateway's workers.dev host, and
    // since OPP4a that host has a working cache (Workers Caching is keyed to
    // the worker, not the hostname). If this stops being true, the fallback
    // becomes a downgrade and the pressure to set the variable early returns.
    const platform = readFileSync(
      resolve(__dirname, "../../../web/src/lib/platform.ts"),
      "utf8",
    );
    expect(platform).toContain("openproduct-gateway-${env}");
  });
});
