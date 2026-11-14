import { NotFoundBody } from "./ui/not-found-body";

/**
 * The public plane's own not-found (launch polish, from the Chrome review).
 *
 * Before this file existed, an unknown slug on openproduct.live fell through
 * to the CONSOLE's 404 — the Orun mark, "doesn't match anything in the
 * console", and a "Back to workspaces" button that dropped an anonymous
 * visitor into the app shell. A public surface must answer in its own voice:
 * a private profile, a nonexistent one, and a mistyped address all land here,
 * byte-identical, with the one useful next step.
 *
 * THE BODY IS `ui/not-found-body.tsx` (openproduct-redesign OPR-4): a private
 * thread's page draws the same one for anybody who may not read the thread.
 */
export default function OpenproductNotFound() {
  return <NotFoundBody />;
}
