// The workspace view door (openproduct-reader OPR5, seam edge S12), kept pure
// for tests — the `submit/handoff.ts` precedent for S10.
//
// A listing that holds a link grant carries `workspaceRef`, the console
// address of the PUBLIC workspace its maker attested. The page renders one
// plain anchor on that fact — to `/{slug}/workspace` on THIS origin, so the
// cached page never spells a console address — and that address redirects
// every visitor, signed in here or not, to the console's landing with
// `from=openproduct` as provenance (LR-9). The console signs the visitor in.
// Both paths and the query are the seam contract, pinned by fixture on both
// sides (`seam-fixtures/webhook-contract.json`, `urlEdges.workspaceView`).

/** The provenance the console landing records; the S5 door uses the same word. */
export const WORKSPACE_VIEW_FROM = "openproduct";

/** The door's address on this origin: a redirect to the console (LR-9). */
export function workspaceDoorPath(slug: string): string {
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
export const WORKSPACE_VIEW_LABEL = "Open on Orunbase";
