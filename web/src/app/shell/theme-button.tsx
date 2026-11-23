"use client";

import { THEME_STORAGE_KEY, applyTheme } from "../ui/theme";

/**
 * The bar's theme control (openproduct-left-rail LR5, design §4.3): one icon
 * button that switches between light and dark.
 *
 * IT READS THE DOCUMENT, NOT REACT STATE: the ramp in force is an attribute
 * on `<html>` (set before paint by the layout's boot script), so the button
 * asks it at the moment of the press and has nothing to hydrate. "System"
 * stays a choice of the footer's control; from here a press leaves it for
 * the opposite of what is showing.
 *
 * The same control for every visitor (I6): it renders the same markup
 * whatever the theme.
 */
export function ThemeButton() {
  const toggle = () => {
    const root = document.documentElement;
    const attribute = root.getAttribute("data-theme");
    const dark =
      attribute === "dark" || (attribute === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = dark ? "light" : "dark";
    applyTheme(next);
    try {
      if (next === "light") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // A browser that refuses storage still switches for this page.
    }
  };
  return (
    <button
      type="button"
      aria-label="Switch between light and dark"
      title="Switch between light and dark"
      onClick={toggle}
      className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:hidden"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
      </svg>
    </button>
  );
}
