// What the maker view's GATES need, and nothing else (openproduct-redesign
// OPR-3, design §4).
//
// A product's page is the same page for every visitor, and every visitor's
// browser downloads whatever that page's client components import. The maker
// view's forms and lists are fetched only for the crew (`lazy.tsx`); what
// decides whether to fetch them — is this visitor on the crew, and is the
// switch on Manage — has to be in everybody's bundle, so it is kept to these
// few lines. `model.ts` is the rest, and re-exports this file, so there is
// still one place to import the maker view's rules from.
//
// PURE, AND NO JSX: the web test lane is module-level.

import { composePostPagePath, type OverlayCrew } from "@openproduct/contracts";

// ─── the Manage / Visitor switch ───────────────────────────────────────────

/** `manage` shows the maker's controls; `visitor` shows the crew the public
 *  page exactly as everybody else gets it. */
export const VIEW_MODES = ["manage", "visitor"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  manage: "Manage",
  visitor: "Visitor",
};

/** The switch's accessible name (boards `Product`, `PhoneProduct`). */
export const VIEW_SWITCH_LABEL = "View this page as";

/** Where the header keeps the switch: the one named slot in `top-panel.tsx`. */
export const VIEW_SWITCH_SLOT_ID = "page-view-switch";

/** The session key the choice is remembered under: one per product. */
export function viewModeKey(slug: string): string {
  return `openproduct.view.${slug}`;
}

/** A stored value as a mode. Anything else is `manage`: the crew's default. */
export function viewModeOf(stored: string | null | undefined): ViewMode {
  return stored === "visitor" ? "visitor" : "manage";
}

/**
 * Whether the maker's controls draw. Both halves are required: the overlay
 * said this visitor is on the crew, and the switch is on Manage. "Visitor"
 * hides every maker element, so the crew sees the public page.
 */
export function isManaging(crew: OverlayCrew | null, mode: ViewMode): boolean {
  return crew !== null && mode === "manage";
}

/** The builder, opened on a post the crew already has (a draft to continue,
 *  or a published post to edit). */
export function continuePostPath(slug: string, postId: string): string {
  return `${composePostPagePath(slug)}?draft=${encodeURIComponent(postId)}`;
}

/** What shipping a milestone offers: the draft post core prepared. */
export const OFFERED_POST_LABEL = "Draft post ready";

/** The Crew tab's seats, where the form is: a link from another tab's page
 *  goes here. An idea has one page, and its seats are on it. */
export function seatFormPath(slug: string, idea: boolean): string {
  return idea ? `/${slug}#people-wanted` : `/${slug}/crew#people-wanted`;
}

// ─── the room the maker view takes ─────────────────────────────────────────

/**
 * THE MAKER VIEW ARRIVES AFTER LOAD, ON A PAGE THAT IS ALREADY PAINTED, and
 * the pieces at the top of a column ("Needs you", the New post pills, the
 * milestone manager) push everything under them down when they do. The
 * cached page cannot hold their room — it is the same bytes for a visitor —
 * so the crew's own browser remembers how tall each piece was, and the next
 * time it opens the page that room is held before the first paint.
 *
 *   the slot     an empty `div` in the server render, around each such piece
 *                (`MakerSlot`), `display: none` while empty — a visitor's
 *                page has no gap
 *   the memory   `localStorage`, one entry per product: `{slot: height}`
 *   the boot     an inline script in the page (the same text for everybody)
 *                that reads the entry BEFORE the slots are parsed and, only
 *                when the session hint says signed in, sets
 *                `--maker-<slot>` on the root. The slot's `min-height` reads it
 *   the sync     `reserve.tsx`, in the browser: measures what drew, keeps
 *                the entry true, and forgets it when this is not the crew's
 *                page (signed out, not on the crew, or on "Visitor")
 *
 * The very first visit as crew still moves once: nothing knew.
 */
export const MAKER_RESERVE_ATTRIBUTE = "data-maker-reserved";

/** The slots that hold room, by name. A closed list: the boot script sets a
 *  custom property for these names and nothing else. */
export const MAKER_SLOTS = ["needs-you", "post", "milestones"] as const;
export type MakerSlotName = (typeof MAKER_SLOTS)[number];

/** Where this product's heights are remembered. */
export function makerReserveKey(slug: string): string {
  return `openproduct.maker.${slug}`;
}

/** The custom property a slot's `min-height` reads. */
export function makerSlotProperty(slot: MakerSlotName): string {
  return `--maker-${slot}`;
}

/** A remembered entry, read back: only the known slots, only sane heights. */
export function parseMakerReserve(raw: string | null | undefined): Partial<Record<MakerSlotName, number>> {
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const out: Partial<Record<MakerSlotName, number>> = {};
  for (const slot of MAKER_SLOTS) {
    const value = (parsed as Record<string, unknown>)[slot];
    if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 4000) out[slot] = Math.round(value);
  }
  return out;
}

/**
 * The boot script's text for a product's page. The slug is a slug (letters,
 * digits, hyphens), so it is safe inside the string it is written into; the
 * script trusts nothing it reads — a slot outside the list, or a height that
 * is not a sane number, sets nothing.
 *
 * NO `<` ANYWHERE IN IT (every comparison is written with `>`), so nothing in
 * it can open or close a tag from inside the `<script>` it is written into,
 * whatever it is given. A test holds that.
 */
export function makerReserveBoot(slug: string): string {
  const key = JSON.stringify(makerReserveKey(slug));
  const slots = JSON.stringify(MAKER_SLOTS);
  return `try{var r=document.documentElement,m=JSON.parse(localStorage.getItem(${key})||"null");if(m&&r.classList.contains("op-signed-in")){var s=${slots},n=0;for(var i=0;s.length>i;i++){var h=m[s[i]];if(typeof h==="number"&&h>0&&4000>h){r.style.setProperty("--maker-"+s[i],Math.round(h)+"px");n++}}if(n)r.setAttribute("${MAKER_RESERVE_ATTRIBUTE}",${JSON.stringify(slug)})}}catch(e){}`;
}
