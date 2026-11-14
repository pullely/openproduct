"use client";

import * as React from "react";

import type { OverlayCrew } from "@openproduct/contracts";

import { useCrewOf } from "../../ui/use-overlay";

import { isManaging, viewModeKey, viewModeOf, type ViewMode } from "./model";

/**
 * The maker view's one gate (openproduct-redesign OPR-3, design §4).
 *
 * EVERY MAKER ELEMENT ASKS THIS HOOK, AND THIS HOOK ASKS `useCrewOf`. The
 * overlay's server snapshot is always "pending", so on the server — and for
 * every visitor who is not on the crew — `crew` is null and `managing` is
 * false: the component returns null and the cached HTML carries nothing of
 * the maker view. It appears in the crew's own browser, after load.
 *
 * WHAT IS KEPT HERE, per product, outside React so the header's switch and
 * the page's pieces agree without a provider between them (the switch is
 * portalled into the site header, which is not an ancestor of the page):
 *
 *   mode     Manage or Visitor — remembered for the session (`sessionStorage`),
 *            so it survives a tab change and a save, and not a new visit
 *   editing  whether the "Edit details" form is open
 *   saved    the one-line pitch as just saved, shown until the cached page
 *            catches up (the public document is cached for a minute)
 */
const listeners = new Set<() => void>();
let version = 0;
const modes = new Map<string, ViewMode>();
const editing = new Set<string>();
const savedTaglines = new Map<string, string | null>();

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const clientSnapshot = (): number => version;
const serverSnapshot = (): number => 0;

function storedMode(slug: string): ViewMode {
  const known = modes.get(slug);
  if (known) return known;
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(viewModeKey(slug));
  } catch {
    // Storage can be blocked; the choice then lasts as long as the page does.
  }
  const mode = viewModeOf(stored);
  modes.set(slug, mode);
  return mode;
}

/** Choose Manage or Visitor for this product, for the rest of the session. */
export function setViewMode(slug: string, mode: ViewMode): void {
  modes.set(slug, mode);
  // Leaving Manage closes the form: "Visitor" shows the public page.
  if (mode === "visitor") editing.delete(slug);
  try {
    window.sessionStorage.setItem(viewModeKey(slug), mode);
  } catch {
    // See `storedMode`.
  }
  emit();
}

/** Open or close the "Edit details" form. */
export function setEditing(slug: string, open: boolean): void {
  if (open) editing.add(slug);
  else editing.delete(slug);
  emit();
}

/** Remember the pitch a save just wrote, so the page shows it at once. */
export function rememberTagline(slug: string, tagline: string | null): void {
  savedTaglines.set(slug, tagline);
  emit();
}

export interface MakerView {
  /** The crew entry when the visitor is on this product's crew, else null. */
  crew: OverlayCrew | null;
  mode: ViewMode;
  /** On the crew AND on Manage: the maker's controls draw. */
  managing: boolean;
  /** The "Edit details" form is open (only ever true while managing). */
  editing: boolean;
  /** The pitch as last saved from this page, when it was. */
  savedTagline: string | null | undefined;
}

export function useMaker(slug: string): MakerView {
  const crew = useCrewOf(slug);
  React.useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  // The stored mode is read only once the overlay has said "crew": before
  // that — on the server, during hydration, for everybody else — nothing
  // here touches the browser and the answer is the visitor's page.
  const mode: ViewMode = crew === null ? "manage" : storedMode(slug);
  const managing = isManaging(crew, mode);
  return {
    crew,
    mode,
    managing,
    editing: managing && editing.has(slug),
    savedTagline: crew === null ? undefined : savedTaglines.get(slug),
  };
}
