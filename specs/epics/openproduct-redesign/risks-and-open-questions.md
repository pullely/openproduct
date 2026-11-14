# openproduct-redesign — risks and open questions

## Open questions (each with the default that applies until answered)

**R1. How does Orunbase record a demo?** The design assumes the platform's
agent writes and runs a Playwright script against a product's stage and
hands back a recording over the seam. Whether that capability exists on
the platform today is not known from this repository.
*Default:* OPR4 does not start until the owner confirms the platform side.
OPR1 to OPR3 do not depend on it. If the platform side is not ready when
OPR3 lands, the epic closes at OPR3 and OPR4 moves to its own epic.

**R2. The sections with no board** (topics, stack, pricing, collections,
digest, launches, the people list, the forum index).
*Default:* they stay, restyled, linked from the footer (design §5).
Retiring any of them is the owner's call and a separate change.

**R3. Dark theme.** The boards are light only.
*Default:* keep the theme switch and derive a dark ramp in OPR1. If the
owner prefers light only, OPR1 removes the switch and its guards instead;
that is less work, not more.

**R4. The product upvote.** Today a product has an upvote
(`endorsements`); the design has "I'd use this" on ideas and reactions on
posts.
*Default:* the existing upvote is shown as "I'd use this" on a product
and keeps its data. Post reactions are new and separate.

**R5. Who is "the crew" for a private thread?**
*Default:* confirmed `product_people` and `listing_maintainers` of the
product. Pending and retired members are not crew.

## Risks

**K1. The guards.** About a hundred source-reading suites and 32 layout
snapshots pin today's surface. *Mitigation:* design §9: each is rewritten
to hold the new design in the same pull request that changes what it
pins; none is deleted or skipped to get green.

**K2. Budgets.** Three font families and richer cards can pass the wire
budget (276 KB, 30 requests, no third-party host) or a route's JS budget.
*Mitigation:* fonts are subset to Latin and self-hosted; the search card,
the builder and the maker overlay load on demand; any budget that still
has to move is amended in its decision file with the measurement.

**K3. A private thread leaks.** One unfiltered read is a disclosure.
*Mitigation:* design §7: the filter is in the repository, private threads
never enter the search index, and one test enumerates every read that
returns threads or posts.

**K4. Personal content in a cached page.** The maker view, "Needs you"
and private threads must never reach the edge cache. *Mitigation:* design
§4: they are fetched after load with `no-store` from signed-in routes;
a test asserts the public HTML of a product page is identical with and
without a session.

**K5. Milestone size.** OPR1 and OPR2 are each a large pull request.
*Mitigation:* the plan's rule is one pull request per milestone because a
reviewer reads the feature in one diff; the pull request body lists the
pages in the order to read them, and the stage deploy is the review.

**K6. Makers lose the studio mid-epic.** *Mitigation:* the studio keeps
working until OPR2 lands the same jobs on the product page; its addresses
redirect only then.

**K7. Sample content on the boards.** The boards use real product names
and bracketed placeholders. *Mitigation:* bracketed text is never copied
into the product; a page shows what the data holds or its empty state.
