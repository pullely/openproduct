// A page from the build before this one (openproduct-open-builds OB8).
//
// THE PEOPLE INDEX'S FAILURE, PINNED. `/people` showed *Something failed
// here* on prod while its server render answered 200. Every deploy replaces
// the worker's static assets, so the previous build's hashed chunks 404 the
// moment the new build is live, and a document from that previous build
// still reaches readers (the edge's stale window, a tab opened before the
// deploy). Its page chunk fails with `ChunkLoadError`; `people/error.tsx`
// caught it, discarded it, and offered *Try again*, which asks for the same
// missing chunk. Reproduced by 404ing `app/people/(index)/page-*.js` under a
// real browser: `ChunkLoadError: Loading chunk 1848 failed`, then the panel.
//
// What is pinned: the recogniser knows the failure; a stale page reloads
// ONCE per address per minute and never loops; every route boundary goes
// through the one component that logs the error and reloads; and the
// people boundary no longer discards what it caught.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STALE_DEPLOY_RELOAD_KEY,
  STALE_DEPLOY_WINDOW_MS,
  claimReload,
  isStaleDeployError,
} from "@openproduct-web/lib/stale-deploy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("the recogniser knows a chunk from a build that is gone", () => {
  it("matches webpack's ChunkLoadError and the CSS and native-import shapes", () => {
    const chunk = Object.assign(new Error("Loading chunk 1848 failed.\n(error: …/app/people/(index)/page-f4e0.js)"), {
      name: "ChunkLoadError",
    });
    expect(isStaleDeployError(chunk)).toBe(true);
    expect(isStaleDeployError(new Error("Loading CSS chunk 91 failed."))).toBe(true);
    expect(isStaleDeployError(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
    expect(isStaleDeployError(new TypeError("Importing a module script failed."))).toBe(true);
  });

  it("leaves every other failure to the panel", () => {
    expect(isStaleDeployError(new TypeError("person.maintains is not iterable"))).toBe(false);
    expect(isStaleDeployError(new Error("fetch failed"))).toBe(false);
    expect(isStaleDeployError(null)).toBe(false);
    expect(isStaleDeployError("ChunkLoadError")).toBe(false);
  });
});

describe("a stale page reloads once, and never loops", () => {
  it("claims one reload per address per window", () => {
    const store = memory();
    const t0 = Date.parse("2026-10-14T07:40:00Z");
    expect(claimReload(store, "/people", t0)).toBe(true);
    expect(store.map.get(STALE_DEPLOY_RELOAD_KEY)).toBe(`/people ${t0}`);
    // The same failure again inside the window is real: show the panel.
    expect(claimReload(store, "/people", t0 + 5_000)).toBe(false);
    // Another address is its own question.
    expect(claimReload(store, "/@ada", t0 + 6_000)).toBe(true);
    // And the window passes.
    expect(claimReload(store, "/@ada", t0 + 6_000 + STALE_DEPLOY_WINDOW_MS)).toBe(true);
  });

  it("does not reload at all where it cannot record that it did", () => {
    expect(claimReload(null, "/people", Date.now())).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => undefined,
    };
    expect(claimReload(broken, "/people", Date.now())).toBe(false);
  });
});

describe("every route boundary goes through the one that logs and reloads", () => {
  it.each(["error.tsx", "people/error.tsx", "[slug]/error.tsx", "me/error.tsx", "studio/error.tsx"])(
    "%s renders RouteError with the error it caught",
    (file) => {
      const source = code(file);
      expect(source).toContain("<RouteError");
      expect(source).toContain("error={error}");
      expect(source).not.toContain("<FailurePanel");
    },
  );

  it("logs the digest, reloads a stale page once, and reloads on Try again rather than re-rendering", () => {
    const route = code("ui/route-error.tsx");
    expect(route).toContain('console.error("openproduct route error", error.digest ?? "(no digest)"');
    expect(route).toContain("claimReload(storage, window.location.pathname, Date.now())");
    expect(route).toContain("const tryAgain = stale ? () => window.location.reload() : reset;");
  });

  it("the boundary of last resort recovers a stale page too, with nothing but the pure helper", () => {
    const global = code("global-error.tsx");
    expect(global).toContain("isStaleDeployError(error)");
    expect(global).toContain("claimReload(storage, window.location.pathname, Date.now())");
    expect(global).toMatch(/^import \{ claimReload, isStaleDeployError \} from "@\/lib\/stale-deploy";$/m);
  });
});
