// Build the website against the fixture, serve it, hand back a base URL
// (openproduct-commons XP4).
//
// WHY `next start` AND NOT THE OPENNEXT WORKER. What deploys is a Cloudflare
// worker the `@opennextjs/cloudflare` adapter builds out of `.next/standalone`,
// and driving workerd here would buy accuracy this lane cannot use: every
// quantity it budgets — the bytes of the hashed `/_next/static` chunks, the
// weight of the cached document, the layout the browser computes from them —
// comes out of the same `.next` output either way. So this takes the cheap,
// stable path and says so, rather than implying a fidelity it does not have.
//
// (`next build` prints a warning that `next start` "does not work with
// output: standalone". The flag is there for the adapter; `next start` serves
// the same `.next` output regardless, which is what this measures.)
//
// KILLING THE SERVER IS ITS OWN PROBLEM, and getting it wrong costs the next
// run rather than this one. `pnpm exec next start` is a shell wrapper around
// the real server: signalling the wrapper leaves the child holding the port,
// and the next run dies on EADDRINUSE having already spent three minutes on a
// build. So the server is started in its own process group and the GROUP is
// signalled.

import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startGateway } from "./fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = resolve(here, "../../../web");

/** How long a build may take before we call it hung. Generous: a cold CI
 *  runner compiling 35 routes is slow, and a timeout that fires on a slow
 *  machine reads as a product regression, which is the worst kind of flake. */
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

function run(cmd, args, opts) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error(`${cmd} ${args.join(" ")} timed out after ${BUILD_TIMEOUT_MS}ms`));
    }, BUILD_TIMEOUT_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

/**
 * Bring up the fixture gateway and the website in front of it.
 *
 * Returns `{ base, gateway, stop }`. `gateway.requests` is every read the
 * server made, in order, so a budget can ask how many times a page read the
 * directory without a stopwatch being involved.
 *
 * `XP4_SKIP_BUILD=1` reuses an existing `.next` — a local convenience only.
 * CI always builds, because a budget measured against a stale bundle is a
 * budget measuring the last person's work.
 */
export async function serveWebsite({ port = 3187 } = {}) {
  // A FIXED gateway port, derived from the web port rather than allocated.
  //
  // `NEXT_PUBLIC_*` is INLINED AT BUILD TIME, so the gateway's address is
  // baked into the bundle — an ephemeral port would mean every build produced
  // an app that could only ever talk to that one run's gateway, and
  // `XP4_SKIP_BUILD` would then point a reused bundle at a socket nobody is
  // listening on. The failure that produces is the nastiest kind: the reads
  // fail, `readPublic` turns them into `null`, and the dynamic routes render
  // failure panels that a lane without the §1 "did it render" check would have
  // measured as very fast pages.
  const gateway = await startGateway(port + 1);

  const env = {
    ...process.env,
    // The fixture answers every public read. Set for BOTH build and serve:
    // the static routes bake their content at build time and the dynamic ones
    // read at request time, and a lane that set it for only one of those
    // would measure half a website.
    NEXT_PUBLIC_OPENPRODUCT_API_URL: gateway.url,
    NEXT_PUBLIC_DEPLOY_ENV: "stage",
    // A CANONICAL ORIGIN, AND FR5 IS WHY IT IS NOT EMPTY ANY MORE.
    //
    // This was `""`, on the reasoning that "a workers.dev-shaped preview
    // advertises none, and this is not a deployment" — true about canonical
    // URLs, and wrong about what it costs. `publicApexOrigin()` returning null
    // does not merely drop a `<link rel="canonical">`: the listing's badge
    // snippet (RE4) and its share control (RE3) BOTH render `null` without an
    // origin, so every lane here has been measuring a listing page with two
    // shipped controls missing from it — a smaller document, a smaller client
    // bundle, and two controls no accessibility walk could reach.
    //
    // FR5 found it by adding a check for one of them and being told it was not
    // on the page. What deploys has an origin; so does the corpus now.
    NEXT_PUBLIC_SITE_ORIGIN: "https://openproduct.example",
    NEXT_PUBLIC_CONSOLE_ORIGIN: "https://console.invalid",
  };

  if (!process.env.XP4_SKIP_BUILD) {
    // MD2 — THE DATA CACHE OUTLIVES THE BUILD, and it masked a fixture fix. Next
    // persists `fetch()` responses under `.next/cache/fetch-cache` across
    // builds, keyed by URL; the fixture gateway sits on one fixed port, so a
    // document it answered last week is served to this week's prerender
    // unchanged. A sidebar the fixture had just learned to answer with
    // `replies` still prerendered without them and the build died on
    // `.length`. CI never sees this (a fresh runner has no cache); a laptop
    // always does. Cleared before every build, so the fixture is the only
    // source of what the build reads.
    await rm(resolve(WEB_DIR, ".next/cache/fetch-cache"), { recursive: true, force: true });
    // `--webpack`, as the app's own `build` script does (next.config.mjs says why).
    await run("pnpm", ["exec", "next", "build", "--webpack"], { cwd: WEB_DIR, env });
  }

  const server = spawn("pnpm", ["exec", "next", "start", "-p", String(port)], {
    cwd: WEB_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    // Its own process group, so `stop()` can take the whole tree down.
    detached: true,
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => process.stderr.write(d));

  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(4000) });
      up = res.status < 500;
    } catch {
      await sleep(500);
    }
  }

  const stop = async () => {
    try {
      // Negative pid = the whole process group, which is the wrapper AND the
      // server it spawned.
      process.kill(-server.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    await gateway.close();
  };

  if (!up) {
    await stop();
    throw new Error("web-perf: the website did not come up");
  }

  return { base, gateway, stop };
}
