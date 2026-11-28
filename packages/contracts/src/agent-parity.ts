// Every route, and what an agent can do with it (openproduct-mcp MC2).
//
// ─── WHY A CATALOGUE ──────────────────────────────────────────────────────
//
// "Everything should be available as MCP" stays true only if a new route
// cannot ship without somebody saying what an agent does with it. So every
// internal route core serves is named here BY ITS CONSTANT in
// `core/src/router.ts`, and for each method it accepts there is one of:
//
//   a tool       the MCP tool that stands for it
//   excluded     a reason from `AGENT_EXCLUSIONS` (design §5)
//
// `tests/core/src/agent-parity.test.ts` reads the router's source and fails
// when a constant is missing here, when an entry names a tool the registry
// does not have, or when an entry names a constant that no longer exists.
// Until MC8 there was a third kind, "not yet", naming the milestone that
// would bring a route's tool; MC7 emptied it and MC8 deleted it.

export type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Why a route is not a tool. Each one is a sentence a reader can check. */
export const AGENT_EXCLUSIONS = {
  credentials: "Signing in, sessions and passwords. An agent never holds a person's password or session; connecting one is the OAuth door.",
  agent_credentials: "Minting, listing and revoking agent credentials. An agent cannot widen, extend or hide its own access.",
  machine: "Machine-to-machine already: the sweep, the seams from Orunbase and the ingestion phases, each with its own signature or binding.",
  operator: "The operator's review, moderation and appeal decisions: a human judgement by policy, and not a person's own act.",
  account: "Deleting an account and downloading its data: irreversible or bulk personal data, done in a browser with a fresh sign-in.",
  link_grant: "Linking a workspace: the platform's attestation, carried by a workspace owner or admin in a browser.",
  appeal: "Filing an appeal: a person's own words to the operator (risks Q4).",
  observation: "Written by openproduct itself after it reads a repository, never by a caller.",
  overlay: "The website's own per-page overlay; every fact in it has a tool of its own.",
  no_verbs: "The collection answers no method of its own; each member route has its tool.",
} as const;
export type AgentExclusion = keyof typeof AGENT_EXCLUSIONS;

export type RouteUse = { readonly tool: string } | { readonly excluded: AgentExclusion };

export type RouteEntry = Partial<Record<RouteMethod, RouteUse>>;

const tool = (name: string): RouteUse => ({ tool: name });
const excluded = (reason: AgentExclusion): RouteUse => ({ excluded: reason });

/** Keyed by the route's constant in `core/src/router.ts`. */
export const AGENT_ROUTE_CATALOGUE: Record<string, RouteEntry> = {
  // ── a listing and its words ──
  ORG_PROFILES_RE: { GET: tool("list_my_listings"), POST: tool("create_listing") },
  ORG_PROFILE_RE: { GET: tool("get_listing"), PATCH: tool("update_listing") },
  PROFILE_PUBLISH_RE: { POST: tool("publish_listing"), DELETE: tool("unpublish_listing") },
  PROFILE_STAGE_RE: { PUT: tool("change_stage") },
  PROFILE_REPO_OBSERVATION_RE: { PUT: excluded("observation") },
  PROFILE_REVIEW_RE: { POST: excluded("operator") },
  PROFILE_MAINTAINERS_RE: { PUT: tool("set_public_crew") },
  PROFILE_LINK_GRANT_RE: { PUT: excluded("link_grant") },
  PROFILE_ORUNBASE_RE: { GET: tool("get_listing_sync") },
  PROFILE_NEEDS_YOU_RE: { GET: tool("get_needs_you") },
  // ── images ──
  PROFILE_MEDIA_RE: { GET: tool("list_media"), POST: tool("upload_media"), PUT: tool("reorder_gallery") },
  PROFILE_MEDIA_ITEM_RE: { PATCH: tool("update_media"), DELETE: tool("remove_media") },
  // ── posts, milestones, launches ──
  PROFILE_PRODUCT_POSTS_RE: { GET: tool("list_posts"), POST: tool("create_post") },
  PROFILE_PRODUCT_POST_RE: { PATCH: tool("update_post"), DELETE: tool("delete_post") },
  PROFILE_PRODUCT_POST_PUBLISH_RE: { POST: tool("publish_post") },
  PROFILE_MILESTONES_RE: { GET: tool("list_milestones"), POST: tool("create_milestone"), PUT: tool("reorder_milestones") },
  PROFILE_MILESTONE_RE: { PATCH: tool("update_milestone"), DELETE: tool("delete_milestone") },
  PROFILE_MILESTONE_SHIPPED_RE: { PUT: tool("ship_milestone"), DELETE: tool("ship_milestone") },
  PROFILE_LAUNCHES_RE: { GET: tool("list_listing_launches"), POST: tool("schedule_launch") },
  PROFILE_LAUNCH_RE: { PATCH: tool("reschedule_launch"), DELETE: tool("cancel_launch") },
  // ── seats, crew, the product's discussions ──
  PROFILE_OPENINGS_RE: { POST: tool("open_role") },
  PROFILE_OPENING_RE: { PUT: tool("update_role"), DELETE: tool("close_role") },
  PROFILE_CREW_RE: { GET: tool("list_crew"), PUT: tool("set_crew_roles") },
  PROFILE_CREW_MEMBER_RE: { PUT: tool("set_crew_roles") },
  PROFILE_THREADS_RE: { GET: tool("list_listing_threads") },
  PRIVATE_THREADS_PATH: { GET: tool("list_private_threads") },
  PRIVATE_THREAD_RE: { GET: tool("get_private_thread") },
  PRIVATE_THREAD_POSTS_RE: { POST: tool("reply_private") },
  THREAD_RESOLVED_RE: { PUT: tool("resolve_thread"), DELETE: tool("resolve_thread") },
  THREAD_MANAGE_RE: { POST: tool("moderate_thread") },
  ORG_ROSTER_RE: { POST: tool("name_on_roster") },
  ORG_ROSTER_SUBJECT_RE: { DELETE: tool("remove_from_roster") },
  // ── the contributor's side ──
  THREADS_PATH: { POST: tool("create_thread") },
  THREAD_POSTS_RE: { POST: tool("reply") },
  THREAD_COMMENT_PATH: { POST: tool("comment") },
  POST_VOTE_RE: { PUT: tool("vote"), DELETE: tool("vote") },
  REPORTS_PATH: { POST: tool("report") },
  ME_PATH: { GET: tool("whoami"), PUT: tool("update_my_profile"), DELETE: excluded("account") },
  ME_EXPORT_PATH: { GET: excluded("account") },
  ME_OVERLAY_PATH: { GET: excluded("overlay") },
  ME_LISTINGS_PATH: { GET: tool("list_my_listings") },
  ME_APPLICATIONS_PATH: { GET: tool("list_my_applications") },
  ME_SAVED_PATH: { GET: tool("list_saved"), PUT: tool("save") },
  ME_SAVED_SLUG_RE: { DELETE: tool("save") },
  ME_FOLLOW_RE: { PUT: tool("follow"), DELETE: tool("follow") },
  ME_FOLLOWING_PATH: { GET: tool("list_following") },
  ME_ENDORSEMENTS_PATH: { GET: excluded("no_verbs") },
  ME_ENDORSEMENT_SLUG_RE: { PUT: tool("endorse"), DELETE: tool("endorse") },
  ME_PRODUCT_POST_REACTION_RE: { PUT: tool("react"), DELETE: tool("react") },
  ME_COLLECTIONS_PATH: { GET: tool("list_my_collections"), POST: tool("create_collection") },
  ME_COLLECTION_ITEMS_RE: { POST: tool("edit_collection") },
  ME_COLLECTION_STATE_PATH: { POST: tool("set_collection_state") },
  ME_INBOX_PATH: { GET: tool("list_notifications"), PUT: tool("mark_notifications_read") },
  ME_DIGEST_PATH: { GET: tool("get_digest_subscription"), PUT: tool("set_digest_subscription") },
  ME_HANDLE_PATH: { PUT: tool("claim_handle") },
  ME_PROFILE_VISIBILITY_PATH: { PUT: tool("set_profile_visibility") },
  ME_ROSTER_PATH: { GET: tool("list_roster_invitations") },
  ME_ROSTER_ANSWER_RE: { POST: tool("answer_roster") },
  ME_APPEALS_PATH: { GET: tool("list_my_appeals"), POST: excluded("appeal") },
  // ── the operator ──
  REPORT_QUEUE_PATH: { GET: excluded("operator") },
  MODERATION_ACTS_PATH: { POST: excluded("operator") },
  MODERATION_TRIAGE_PATH: { POST: excluded("operator") },
  MODERATION_DOSSIER_PATH: { GET: excluded("operator") },
  FLAG_QUEUE_PATH: { GET: excluded("operator") },
  FLAG_RESOLVE_PATH: { POST: excluded("operator") },
  APPEAL_QUEUE_PATH: { GET: excluded("operator") },
  APPEAL_DECIDE_PATH: { POST: excluded("operator") },
  // ── credentials, sessions, agents ──
  AUTH_SIGN_UP_PATH: { POST: excluded("credentials") },
  AUTH_VERIFY_PATH: { POST: excluded("credentials") },
  AUTH_SESSIONS_PATH: { POST: excluded("credentials") },
  AUTH_SESSIONS_RESOLVE_PATH: { POST: excluded("credentials") },
  AUTH_SESSIONS_REVOKE_PATH: { POST: excluded("credentials") },
  CREDENTIAL_READ_RE: { GET: excluded("credentials") },
  OAUTH_CLIENTS_PATH: { POST: excluded("agent_credentials") },
  OAUTH_CLIENT_RE: { GET: excluded("agent_credentials") },
  OAUTH_TOKEN_INTERNAL_PATH: { POST: excluded("agent_credentials") },
  OAUTH_REVOKE_INTERNAL_PATH: { POST: excluded("agent_credentials") },
  AGENT_RESOLVE_PATH: { POST: excluded("agent_credentials") },
  AGENT_IDEMPOTENCY_LOOKUP_PATH: { POST: excluded("agent_credentials") },
  AGENT_IDEMPOTENCY_STORE_PATH: { POST: excluded("agent_credentials") },
  AGENT_UPLOAD_TICKETS_PATH: { POST: excluded("agent_credentials") },
  AGENT_UPLOAD_TICKET_CONSUME_PATH: { POST: excluded("agent_credentials") },
  ME_OAUTH_GRANTS_PATH: { POST: excluded("agent_credentials") },
  ME_AGENT_CREDENTIALS_PATH: { GET: excluded("agent_credentials"), POST: excluded("agent_credentials") },
  ME_AGENT_CREDENTIAL_RE: { DELETE: excluded("agent_credentials") },
  // ── machines ──
  SEAM_JOIN_REQUEST_PATH: { POST: excluded("machine") },
  SEAM_WORKSPACE_EVENT_PATH: { POST: excluded("machine") },
  SEAM_PROJECT_EVENT_PATH: { POST: excluded("machine") },
  SIGNALS_DUE_PATH: { GET: excluded("machine"), POST: excluded("machine") },
  SIGNALS_OBSERVATION_PATH: { POST: excluded("machine") },
  CAPTURES_DUE_PATH: { GET: excluded("machine"), POST: excluded("machine") },
  CAPTURES_PATH: { POST: excluded("machine") },
  SEARCH_REBUILD_PATH: { POST: excluded("machine") },
  INTEGRITY_SWEEP_PATH: { POST: excluded("machine") },
  INTEGRITY_DISCLOSURE_PATH: { GET: excluded("machine") },
  SNAPSHOT_SWEEP_PATH: { POST: excluded("machine") },
  CATALOGUE_REBUILD_PATH: { POST: excluded("machine") },
  LAUNCH_FIRE_PATH: { POST: excluded("machine") },
  DEFENCE_SWEEP_PATH: { POST: excluded("machine") },
  SWEEP_STATE_PATH: { GET: excluded("machine"), POST: excluded("machine") },
  SWEEP_OUTCOME_PATH: { POST: excluded("machine") },
  BOARD_SWEEP_PATH: { POST: excluded("machine") },
  DIGEST_QUEUE_PATH: { POST: excluded("machine") },
  DIGEST_PENDING_PATH: { GET: excluded("machine") },
  DIGEST_DELIVERED_PATH: { POST: excluded("machine") },
};

/** Every use in the catalogue, flattened — for the parity test and `/docs/mcp`. */
export function catalogueUses(): Array<{ route: string; method: RouteMethod; use: RouteUse }> {
  const out: Array<{ route: string; method: RouteMethod; use: RouteUse }> = [];
  for (const [route, entry] of Object.entries(AGENT_ROUTE_CATALOGUE)) {
    for (const [method, use] of Object.entries(entry) as Array<[RouteMethod, RouteUse]>) out.push({ route, method, use });
  }
  return out;
}
