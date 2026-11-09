/**
 * Which ramp, as pure values (openproduct-worldclass FR1).
 *
 * SEPARATE FROM THE CONTROL, for the reason `feed/tile.ts` and `ui/time.ts`
 * already state about themselves: the web test lane is module-level and has no
 * JSX, so a rule inside a `.tsx` is a rule no test in this repository can
 * hold. The key and the three choices are also read by the inline script in
 * `layout.tsx`, which runs before React exists — so they have to live
 * somewhere neither side owns.
 */

/**
 * Three, and `system` is the default.
 *
 * A two-way toggle has no way back to the operating system's answer: somebody
 * who taps `dark` on a phone that switches at sunset has silently opted out of
 * that forever, with nothing on the page to say so.
 */
export const THEME_CHOICES = ["system", "light", "dark"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

/**
 * `localStorage`, NOT a cookie and NOT the account.
 *
 * A cookie would vary the request and cost the edge cache the whole estate is
 * built on; the account would make a public page depend on who is asking,
 * which is exactly what **WC-4** and **I6** forbid. The bytes of the document
 * are the same for everybody either way — only this browser knows.
 */
export const THEME_STORAGE_KEY = "op_theme";

/** Stamp the choice on `<html>`. `system` removes the attribute, which is what
 *  hands the answer back to `prefers-color-scheme` in globals.css. */
export function applyTheme(choice: ThemeChoice, root: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void } = document.documentElement): void {
  // Light is the default and needs no attribute; "system" is an explicit
  // choice and is stamped like the other two, so the device's preference is
  // followed only when the reader asked for it.
  if (choice === "light") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}
