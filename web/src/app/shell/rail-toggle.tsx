"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { MenuIcon } from "../ui/icons";

/** The attribute on `<html>` that opens the rail as a drawer (globals.css). */
export const RAIL_OPEN_ATTRIBUTE = "data-site-rail";

/** Close the drawer from anywhere: the scrim, a rail link. */
export function closeRail(): void {
  document.documentElement.removeAttribute(RAIL_OPEN_ATTRIBUTE);
}

/**
 * The menu button (openproduct-left-rail LR2, design §4.5): below 960px the
 * rail is a drawer, and this opens it.
 *
 * THE STATE IS AN ATTRIBUTE ON `<html>`, not React state shared across the
 * tree: the button is in the bar and the rail is in the page frame, and the
 * stylesheet is what moves the rail. This component mirrors the attribute so
 * `aria-expanded` is true to it.
 *
 * IT CLOSES ON ESCAPE AND ON NAVIGATION. A drawer left open over the page a
 * reader just chose is a page they cannot see.
 *
 * Not displayed from 960px up, where the rail is pinned (`min-[960px]:hidden`),
 * and never on a personal branch: the same control for every visitor (I6).
 */
export function RailToggle() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    closeRail();
    setOpen(false);
  }, []);

  // Navigation closes it.
  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // The scrim and the rail's links close it by removing the attribute;
    // watch the attribute so `aria-expanded` follows.
    const observer = new MutationObserver(() => {
      if (!document.documentElement.hasAttribute(RAIL_OPEN_ATTRIBUTE)) setOpen(false);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [RAIL_OPEN_ATTRIBUTE] });
    window.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <button
      type="button"
      aria-label="Menu"
      aria-expanded={open}
      aria-controls="site-rail"
      onClick={() => {
        if (open) {
          close();
        } else {
          document.documentElement.setAttribute(RAIL_OPEN_ATTRIBUTE, "open");
          setOpen(true);
        }
      }}
      className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:h-[44px] max-sm:w-[44px] min-[960px]:hidden"
    >
      <MenuIcon className="h-5 w-5 shrink-0" />
    </button>
  );
}
