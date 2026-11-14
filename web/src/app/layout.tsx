import { publicApexOrigin } from "./public-api";
import { SITE_CARD_ALT, cardMeta } from "./ui/og";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "../styles/globals.css";

import { SESSION_HINT_COOKIE, SIGNED_IN_CLASS } from "./auth/auth";
import { THEME_STORAGE_KEY } from "./ui/theme";
import { AuthNotice } from "./auth-notice";
import { KeyboardLayer } from "./shell/keyboard-layer";
import { NavigationProgress } from "./shell/navigation-progress";
import { SectionBar } from "./shell/section-bar";
import { SiteFooter } from "./shell/site-footer";
import { TopPanel } from "./shell/top-panel";

// OPR1 — THE REDESIGN'S THREE FACES, and each has exactly one job
// (openproduct-redesign design.md §3). Hanken Grotesk is every UI voice at a
// 15px base; Lora is display only — page titles and idea quotes, the quotes
// in its italic; IBM Plex Mono is the small uppercase label and the machine
// facts (licences, counts, component names).
//
// FIVE FILES, 98,664 BYTES, and the font budget was moved to say so
// (`FONTS` in tests/web-perf/src/budgets.mjs; the wire budget's amendment is
// in tests/web/src/wire-budget.decision.json). `latin` only and `swap` on all
// three. Each file is here for a use the design names and no other: Hanken
// Grotesk is one variable file across 400–600, Lora ships 400 upright and 400
// italic and no second weight, and IBM Plex Mono — which has no variable
// build — ships 400 and the 500 its labels are set in. Weights stop at 600.
//
// The files are committed under src/fonts rather than fetched from Google
// Fonts at build time, so `next build` never depends on
// fonts.googleapis.com and no visitor's browser reaches a third-party host
// (the wire budget allows none). See src/fonts/README.md.
const hanken = localFont({
  src: "../fonts/hanken-grotesk-latin-wght.woff2",
  weight: "400 600",
  style: "normal",
  display: "swap",
  variable: "--font-hanken",
});

const lora = localFont({
  src: [
    { path: "../fonts/lora-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/lora-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  variable: "--font-lora",
  // A serif: size the fallback against Times New Roman.
  adjustFontFallback: "Times New Roman",
});

const plexMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-plex-mono",
});


/**
 * The account control's shape, before the first paint.
 *
 * A CLASS STAMPED BEFORE THE FIRST PAINT, because a flash of the wrong
 * control is worse than a millisecond of work. I6 pins the shell's server render to the ANONYMOUS branch for
 * everybody — that is what keeps the cached HTML from varying — so a
 * signed-in visitor watched `Sign in` repaint into their own name on every
 * load, across a full server round trip.
 *
 * WHAT THIS DOES NOT DO IS CHANGE THE HTML. Both branches of the chip are in
 * the document for everyone, byte-identically; this only adds a class that
 * decides which one is DISPLAYED (see `globals.css`). I6 is untouched, the
 * page is still one cached document, and React renders the same tree either
 * way — so there is no hydration mismatch to get wrong.
 *
 * The regex is anchored on both sides so a cookie whose name merely ENDS in
 * `op_signed_in` cannot set it.
 *
 * NO SCRIPT, NO CLASS, ANONYMOUS BRANCH — which is the honest default and
 * the one AC2c asked for: a visitor with no JavaScript gets the real anchor
 * to the platform's door.
 */
/**
 * Which ramp, before the first paint (openproduct-worldclass FR1).
 *
 * THE SAME SHAPE AS `SESSION_BOOT` ABOVE, and for the same reason: a React
 * effect runs after paint, so a reader who chose dark on a light device would
 * watch every page flash white before it settled. Four statements, inline, in
 * `<head>`, before a byte of the body is parsed.
 *
 * WHAT THIS DOES NOT DO IS CHANGE THE HTML. It sets one attribute on the root
 * element from a value only this browser holds — `localStorage`, never a
 * cookie, so the request does not vary and the edge cache is untouched (I6,
 * WC-4). No stored preference means no attribute, which hands the answer to
 * `prefers-color-scheme` in globals.css: FR0's dark ramp is what a dark
 * device gets with nothing stored at all.
 *
 * The value is validated rather than trusted. `localStorage` is writable by
 * anything running on this origin, and stamping an arbitrary string into an
 * attribute the stylesheet keys on is how a page ends up correct but silently
 * un-themed — the same argument `data-accent` makes about its own fallback.
 */
const THEME_BOOT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||t==="light"||t==="system"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}`;

const SESSION_BOOT = `try{if(/(?:^|; )${SESSION_HINT_COOKIE}=1(?:;|$)/.test(document.cookie)){document.documentElement.classList.add("${SIGNED_IN_CLASS}");}}catch(e){}`;

/**
 * The independent openproduct console (openproduct-independence OX2).
 *
 * This app serves `openproduct.live` as its own Next.js deployment — no longer
 * a route group inside the org console behind a host rewrite. The properties
 * the route group held survive the move unchanged:
 *
 *   - anonymous pages render byte-identically signed-in and signed-out — the
 *     server output here is static for every visitor; the shell's AccountChip
 *     and AuthNotice personalise client-side only, after hydration;
 *   - titles, descriptions and OG tags are in scope, and nothing beyond them.
 */
/**
 * Which accent hue this deployment paints. Amber — the redesign's #B8862F —
 * is the default and the only one :root carries (openproduct-redesign OPR1;
 * it took the place the prototype's ocean held); ember 25 · moss 150 ·
 * plum 340 are `[data-accent]` blocks in globals.css that redefine the
 * accent family and nothing else.
 *
 * Read once, here, and validated — an unknown value falls back to amber
 * rather than stamping an attribute no stylesheet answers, which would leave
 * the page correct but silently un-themed.
 *
 * A BUILD-TIME fact, deliberately: it is in the first byte of the document
 * and identical for every visitor. An accent chosen per visitor would be a
 * second render of a page I6 requires to be exactly one.
 */
const ACCENTS = ["amber", "ember", "moss", "plum"] as const;
const RAW_ACCENT = process.env.NEXT_PUBLIC_OPENPRODUCT_ACCENT;
const ACCENT = (ACCENTS as readonly string[]).includes(RAW_ACCENT ?? "")
  ? (RAW_ACCENT as (typeof ACCENTS)[number])
  : "amber";

/**
 * QE1 — THE SITE CARD IS THE DEFAULT, on every route that declares no card
 * of its own. The audit found `og:image` absent on six list routes; RE0 had
 * built the card and the routes, and every page that did not spread
 * `cardMeta` into its metadata unfurled as bare text. Declared here, the
 * docs, the transparency report, the studio's door and every future page
 * carry the site's picture until they earn one of their own — and a page
 * that declares `openGraph` replaces this object whole, so `reach.test.ts`
 * holds that any page doing so brings its own `images`.
 */
const SITE_CARD = cardMeta(publicApexOrigin(), "/og/site", SITE_CARD_ALT);

export const metadata: Metadata = {
  title: {
    default: "openproduct",
    template: "%s · openproduct",
  },
  description: "Products built in the open, looking for people.",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "openproduct", statusBarStyle: "default" },
  ...(SITE_CARD
    ? {
        openGraph: { type: "website", siteName: "openproduct", images: SITE_CARD.images },
        twitter: SITE_CARD.twitter,
      }
    : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The light page's own colour (`--background`, #F6F4EE). Light is the
  // default ramp — a reader gets dark only by choosing it (globals.css) — and
  // this is a build-time fact in the document, the same for every visitor.
  themeColor: "#f6f4ee",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-accent={ACCENT}
      className={`${hanken.variable} ${lora.variable} ${plexMono.variable}`}
    >
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        {/* esbuild's `keepNames` helper (`__name`) can be referenced by inline
            scripts in the @opennextjs/cloudflare build without being defined
            in the browser; define a no-op ahead of everything. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "globalThis.__name=globalThis.__name||function(t){return t};",
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: SESSION_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {/* LC1 — FEED AUTODISCOVERY, as markup rather than as metadata.
            Next merges `alternates` by REPLACEMENT: any page setting its own
            `alternates: { canonical }` — which every public page here does —
            wipes the parent's `types` along with it, and the feeds silently
            stop being discoverable on exactly the pages a reader is standing
            on. Rendered here, no page can clobber them. A browser found this;
            the metadata version emitted nothing on the home page. */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="openproduct · the digest"
          href="/digest/feed.xml"
        />
        <link
          rel="alternate"
          type="application/feed+json"
          title="openproduct · the digest"
          href="/digest/feed.json"
        />
        {/* THE WAY PAST THE SHELL (openproduct-commons XP4).
            The top panel is a wordmark, a search field, five section links and
            two account controls: ELEVEN tab stops, on every route, before a
            keyboard user reaches a single word of the page they opened. XP4's
            keyboard walk measured that — the first facet on the directory is
            the eleventh stop — and this is the standard answer to it.
            FIRST IN THE BODY, because a skip link that is not the first tab
            stop skips nothing. Visually hidden until it has focus, at which
            point it becomes an ordinary visible control: `sr-only` alone would
            make it invisible to the sighted keyboard user it exists for. */}
        <a
          href="#content"
          className="sr-only rounded-[9px] bg-foreground px-3.5 py-2 text-[14.5px] font-medium text-background focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
        >
          Skip to content
        </a>
        {/* OPP13 — the click, shown. Renders nothing until the router takes
            a soft navigation, so the document is unchanged (I6). */}
        <NavigationProgress />
        {/* The commons shell (openproduct-commons XP0): the design's sticky
            glass bar, the same markup for every visitor — the one personal
            thing inside it is the account chip's own island. */}
        <TopPanel />
        <AuthNotice />
        {/* The page owns its own container; the shell owns the frame around
            it. `flex-1` keeps the footer at the bottom on a short page.
            `tabIndex={-1}` is what makes the skip link above actually move
            focus: without it the browser scrolls to this element and leaves
            focus in the shell, so the next Tab goes back to the navigation
            the visitor just asked to skip. */}
        <div id="content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </div>
        {/* The footer, as the design draws it — and a product or person page
            renders its own in its place (shell/site-footer.tsx). */}
        <SiteFooter />
        {/* FR1 — the sections, at the bottom, on a phone. It is `fixed`, so it
            takes no space in this column; the reserve that keeps the last row
            of a page above it is `--tabbar-reserve` on `body`, in
            globals.css, where the bar's own height is also written. */}
        <SectionBar />
        {/* FR4 — the keyboard layer. It renders nothing until `?` is pressed;
            `⌘K` and `/` stay in `palette.tsx`, next to the field they focus. */}
        <KeyboardLayer />
      </body>
    </html>
  );
}
