// The suites are scheduled by the components they test (openproduct-performance D5).
//
// ─── THE GAP ──────────────────────────────────────────────────────────────
//
// `orun plan --changed` selects a component when ITS OWN files change. A
// `dependsOn` edge does NOT pull a dependent into a plan — `tests/web-perf`'s
// component measured that and wrote it down, and each of these three test
// components declares the edge and is planned anyway only when its own files
// move. So until this was wired, a change under `apps/openproduct/web/`,
// `apps/openproduct/gateway/` or `apps/openproduct/core/` planned exactly
// three jobs — that component in dev, stage and prod — and **2,046 tests did
// not run**.
//
// Not a theory. `orun plan --changed --files apps/openproduct/web/src/x.ts`
// lists only `openproduct-web`'s three jobs, and PR #1358 (which touched
// `web/component.yaml` and `web/src/lib/platform.ts` and nothing else) ran
// four jobs in CI — `plan` plus `openproduct-web` in three environments. The
// 1,044-test suite was not among them, and the change merged.
//
// ─── THE FIX, AND WHERE IT LIVES ──────────────────────────────────────────
//
// Each source component's `buildCommand` now runs its own suite before
// building. `buildCommand` is the only free-form slot in these compositions
// that runs before the deploy — the verify profiles have a fixed capability
// list with no pre-build hook — and the build step's `onFailure: stop` is what
// turns a red suite into a blocked deploy rather than a report nobody reads.
//
// ─── WHAT THIS GUARD DOES AND DOES NOT CLOSE ──────────────────────────────
//
// Every suite asserts ALL THREE wirings, not just its own, so removing the
// gateway's is caught by a pull request that also touches the website. What it
// cannot catch is the self-referential case: a pull request whose ONLY change
// is to delete the invocation from one component runs that component's new
// build command, which no longer runs the suite that would have objected. That
// is inherent to `--changed` planning and is stated here rather than left for
// somebody to discover.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** Each source component, and the suite its build must run first. */
const WIRED = [
  { component: "apps/openproduct/web/component.yaml", suite: "@openproduct/web-tests", app: "@openproduct/web" },
  { component: "apps/openproduct/gateway/component.yaml", suite: "@openproduct/gateway-tests", app: "@openproduct/gateway" },
  { component: "apps/openproduct/core/component.yaml", suite: "@openproduct/core-tests", app: "@openproduct/core" },
] as const;

describe("a source change runs the suite that guards it", () => {
  it.each(WIRED.map((w) => [w.app, w] as const))(
    "%s builds only after its own tests pass",
    (_app, wired) => {
      const yaml = readFileSync(resolve(REPO, wired.component), "utf-8");
      const line = yaml.split("\n").find((l) => l.trimStart().startsWith("buildCommand:"));
      expect(line).toBeDefined();
      const test = line!.indexOf(`test --filter=${wired.suite}`);
      const build = line!.indexOf(`build --filter=${wired.app}`);
      expect(test).toBeGreaterThan(-1);
      expect(build).toBeGreaterThan(-1);
      // ORDER, not just presence: tests after a build still gate the deploy,
      // but they pay for the build first — and on the website that is minutes
      // spent to learn something the suite knew in seconds.
      expect(test).toBeLessThan(build);
    },
  );

  it("every openproduct test package is either wired or deliberately not", () => {
    // The list above is hand-written, which is the usual way a check like this
    // rots: somebody adds a suite and nobody adds a row. So the suites are
    // DISCOVERED and reconciled against it.
    //
    // `@openproduct/web-perf` is the one deliberate omission, and D5 is why:
    // it builds the website itself against a fixture address, so it cannot
    // reuse the deploy job's build and would add minutes to every deploy,
    // prod included. The cheap suites are wired; the expensive lane is still
    // an open decision, and this line is where that decision is visible.
    //
    // IT ALSO CLOSES THE SILENT NO-OP. A turbo filter that matches nothing
    // exits 0 with `Tasks: 0 successful`, so a typo in a `buildCommand` would
    // let the build sail past a suite that never ran — which is the exact
    // class of failure this file exists for. The wiring assertion above pins
    // the filter to a name, and this one pins that name to a package that
    // actually exists.
    const suites = readdirSync(resolve(REPO, "apps/openproduct/tests"))
      .map((dir) => {
        const pkg = resolve(REPO, "apps/openproduct/tests", dir, "package.json");
        return existsSync(pkg) ? (JSON.parse(readFileSync(pkg, "utf-8")).name as string) : null;
      })
      .filter((name): name is string => name !== null)
      .sort();
    expect(suites).toEqual([
      "@openproduct/core-tests",
      "@openproduct/gateway-tests",
      "@openproduct/web-perf",
      "@openproduct/web-tests",
    ]);
    expect([...WIRED].map((w) => w.suite).sort()).toEqual(
      suites.filter((name) => name !== "@openproduct/web-perf"),
    );
  });

  it("no suite declares a `dependsOn`, because an edge makes it run NOTHING", () => {
    // THE SECOND HALF OF THE SAME BUG, and the more expensive one. These
    // components used to declare edges to the components they test. The edge
    // scheduled nothing — that is the gap above — and when the subject WAS in
    // the same plan it cost the whole suite: on a pull request there is no
    // `--remote-state`, so each job coordinates locally and reads an in-plan
    // dependency as unfinished. The job prints `✓ Done in 0.0s / 1 waiting`,
    // runs nothing, and reports SUCCESS.
    //
    // OBSERVED IN CI, verbatim, on #1364 and #1365. So the edge made a suite
    // run only when the code it guards had NOT changed, which is exactly
    // backwards. `orun plan` confirms the mechanism: with the edge,
    // `openproduct-web-tests · dev · Verify` waits on one job; without it, zero.
    //
    // `tests/web-perf/component.yaml` reasoned its way here first and wrote it
    // down. This is the assertion that keeps the other three from drifting back.
    for (const dir of readdirSync(resolve(REPO, "apps/openproduct/tests"))) {
      const yaml = resolve(REPO, "apps/openproduct/tests", dir, "component.yaml");
      if (!existsSync(yaml)) continue;
      const source = readFileSync(yaml, "utf-8")
        .replace(/^\s*#.*$/gm, "")
        .replace(/^\s*$\n/gm, "");
      expect([dir, /^\s*dependsOn:/m.test(source)]).toEqual([dir, false]);
    }
  });
});
