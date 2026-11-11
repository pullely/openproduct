/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    // ── The type ladder ────────────────────────────────────────────────
    // Nine sizes, in absolute pixels, and nothing else. This REPLACES
    // Tailwind's scale rather than extending it, which is the point: the
    // default scale is rem-based, `globals.css` typesets `html` at 14px, and
    // every rung therefore resolved to 87.5% of what it read as — `text-xs`
    // rendered 10.5px, under the 12px floor, and `text-sm` rendered 12.25px,
    // a value that is on no ladder at all. Absolute pixels mean the class name
    // and the rendered size are the same fact.
    //
    // Off-ladder rungs (`text-3xl` and up) are deliberately absent: asking for
    // one now fails to resolve instead of quietly introducing a tenth size.
    // Arbitrary values (`text-[19px]`) still bypass this by design, so the
    // ladder is also enforced at review time by the guard in
    // tests/web-console-next/src/type-ladder.test.ts.
    //
    //   12    count badges, the smallest labels
    //   12.5  dense table cells, timestamps, small links
    //   13    metadata under row titles, status words, owner names
    //   13.5  the half-step between metadata and body
    //   14    body copy, list rows, job steps, dock messages
    //   15    row titles, sidebar nav labels, section headings
    //   16    thread and section titles; also the no-zoom input floor
    //   28    page titles and the Overview greeting (Lora 500)
    //   32    the big display numerals (Lora, line-height 1)
    fontSize: {
      xs: ["12px", { lineHeight: "1.35" }],
      dense: ["12.5px", { lineHeight: "1.4" }],
      sm: ["13px", { lineHeight: "1.45" }],
      mid: ["13.5px", { lineHeight: "1.45" }],
      base: ["14px", { lineHeight: "1.5" }],
      lg: ["15px", { lineHeight: "1.45" }],
      xl: ["16px", { lineHeight: "1.4" }],
      // MX2 — a mobile browser zooms the page whenever it focuses an input
      // under 16px. `text-nozoom` is the fix, and it is named for what it
      // prevents so it survives a search-and-replace.
      nozoom: ["16px", { lineHeight: "1.4" }],
      title: ["28px", { lineHeight: "1.15" }],
      "2xl": ["28px", { lineHeight: "1.15" }],
      numeral: ["32px", { lineHeight: "1" }],
    },
    // Three weights. 700+ is not part of this type system — Hanken Grotesk at
    // 600 is already the emphatic end of the UI voice, and the console's
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
        // openproduct-commons XP0 — the commons chrome. `panel` is the
        // full-bleed dark top bar (dark in BOTH themes); `endorse` is the one
        // reserved accent, and it means endorsement wherever it appears.
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
        // The eclipse's amber (brand/README.md). Identity, not status — reach
        // for `warning` when the colour means something is wrong.
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
        // The lift a panel hanging off the chrome needs to read as being IN
        // FRONT of the page rather than pasted onto it: a long, soft, mostly
        // downward cast, no ring. Two of them — the Assist popover and the
        // history menu it shares a trigger with — so it is a token rather than
        // two arbitrary values that drift apart.
        panel: "0 16px 44px -12px rgb(0 0 0 / 0.28), 0 4px 12px -4px rgb(0 0 0 / 0.12)",
        menu: "0 12px 32px -10px rgb(0 0 0 / 0.24), 0 3px 8px -3px rgb(0 0 0 / 0.10)",
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
