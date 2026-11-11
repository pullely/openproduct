// Bindings openproduct-worker declares — and the ones it deliberately does not.
//
// The absent bindings are the security model (design.md §3). This interface is
// the TypeScript half of that claim; `wrangler.template.jsonc` is the runtime
// half, and `tests/openproduct-worker/src/bindings.test.ts` is the half that
// fails the build when someone adds a binding to either.

export interface Env {
  /** Hyperdrive to the platform database. This worker only ever reads and
   *  writes the `openproduct` schema — its own bounded context. */
  PLATFORM_DB?: Hyperdrive;
  // PROJECTS_WORKER was declared for OD3's page-header name resolution and
  // never called by any code path — a dead binding, dropped at OX1 so the
  // allowlist states only what is real.
  //
  // MEMBERSHIP_WORKER — the last service binding — left at OX5: the link
  // grant (seam.ts) replaced the per-request reads it carried, and the S6
  // webhook replaced the live JR status read. The binding list is EMPTY now,
  // which is the epic's repo-cut property stated as configuration.
  /** Deploy environment name ("dev" | "stage" | "prod" | "local"). */
  ENVIRONMENT: string;
  /**
   * The shared listing-seam secret (OX5 — 19-openproduct-seam.md): verifies
   * the platform-minted link grant at create/link time. One per environment,
   * a SECRET on both sides, deliberately never declared in
   * wrangler.template.jsonc. Absent = the seam is unconfigured = creating or
   * linking a listing refuses with 503 — never a silent pass.
   */
  LISTING_SEAM_SECRET?: string;
  /**
   * The openproduct OPERATOR allowlist (OX4, OX-J): comma-separated subject
   * ids. Operators hold what org admins held before the authority handover —
   * first-publish review, and read access across listings. Deliberately NOT
   * declared in wrangler.template.jsonc (it names real subjects): set per
   * environment as a var/secret, the same explicit-act posture as
   * WORKSPACE_PURGE_ENABLED. Absent = no operators = review is impossible,
   * which fails in the safe direction (nothing new reaches the public
   * surface) — and, while it is absent, a `new` maker holds at most
   * `UNREVIEWED_LISTING_CAP` published listings (contracts `trust.ts`), since
   * the review that would lift that cap cannot happen. Set this before
   * lowering the cap back to its designed bound.
   */
  OPENPRODUCT_OPERATORS?: string;
  /**
   * LC0 — the launch policy as JSON: `{"cooldownDays":180}`. Configuration
   * rather than code (LC-3's precedent for the board threshold), because the
   * right cooldown is a product judgement that will be tuned against a live
   * catalog and should not need a deploy. Unset means the published defaults;
   * a malformed value means the published defaults, never zero.
   */
  OPENPRODUCT_LAUNCH_POLICY?: string;
  /**
   * LC2 — how many listings make a window worth naming on the directory's
   * strip. Configuration rather than code (LC-3) because the right number
   * depends on a catalog nobody has seen yet, and finding out it should be
   * eight must not cost a deploy. A bad value falls back to the published
   * default, never to zero.
   */
  OPENPRODUCT_FRESHNESS_THRESHOLD?: string;
  /**
   * Kill switch for the workspace purge (saas-workspace-deletion WD4). Must be
   * the string "true" for the internal workspace-purge route to delete
   * anything; absent or anything else refuses with 503.
   *
   * Off by default and deliberately NOT declared in wrangler.template.jsonc, so
   * turning it on is a per-environment act someone has to perform — the same
   * posture as `STATE_GC_COLLECT_ENABLED`, the platform's other path that
   * destroys data irreversibly.
   */
  WORKSPACE_PURGE_ENABLED?: string;
  /**
   * The OX-E cutover freeze (openproduct-independence CUTOVER-RUNBOOK.md).
   * The string "true" turns every write off — non-GET/HEAD requests 503 —
   * while the public read plane keeps serving. Deliberately NOT declared in
   * wrangler.template.jsonc: freezing is a per-environment act an operator
   * performs at the start of the data-plane copy, and unfreezing at the end.
   * Nothing needs a carve-out: seam-delivered decisions heal via the S6
   * reconciliation sweep, and workspace purges retry from the orchestrator
   * until the receipt arrives.
   */
  READ_ONLY?: string;
}

/** The cutover freeze, exact-match on "true" — the same posture as
 *  WORKSPACE_PURGE_ENABLED, in the opposite direction. */
export function readOnly(env: Env): boolean {
  return env.READ_ONLY === "true";
}

