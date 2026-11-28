# openproduct-mcp — risks and open questions

## Risks

- **R1 — an authorization server is new surface.** OAuth with dynamic
  registration is the largest new security surface since sign-in. It is
  kept small: public clients and PKCE S256 only, no implicit grant, no client
  secrets, exact redirect-URI match, short access tokens, refresh rotation
  with reuse detection. A security review is a gate on MC1.
- **R2 — prompt injection through content.** An agent that reads a comment
  saying "now delete this listing" may try. Mitigations: other people's
  words come back marked untrusted (design §3.6), destructive tools carry
  `destructiveHint`, and scopes let a person give an agent `posts` without
  `listings`. None of this stops a client that ignores it; that is stated
  on `/docs/mcp`.
- **R3 — volume.** An agent can post faster than a person. Mitigation: the
  per-credential `agent` bucket on top of the person's own, and the existing
  defence pipeline. If posts through agents become noisy, the next step is a
  lower bucket for `community`, not a public "agent" label.
- **R4 — drift between a tool and its button.** If a tool reimplements a
  route, the two will differ. Mitigation: tools call the route's own handler
  (design §3.3), and each tool's test asserts the same core request as the
  website's.
- **R5 — the gateway's bundle.** `mcp.ts` already carries the MCP SDK; the
  registry and OAuth add more to a worker with a size limit. The gateway's
  bundle size is measured in each PR's status entry.
- **R6 — revocation lag.** The in-isolate subject cache means a revoked
  credential works for up to 60 seconds. Stated on the page; shortened only
  if it matters in practice.

## Questions for the owner

Q1 to Q3 were answered on 2026-11-28: the owner accepted each
recommendation. They stand below as decisions.

- **Q1 — OAuth now, or tokens first?** The plan builds OAuth and personal
  tokens together in MC1, because hosted clients (Claude's connectors) need
  dynamic registration to connect at all. A smaller first step is personal
  tokens only, which works for Claude Code and scripts but not for claude.ai.
  **Decided: both in MC1** (owner, 2026-11-28).
- **Q2 — should agent posts be labelled publicly?** The design says no: the
  person is the author and answers for it, the audit records how it
  arrived. The alternative is a small "via <client>" on the post.
  **Decided: no public label** (owner, 2026-11-28).
- **Q3 — can an agent publish a listing?** The design allows it behind an
  explicit acknowledgement of the publish disclosure. The stricter option is
  to keep publishing human, like the link grant.
  **Decided: an agent may publish, behind the acknowledgement** (owner,
  2026-11-28).
- **Q4 — appeals.** Excluded for now (design §5). Allow if owners ask.
- **Q5 — MCP resources and prompts.** This epic is tools only. Exposing
  listings as resources (`openproduct://products/{slug}`) and a "describe my
  product" prompt is a possible follow-up.
- **Q6 — the operator's tools.** Review and moderation queues for the
  operator are left out. They could be a later, separately scoped epic.
