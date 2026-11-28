# openproduct-mcp

| | |
|---|---|
| Epic | `openproduct-mcp` (EP-7) |
| Status | MC0 to MC5 done (#40 to #45); MC6 in review |
| Came from | Owner request on 2026-11-28: "everything should be available as MCP" |
| Design | `design.md`; no board yet (two screens to draw, design §6) |

Everything a person can do on openproduct, an agent can do over MCP on
their behalf: create a listing, write its description, upload its logo,
hero and gallery images, post an update, ship a milestone, open a seat,
manage the crew, comment, follow, save and endorse. The `/mcp` endpoint
stays where it is and stays anonymous for reading; a person who connects
an agent gives it a scoped, revocable credential, and the same endpoint then
offers the tools that credential allows.

One rule holds the epic together: **an MCP tool is a client of the route
the website uses, never a second write path.** Every tool calls core at the
same internal path, through the same authorisation table, rate limits,
moderation, audit and purges as the button it stands for. A parity test
fails the build when a write route exists with neither a tool nor a stated
exclusion, so "everything" stays true after this epic ends.

| Milestone | Task | What lands |
|---|---|---|
| MC0 — the spec | MC-1 | This doc set and the task contracts |
| MC1 — connecting an agent | MC-2 | Agent credentials, OAuth 2.1 for MCP clients, personal tokens, the consent screen and Connected agents in settings |
| MC2 — the signed-in endpoint and the parity guard | MC-3 | `/mcp` reads a bearer; the tool registry, scopes and annotations; your own listings and drafts; the parity test |
| MC3 — listings and their words | MC-4 | Create a listing, edit its details and description, links, category, pricing, hosting, stack; change stage; publish and unpublish |
| MC4 — images | MC-5 | Logo, hero and gallery: upload by ticket, by URL or inline; alt text, order, removal |
| MC5 — posts, milestones, launches | MC-6 | Draft, edit, publish and delete posts of every authored kind; milestones; launches |
| MC6 — seats, crew and the product's discussions | MC-7 | Role openings, the applications the crew can see, crew roles, moderation and resolving |
| MC7 — the contributor's side | MC-8 | Comments, threads, replies, votes, reactions, follows, saves, endorsements, collections, your applications, notifications, your own profile |
| MC8 — documented and connectable | MC-9 | `/docs/mcp`, the tool list in the API changelog, a verified Claude connector, the "not yet" list empty |

The epic is done when the parity test's "not yet" list is empty, every
exclusion left is one design §5 names, and a person can connect Claude to
openproduct.live and list, describe, illustrate and post about a product
without opening the website.
