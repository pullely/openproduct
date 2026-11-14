// The sections of `/me`, as addresses (openproduct-redesign OPR1, boards `Me`
// and `PhoneMe`).
//
// ONE PAGE, AND A SWITCHER. Your pages were three addresses under a strip of
// tabs — the profile form, the saved list, the applications. The board makes
// them one page: the profile card, then a switcher between what you hold
// here. The form left for `/me/settings`; the lists became sections.
//
// A SECTION IS AN ADDRESS, not a piece of client state: `/me?section=saved`
// is a link somebody can be sent, the back button undoes, and a server
// render answers — so the switcher is links, and the page ships no script
// for it. The first section is the bare `/me`.
//
// THREE SECTIONS, WHERE THE BOARD DRAWS FIVE. A section is listed only when
// today's data can fill it:
//   - Following has no list to read — the product answers "do I follow
//     THIS?" (the overlay), never "what do I follow?";
//   - Drafts has no draft to show — a post is published or it is not.
// Both arrive with the reads that make them true, and neither is drawn empty
// in the meantime: an empty section a person can never fill is a promise.
//
// PURE, AND ON ITS OWN, so the old addresses, the act routes and the tests
// can ask where a section lives without loading a component (the
// `ui/keys.ts` lesson: a module imported for one function should not bring a
// runtime with it).

export const ME_SECTION_KEYS = ["products", "saved", "seats"] as const;
export type MeSection = (typeof ME_SECTION_KEYS)[number];

/** The section the bare `/me` shows — the board's first. */
export const ME_DEFAULT_SECTION: MeSection = "products";

/**
 * Which section an address names. Anything that is not one of them — absent,
 * misspelt, repeated — is the first section, never a 404: the page is the
 * visitor's own, and a stale link to a section should still land on it.
 */
export function meSectionOf(raw: string | string[] | undefined): MeSection {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (ME_SECTION_KEYS as readonly string[]).includes(value ?? "")
    ? (value as MeSection)
    : ME_DEFAULT_SECTION;
}

/** A section's address. The first is the page itself. */
export function meSectionHref(section: MeSection): string {
  return section === ME_DEFAULT_SECTION ? "/me" : `/me?section=${section}`;
}

/** The sign-in door, with the way back to exactly this address. */
export function signInFor(path: string): string {
  return `/signin?return_to=${encodeURIComponent(path)}`;
}
