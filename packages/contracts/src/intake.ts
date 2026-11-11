// IN0 — the live preview (openproduct-worldclass).
//
// The founder's form and the feed's row, agreeing before anything is
// submitted. What a preview owes a reader is not encouragement: it is an
// accurate account of what the row will say AND of what it cannot yet know,
// because the gap between those two is where a preview turns into a promise.

import type { FeedEntry } from "./feed.js";
import type { Provenance, SignalSource } from "./provenance.js";

/** What `/submit` collects. The web layer's own `CreateDraft` narrowed to the
 *  two fields the row can show — the pitch has no place in a feed row. */
export interface PreviewDraft {
  readonly name: string;
  readonly tagline: string;
}

export const PREVIEW_HEADING = "How it will look";

/**
 * THE ADDRESS IS THE ONE THING THIS PAGE MUST NOT GUESS.
 *
 * `/submit` hands a NAME to the console (`/start/openproduct?name=…`) and the
 * console provisions the workspace, the project and the listing — the address
 * among them. Nothing in the web layer derives a slug, there is no slugify in
 * these contracts, and inventing one here would publish a specific, checkable
 * falsehood the moment the console's rule differed by a character (a
 * collision suffix, a reserved word, a normalisation nobody here knows about).
 *
 * A general disclaimer is a worse-looking answer and a better one: the reader
 * learns the address is not ours to promise, rather than being handed a wrong
 * one confidently.
 */
export const PREVIEW_ADDRESS_NOTE =
  "The name is what the row shows. Its address is assigned when the workspace is created, so this preview does not guess it.";

/**
 * WHAT THE ROW IS NOT SHOWING, said out loud.
 *
 * A licence is OBSERVED at publish and never a maintainer's claim (OPC-7); a
 * position is given by the sweep and is absent, not zero, until then (OPC-C);
 * topics, stack and open roles are filled in later. Every one of those renders
 * as nothing at all in the row, and a row with four silent absences reads as a
 * sparse listing rather than as an unfinished one. The sentence is what turns
 * the second reading into the first.
 */
export const PREVIEW_ABSENT_NOTE =
  "No licence, topics or stack yet — those are read from the repository once it is linked, and a position appears the first time the board runs.";

/** The preview's launch id and version, which exist only to satisfy the row's
 *  shape. Neither is rendered; both are constants so nothing here can be
 *  mistaken for an identifier the rest of the estate would recognise. */
export const PREVIEW_LAUNCH_ID = "preview";

/**
 * A draft, as the feed's own row would render it.
 *
 * ONE MAPPING, IN THE CONTRACT, because the promise IN0 makes is that the
 * preview and the feed agree — and two places deciding what a draft looks like
 * is the drift that promise is about. The web layer passes the result straight
 * to `FeedRow`; there is nothing left for it to decide.
 *
 * EVERY UNKNOWN IS ITS OWN ABSENCE, not a placeholder:
 *
 *   rank      `null` — the sweep has not run. The row draws NO number, which
 *             is different from a zero and different from a dash (OPC-C).
 *   licence   `null` — nothing has been observed. The row draws nothing
 *             rather than "unknown", which would be a finding we did not make.
 *   topics    empty, `stack` empty — the row omits its whole third line,
 *             glyph included, rather than drawing furniture over nothing.
 *   roles     `0` — a listing asking for nobody is a fact, and the row's own
 *             rule already omits the badge instead of printing a
 *             disappointment.
 *
 * `slug` IS THE NAME AS TYPED, and that is the contract's own rule rather
 * than a shortcut: on this estate a listing's slug IS its name (`FeedEntry`
 * says so, in those words), there is no display-name column, and a preview
 * that rendered some other string would be the one surface calling a product
 * something the rest of the site does not.
 */
export function previewEntry(draft: PreviewDraft, now: Date): FeedEntry {
  const launchedAt = now.toISOString();
  return {
    launchId: PREVIEW_LAUNCH_ID,
    slug: draft.name,
    tagline: draft.tagline.length > 0 ? draft.tagline : null,
    versionLabel: "",
    launchedAt,
    day: launchedAt.slice(0, 10),
    rank: null,
    counted: 0,
    ineligible: 0,
    licence: null,
    topics: [],
    stack: [],
    roleOpeningCount: 0,
    commentCount: 0,
    // MD3 — a draft has no hero yet; the preview keeps the monogram, as the
    // row will until the Media step gives it one.
    thumbnail: null,
  };
}

// ─── IN1 — the steps ───────────────────────────────────────────────────────

/**
 * The five steps a listing is filled in through.
 *
 * ONE VOCABULARY, because the strip that navigates them, the pages that are
 * them and the tests that walk them must agree about what a step IS — its
 * address, its name and what it holds. Three files inventing that separately
 * is how a strip comes to link a step that no longer exists.
 */
export type ListingStepId = "details" | "media" | "topics" | "people" | "schedule";

export interface ListingStep {
  readonly id: ListingStepId;
  /** What the strip calls it. */
  readonly label: string;
  /**
   * The path segment under `/studio/{org}/{profile}`, or `null` for a step
   * that has no page yet.
   *
   * `schedule` keeps the address it already had — `launches` — rather than
   * being moved to match its label. LC0 shipped that page, it is linked from
   * the listing's status line, and renaming a working address to tidy a
   * vocabulary is a cost paid by everyone holding the old link.
   */
  readonly segment: string | null;
  /** One line: what a maintainer does here. */
  readonly holds: string;
  /**
   * Why this step has no page, or `null` when it has one. A step that cannot
   * be built yet is still part of the sequence, and saying so is better than
   * a strip of four that quietly implies there were only ever four.
   */
  readonly awaits: string | null;
}

export const LISTING_STEPS: readonly ListingStep[] = [
  {
    id: "details",
    label: "Details",
    segment: "details",
    holds: "The name, the sentence under it, the pitch, and the two links.",
    awaits: null,
  },
  {
    id: "media",
    label: "Media",
    segment: "media",
    holds: "The hero image and the gallery — what a reader sees before a word.",
    // MD2 BUILT THIS STEP on 10 Sep 2026. It waited on MD1, the store; for a
    // while before that it waited on WC-C, the decision — and for a while it
    // named the decision after the decision had been taken, which is the
    // history the `awaits` sentence carries in its wording rule: name a BUILD
    // a maintainer can wait for, never a decision somebody already took.
    // Nothing here waits now, and the strip renders it as a link.
    awaits: null,
  },
  {
    id: "topics",
    label: "Topics and stack",
    segment: "topics",
    holds: "Where this listing sits in the catalogue, and what it is built with.",
    awaits: null,
  },
  {
    id: "people",
    // OB6 (D4) — the roles live here, so the tab says so.
    label: "People and roles",
    segment: "people",
    holds: "Who is shown as a maintainer, and which roles are open.",
    awaits: null,
  },
  {
    id: "schedule",
    // openproduct-studio OSD7: the strip's tab is named for the card it opens
    // — "Launches", at `/launches` — so a maker never clicks "Schedule" and
    // lands on a page titled something else. The id stays `schedule`: it is
    // an address other code keys on, and renaming it buys nothing a reader sees.
    label: "Launches",
    segment: "launches",
    holds: "When this version launches, and what happened to the last one.",
    awaits: null,
  },
];

/**
 * The steps the studio's strip draws (OB6). The Launches step left the strip:
 * a build is published, not launched, and the strip is the path to Publish.
 * Its page stays at `/launches` for anyone holding the link (OSD7's address
 * rule), and it stays in `LISTING_STEPS` so that page still knows its name.
 */
export const STRIP_STEPS: readonly ListingStep[] = LISTING_STEPS.filter((step) => step.id !== "schedule");

/** The listing's own base address — the overview, and the strip's home. */
export function listingBasePath(org: string, profile: string): string {
  return `/studio/${encodeURIComponent(org)}/${encodeURIComponent(profile)}`;
}

/**
 * A step's address, or `null` when the step has no page.
 *
 * `null` rather than a `#` or the overview: a strip that renders an unbuilt
 * step as a link teaches a reader the step is there and then does nothing,
 * which is worse than saying what it waits on.
 */
export function listingStepPath(org: string, profile: string, step: ListingStep): string | null {
  return step.segment === null ? null : `${listingBasePath(org, profile)}/${step.segment}`;
}

/** The step a segment names, for a page to say which one it is. */
export function listingStepOf(segment: string): ListingStep | null {
  return LISTING_STEPS.find((s) => s.segment === segment) ?? null;
}

/**
 * WHAT AN INDEPENDENT STEP MEANS, and the reason it is written down.
 *
 * The editor was one form posting every field at once. Split into steps
 * naively, the Details step's save would send no `stack` and no facets — and
 * the route, reading absent fields as empty ones, would CLEAR the topics a
 * maintainer set on another page. The API is a PATCH and always was; the
 * route simply sent everything because there was only ever one form.
 *
 * So each step's save carries its own intent and its own fields, and this is
 * the list the route and its tests agree on. A step that saved a field
 * belonging to another step would be four URLs wearing one form.
 */
export const STEP_FIELDS: Readonly<Record<"details" | "topics" | "people", readonly string[]>> = {
  details: ["slug", "tagline", "pitch", "repoUrl", "liveUrl"],
  // CT1's two assigned facets, and the stack. `licence` is NOT here: it is
  // observed from the repository at publish, never a maintainer's claim
  // (OPC-7), and a field for it on this step would invite one.
  topics: ["stack", "category", "hosting", "pricing"],
  people: ["maintainers"],
};

// ─── IN2 — repo import ─────────────────────────────────────────────────────

/**
 * WHICH CLASS A SHOWN VALUE IS IN — `provenance.ts`'s own word, narrowed.
 *
 * That module already carries this estate's provenance vocabulary: a
 * three-class union (`authored` / `observed` / `derived`), the four signal
 * sources, and the rule that an observation without an `observedAt` cannot be
 * constructed. IN2 does NOT invent a second one. What it adds is the two
 * classes an intake field can be in — nothing here is derived, because
 * nothing here is computed from anything — and the words the form says.
 */
export type IntakeClass = Extract<Provenance["class"], "observed" | "authored">;

/**
 * The source these observations carry, and it is `declared_repo` rather than
 * `linked_repo` deliberately: the gateway reads `api.github.com` over the
 * PUBLIC API from a URL the maintainer typed, with no App and no custody of
 * anything. `linked_repo` promises more than that read can see.
 */
export const IMPORT_SOURCE: SignalSource = "declared_repo";

export const PROVENANCE_LABEL: Readonly<Record<IntakeClass, string>> = {
  observed: "from the repository",
  authored: "yours",
};

export const PROVENANCE_NOTE: Readonly<Record<IntakeClass, string>> = {
  observed:
    "Read from the linked repository at the last check. Edit it and it becomes yours — nothing will overwrite it after that.",
  authored: "You wrote this. Nothing observes it, and a repository check will not change it.",
};

/** The four fields an import fills, in the order the form draws them. */
export const IMPORTED_FIELDS = ["name", "description", "licence", "stack"] as const;
export type ImportedField = (typeof IMPORTED_FIELDS)[number];

export const IMPORTED_FIELD_LABEL: Readonly<Record<ImportedField, string>> = {
  name: "Name",
  description: "Description",
  licence: "Licence",
  stack: "Stack",
};

/**
 * THE LICENCE IS THE ONE THAT CANNOT BE AUTHORED, and saying so here keeps
 * three surfaces from disagreeing about it.
 *
 * A licence is a legal fact about a repository, published as observed
 * everywhere on this estate (OPC-7). The import shows it like the other
 * three; unlike the other three there is no field to edit, because a
 * maintainer typing a licence would be a claim this product does not make on
 * anybody's behalf.
 */
export const OBSERVED_ONLY_FIELDS: readonly ImportedField[] = ["licence"];

export interface ImportedValue {
  readonly field: ImportedField;
  /** What the form shows. `null` when neither side has anything. */
  readonly value: string | null;
  readonly provenance: IntakeClass;
  /** What the repository says, when it differs from an authored value —
   *  so a maintainer can see what they overrode without losing it. */
  readonly observed: string | null;
}

/**
 * What the import shows for one field: the authored value if there is one,
 * otherwise the observation, and which of the two that was.
 *
 * AUTHORED WINS, ALWAYS. An observation never overwrites a person's words —
 * it fills a gap, and steps back the moment they fill it themselves. That
 * ordering is the whole reason the two are stored separately: prefilling the
 * authored column at import time would destroy the difference a second after
 * it was made, and leave nobody able to say where the sentence came from.
 */
export function importedValue(
  field: ImportedField,
  authored: string | null | undefined,
  observed: string | null | undefined,
): ImportedValue {
  const own = typeof authored === "string" && authored.trim().length > 0 ? authored.trim() : null;
  const seen = typeof observed === "string" && observed.trim().length > 0 ? observed.trim() : null;
  if (own !== null) return { field, value: own, provenance: "authored", observed: seen };
  return { field, value: seen, provenance: "observed", observed: seen };
}

/** The same, for the stack — a list rather than a sentence. */
export function importedStack(
  authored: readonly string[] | null | undefined,
  observed: readonly string[] | null | undefined,
): ImportedValue {
  const own = (authored ?? []).filter((t) => t.trim().length > 0);
  const seen = observed === null || observed === undefined ? null : observed.join(", ");
  if (own.length > 0) {
    return { field: "stack", value: own.join(", "), provenance: "authored", observed: seen };
  }
  return { field: "stack", value: seen, provenance: "observed", observed: seen };
}

/** Whether anything has been observed at all — the difference between "not
 *  checked yet" and "checked, and it said nothing". */
export function hasObservation(profile: {
  repoCheckedAt: string | null;
  repoName: string | null;
  repoDescription: string | null;
  repoTopics: string[] | null;
  repoLicence: string | null;
}): boolean {
  return (
    profile.repoCheckedAt !== null &&
    (profile.repoName !== null ||
      profile.repoDescription !== null ||
      profile.repoTopics !== null ||
      profile.repoLicence !== null)
  );
}
