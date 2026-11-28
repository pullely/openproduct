# openproduct-mcp — implementation plan

One task per milestone, one PR per task, in order. Each PR keeps every
existing test and web-perf lane green; a changed assertion or budget says
why in the status file. From MC2 on, each PR shrinks the parity test's
"not yet" list and never grows it.

## MC1 — connecting an agent (MC-2)

- Migration: `agent_credentials` (design §2.1) and `oauth_clients`
  (registered client id, name, redirect URIs, `registered_at`; no secret,
  public clients only). The subject registry classifies credentials as the
  subject's, so they leave with them.
- Contracts: `AGENT_TOKEN_PREFIX = "opa_"`, the scope vocabulary, TTLs,
  `isAgentToken`.
- Core: mint, resolve, list, revoke; refresh rotation; `last_used_at`
  written at most once a minute.
- Gateway: the two `.well-known` documents, `/oauth/register`,
  `/oauth/authorize` (hands off to the web consent page), `/oauth/token`,
  `/oauth/revoke`; `resolveSubject` learns `opa_`.
- Web: the consent page and Settings → Connected agents (design §6).
- Tests: the whole OAuth round trip with PKCE; a refused `plain` challenge;
  a reused refresh token revoking the family; a revoked credential refused
  after the cache TTL; no `%email%` column (I3 holds).

## MC2 — the signed-in endpoint and the parity guard (MC-3)

- Contracts: the tool registry (design §3.2) replacing `AGENT_TOOLS`'s
  shape; the exclusions table (design §5); a `NOT_YET` list of every write
  route with no tool yet.
- Gateway: `mcp.ts` dispatches from the registry; anonymous vs signed-in
  `tools/list`; 401 with `WWW-Authenticate`; the internal credential header;
  the `agent` bucket; the shared "call the route's own handler" adapter.
- Core: scope check beside `authorize.ts`; `via` in audit entries;
  idempotency keys.
- Tools: the public reads, `whoami`, `list_my_listings`, `get_listing`,
  `list_workspaces`.
- **The parity test** (`tests/gateway/src/mcp-parity.test.ts`): it walks
  the gateway's route table, and every non-GET route must be a registry
  tool's route, an exclusion, or on `NOT_YET`. A route on two of them fails.

## MC3 — listings and their words (MC-4)

- Tools: `create_listing`, `update_listing` (links included), `change_stage`,
  `get_publish_checklist`, `publish_listing`, `unpublish_listing`.
- `create_listing`'s unlinked-workspace refusal carries the console address.
- `publish_listing` requires the disclosure acknowledgement (design §3.7).
- Tests: each tool against the same fixtures as its website route, asserting
  the same core request; a Member's agent refused with the stranger's 404.

## MC4 — images (MC-5)

- Gateway: `/v1/agent-uploads/{ticket}` (PUT), tickets in the rate-limit
  Durable Object's storage or core, single use, 10 minutes; the URL fetch
  with the capture's target refusals and a streaming cap; the inline path
  capped at 1 MB. All three call `handleMediaUpload`.
- Tools: `request_media_upload`, `upload_media`, `add_media_from_url`,
  `list_media`, `update_media`, `remove_media`.
- Tests: a ticket used twice, expired, for another listing, or with more
  bytes than declared; a URL that resolves to a private address; a PNG that
  is secretly HTML (refused exactly as the website refuses it).

## MC5 — posts, milestones, launches (MC-6)

- Tools: the post, milestone and launch rows of design §4.
- `create_post` validates through the same template-only post blocks
  (`product-post-blocks.ts`) and returns the draft's preview address.

## MC6 — seats, crew and the product's discussions (MC-7)

- Tools: openings, the recorded applications, crew roles, private threads, resolve,
  moderation.
- Untrusted wrapping (design §3.6) on every field another person wrote.
- Tests: `set_crew_roles` cannot leave a listing with no Lead; a locked
  Lead stays locked.

## MC7 — the contributor's side (MC-8)

- Tools: the community, notification and profile rows of design §4.
- After this PR the `NOT_YET` list is empty.

## MC8 — documented and connectable (MC-9)

- Web: `/docs/mcp` — connecting, scopes, every tool generated from the
  registry, the limits, the exclusions with their reasons.
- The API changelog records the MCP server's new version.
- A recorded run of Claude's connector against stage: connect, create a
  draft, describe it, upload a logo by ticket, post an update, publish.
- The `NOT_YET` list and its constant are deleted; the parity test then
  allows only tools and exclusions.
