// The workspace picker door (seam edge S13 — a URL edge in S10's shape).
//
// openproduct cannot see a maker's workspaces: its token is `identity`-scoped
// and reads nothing on the platform. So "link a workspace" is a plain link to
// the console's picker, which lists the maker's OPENPRODUCT workspaces under
// their own console session, mints the S4 grant there, and hands back to
// `/studio/link#listing_grant=…`. The address and its one parameter are the
// seam contract, pinned by fixture on both sides
// (`seam-fixtures/webhook-contract.json`, `urlEdges.listingPicker`).

/** The console picker's path. */
export const WORKSPACE_PICKER_PATH = "/start/openproduct/link";

/** The words on every door to it. */
export const LINK_WORKSPACE_LABEL = "Link a workspace";

/**
 * The console picker, optionally opened on one workspace (an unlinked
 * listing's own). `consoleOrigin` empty means the single-host dev setup — a
 * relative path, exactly as the S10 hand-off and the S12 door behave.
 */
export function consoleWorkspacePickerUrl(consoleOrigin: string, workspace?: string): string {
  const origin = consoleOrigin.replace(/\/+$/, "");
  const query = workspace ? `?${new URLSearchParams({ workspace }).toString()}` : "";
  return `${origin}${WORKSPACE_PICKER_PATH}${query}`;
}
