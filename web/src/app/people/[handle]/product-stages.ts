// Where each of a person's products stands (openproduct-redesign OPR-3;
// boards `Person`, `PhonePerson`): the line under a product's row —
// `shipping, 3 of 4`, `idea`.
//
// A PROFILE'S LISTING CARRIES NO STAGE (`PublicProfileListing` is a slug, a
// tagline and a logo), so the line is read where the stage is published: the
// product's own public document, the cached read every product page makes.
// One per product, in parallel, bounded — and a product whose document could
// not be read simply has no line, never a guessed one.

import type { PublicProfile } from "@openproduct/contracts";

import { fetchPublicProfile } from "../../public-api";
import { stageLine } from "../../ui/stage";

/** How many of a person's products one render reads the stage of. */
export const PERSON_STAGE_READ_LIMIT = 12;

/** The line for one product's document, or null when it has no stage. */
export function stageLineOf(profile: Pick<PublicProfile, "stage" | "milestoneCounts"> | null): string | null {
  if (!profile || (profile.stage !== "idea" && profile.stage !== "shipping")) return null;
  return stageLine(profile.stage, profile.milestoneCounts ?? null);
}

/** Slug → stage line, for the products that have one. */
export async function readStageLines(
  slugs: readonly string[],
  read: (slug: string) => Promise<Pick<PublicProfile, "stage" | "milestoneCounts"> | null> = fetchPublicProfile,
): Promise<Record<string, string>> {
  const wanted = [...new Set(slugs)].slice(0, PERSON_STAGE_READ_LIMIT);
  const documents = await Promise.all(wanted.map((slug) => read(slug).catch(() => null)));
  const out: Record<string, string> = {};
  documents.forEach((document, index) => {
    const line = stageLineOf(document);
    if (line !== null) out[wanted[index]!] = line;
  });
  return out;
}
