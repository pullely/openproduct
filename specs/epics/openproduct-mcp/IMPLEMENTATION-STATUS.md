# openproduct-mcp — implementation status

| Milestone | Task | State | PR |
|---|---|---|---|
| MC0 — the spec | MC-1 | Done | #40 |
| MC1 — connecting an agent | MC-2 | Done | #41 |
| MC2 — the signed-in endpoint and the parity guard | MC-3 | Done | #42 |
| MC3 — listings and their words | MC-4 | Done | #43 |
| MC4 — images | MC-5 | Done | #44 |
| MC5 — posts, milestones, launches | MC-6 | Done | #45 |
| MC6 — seats, crew and the product's discussions | MC-7 | In review | this PR |
| MC7 — the contributor's side | MC-8 | Not started | |
| MC8 — documented and connectable | MC-9 | Not started | |

The owner accepted the spec on 2026-11-28 and took the recommendation on
Q1 to Q3. The two screens in design §6 had no board when MC1 started; MC1
builds them from design §6 in the left-rail epic's graphite frame, and the
status entry says so. Console only: create EP-7 and its tasks in Orunbase.

## From MC1

What landed:

- **Agent credentials** (migrations 2305, 2306): `oauth_clients` (public
  clients only, no secrets), `oauth_codes` (by hash, ten minutes, single
  use, scoped to their client) and `agent_credentials` (the `opa_` access
  token and the `opr_` refresh token by SHA-256 only, scopes, an optional
  listing restriction, `last_used_at` at most once a minute, revoked by
  timestamp). `agent_refresh_history` keeps every refresh hash a rotation
  replaced. The subject registry classifies the credential and code rows as
  the person's own: deleted with them, never exported.
- **The OAuth door** on the gateway (`gateway/src/oauth.ts`), with core
  deciding (`core/src/handlers/agent-credentials.ts`): RFC 9728 and 8414
  discovery, RFC 7591 registration, the authorization endpoint (checks the
  client, its redirect, PKCE S256, the scope and the resource indicator,
  then hands the browser to the consent page), the token endpoint (code +
  PKCE; refresh with rotation) and RFC 7009 revocation. Registration and the
  token endpoint are rate-limited; open CORS on these paths only, since none
  reads a cookie.
- **`/mcp/me`**: answers 401 with `WWW-Authenticate` until an agent's own
  credential arrives; refuses a person's `ops_` session. An `opa_` token is
  refused on every other route before it can reach anything. In MC1 it
  serves the same read tools as `/mcp`; MC2 adds the signed-in ones.
- **The website**: the consent screen at `/me/connect` and Settings →
  Connected agents at `/me/settings/agents` (list, Revoke, New personal
  token). A new token is shown once, from a one-minute cookie on that page's
  path that the page clears once it is on screen; never from a URL.

Departures from the design, said plainly:

- **Two endpoints, not one** (design §3.1, amended): an MCP client that gets
  a 200 from the anonymous `/mcp` never starts OAuth.
- **The consent screen is `/me/connect`** (design §6.1, amended): only
  `/me` and `auth/` pages may read a session.
- **No board**: the two screens were built from design §6 in the left-rail
  epic's graphite frame.
- **Idempotency keys move to MC3**, the first milestone with a creating tool.

Security review (an independent reviewer read the whole change; findings
and what was done):

- *Medium — refresh reuse could be bypassed* by a thief who refreshed twice
  before the real client: only the last replaced hash was remembered. Fixed:
  every replaced hash is kept (2306) and any of them returning revokes the
  credential. Tested in the pg suite.
- *Medium — open redirect from the API origin*: a self-registered client
  could get a 302 to its own address from `/oauth/authorize` with a bad
  parameter. Fixed: every refusal there is a page; only the person's Allow or
  Cancel redirects.
- *Medium/Low — registration growth*: an IPv6 host could spread across
  per-address buckets, and nothing pruned. Fixed: registration is keyed by
  /64 and also bounded for everybody together (500 an hour), and each
  registration prunes expired codes and clients that never connected anyone.
- *Low/Medium — clickjacking*: no page sent frame headers. Fixed:
  `/me/connect` and `/me/settings/agents` send `X-Frame-Options: DENY` and
  `frame-ancestors 'none'`.
- *Low — code replay*: fixed; a code presented again revokes the credential
  it produced, and another client cannot spoil someone's code.
- *Low — text injection on the consent page*: fixed; both pages show fixed
  sentences chosen by a code.
- *Low — "shown once" was a minute*: fixed as above.
- *Low — conformance*: a rate-limited request is now a 429; an empty
  `state` is echoed. The agent cache is bounded (1,000 entries).
- *Accepted*: a client that retries a refresh with the same token loses its
  grant (the safe side of reuse detection); `localhost` is allowed as a
  loopback host beside the IP literals, because common MCP clients register
  it; scopes are not yet enforced on `/mcp/me` because it serves only
  public read tools until MC2, which must enforce them before any other tool
  lands.

Known follow-ups:

- Nothing sweeps expired sessions or credentials on a schedule (sessions
  never had one either); MC1 prunes on registration only.
- Signing out everywhere or a password reset leaves agents connected; they
  are revoked one by one, or all at once by deleting the account.

## From MC2

What landed:

- **The registry** (`packages/contracts/src/agent-tools.ts`): every
  signed-in tool once — name, words, input schema, the scope it needs
  (`null` public, `"any"`, or a scope) and its MCP annotations. `/mcp/me`
  lists the catalogue tools, the public reads and whatever the credential's
  scopes allow; a call to a tool outside them is refused in words that say
  which scope is missing.
- **Tools that are clients of their routes** (`gateway/src/agent-tools.ts`):
  a public read is a GET of the public route through `route()`; anything of
  the person's goes through `handleAuthenticated` — the website's own path —
  with the person already resolved from the credential (`AgentActor`), so
  rate limits, velocity, core's authorisation, refusals and purges are the
  website's. The request to core carries `x-actor-agent-credential`, built
  fresh like every `x-actor-*`, never copied from the client.
- **The listing restriction** holds at the one door every crew route goes
  through: a `/v1/organizations/…/profiles/{id}` path outside it is the
  stranger's 404, and `list_my_listings` lists only what the connection may
  touch.
- **The agent's own bucket**: `agentWrite`, 30 writes a minute per
  credential, on top of the person's buckets.
- **Tools**: `search`, `get_feed`, `list_people`, `get_person`,
  `list_threads`, `get_thread`, `get_digest`, `get_leaderboard`,
  `list_launches`, `whoami`, `list_my_listings`, `get_listing`. Answers
  that carry other people's words come wrapped with a note saying they are
  data (design §3.6).
- **The parity guard** (`packages/contracts/src/agent-parity.ts`,
  `tests/core/src/agent-parity.test.ts`): every internal route constant in
  `core/src/router.ts` is catalogued, method by method, as a tool, an
  exclusion with its reason, or the milestone that brings it. 76 uses are
  "not yet"; the test holds that number from rising.

Departures from the design, said plainly:

- **The parity guard reads core's router, not the gateway's.** The gateway
  routes by pattern and has no table to walk; core's router declares one
  constant per route, and every gateway write lands on one of them.
- **Scopes are enforced at the gateway**, from the registry, before any
  call; core receives the credential id. Core's own authorisation table
  still decides what the person may do, so a scope can only narrow it.
- **The public reads are on `/mcp/me` only.** `/mcp` keeps exactly the
  three catalogue tools it has served since AG1.
- **`list_workspaces` moves to MC3** beside `create_listing`, the one tool
  that needs it. **Idempotency keys and `via` in audit entries** move to
  MC3 too, with the first writes.

## From MC3

What landed:

- **Tools**: `list_workspaces`, `create_listing`, `update_listing` (tagline,
  description, install line, repository, try and live addresses, links,
  stack, category, hosting, pricing, slug), `change_stage`,
  `get_publish_checklist`, `publish_listing`, `unpublish_listing`,
  `get_listing_sync`. Each sends exactly the request the website's own
  control sends, to the same route, with only the fields named.
- **Creating needs the workspace's link grant**, as on the website. Without
  one, `create_listing` says where the person links a workspace; an agent
  limited to named listings cannot create one at all.
- **Publishing asks the person first**: `publish_listing` is refused unless
  `acknowledged: true`, and its refusal sends the agent to
  `get_publish_checklist`, which says in plain words what becomes public
  (owner decision Q3).
- **Idempotency keys** (migration 2310, `agent_idempotency`): a creating
  call may carry one; the first 2xx answer is kept for a day under
  (credential, key), and the same key gets it back without a second write
  or a rate-limit token. A key kept for a different call is a 409. The
  check sits inside the one door every agent write goes through
  (`asPerson`), so every creating tool from here on has it.
- **`via` in the audit**: core's request scope learns the credential from
  the gateway's `x-actor-agent-credential`, and `repoFor` stamps
  `payload.via = {kind: "agent", credentialId}` into every audit entry the
  request writes (`withVia`), so no handler can forget.

Departures from the design, said plainly:

- **The publish checklist names the public keys and says them in one
  paragraph**, rather than the website's line-by-line disclosure, which
  lives in the web app and is not importable by the gateway.

## From MC4

What landed:

- **Three ways in, one handler.** Every image an agent adds ends in the
  website's own `handleMediaUpload` — the length ceiling, the sniff, the
  dimension rules, the content-addressed store, core's row and its
  authorisation — as the agent's person, carrying the credential so the
  audit entry says how it arrived.
  - `request_media_upload` (the recommended way): a one-time address on the
    gateway (`PUT /v1/agent-uploads/{ticket}`), valid ten minutes, bound to
    the credential, listing, kind, alt text and exact byte length
    (migration 2315, `agent_upload_tickets`, by hash). The ticket is the
    authority for that one PUT, so no bearer is read; a Content-Length other
    than the declared one is refused before the body is read; a used,
    expired or unknown ticket, or one whose credential was revoked, is the
    same 404.
  - `upload_media`: base64 inline, at most 1 MB decoded.
  - `add_media_from_url`: a public https image, checked by the screenshot
    sweep's own `captureTarget` (no IP literal, port, credentials or private
    name); every redirect (at most three) is checked again; the body is read
    with a hard 5 MB cap.
- **Describing, ordering, removing**: `list_media`, `update_media` (alt
  text), `reorder_gallery`, `remove_media`, on the website's media item and
  gallery routes.
- The one-time upload address answers any origin (CORS), like the OAuth
  door: it reads no cookie.

Departures from the design, said plainly:

- **Tickets live in core** (a table), not in the rate-limit Durable Object:
  single use needs one atomic statement, and core already has the
  credential to check against.

Second security review (an independent reviewer read MC2 to MC7 as built;
nothing high; what it found and what was done, in this PR):

- *Medium — every agent's public reads shared one bucket*: the inner
  request carried no address, so all of them were "unknown". Fixed: each
  credential's public reads have a bucket of their own.
- *Medium — an agent could spend its person's website budget*: requests made
  as the person spent the person's own `identity` bucket. Fixed: an agent's
  requests spend an `identity` bucket keyed by its credential, beside its
  `agentWrite` bucket, so a busy agent never locks its person out; the
  listing lookup a crew tool makes is read once per MCP request.
- *Medium — `add_media_from_url` fetched without a limit*: failing fetches
  spent nothing. Fixed: every fetch spends a write first; one deadline
  covers every hop; a non-image answer is refused before its body is read.
  Its safety from private addresses is `captureTarget`'s names-only rule
  plus the Workers runtime, which cannot reach private networks; that is
  stated where the fetch happens.
- *Low* — minting an upload ticket spends a write; the anonymous ticket PUT
  is bounded per address before it can cost core a statement; every read
  that carries words other people wrote (a listing, its images, its sync
  state, and later posts, milestones, launches and the person's own lists)
  comes back marked as data.
- *Accepted*: two concurrent calls with one new idempotency key can both
  write (no reservation row); an upload ticket is a bearer address for its
  ten minutes; core's ticket endpoints trust the gateway for the scope and
  the restriction, as every internal route trusts the binding.

## From MC5

What landed:

- **Posts**: `describe_post_kinds` (the four authored kinds and each kind's
  block catalogue, from `POST_BLOCK_CATALOGUE`, so an agent writes only what
  the template-only builder accepts), `list_posts`, `create_post` (a draft),
  `update_post`, `publish_post` (optionally naming the milestone it ships or
  the role opening it is for), `delete_post`.
- **Milestones**: `list_milestones`, `create_milestone`, `update_milestone`,
  `reorder_milestones`, `ship_milestone` (shipped true or false — the
  website's PUT and DELETE), `delete_milestone`.
- **Launches**: `list_listing_launches` (with the eligibility the website's
  form reads), `schedule_launch`, `reschedule_launch`, `cancel_launch`.
- `get_needs_you`: what the crew has to do next.
- Creating tools take an `idempotencyKey`; destructive ones carry
  `destructiveHint`. Each tool is pinned by a test to the exact route,
  method and body the website sends.

Departures from the design, said plainly:

- **`create_post` does not return a preview address**: the draft itself is
  the answer, and `list_posts` reads it back. The builder's address needs the
  website's origin and the draft's kind, and adds nothing an agent can act on.

## From MC6

What landed:

- **Seats**: `open_role`, `update_role` (words, order, open or filled),
  `close_role`.
- **Crew**: `list_crew` (search, role filter, 30 a page), `set_crew_roles`
  (a Lead's act: core's one guarded statement still refuses leaving no Lead
  or moving a locked Lead, row by row), `set_public_crew` (who the page
  credits), `name_on_roster`, `remove_from_roster`.
- **The product's discussions**: `list_listing_threads`,
  `list_private_threads`, `get_private_thread`, `reply_private`,
  `resolve_thread`, `moderate_thread` (lock, unlock, answer).
- Every answer that carries other people's words — the crew list and every
  thread read — comes wrapped with the note that it is data.

Departures from the design, said plainly:

- **No `list_applications` tool**: there is no crew-side applications route
  to stand for. Applications arrive from Orunbase's join door through the
  S6 seam and show on the listing (`get_listing`'s openings), which is where
  an agent reads them.
- **Thread tools are refused to a connection limited to named listings.** A
  thread is addressed by its id alone and does not say which listing it is
  on, so the restriction cannot be checked; it is not assumed.
