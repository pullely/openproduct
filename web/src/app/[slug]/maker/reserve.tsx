"use client";

import * as React from "react";

import { useOverlay } from "../../ui/use-overlay";

import {
  MAKER_RESERVE_ATTRIBUTE,
  MAKER_SLOTS,
  makerReserveKey,
  makerSlotProperty,
  parseMakerReserve,
  type MakerSlotName,
} from "./gate";
import { useMaker } from "./use-maker";

/** How long a held slot waits for its piece before its room is given back:
 *  the lazy chunk, and "Needs you"'s own read, both land well inside it. */
const RELEASE_AFTER_MS = 4000;

function release(root: HTMLElement): void {
  root.removeAttribute(MAKER_RESERVE_ATTRIBUTE);
  for (const slot of MAKER_SLOTS) root.style.removeProperty(makerSlotProperty(slot));
}

function remember(slug: string, heights: Partial<Record<MakerSlotName, number>>): void {
  try {
    if (Object.keys(heights).length === 0) window.localStorage.removeItem(makerReserveKey(slug));
    else window.localStorage.setItem(makerReserveKey(slug), JSON.stringify(heights));
  } catch {
    // No storage: nothing is remembered, and the next visit moves once.
  }
}

/**
 * Keeps the maker view's remembered room true (`gate.ts` says what the room
 * is and why). Renders nothing.
 *
 *   not answered yet     nothing is touched: whatever the boot script held
 *                        stays held, so the page does not collapse and grow
 *   the crew, on Manage  each slot's piece is measured as it draws and as it
 *                        changes; the slot's room follows it, and so does
 *                        the memory. A slot whose piece never draws (nothing
 *                        needs you today) gives its room back after a moment
 *   anybody else         the memory is forgotten and the room released: this
 *                        is not the crew's page (signed out, not on the crew,
 *                        or the switch is on "Visitor")
 *
 * A soft navigation does not run the boot script, so on mount another
 * product's reservation is dropped, and on unmount this one's is.
 */
export function MakerReserve({ slug }: { slug: string }) {
  const ids = React.useMemo(() => [slug], [slug]);
  const answered = useOverlay(ids).status !== "pending";
  const { managing } = useMaker(slug);

  React.useEffect(() => {
    const root = document.documentElement;
    if (root.hasAttribute(MAKER_RESERVE_ATTRIBUTE) && root.getAttribute(MAKER_RESERVE_ATTRIBUTE) !== slug) release(root);
    return () => release(document.documentElement);
  }, [slug]);

  React.useEffect(() => {
    if (!answered) return;
    const root = document.documentElement;
    if (!managing) {
      remember(slug, {});
      release(root);
      return;
    }
    let stored: Partial<Record<MakerSlotName, number>> = {};
    try {
      stored = parseMakerReserve(window.localStorage.getItem(makerReserveKey(slug)));
    } catch {
      // See `remember`.
    }
    const heights: Partial<Record<MakerSlotName, number>> = { ...stored };
    const slots = MAKER_SLOTS.flatMap((name) => {
      const element = document.querySelector<HTMLElement>(`[data-maker-slot="${name}"]`);
      return element ? [{ name, element }] : [];
    });
    // Only the slots on THIS page are this page's to change: a slot of
    // another tab keeps what was remembered for it.
    const measure = () => {
      let changed = false;
      for (const { name, element } of slots) {
        const piece = element.firstElementChild as HTMLElement | null;
        if (!piece) continue;
        const height = Math.round(piece.getBoundingClientRect().height);
        if (height > 0 && heights[name] !== height) {
          heights[name] = height;
          root.style.setProperty(makerSlotProperty(name), `${height}px`);
          changed = true;
        }
      }
      if (changed) {
        root.setAttribute(MAKER_RESERVE_ATTRIBUTE, slug);
        remember(slug, heights);
      }
    };
    const resize = new ResizeObserver(measure);
    const watch = () => {
      for (const { element } of slots) if (element.firstElementChild) resize.observe(element.firstElementChild);
      measure();
    };
    const arrivals = new MutationObserver(watch);
    for (const { element } of slots) arrivals.observe(element, { childList: true });
    watch();
    // A slot still empty after a moment has nothing to hold room for.
    const timer = window.setTimeout(() => {
      let changed = false;
      for (const { name, element } of slots) {
        if (element.firstElementChild || heights[name] === undefined) continue;
        delete heights[name];
        root.style.removeProperty(makerSlotProperty(name));
        changed = true;
      }
      if (changed) remember(slug, heights);
    }, RELEASE_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      resize.disconnect();
      arrivals.disconnect();
    };
  }, [answered, managing, slug]);

  return null;
}
