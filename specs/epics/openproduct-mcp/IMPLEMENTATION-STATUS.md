# openproduct-mcp — implementation status

| Milestone | Task | State | PR |
|---|---|---|---|
| MC0 — the spec | MC-1 | Done | #40 |
| MC1 — connecting an agent | MC-2 | In review | #41 |
| MC2 — the signed-in endpoint and the parity guard | MC-3 | Not started | |
| MC3 — listings and their words | MC-4 | Not started | |
| MC4 — images | MC-5 | Not started | |
| MC5 — posts, milestones, launches | MC-6 | Not started | |
| MC6 — seats, crew and the product's discussions | MC-7 | Not started | |
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
