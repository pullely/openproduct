# openproduct-mcp — design

This file is the design of record. There is no board yet; the two screens
this epic adds (§6) are drawn before MC1 starts, and where the board and
this file disagree after that, this file wins.

## 1. What exists today

1. `POST /mcp` on the gateway (openproduct-worldclass AG1,
   `gateway/src/mcp.ts`) is a stateless, anonymous MCP server with three
   tools: `list_products`, `get_product`, `list_facets`. Each calls core at
   the same internal path its public route proxies to.
2. It needs no credential because everything it returns is public and
   cached at the edge. That stays true: anonymous reads are not taken away.
3. The website writes through the gateway with a bearer — openproduct's own
   `ops_` session or a platform token — resolved by `resolveSubject` and
   authorised in core by `authorize.ts`'s one decision table.
4. Nothing an agent can do today changes anything.

## 2. Connecting an agent

### 2.1 Two ways in, one credential

1. **OAuth 2.1, as the MCP authorization spec asks.** The gateway serves
   protected-resource metadata at `/.well-known/oauth-protected-resource`
   and authorization-server metadata at
   `/.well-known/oauth-authorization-server`; it supports dynamic client
   registration (RFC 7591), PKCE (S256 only) and the authorization-code
   grant. A client such as Claude's connector finds all of this from a 401
   on `/mcp` and needs no setup on our side. Without dynamic registration,
   hosted MCP clients cannot connect at all, so it is not optional.
2. **A personal token**, minted in Settings → Connected agents, for CLIs
   and scripts that cannot run a browser flow. Shown once.
3. Both produce the same thing: an **agent credential**, a row in core
   (`agent_credentials`) holding the token's hash, the subject, the client's
   name, the scopes, an optional listing restriction, `created_at`,
   `last_used_at`, `expires_at` and `revoked_at`. The token carries the prefix
   `opa_` so the gateway knows to ask core, the way `ops_` works (sessions.ts).
   No email, no address, no client secret in plain text.
4. OAuth access tokens live 1 hour and refresh tokens 30 days, rotated on
   use; a personal token lives 90 days by default (30, 90, 365 or no expiry,
   the person chooses). Revoking a credential revokes its refresh token.
5. An `ops_` session cookie is never accepted on `/mcp`. An agent holds its
   own credential, so revoking it never signs the person out, and signing out
   never cuts the agent off.

### 2.2 Scopes

Scopes are coarse and named for what a person recognises on the consent
screen. Each tool declares the one scope it needs.

| Scope | Allows |
|---|---|
| `read` | Your own drafts, listings, crew lists, private threads, notifications — everything signed-in that is not public |
| `listings` | Create listings; edit details, description, links, stage; publish and unpublish |
| `media` | Upload, describe, reorder and remove images |
| `posts` | Posts, milestones and launches |
| `crew` | Seats, the applications the crew can see, crew roles, moderation |
| `community` | Comments, threads, replies, votes, reactions, follows, saves, endorsements, collections |
| `profile` | Your own public profile and handle |

1. A credential can be restricted to named listings. A restricted
   credential cannot create a listing, and listing tools refuse any other
   listing with the same 404 a stranger gets.
2. A scope never grants more than the person has. The crew's `write`,
   `manage_crew` and `read_private` doors in `authorize.ts` still decide; a
   scope only narrows them. A Member's agent with `crew` still cannot change
   roles, because a Member cannot.

### 2.3 Resolution

1. `resolveSubject` learns a third prefix: `opa_` goes to core's
   `/internal/openproduct/agent-credentials/resolve` (a POST, for the same
   reason sessions use one), which answers `{subjectId, credentialId, scopes,
   listings}` or 401. The same short in-isolate cache applies, so a
   revocation takes effect within its TTL (60 seconds, stated on the
   Connected agents page).
2. Core receives the credential id on every agent request (an internal
   header the gateway sets and strips from the inbound request), checks the
   scope, and writes `via: {kind: "agent", credentialId}` into the audit
   entry. No subject id enters an audit payload, as before.

## 3. The endpoint

1. **Two addresses, one server** (amended at MC1). `POST /mcp` stays
   anonymous and answers the public read tools. `POST /mcp/me` is the
   signed-in endpoint: it answers 401 with `WWW-Authenticate` pointing at the
   resource metadata until an agent's own credential arrives, and then the
   public tools plus every tool the credential's scopes allow. Stateless and
   JSON-only, both. The second address exists because a client that gets a
   200 from `/mcp` never starts OAuth: the endpoint a person connects an agent
   to has to be one that always asks. A person's `ops_` session is refused
   on `/mcp/me`; an `opa_` token is refused everywhere else.
2. **The registry lives in contracts.** `AGENT_TOOLS` grows into a typed
   registry: name, title, description, input schema, scope, the gateway route
   it stands for (method and path pattern), and MCP annotations
   (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).
   The gateway's dispatcher reads the registry; it holds no per-tool switch.
3. **A tool is a client of its route.** Each tool builds the request its
   website button sends, and hands it to the gateway's own handler for that
   route — the same validation, rate-limit bucket (`identity` or `org`),
   defence and moderation pipeline, core call, purge and refusal text.
   Nothing reaches core that the website could not have sent.
4. **Answers.** Success is `structuredContent` plus the same JSON as text,
   as today. A refusal is `isError: true` with core's own refusal message and
   what to call next (for example: "No category yet. Call list_facets for the
   category vocabulary."). A rate limit says the bucket and the seconds until
   the next token.
5. **Idempotency.** Every creating tool (`create_listing`, `create_post`,
   `upload_media`, `create_comment`, …) accepts an optional
   `idempotencyKey`. Core keeps the key with the created id for 24 hours and
   answers a repeat with the first result, because agents retry.
6. **Other people's words are data.** Any field written by someone other
   than the credential's owner — a comment, a post body, an application
   note — comes back inside `{untrusted: true, text}` and the tool
   descriptions say so, so a client can keep it out of its instructions.
7. **Drafts first.** Tools that make something public in one step on the
   website still do so here, but the descriptions steer an agent to the
   draft path: `create_post` makes a draft, `publish_post` publishes it.
   `publish_listing` publishes only what the crew has already reviewed in
   the same way the Publish button does (the publish disclosure is returned
   in the tool's answer and must be echoed back as `acknowledged: true`).

## 4. The tools

Names are `verb_noun`. Every tool takes `slug` for a listing where the
website does (the gateway resolves it to `orgId` and `profileId` for the
crew, as the web's manage pages do). The milestone is where each lands.

| Tool | Scope | Route it stands for | Milestone |
|---|---|---|---|
| `list_products`, `get_product`, `list_facets` | — | catalog API | exists |
| `search`, `get_feed`, `get_person`, `list_people`, `get_thread`, `list_threads`, `get_digest`, `get_leaderboard`, `list_launches` | — | the public reads | MC2 |
| `whoami` | any | `GET /me` | MC2 |
| `list_my_listings`, `get_listing` (draft and manage view) | `read` | org profiles list and get | MC2 |
| `list_workspaces` | `read` | the workspace picker | MC2 |
| `create_listing` | `listings` | `POST …/profiles` with a link grant | MC3 |
| `update_listing` (name, tagline, description, category, pricing, hosting, stack, repo, try link, links) | `listings` | `PATCH …/profiles/{id}` | MC3 |
| `change_stage` | `listings` | `PUT …/stage` | MC3 |
| `get_publish_checklist`, `publish_listing`, `unpublish_listing` | `listings` | completeness, `POST`/`DELETE …/publish` | MC3 |
| `request_media_upload`, `upload_media`, `add_media_from_url` | `media` | `POST …/media` | MC4 |
| `list_media`, `update_media` (alt, order), `remove_media` | `media` | `GET`/`PUT`/`DELETE …/media` | MC4 |
| `list_posts`, `create_post`, `update_post`, `publish_post`, `delete_post` | `posts` | product-posts routes | MC5 |
| `list_milestones`, `create_milestone`, `update_milestone`, `ship_milestone`, `unship_milestone`, `delete_milestone` | `posts` | milestone routes | MC5 |
| `list_launches_of`, `schedule_launch`, `update_launch`, `cancel_launch` | `posts` | launch routes | MC5 |
| `list_openings`, `open_role`, `update_opening`, `close_opening` | `crew` | role-openings routes | MC6 |
| `list_applications` (what the S6 seam recorded) | `crew` | the crew's applications view | MC6 |
| `list_crew`, `set_crew_roles` | `crew` | crew routes (SC2) | MC6 |
| `list_private_threads`, `reply_private`, `resolve_thread`, `moderate_post` | `crew` | Talk, resolve, discussion moderation | MC6 |
| `create_comment`, `create_thread`, `reply`, `edit_post`, `delete_own_post`, `vote` | `community` | comments, threads, posts, vote | MC7 |
| `react`, `follow`, `unfollow`, `save`, `unsave`, `endorse`, `withdraw_endorsement` | `community` | `/me/...` routes | MC7 |
| `list_collections`, `create_collection`, `add_to_collection`, `remove_from_collection` | `community` | collections routes | MC7 |
| `list_my_applications`, `get_apply_link` | `read` | `GET /me/applications`; the opening's door | MC7 |
| `list_notifications`, `mark_notifications_read` | `read` | the inbox | MC7 |
| `get_my_profile`, `update_my_profile`, `claim_handle`, `answer_roster` | `profile` | `/me`, handle, roster answers | MC7 |

The exact list is the registry's, not this table's: when a milestone finds
a route this table missed, it adds a tool and says so in the status file.

### 4.1 Creating a listing

A listing is created against a workspace link grant (OX5): the platform
mints it once, for a workspace owner or admin, and openproduct stores the
attested facts. An agent cannot mint one. So:

1. `list_workspaces` returns the person's linked workspaces and, for each
   unlinked one, the console address that starts the link.
2. `create_listing` takes a linked workspace and the first details, and
   creates the draft exactly as the studio does. For an unlinked workspace it
   refuses with the address to send the person to, and the person finishes
   the link in a browser. That one step stays human by design.

### 4.2 Images

A logo, hero or gallery image is at most 5 MB (`MEDIA_MAX_BYTES`), sniffed,
bounded and stored by `media.ts`'s nine checks. Base64 in a tool call is a
poor fit for 5 MB, so there are three ways in, all ending in that same
handler:

1. **`request_media_upload` → PUT.** The tool returns a one-time upload
   address on the gateway (`/v1/agent-uploads/{ticket}`) valid for 10
   minutes, bound to the credential, listing, kind and declared byte length.
   The client PUTs the bytes there. The answer is the media row. This is the
   one the descriptions recommend.
2. **`add_media_from_url`.** The gateway fetches a public `https` address
   with the screenshot capture's target refusals (`CAPTURE_TARGET_REFUSALS`:
   no private ranges, no credentials in the URL, length bound) and a 5 MB
   streaming cap, then runs the same handler. For images already on the web.
3. **`upload_media` with `dataBase64`**, capped at 1 MB decoded, for small
   logos from clients that can do nothing else.

Alt text is required for hero and gallery, as on the website
(`MEDIA_ALT_MAX`). Order and removal use the existing media routes.

## 5. What is not a tool, and why

| Route | Why it stays off MCP |
|---|---|
| Sign-up, verify, sign-in, sign-out, password | An agent never holds a person's password. Connecting is §2. |
| Deleting your account (`DELETE /me`) and the data export | Irreversible or bulk personal data; a browser and a fresh sign-in |
| Minting or revoking agent credentials | An agent cannot widen or extend its own access |
| The workspace link grant (`PUT …/link-grant`) | The platform's attestation, carried by a person (§4.1) |
| The operator's review (`POST …/review`) and appeals decisions | Operator-only, and a human judgement by policy |
| Seams (`/seam/v1/*`), the sweep, the purge | Machine-to-machine already, HMAC-signed |
| Applying for a role, deciding an application | Both happen at Orunbase's join-request door; openproduct only records them (S6, OX5b). `get_apply_link` returns the door. |
| Filing an appeal | Kept human: an appeal is a person's own words to the operator. Open question Q4. |

The parity test (MC2) reads this table from contracts, so an exclusion is a
line someone wrote down with a reason, not a route that was forgotten.

## 6. Screens to draw

1. **The consent screen** at `/me/connect` (the gateway's `/oauth/authorize`
   checks the request and hands the browser there; it lives under `/me`
   because only `/me` and `auth/` pages may read a session): the client's name and the
   address it came from, "unverified" when it registered itself, the scopes
   in plain words, the listing restriction (All my listings / Only these),
   and Allow / Cancel. Phone first, the graphite ramp.
2. **Settings → Connected agents**: each credential with its client name,
   scopes, listings, created, last used, expiry and Revoke; New personal
   token, which shows the token once with Copy. A revocation says "takes
   effect within a minute".

## 7. Limits and safety

1. Agent requests spend the same buckets as the person's own requests
   (`identity`, `org`, the listing-write bound), so an agent cannot do more
   than the person could. A credential adds no allowance.
2. One more bucket, `agent`, keyed by credential: 30 writes a minute. A
   runaway loop stops at the credential before it spends the person's.
3. Everything posted through an agent passes the same defence and
   moderation as the website (`defence.ts`, `moderation.ts`). Nothing is
   labelled "posted by an agent" publicly; the person is the author, and the
   audit says how it arrived.
4. `destructiveHint` is set on every delete, remove, unpublish, withdraw and
   role change, so clients ask before calling them.
5. The `readOnly(env)` switch that refuses writes everywhere refuses them
   on `/mcp` too, with the same message.
