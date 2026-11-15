// Where it runs, in words (openproduct-stages-crew SC-2, design §1.5; board
// `Product`): the strip under a product's header, for everyone — a STAGE row
// and a PRODUCTION row, each with its address and who set it and when.
//
// PURE, AND NO JSX: the web test lane is module-level. The strip itself is
// `where-it-runs-strip.tsx`, which draws what this decides.
//
// FROM THE PUBLIC DOCUMENT ONLY (`PublicProfile.whereItRuns`), the same bytes
// for every visitor, so the page stays one cached document (I6). A document
// cached before SC1 carries no `whereItRuns`; it reads as nothing running
// anywhere, which is what such a product had said.

import {
  NO_WHERE_IT_RUNS,
  PRODUCTION_ACCESS_LABELS,
  type ProductStage,
  type PublicProfile,
  type WhereItRuns,
  type WhereItRunsBy,
} from "@openproduct/contracts";

export const WHERE_IT_RUNS_LABEL = "Where it runs";
export const NOT_ON_STAGE = "Not on stage yet";
export const NOT_IN_PRODUCTION = "Not in production yet";

export interface WhereItRunsRow {
  /** Which row: the tone it is drawn in. */
  readonly env: "stage" | "production";
  /** The mono tag: `STAGE`, `PRODUCTION`. */
  readonly label: string;
  /** The address, or null for a row with nothing there yet. */
  readonly url: string | null;
  /** The address as it reads: no scheme, no trailing slash. */
  readonly shown: string | null;
  /** The quiet line under it. */
  readonly meta: string;
}

/** The document's strip, or nothing running anywhere. */
export function whereItRunsOfProfile(profile: Pick<PublicProfile, "whereItRuns">): WhereItRuns {
  return profile.whereItRuns ?? NO_WHERE_IT_RUNS;
}

/** `acme.app/try`: an address as a row shows it. */
export function shownAddress(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** `Nov 12, 2026`, in UTC so every visitor reads the same day. */
export function shortDay(iso: string): string | null {
  const at = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(at)) return null;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Who set a row and when: `Link set by Ada Iyer · Nov 15, 2026`, `Link set by
 * the crew` for somebody who is not on the public roster, nothing when nobody
 * is recorded. (SC3 adds "Deployed by Orun" for a value a deploy wrote.)
 */
export function setByLine(setBy: WhereItRunsBy | null, at: string | null): string | null {
  if (!setBy) return null;
  const who = setBy.name?.trim() || (setBy.handle ? `@${setBy.handle}` : "the crew");
  const when = at ? shortDay(at) : null;
  return when ? `Link set by ${who} · ${when}` : `Link set by ${who}`;
}

/** The two rows, STAGE then PRODUCTION, as the board draws them. */
export function whereItRunsRows(where: WhereItRuns): readonly WhereItRunsRow[] {
  const stage = where.stage;
  const production = where.production;
  return [
    stage
      ? {
          env: "stage",
          label: "STAGE",
          url: stage.url,
          shown: shownAddress(stage.url),
          meta: [stage.note, setByLine(stage.setBy, stage.at)].filter((part): part is string => Boolean(part)).join(" · ") || "On stage",
        }
      : { env: "stage", label: "STAGE", url: null, shown: null, meta: NOT_ON_STAGE },
    production
      ? {
          env: "production",
          label: "PRODUCTION",
          url: production.url,
          shown: shownAddress(production.url),
          meta: [
            production.version,
            PRODUCTION_ACCESS_LABELS[production.access],
            shortDay(production.since) ? `live since ${shortDay(production.since)}` : null,
            setByLine(production.setBy, production.at),
          ]
            .filter((part): part is string => Boolean(part))
            .join(" · "),
        }
      : { env: "production", label: "PRODUCTION", url: null, shown: null, meta: NOT_IN_PRODUCTION },
  ];
}

/**
 * The header's ink button (board `Stage`: `tryLabel`): "Open it" to the
 * production link once the product is in production, else "Try it" to the
 * stage link — and nothing when there is neither. The stage link IS the try
 * link (design §1.7).
 */
export function liveAction(
  profile: Pick<PublicProfile, "stage" | "tryUrl" | "whereItRuns">,
): { label: "Try it" | "Open it"; href: string } | null {
  const production = whereItRunsOfProfile(profile).production;
  if (profile.stage === "production" && production) return { label: "Open it", href: production.url };
  return profile.tryUrl ? { label: "Try it", href: profile.tryUrl } : null;
}

/**
 * What the Change stage popup starts from (SC-2), off the same public
 * document: the stage now, and the crew's own words for each step it already
 * took — the repository, the stage link and what people can try, the
 * production facts. Plain data, so the server page can hand it to the crew's
 * client components.
 */
export interface StageStart {
  readonly stage: ProductStage;
  readonly repoUrl: string | null;
  readonly tryUrl: string | null;
  readonly whereItRuns: WhereItRuns;
}

export function stageStartOf(profile: Pick<PublicProfile, "stage" | "repoUrl" | "tryUrl" | "whereItRuns">): StageStart {
  return {
    stage: profile.stage,
    repoUrl: profile.repoUrl,
    tryUrl: profile.tryUrl,
    whereItRuns: whereItRunsOfProfile(profile),
  };
}
