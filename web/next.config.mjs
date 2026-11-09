import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `@openproduct/contracts` is a workspace-source package (its exports point
  // at `./src/index.ts`); run it through SWC so the standalone build never
  // depends on a compiled artifact.
  transpilePackages: ["@openproduct/contracts"],
  // openproduct-studio OSD5 — a tab you just left is still yours.
  //
  // Next 15 keeps a DYNAMIC page's render in the client router cache for 0s,
  // so going back to a studio tab visited a moment ago re-ran every read
  // behind it. Thirty seconds: long enough that flicking between a listing's
  // tabs is instant, short enough that a second browser tab's edit shows up
  // within a breath. Every mutation already ends in a 303 or in
  // `router.refresh()`, and a refresh empties this cache — so a save is never
  // hidden behind it.
  experimental: {
    staleTimes: { dynamic: 30 },
  },
  // This hook is why `dev` and `build` pass `--webpack`: Next 16 builds with
  // Turbopack by default and refuses a `webpack` config it would ignore.
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  // openproduct-commons XP1 — the contributor short link.
  //
  // The design's shareable form is `openproduct.live/@ada`, and that is the
  // canonical URL. It cannot be a route directory: in the App Router a folder
  // whose name starts with `@` is a parallel-route slot, not a path segment.
  // So the pretty form is rewritten onto `/people/{handle}`, which is a normal
  // dynamic segment — one line here instead of a middleware this app
  // deliberately does not have (OX2 deleted the last one).
  //
  // A rewrite, not a redirect: the address bar keeps the link the person
  // handed out.
  async rewrites() {
    // CG0 — the handle namespace claims `/@:handle` AT THE ROUTER, before any
    // slug matching can see it. That is what lets `openproduct.live/@ada` and
    // `openproduct.live/kettleworks` coexist without a shared uniqueness
    // table (OPC-B): the two namespaces are separated by a character rather
    // than by a lookup, so a new product slug can never take a person's page
    // and a new handle can never take a product's.
    //
    // `:handle` is matched loosely here on purpose. The route validates the
    // grammar itself (`parseHandle`) and 404s what it does not like — putting
    // the grammar in a rewrite pattern would put it in a second place, and
    // the two would drift the first time the grammar changed.
    return [
      { source: "/@:handle", destination: "/people/:handle" },
      // MP0 — a maker page's tabs live one segment deeper, and the rewrite
      // follows. `:tab` is matched loosely here for the same reason `:handle`
      // is: the route owns the vocabulary and 404s what it does not like, and
      // a second copy of that list in a rewrite pattern is a second place for
      // it to go stale.
      { source: "/@:handle/:tab", destination: "/people/:handle/:tab" },
    ];
  },
  // SB0 — `/create` moved to `/submit`, and this is the SECOND attempt at it.
  //
  // The first shipped a route module whose body was one `permanentRedirect`.
  // It passed every test and every lane, and then production answered:
  //
  //   HTTP/2 200
  //   cache-control: s-maxage=31536000
  //   (empty body)
  //
  // Not a 308. Next PRERENDERED the redirect — the build listed `/create` as
  // static — so what deploys is an RSC payload that the CLIENT router follows.
  // A browser still lands on `/submit`; a CRAWLER sees a 200 with an empty
  // document, cached for a year. That is worse than the 308 the milestone
  // claimed AND worse than the page it replaced, and no test could have caught
  // it because every test ran against the source or a local server.
  //
  // A `redirects()` entry is issued at the EDGE, before the renderer is
  // reached, so the status is the real one. Found by checking the deploy with
  // `curl -I`, which is the only place the difference is visible.
  //
  // NOT A REWRITE, unlike `/@:handle` above: there the pretty form is the one
  // somebody was handed and the bar must keep it; here the design's address is
  // the one to be seen, so the bar should change.
  async redirects() {
    return [
      { source: "/create", destination: "/submit", permanent: true },
      // THERE ARE NOT TWO PAGES. The faceted directory at `/products` and the
      // board index at `/launches` were two more addresses for the list the
      // front page already shows; the design draws one `Launches` pill and
      // one list, and `/` is it. Both old addresses still ARRIVE — permanent,
      // so a crawler moves its weight rather than keeping two entries for
      // one list — and for the reason above they arrive from the edge, never
      // from a route module. A day's own board keeps `/launches/<day>`.
      { source: "/products", destination: "/", permanent: true },
      { source: "/launches", destination: "/", permanent: true },
      // OB7 (openproduct-open-builds D5) — THE LEADERBOARD FOLDED INTO THE
      // UPVOTED ORDER. It ranked launches by the upvotes each day's board
      // had published; the front page's Upvoted order is the builds by their
      // counted upvotes, one sentence at /docs/formulas. Both of its
      // addresses (the week, and each range) arrive there from the edge, for
      // the reason above.
      { source: "/leaderboard", destination: "/builds/upvoted", permanent: true },
      { source: "/leaderboard/:range", destination: "/builds/upvoted", permanent: true },
    ];
  },
  // `output: "standalone"` is required by the @opennextjs/cloudflare adapter,
  // which reads `.next/standalone/**` to bundle the server function.
  output: "standalone",
  // Cap the CDN stale window. Next's default emits `s-maxage=60,
  // stale-while-revalidate=31535940` (a YEAR) on ISR pages, which lets a
  // browser or edge cache serve a pre-deploy HTML shell long after its
  // hashed /_next/static assets were replaced — the assets 404 and the page
  // renders unstyled. Five minutes keeps the 60s freshness posture while a
  // stale shell dies shortly after any deploy.
  expireTime: 300,
  // Trace from the monorepo root so the standalone build pulls in workspace
  // dependencies (e.g. @openproduct/contracts) instead of trying to resolve
  // them from the per-app node_modules. Three levels up: apps/openproduct/web.
  outputFileTracingRoot: path.join(__dirname, "../../.."),
  typescript: {
    ignoreBuildErrors: false,
  },
  // No `eslint` key: Next 16 removed it, and `next build` no longer lints.
  // Lint runs separately via `pnpm lint`.
  env: {
    NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV ?? "",
  },
};

export default nextConfig;
