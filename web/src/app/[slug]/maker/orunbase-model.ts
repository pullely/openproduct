// The crew's Orunbase card, as rules (openproduct-stages-crew SC-4, design
// §3.4; board `Product`, the card at the top of the right rail).
//
// PURE, AND NO JSX: the web test lane is module-level. `orunbase-card.tsx`
// draws what these say.

import {
  ORUNBASE_CARD_TITLE,
  crewCountLine,
  deployLine,
  inSyncLine,
  type OrunbaseCard,
} from "@openproduct/contracts";

import { agoOf } from "../../ui/time";

export { ORUNBASE_CARD_TITLE };

/** One row of the card: a label and what it says. */
export interface OrunbaseRow {
  readonly key: "crew" | "stage" | "production";
  readonly label: string;
  readonly value: string;
}

/** Whether the card draws at all: only for a listing that is linked to an
 *  Orunbase project (a listing without a grant has nothing to sync). */
export function showsOrunbaseCard(card: OrunbaseCard | null): card is OrunbaseCard {
  return card !== null && card.linked;
}

/** `In sync · 2m ago`. */
export function orunbaseSyncLine(card: Pick<OrunbaseCard, "syncedAt">, now: number): string {
  return inSyncLine(card.syncedAt, (iso) => agoOf(iso, now));
}

/** Crew · 12 people, Stage · v1.5.0 · 3h ago, Production · No deploy yet. */
export function orunbaseRows(card: OrunbaseCard, now: number): readonly OrunbaseRow[] {
  const ago = (iso: string) => agoOf(iso, now);
  return [
    { key: "crew", label: "Crew", value: crewCountLine(card.crew) },
    { key: "stage", label: "Stage", value: deployLine(card.stage, ago) },
    { key: "production", label: "Production", value: deployLine(card.production, ago) },
  ];
}
