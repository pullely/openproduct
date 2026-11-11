// The workspace view door (openproduct-reader OPR5, seam edge S12), kept pure
// for tests — the `submit/handoff.ts` precedent for S10.
//
// A listing that holds a link grant carries `workspaceRef`, the console
// address of the PUBLIC workspace its maker attested. The page renders one
// plain anchor on that fact — to a consent page on THIS origin, never
// straight to the console — and the consent page, signed in, hands the
// reader to the console's landing with `from=openproduct` as provenance.
// Both paths and the query are the seam contract, pinned by fixture on both
// sides (`seam-fixtures/webhook-contract.json`, `urlEdges.workspaceView`).

/** The provenance the console landing records; the S5 door uses the same word. */
export const WORKSPACE_VIEW_FROM = "openproduct";

/** The consent page's address on this origin. */
export function workspaceConsentPath(slug: string): string {
  return `/${encodeURIComponent(slug)}/workspace`;
}

/**
 * The console landing (S12): `{console}/view/{workspaceRef}?from=openproduct`.
 * `consoleOrigin` empty means the single-host dev setup — a relative path,
 * exactly as the S10 hand-off and the S5 door behave.
 */
export function consoleWorkspaceViewUrl(consoleOrigin: string, workspaceRef: string): string {
  const origin = consoleOrigin.replace(/\/+$/, "");
  return `${origin}/view/${encodeURIComponent(workspaceRef)}?from=${WORKSPACE_VIEW_FROM}`;
}

/** The anchor's label on the listing. */
export const WORKSPACE_VIEW_LABEL = "View workspace on Orunbase";

/** The consent page's one sentence of why there is a second sign-in. */
export const WORKSPACE_VIEW_CONSENT =
  "The workspace behind this product is public and read-only. To open it you'll sign in to Orunbase with the same account you use here — Orunbase is where this product is built. You'll be added as a reader; you can leave at any time.";
