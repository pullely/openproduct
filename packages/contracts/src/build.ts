// Which build is answering (openproduct-operations OO3).
//
// RS4 read a deploy off a field that did not exist before it, which works
// once. WC-H's rule — measure nothing until the branch under test is the
// branch that is live — needs the live side to SAY which version it is, and
// the runbook's deploy page asked for exactly that. This is it: the Worker's
// own version metadata (Cloudflare's `version_metadata` binding: the version
// id and the moment it was uploaded), carried on `/health` beside the
// environment and the sweep, and shown on `/docs/checks`.
//
// NOT A COMMIT. The binding knows the version, not the git SHA that built
// it; `tag` would carry one if the deploy uploaded with `--tag`, which this
// estate's composition does not. The id and the upload time are enough for
// both uses — "is the deploy I am measuring the one that is live" is a
// comparison of upload times against the merge, and OO3's assertion is
// "every per-tick phase ran after this moment".

export interface BuildInfo {
  /** The Worker version id, or null where the binding is absent (a test, `wrangler dev`). */
  readonly version: string | null;
  /** When that version was uploaded, ISO; null with the version. */
  readonly deployedAt: string | null;
  /** The version's tag, when the upload carried one; null otherwise. */
  readonly tag: string | null;
}

export const UNKNOWN_BUILD: BuildInfo = Object.freeze({ version: null, deployedAt: null, tag: null });

/** From the binding's value to the document's field. */
export function buildInfo(meta: { id: string; tag: string; timestamp: string } | undefined): BuildInfo {
  if (!meta || typeof meta.id !== "string" || meta.id.length === 0) return UNKNOWN_BUILD;
  const at = Date.parse(meta.timestamp);
  return {
    version: meta.id,
    deployedAt: Number.isFinite(at) ? new Date(at).toISOString() : null,
    tag: typeof meta.tag === "string" && meta.tag.length > 0 ? meta.tag : null,
  };
}

/** The short form a page shows: the first eight characters of the version id. */
export function shortVersion(version: string): string {
  return version.slice(0, 8);
}
