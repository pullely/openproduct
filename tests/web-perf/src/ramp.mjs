// Which ramp a pass measures, chosen the way a reader chooses it.
//
// LIGHT IS THE DEFAULT (3c50ac4a). With nothing stored the page is light on
// every device, and `prefers-color-scheme` is answered only under
// `data-theme="system"`. So a context opened with `colorScheme: "dark"` alone
// renders the LIGHT page: the dark passes measured light twice (every dark
// snapshot recorded light colours) until this stored the choice.
//
// The dark pass stores `dark` under the site's own key before any page script
// runs, which is what the footer's theme control does; the layout's boot script
// then stamps `data-theme="dark"` before first paint. `colorScheme` is still set
// so the browser chrome (scrollbars, form controls) matches the ramp.

/** The site's key (apps/openproduct/web/src/app/ui/theme.ts THEME_STORAGE_KEY). */
const THEME_STORAGE_KEY = "op_theme";

export async function newRampContext(browser, { viewport, colorScheme }) {
  const context = await browser.newContext({ viewport, colorScheme });
  if (colorScheme === "dark") {
    await context.addInitScript(
      ([key]) => {
        try {
          localStorage.setItem(key, "dark");
        } catch {}
      },
      [THEME_STORAGE_KEY],
    );
  }
  return context;
}
