// A step's card, as one class string (openproduct redesign, OPR1).
//
// Its own file because three things spell the card — the editor's
// `SectionCard`, the step skeleton and the media island — and the island is a
// client component that must not pull the editor's server module to get a
// string.

import { TILE } from "../../../ui/design";

/** A step's card: the shared flat tile with the step's room inside. */
export const STEP_CARD = `scroll-mt-20 px-6 pb-6 pt-5 max-sm:px-4 ${TILE}`;
