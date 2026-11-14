/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    // ── The type ladder (openproduct-redesign OPR1, design.md §3) ───────
    // The redesign's sizes, in absolute pixels, and nothing else. This
    // REPLACES Tailwind's scale rather than extending it, which is the point:
    // the default scale is rem-based, `globals.css` typesets `html` at 14px,
    // and every rung would resolve to 87.5% of what it reads as. Absolute
    // pixels mean the class name and the rendered size are the same fact.
    //
    // THE REDESIGN HAS SEVEN SIZES:
    //
    //   10.5  the mono label (IBM Plex Mono, uppercase, tracked 0.12em)
    //   11    labels
    //   13    secondary text
    //   15    body
    //   16    inputs — also the no-zoom floor on a phone
    //   18    card titles
    //   40    page titles (Lora 400), 28 on a phone
    //
    // THE OLD NAMES STILL RESOLVE, each to the nearest of those, so a page
    // that has not been rebuilt yet is re-set rather than broken. Where two
    // old rungs were half a pixel apart they are now the same size, which is
    // the ladder getting shorter on purpose:
    //
    //   name      was    is    the redesign's
    //   xs        12     11    label
    //   dense     12.5   13    secondary
    //   sm        13     13    secondary
    //   mid       13.5   13    secondary
    //   base      14     15    body
    //   lg        15     15    body
    //   xl        16     16    input size (a 16px heading rung until rebuilt)
    //   nozoom    16     16    inputs
    //   title     28     28    the page title's phone step
    //   2xl       28     28    the page title's phone step
    //   numeral   32     28    the page title's phone step (32 is on no rung)
    //
    // AND FOUR NEW NAMES, for the sizes that had none:
    //
    //   label        11     labels
    //   mono-label   10.5   the mono label, with its 0.12em tracking
    //   card-title   18     card titles
    //   display      40     page titles; pair with `max-sm:text-title`
    //
    // Off-ladder rungs (`text-3xl` and up) are deliberately absent: asking for
    // one fails to resolve instead of quietly introducing an eighth size.
    // Arbitrary values (`text-[19px]`) still bypass this by design, and leave
    // page by page as each is rebuilt.
    fontSize: {
      "mono-label": ["10.5px", { lineHeight: "1.3", letterSpacing: "0.12em" }],
      label: ["11px", { lineHeight: "1.35" }],
      xs: ["11px", { lineHeight: "1.35" }],
      dense: ["13px", { lineHeight: "1.45" }],
      sm: ["13px", { lineHeight: "1.45" }],
      mid: ["13px", { lineHeight: "1.45" }],
      base: ["15px", { lineHeight: "1.5" }],
      lg: ["15px", { lineHeight: "1.5" }],
      xl: ["16px", { lineHeight: "1.4" }],
      // MX2 — a mobile browser zooms the page whenever it focuses an input
      // under 16px. `text-nozoom` is the fix, and it is named for what it
      // prevents so it survives a search-and-replace. The redesign's input
      // size is the same 16px.
      nozoom: ["16px", { lineHeight: "1.4" }],
      "card-title": ["18px", { lineHeight: "1.3" }],
      title: ["28px", { lineHeight: "1.15" }],
      "2xl": ["28px", { lineHeight: "1.15" }],
      numeral: ["28px", { lineHeight: "1" }],
      display: ["40px", { lineHeight: "1.1" }],
    },
    // Three weights. 700+ is not part of this type system — Hanken Grotesk at
    // 600 is already the emphatic end of the UI voice (and the heaviest the
    // self-hosted file declares), and the site's
    // hierarchy is carried by size and colour rather than by weight. `bold` is
    // kept as an alias clamped to 600 rather than removed, so a stray
    // `font-bold` renders the intended semibold instead of silently resolving
    // to nothing.
    fontWeight: {
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "600",
    },
    extend: {
      // MX1 — touch sizing in absolute pixels, deliberately outside the rem
      // scale. `globals.css` sets `html { font-size: 14px }`, so every
      // rem-based Tailwind size is silently multiplied by 0.875: the
      // `min-h-11` that reads as "44px, the platform minimum" actually renders
      // 38.5px, and the console's touch targets have been ~12% under target
      // wherever that idiom was used. These do not move with the root size.
      //   touch    — the minimum tappable box (WCAG 2.5.5 / platform minimum)
      //   tabbar   — the bottom tab bar's row height
      spacing: {
        touch: "44px",
        tabbar: "56px",
      },
      colors: {
        // `<alpha-value>` ON EVERY ONE OF THESE, and it is not decoration.
        //
        // Tailwind substitutes that placeholder when a utility carries an
        // opacity modifier. Without it, `bg-card/[0.92]` and `border-x/15`
        // do not merely lose their opacity — THE RULE IS NOT EMITTED AT ALL,
        // so the element paints nothing and the failure is silent.
        //
        // This config never had it. `top-panel.tsx` had been asking for
        // `bg-panel-line/15`, `bg-panel-line/[0.07]` and `border-panel-line/20`
        // since XP0, and every one of those hairlines and hover fills has been
        // absent in production for the whole life of the app. Found at OL1,
        // when the design's glass bar (`bg-card/[0.92]`) rendered fully
        // transparent and a computed-style probe said `rgba(0, 0, 0, 0)`.
        border: "oklch(var(--border) / <alpha-value>)",
        input: "oklch(var(--input) / <alpha-value>)",
        ring: "oklch(var(--ring) / <alpha-value>)",
        background: "oklch(var(--background) / <alpha-value>)",
        foreground: "oklch(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "oklch(var(--primary) / <alpha-value>)",
          foreground: "oklch(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "oklch(var(--secondary) / <alpha-value>)",
          foreground: "oklch(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "oklch(var(--muted) / <alpha-value>)",
          foreground: "oklch(var(--muted-foreground) / <alpha-value>)",
        },
        // The shell's chrome. `panel` is the header's frosted bar — white in
        // the light ramp, painted at 0.62 with a blur (openproduct-redesign
        // OPR1), the card's value in the dark one; `endorse` is the one
        // reserved accent — the amber — and it means endorsement wherever it
        // appears.
        panel: {
          DEFAULT: "oklch(var(--panel) / <alpha-value>)",
          foreground: "oklch(var(--panel-foreground) / <alpha-value>)",
          muted: "oklch(var(--panel-muted) / <alpha-value>)",
          line: "oklch(var(--panel-line) / <alpha-value>)",
          raised: "oklch(var(--panel-raised) / <alpha-value>)",
          "raised-line": "oklch(var(--panel-raised-line) / <alpha-value>)",
        },
        "on-accent": "oklch(var(--on-accent) / <alpha-value>)",
        endorse: {
          DEFAULT: "oklch(var(--endorse) / <alpha-value>)",
          ink: "oklch(var(--endorse-ink) / <alpha-value>)",
          soft: "oklch(var(--endorse-soft) / <alpha-value>)",
          line: "oklch(var(--endorse-line) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "oklch(var(--accent) / <alpha-value>)",
          foreground: "oklch(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "oklch(var(--destructive) / <alpha-value>)",
          foreground: "oklch(var(--destructive-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "oklch(var(--warning) / <alpha-value>)",
          foreground: "oklch(var(--warning-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "oklch(var(--success) / <alpha-value>)",
          foreground: "oklch(var(--success-foreground) / <alpha-value>)",
        },
        info: {
          DEFAULT: "oklch(var(--info) / <alpha-value>)",
          foreground: "oklch(var(--info-foreground) / <alpha-value>)",
        },
        link: "oklch(var(--link) / <alpha-value>)",
        // openproduct-redesign OPR1 — the four kinds and the two wells
        // (design.md §3). A colour here means a KIND: amber is shipped and
        // links, `idea` (lavender) is ideas, `version` (slate) is versions,
        // `seat` (teal) is help wanted. DEFAULT is the hue as a fill or a
        // mark; `ink` / `deep` is the member that is safe as a word; `soft`
        // and `wash` are the tints under them. Contrast for each pair is
        // written beside the values in globals.css.
        amber: {
          DEFAULT: "oklch(var(--amber) / <alpha-value>)",
          ink: "oklch(var(--amber-ink) / <alpha-value>)",
          soft: "oklch(var(--amber-soft) / <alpha-value>)",
        },
        idea: {
          DEFAULT: "oklch(var(--idea) / <alpha-value>)",
          deep: "oklch(var(--idea-deep) / <alpha-value>)",
          soft: "oklch(var(--idea-soft) / <alpha-value>)",
          wash: "oklch(var(--idea-wash) / <alpha-value>)",
        },
        version: {
          DEFAULT: "oklch(var(--version) / <alpha-value>)",
          soft: "oklch(var(--version-soft) / <alpha-value>)",
        },
        seat: {
          DEFAULT: "oklch(var(--seat) / <alpha-value>)",
          ink: "oklch(var(--seat-ink) / <alpha-value>)",
          soft: "oklch(var(--seat-soft) / <alpha-value>)",
          wash: "oklch(var(--seat-wash) / <alpha-value>)",
        },
        sunken: "oklch(var(--sunken) / <alpha-value>)",
        well: "oklch(var(--well) / <alpha-value>)",
        // FR0 — the ink behind a modal, as a token rather than an inline
        // `oklch(0.2 0.01 80 / 0.45)`. A scrim tuned for a near-white page is
        // nearly invisible over a near-black one, so the dark ramp gives it a
        // much lower lightness; the opacity stays at the call site.
        scrim: "oklch(var(--scrim) / <alpha-value>)",
        // Console design ramp (see globals.css): body copy, quiet metadata,
        // the inner-card hairline fill, and the inks/borders that ride on the
        // soft tinted pills.
        copy: "oklch(var(--copy) / <alpha-value>)",
        faint: "oklch(var(--faint) / <alpha-value>)",
        "surface-2": "oklch(var(--surface-2) / <alpha-value>)",
        "border-strong": "oklch(var(--border-strong) / <alpha-value>)",
        "border-hover": "oklch(var(--border-hover) / <alpha-value>)",
        "warning-strong": "oklch(var(--warning-strong) / <alpha-value>)",
        "warning-pill": "oklch(var(--warning-pill) / <alpha-value>)",
        "warning-soft-border": "oklch(var(--warning-soft-border) / <alpha-value>)",
        "warning-wash-soft": "oklch(var(--warning-wash-soft) / <alpha-value>)",
        "info-strong": "oklch(var(--info-strong) / <alpha-value>)",
        "info-border": "oklch(var(--info-border) / <alpha-value>)",
        "success-border": "oklch(var(--success-border) / <alpha-value>)",
        // Soft tint fills for status pills and warn/error row washes.
        "success-soft": "oklch(var(--success-soft) / <alpha-value>)",
        "warning-soft": "oklch(var(--warning-soft) / <alpha-value>)",
        "warning-accent": "oklch(var(--warning-accent) / <alpha-value>)",
        "warning-wash": "oklch(var(--warning-wash) / <alpha-value>)",
        "destructive-soft": "oklch(var(--destructive-soft) / <alpha-value>)",
        "destructive-wash": "oklch(var(--destructive-wash) / <alpha-value>)",
        "info-soft": "oklch(var(--info-soft) / <alpha-value>)",
        // Work plane + agent identity (orun-work-v5 WV0, and the Agents
        // console's design-agent violet). These already existed as CSS
        // variables and were reached for with `bg-[oklch(var(--…))]` escapes;
        // naming them here is what lets `bg-agent-soft` / `bg-work-track`
        // resolve at all (`bg-work-track` silently rendered nothing before).
        agent: "oklch(var(--agent) / <alpha-value>)",
        "agent-soft": "oklch(var(--agent-soft) / <alpha-value>)",
        "agent-strong": "oklch(var(--agent-strong) / <alpha-value>)",
        "work-track": "oklch(var(--work-track) / <alpha-value>)",
        "warning-border": "oklch(var(--warning-border) / <alpha-value>)",
        "warning-ink": "oklch(var(--warning-ink) / <alpha-value>)",
        // Overview v3's warm hairline family (see globals.css).
        line: "oklch(var(--line) / <alpha-value>)",
        "line-soft": "oklch(var(--line-soft) / <alpha-value>)",
        track: "oklch(var(--track) / <alpha-value>)",
        // The logo ring's amber. Identity, not status — reach for `warning`
        // when the colour means something is wrong.
        "brand-amber": "oklch(var(--brand-amber) / <alpha-value>)",
        "brand-amber-inverted": "oklch(var(--brand-amber-inverted) / <alpha-value>)",
        // Catalog v2 (Orunbase Console v2) — the catalog index + service page inks.
        // Distinct from the semantic ramp on purpose; see globals.css.
        "ink-2": "oklch(var(--ink-2) / <alpha-value>)",
        avatar: "oklch(var(--avatar) / <alpha-value>)",
        "rule-dot": "oklch(var(--rule-dot) / <alpha-value>)",
        "kind-service-bg": "oklch(var(--kind-service-bg) / <alpha-value>)",
        "kind-job-bg": "oklch(var(--kind-job-bg) / <alpha-value>)",
        "verdict-pass": "oklch(var(--verdict-pass) / <alpha-value>)",
        "verdict-fail": "oklch(var(--verdict-fail) / <alpha-value>)",
        "status-healthy": "oklch(var(--status-healthy) / <alpha-value>)",
        "tier-bronze": "oklch(var(--tier-bronze) / <alpha-value>)",
        // The activity plane's failure pair (see globals.css) — a shade deeper
        // than `destructive`, because a red run is an outcome, not a warning.
        "run-failed": "oklch(var(--run-failed) / <alpha-value>)",
        "run-failed-ink": "oklch(var(--run-failed-ink) / <alpha-value>)",
        card: {
          DEFAULT: "oklch(var(--card) / <alpha-value>)",
          foreground: "oklch(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "oklch(var(--popover) / <alpha-value>)",
          foreground: "oklch(var(--popover-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        // OPR1 — FLAT (openproduct-redesign design.md §3: no drop shadows).
        // The two names stay, because the menus that hang off the chrome ask
        // for them, and each is now a one-pixel hairline ring in the ramp's
        // own ink instead of a cast: a floating surface still has an edge
        // against the white card it may open over, and nothing has a shadow.
        panel: "0 0 0 1px oklch(var(--foreground) / 0.08)",
        menu: "0 0 0 1px oklch(var(--foreground) / 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        // Dialog enter/exit. The centering `translate(-50%, -50%)` is baked in
        // so the scale animation never clobbers it — otherwise the dialog
        // animates from an off-center position and snaps to center.
        "dialog-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(0.96)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        "dialog-out": {
          from: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
          to: { opacity: "0", transform: "translate(-50%, -50%) scale(0.96)" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-out-left": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-100%)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-out-right": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" },
        },
        "slide-in-bottom": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "slide-out-bottom": {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(100%)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(4px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "pop-out": {
          from: { opacity: "1", transform: "translateY(0) scale(1)" },
          to: { opacity: "0", transform: "translateY(4px) scale(0.98)" },
        },
        // Subtle directional swap for the sidebar nav (product <-> settings).
        "sidebar-in-right": {
          from: { opacity: "0", transform: "translateX(10px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "sidebar-in-left": {
          from: { opacity: "0", transform: "translateX(-10px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // Northwind motion: screens fade up on entry, live dots pulse,
        // running bars flow, the entity drawer slides in over a scrim.
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "menu-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        // orun-work-v5 WV5: the task peek slides in from the right edge —
        // 150ms ease-out, per design.md §4 (reduced-motion collapses it).
        "peek-in": {
          from: { opacity: "0", transform: "translateX(12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        livepulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        // Console design motion: bands rise on entry (staggered by an inline
        // animation-delay), live dots throw an expanding ring, and the earth
        // under the brand mark's horizon breathes.
        rise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        // The activity log pane: its scrim fades, the pane slides in from the
        // right edge, and a live tail's cursor blinks on the last line.
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        panein: {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "none" },
        },
        ring: {
          "0%": { transform: "scale(1)", opacity: "0.5" },
          "70%, 100%": { transform: "scale(2.6)", opacity: "0" },
        },
        // The eclipse breathing (components/brand/logo.tsx `ConditionsMark`):
        // the light under the horizon dims and returns. Opacity only — the
        // mark's geometry never moves, and the resting frame is 100% so
        // reduced motion (which collapses the cycle to one near-instant pass)
        // lands on full amber rather than on a half-lit mark.
        eclipse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        runflow: {
          from: { backgroundPosition: "0 0" },
          to: { backgroundPosition: "20px 0" },
        },
        // A thread's name resolving in place (DD3 live naming): the old label
        // gives way to the derived one by sharpening out of a blur rather than
        // popping — the name reads as "settling", not as a layout change.
        "title-in": {
          from: { opacity: "0", filter: "blur(5px)", transform: "translateY(3px)" },
          to: { opacity: "1", filter: "blur(0)", transform: "translateY(0)" },
        },
        "drawer-in": {
          from: { opacity: "0.4", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scrim-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // OPP13 — the navigation bar (shell/navigation-progress.tsx). Grows
        // quickly, then slows toward the far edge without reaching it: a bar
        // that hit 100% and kept waiting would be a lie about progress.
        "nav-progress": {
          "0%": { transform: "scaleX(0)" },
          "45%": { transform: "scaleX(0.55)" },
          "100%": { transform: "scaleX(0.88)" },
        },
        // …and runs the last stretch when the route lands, then fades.
        "nav-done": {
          "0%": { transform: "scaleX(0.88)", opacity: "1" },
          "45%": { transform: "scaleX(1)", opacity: "1" },
          "100%": { transform: "scaleX(1)", opacity: "0" },
        },
      },
      animation: {
        // iOS-style easing for sheets so the panel decelerates naturally.
        "fade-in": "fade-in 150ms ease-out",
        "fade-out": "fade-out 150ms ease-in",
        "dialog-in": "dialog-in 180ms cubic-bezier(0.32, 0.72, 0, 1)",
        "dialog-out": "dialog-out 140ms ease-in",
        "slide-in-left": "slide-in-left 280ms cubic-bezier(0.32, 0.72, 0, 1)",
        "slide-out-left": "slide-out-left 220ms cubic-bezier(0.32, 0.72, 0, 1)",
        "slide-in-right": "slide-in-right 280ms cubic-bezier(0.32, 0.72, 0, 1)",
        "slide-out-right": "slide-out-right 220ms cubic-bezier(0.32, 0.72, 0, 1)",
        "slide-in-bottom": "slide-in-bottom 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        "slide-out-bottom": "slide-out-bottom 220ms cubic-bezier(0.32, 0.72, 0, 1)",
        "pop-in": "pop-in 140ms ease-out",
        "pop-out": "pop-out 110ms ease-in",
        "sidebar-in-right": "sidebar-in-right 220ms cubic-bezier(0.32, 0.72, 0, 1)",
        "sidebar-in-left": "sidebar-in-left 220ms cubic-bezier(0.32, 0.72, 0, 1)",
        shimmer: "shimmer 1.6s linear infinite",
        "nav-progress": "nav-progress 1.6s cubic-bezier(0.2, 0.7, 0.2, 1) both",
        "nav-done": "nav-done 240ms ease-out both",
        "fade-up": "fade-up 280ms ease both",
        "menu-in": "menu-in 120ms ease-out both",
        "peek-in": "peek-in 150ms ease-out both",
        livepulse: "livepulse 1.6s ease-in-out infinite",
        rise: "rise 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        blink: "blink 1s step-end infinite",
        panein: "panein 260ms cubic-bezier(0.2, 0.7, 0.2, 1) both",
        ring: "ring 2s cubic-bezier(0, 0, 0.2, 1) infinite",
        eclipse: "eclipse 4.8s ease-in-out infinite",
        runflow: "runflow 1s linear infinite",
        "title-in": "title-in 420ms cubic-bezier(0.22, 0.8, 0.28, 1) both",
        "drawer-in": "drawer-in 240ms cubic-bezier(0.2, 0.8, 0.25, 1) both",
        "scrim-in": "scrim-in 200ms ease both",
      },
    },
  },
  plugins: [],
};
