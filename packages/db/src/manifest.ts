// openproduct's OWN migration manifest (openproduct-independence OX5c).
//
// THE SAME LADDER, MOVED WHOLE. Every entry below is byte-identical to its
// platform twin — same id, same SQL file, same checksum — so the new
// database replays exactly the history the platform database holds, and the
// OX-E freeze-copy-verify cutover copies rows into tables that are provably
// the same shape. A drift guard (repository-pg.test.ts) compares these
// checksums against the platform manifest's openproduct-context entries for
// as long as both manifests exist; the platform half retires at cutover
// (teardown row 10).
//
// The control baseline comes along because the runner needs its tracking
// schema (_migrations.applied) in THIS database too.

import type { MigrationManifest } from "./runner/types.js";

export const manifest: MigrationManifest = {
  version: 1,
  migrations: [
    {
      id: "000_control_baseline",
      context: "control",
      path: "000_control/up.sql",
      checksum:
        "2a5d7f30684c99e3ff441ca8a2c38038dedd1bab4db4a40e92cd36bb22be297f",
      description:
        "Baseline control migration — creates the migration tracking schema",
    },
    {
      id: "1160_openproduct_profiles",
      context: "openproduct",
      path: "1160_openproduct_profiles/up.sql",
      checksum:
        "1ecba66b2d5375633866ac07055a2c11b014ebb7bb4083d1f74a76191f973701",
      description:
        "OD0 \u2014 the public plane's entire data footprint (saas-openproduct): a dedicated `openproduct` schema with profiles, role_openings and published_maintainers. One schema because it is both the bounded-context line and the teardown unit \u2014 teardown.md row 10 is one DROP SCHEMA openproduct CASCADE, the shape 1150_work_teardown_v2 proved. No cross-schema foreign keys: org_id, project_id and join_link_ref are opaque, so nothing points into membership.* or projects.* and the schema drops in one statement. profiles.visibility defaults 'private' and a CHECK forbids a public row without reviewed_at (the admin review that is both the curation gate and the v1 moderation lever); repo_visibility/repo_licence/repo_checked_at record what the GitHub App observed at publish time on the AUTHENTICATED path, because the platform creates product repos private (integrations-worker repo-create.ts) and OD does not change that. Maintainers are an explicit publication list keyed by subject_id \u2014 never derived from membership.members, never carrying an email. Dormant on arrival: nothing routes here until OD1 ships the worker.",
    },
    {
      id: "1170_openproduct_maintainer_names",
      context: "openproduct",
      path: "1170_openproduct_maintainer_names/up.sql",
      checksum:
        "0f6d971288d11145be58c54daa3d59d806ae9cb560fa17d6efe9289b4319c12c",
      description:
        "OD3 \u2014 openproduct.published_maintainers.display_name: a MAINTAINER-AUTHORED name, the same trust class as role_label, not a platform identity claim. Supersedes design.md \u00a72.3's read-time resolution, which cannot be built without breaking the epic's central property: names live in identity.users, PP composes them in api-edge under the caller's own organization.member.list, and the public read has no caller \u2014 so serving them would mean giving openproduct-worker a subject-id-to-name capability, i.e. a way to deanonymize an arbitrary subject id from the isolate that serves the public plane. subject_id remains the key; no email, ever. Additive and idempotent.",
    },
    {
      id: "1250_openproduct_home",
      context: "openproduct",
      path: "1250_openproduct_home/up.sql",
      checksum:
        "d37c564f0a47e576341c8053b961d28528867241f5dd7e00663c5e62ec390b0d",
      description:
        "OH0 (openproduct-home) \u2014 the contributor's side of the public plane: openproduct.contributors (authored name and bio, subject_id keyed \u2014 the identity scope's one read is the whole identity surface; no email, ever, the OD2a boundary rule), openproduct.applications (the contributor's VIEW of a JR request \u2014 a projection, not a second state machine: JR owns the lifecycle, status is a cached snapshot keyed by the request's public id, and when they disagree JR is right; role_opening_id carries no FK so history survives opening churn), and openproduct.saved_products (bookmarks, private to the subject \u2014 no public count exists to drift). All three live in the EXISTING openproduct schema so teardown.md row 10 \u2014 DROP SCHEMA openproduct CASCADE \u2014 covers them with no amendment. Dormant: nothing routes here until OH1/OH2. Additive, idempotent.",
    },
    {
      id: "1260_openproduct_components",
      context: "openproduct",
      path: "1260_openproduct_components/up.sql",
      checksum:
        "8e340f2ebfca81acf7aec8c1c751e5d62d2fc5d2619bf8fa42f3c729ebd9b90d",
      description:
        "OH4 (openproduct-home) \u2014 components JSONB on openproduct.profiles: the first deliberate widening of OD's projection. A curated snapshot COPIED at publish time from what the maintainer selected \u2014 not a binding (state-worker stays forbidden), not a live view (the page renders the publish timestamp beside it), not a default (null = nothing chosen, and the OD6 disclosure dialog is where the choosing happens). Re-publish rewrites it wholesale. Additive, idempotent.",
    },
    {
      id: "1290_openproduct_listing_maintainers",
      context: "openproduct",
      path: "1290_openproduct_listing_maintainers/up.sql",
      checksum:
        "74d4726b149d60b204830c351c15d11396757ee2382ddf3afdc497fe91250d76",
      description:
        "OX4 (openproduct-independence) \u2014 the authority handover's data half: openproduct.listing_maintainers, the subject-keyed AUTHORIZATION list (role owner|maintainer, CHECK-pinned) that replaces the platform policy engine's project.openproduct.* actions as the answer to who may act on a listing. Deliberately distinct from published_maintainers (the PUBLICATION list \u2014 what a visitor sees): who may edit and who is shown were never the same fact. Same trust model as every openproduct table: opaque subject ids, no cross-schema FK, no email ever. In-schema FK to profiles with ON DELETE CASCADE so the teardown/relocation unit is unchanged. Backfills every existing listing's creator as its owner (usr_/sp_ prefixed created_by only \u2014 unparseable creators are skipped, not guessed, and an operator adds owners by hand). Additive, idempotent.",
    },
    {
      id: "1300_openproduct_profile_link_grants",
      context: "openproduct",
      path: "1300_openproduct_profile_link_grants/up.sql",
      checksum:
        "b9e11ba05b55e9f9a21f287a58f30fbde5bf4ee3c0b05a3bb931993b36188d3d",
      description:
        "OX5 (openproduct-independence) — the stored half of the LINK GRANT (seam S4/S5): a nullable link_grant JSONB on openproduct.profiles holding the platform's verified attestation (door token, grantedBy, grantedAt, workspace public-eligibility). Replaces the per-request authorization-context/visibility reads and the binding-only door mint — the last service-binding uses openproduct had. Listings without a grant refuse publish with workspace_link_required, whose remedy is the link flow; never a silent pass. Additive, idempotent.",
    },
    {
      id: "1310_openproduct_audit_log",
      context: "openproduct",
      path: "1310_openproduct_audit_log/up.sql",
      checksum:
        "d42fc00cff3b4df3db1c5981bd8f395b6dca1dd525edf7f41d92c887cf5f7f02",
      description:
        "OX5c (openproduct-independence) — the LOCAL audit log: openproduct.audit_log replaces the maintainer door's appendEventWithAudit writes into the platform events schema, the last platform-schema WRITE openproduct made. FK-free on purpose (an audit row survives the profile it describes); org_id-scoped, which is what the workspace purge deletes by (purge-registry class purge). Same type vocabulary the platform catalog carried; openproduct owns it now. Additive, idempotent.",
    },
    {
      id: "1320_openproduct_catalog",
      context: "openproduct",
      path: "1320_openproduct_catalog/up.sql",
      checksum:
        "3ebe2c244c007a34f4175a23898fbb1f9be8d673b05153d632711a6b7c3fa7bc",
      description:
        "CT0 (openproduct-commons) — the catalog substrate: openproduct.facets (the seven groups the reference design's rail asks about, each 'assigned' or 'derived'), openproduct.facet_values (the vocabulary inside a group — closed for category/licence/hosting/team_size, open-but-canonicalised for stack, retired rather than deleted), openproduct.facet_counts (precomputed, because the rail renders on a page that resolves no actor and is edge-cached 60s, so a count cannot be a COUNT(*) at request time), and category/hosting/stack_canonical on openproduct.profiles. stack_canonical is the RESOLVED subset; profiles.stack stays the maintainer's own words, and an entry our vocabulary did not recognise stays authored text and never becomes a facet (CT-1) — a facet count over free text is a lie, and a maintainer is never blocked by our list. Nullable throughout: an unassigned facet is not a default bucket, the same rule SN applies to an unobserved metric. No email, no cross-schema FK, everything inside the openproduct schema so DROP SCHEMA openproduct CASCADE stays one statement. Dormant on arrival: nothing routes here until CT1. Additive, idempotent.",
    },
    {
      id: "1330_openproduct_trust",
      context: "openproduct",
      path: "1330_openproduct_trust/up.sql",
      checksum:
        "f94548ec33f2f20d48ad5be4e0217293cdbbba68634128835afe1f17efe94fc1",
      description:
        "TS0 (openproduct-commons) — the capacity to carry a public surface, landed in wave 1 before any public write surface exists (OPC-8 makes each later surface wait for its named control here). Three tables, one per layer of TS-1: openproduct.trust_levels (the graduated ladder replacing OD's per-publish admin review — absence of a row means 'new', because a row per signed-in subject would make this a shadow user directory), openproduct.reports (the queue; reporters are NAMED — TS-1's first layer is standing, an anonymous report has no accountability and a flood of them attacks the queue itself, so anonymous visitors keep the footer report address of OD-C), and openproduct.moderation_acts (append-only: a restore is a NEW act, never an edit of the removal, because an appeal must be able to ask what was done and when it was undone). Velocity — TS-1's middle layer — is TS2 at the gateway and has no table: a rate limit is durable-object state, not a row. subject_kind + subject_ref are opaque with no FK so a report survives the thing it reported, and the schema still drops in one statement. A CHECK forbids an automated removal outright (TS-5): automation may flag, discount and de-index; only a human removes, because a false positive erases a real person's work from a crawled public page. Additive, idempotent.",
    },
    {
      id: "1340_openproduct_signals",
      context: "openproduct",
      path: "1340_openproduct_signals/up.sql",
      checksum:
        "8eeb8c4e26c96992dd126aa889acb55ed0b8c1efc95ad35a0dc06061e7ed6efd",
      description:
        "SN0 (openproduct-commons) — where the numbers come from and how old they are allowed to get. openproduct.signal_sources (one row per listing per source: what we watch, whether it still answers, and the withdrawal that stops both polling and rendering when it does not), openproduct.metrics (windowed, APPEND-ONLY rows — never a live query on the read path, because a number computed at request time cannot be edge-cached and OPC-1 requires the public document to render with no actor; a correction is a NEW row with a later observed_at, which is what lets EN3's integrity sweep restate a total without erasing what it restated), and openproduct.activity_events (the design's seven-verb public timeline, CHECK-pinned closed because this text renders on a public page and an open vocabulary would let an ingester write attacker-influenced strings onto it). Three observation tiers (OPC-C): linked_repo sees everything, declared_repo sees activity but not tests, manifest sees no activity at all — and a tier-3 listing shows a DASH where a tier-1 shows a number, never a zero, because '0 commits this week' says the project is dead while an unmeasured project has said nothing. Metric and window vocabularies stay in the contract beside their freshness windows and formula prose rather than being CHECK-pinned here, so a sub-epic adding a number does not need a migration. Values are BIGINT and never float: every number the design renders is a count or a timestamp, and a float would be the first step toward a score, which OPC-4 forbids. Activity is built only from public sources (OPC-J) — never from openproduct.audit_log, which is org-scoped and private. Dormant on arrival: nothing polls and nothing renders until SN1/SN2. Additive, idempotent.",
    },
    {
      id: "1350_openproduct_search",
      context: "openproduct",
      path: "1350_openproduct_search/up.sql",
      checksum:
        "ec334128ea088228308ff7c3aa63c7bd31dfb2195c451a6e2efbf89884bb7dd4",
      description:
        "DS0 (openproduct-commons) \u2014 the search index, built FROM the catalog document and never from openproduct.profiles (DS-1). That inversion is the whole safety argument: anything this table can return is by construction something the public read would have returned anyway, so the index cannot leak a draft listing, an unconfirmed role, or a removed post \u2014 the builder's input type IS the public projection, so a private column is not something a future edit must remember to exclude, it is not in scope to be included. The replace is wholesale, which is how de-indexing works: an unpublished listing is simply absent from the next document and the rebuild deletes what the document no longer contains, so the 'we forgot to de-index it' class of bug cannot occur. openproduct.search_index stores terms as text[] with a GIN index rather than a tsvector, and that is OPC-4 rather than a performance choice: ts_rank is a weighted black box (term frequency, length normalisation, position weights, constants nobody here chose) and OPC-4 forbids an ordering without a sentence a person can read. So Postgres narrows the CANDIDATES with an overlap test that has no opinion about order, and the ORDER comes from a published formula in the contract that /docs renders \u2014 the database finds, the contract ranks. The stemming that costs us is bought back in a tokeniser shared between build and query, because a tokeniser used on only one side is how a search box stops matching documents it built itself. openproduct.search_index_state is a single row holding the rebuild floor, in the database rather than in worker memory because there is no single worker: an isolate rebuilding on its own timer rebuilds once per isolate, which on a busy minute is exactly the sixty rebuilds the floor exists to prevent. kind is open text, not a CHECK \u2014 CG1 adds person and LC3 may add collection, and nothing about correctness depends on the set being closed. Additive, idempotent.",
    },
    {
      id: "1360_openproduct_handles",
      context: "openproduct",
      path: "1360_openproduct_handles/up.sql",
      checksum:
        "d64586bcc328da5c8ea5b54bd9f060dd297f693145e2a338289b624e7477e390",
      description:
        "CG0 (openproduct-commons) \u2014 the handle namespace. openproduct.live/kettleworks is a product and openproduct.live/@ada is a person: the @ is part of the URL rather than decoration (OPC-B), because two flat namespaces at the root would need a shared uniqueness table and would make every new reserved word a breaking change for whoever already held it \u2014 with the sigil the two cannot collide at all and the router tells them apart without consulting a database. A RELEASED HANDLE IS A TOMBSTONE, NOT A FREE SLOT (CG-1), and that is the decision here that costs something and is worth it: a handle is an identity somebody handed out, and it lives in commit messages, chat logs, conference badges and address books, so re-issuing @ada to a different person does not give the new holder a name, it gives them the ACCUMULATED TRUST of a stranger and gives everyone who knew the first Ada a page that looks like her and is not. The row therefore survives release, released_at is set, and the unique index covers released rows too \u2014 the namespace only ever shrinks, which is the correct trade for a namespace whose entries are people. One ACTIVE handle per subject via a partial unique index, so a person may release one and claim another while both rows exist forever. The grammar (2\u201332 of [a-z0-9-], never leading or trailing a dash) is a CHECK as well as a contract rule, because this column is a URL segment and a segment only the application validates is one a direct INSERT can break for every reader. The reserved list is seeded AS DATA rather than enforced in a CHECK: a CHECK would make every new top-level route a migration and would hide the list from the API that has to explain a refusal \u2014 reserved rows carry a null subject and a reason, so a reserved handle and a taken one are refused by one code path rather than two. sitemap.xml is deliberately absent because it fails the grammar and can never be claimed; a reserved list containing unclaimable entries teaches its reader that the list is decorative. Dormant on arrival: nothing renders from this table until CG1. Additive, idempotent.",
    },
    {
      id: "1370_openproduct_indexable",
      context: "openproduct",
      path: "1370_openproduct_indexable/up.sql",
      checksum:
        "a25feb53b31bd76a3ac8db5f9ede7464669639be63cb3d8bb9a57c801cb9cb41",
      description:
        "TS1 (openproduct-commons) \u2014 whether a published listing may be AMPLIFIED, as a stored fact. TS1 replaces OD's per-publish admin review with a ladder (TS-2): reviewing every publish is a fine lever at fifteen listings and an outage at the design's 1,284, so the human cost moves to where the risk is \u2014 a maker's first listing is cautious and every subsequent one is immediate. Cautious means UNINDEXED, not blocked: the maker builds their page, shares the link and is read by anyone they send it to; search engines simply do not amplify it until a human has looked or the maker has earned their way up. Blocking would punish the honest first-timer, who is the overwhelming majority, to inconvenience the spammer, who will make another account anyway. This is a COLUMN rather than a read-time join on trust_levels for two reasons: the public read resolves no actor and touches no per-subject table (OPC-1), so joining a person-scoped table onto the catalog document would put a private table on the one path that must never have one; and a join would be RETROACTIVE \u2014 a maker demoted next year would silently de-index a listing cleared last year, and a promoted one would silently amplify pages nobody ever looked at. Indexability is a decision made at publish time about a specific listing, and storing it is what makes it a decision rather than a side effect. DEFAULT TRUE deliberately: every listing existing when this runs was published under OD's rules, which required a human review, so defaulting them to FALSE would de-index the entire live catalog to express a rule about newcomers. This migration also REPLACES 1160's profiles_public_requires_review CHECK rather than dropping it: 1160 wrote the rule as 'public implies reviewed', which was right for a catalog of fifteen and is an outage at 1,284, and what replaces it is the rule that is actually true now \u2014 a published listing must have been looked at by a person OR must not be amplified. A row that is public AND indexable AND unreviewed still cannot exist whatever a handler believes, because that combination is precisely 'we told search engines to promote a page nobody read', which is the outcome the original CHECK existed to prevent and the only one it actually needed to. Dropping it outright would have been easier and would have left the guarantee living only in application code, which is where guarantees go to be forgotten. Additive to the column, idempotent, and the constraint swap is safe to replay.",
    },
    {
      id: "1380_openproduct_public_profiles",
      context: "openproduct",
      path: "1380_openproduct_public_profiles/up.sql",
      checksum:
        "254029b0f5a5a612818d82854feca0659aefc6d978cb461abe6e7a1cfb23993c",
      description:
        "CG1 (openproduct-commons) \u2014 the public half of a contributor, and the two gates in front of it. openproduct.contributors has held a display name and a bio since OH0, both private; CG1 gives a contributor a page at /@handle, which makes those same fields the most exposed text this estate publishes about a person. TWO GATES, BOTH NECESSARY (CG-2): their own act \u2014 profile_public defaults FALSE and nothing sets it but the contributor's opt-in, so nobody gets a public page by signing in, by being added to a listing, or by being mentioned; and STANDING \u2014 a profile renders only for somebody who maintains a listing that is itself public, which is the anti-spam property of the entire people surface, since a public profile directory open to anyone who can sign in is a spam directory within a month and one bounded by 'you are on a product somebody published' is self-limiting. The second gate is deliberately NOT a column: it is a read-time join against listing_maintainers, because it is a fact about the world that changes without anybody touching this row \u2014 unpublish your last listing and your page stops rendering, republish and it returns. A denormalised has_standing flag would be a cache of a join, and the bug it produces is a page that outlives the standing it was granted for. Nothing here is copied from identity.* (CG-4): every column is text the contributor typed on this surface, which is what makes the page's footer sentence ('Profile authored on openproduct. Nothing here is copied from an Orunbase account.') true and testable. Links are text with a length CHECK but no URL grammar CHECK \u2014 a URL regex in a constraint is one somebody has to migrate the day it is wrong, and the write boundary already refuses anything that is not an https URL on a host we will render; what the schema enforces is length, because an unbounded text column on a public page is a denial of service with extra steps. published_at is required whenever profile_public, because a transparency record (TS5) and an appeal both need to say WHEN the public surface began. Additive, idempotent: every column is nullable or defaulted and no existing contributor becomes visible.",
    },
    {
      id: "1390_openproduct_endorsements",
      context: "openproduct",
      path: "1390_openproduct_endorsements/up.sql",
      checksum:
        "c4edc8ff25cacb7b6a9edb843cc2c0add777ce357de2b5aebdb4433b41f900f1",
      description:
        "EN0 (openproduct-commons) \u2014 the public endorsement, and why it is a SECOND table rather than a column on the first. 1250 promised, in a comment on saved_products, that a save is a private act with no count on any public page and therefore no counter to drift. The design puts a count on every card, and the cheap way there is to count saved_products and add a public flag \u2014 which is the one thing this migration exists to refuse (EN-1, OPC-3): every one of those rows was created under a promise that nobody would ever see it, and counting them now would retroactively publish a private gesture made by people who cannot be asked and did not agree. Two tables cost one migration; the alternative costs the estate's word. saved_products is therefore NOT touched \u2014 not widened, not counted, not migrated, not read \u2014 and a test pins its column list before and after, because the pressure to 'just add a flag' returns every time somebody notices the two tables look similar. Endorsements are APPEND-ONLY with a withdrawn_at (EN-3): withdrawing does not delete, because EN3's integrity sweep must be able to RESTATE a public total without erasing what it restated, and because 'endorsed, withdrew, endorsed again' is then one row with a history rather than three facts nobody can reconcile. One row per (listing, subject) by primary key \u2014 an anonymous vote is an unbounded vote (EN-2) and a repeatable signed-in one is the same thing with extra steps. A pending state records the act of somebody below TS1's trust floor without counting it, so a newcomer's honest gesture is not thrown away and counts the moment they clear. Integrity is a SEPARATE table and the separation is the point (EN-4): endorsements holds the act, endorsement_integrity holds the machine's opinion, and keeping them apart means a person is never told, and never implicitly accused, that their honest endorsement was judged fake \u2014 the discount is disclosed in aggregate in the transparency report and never per person. No counter column anywhere: the public total is a recomputed metrics row, because a counter cannot be restated without erasing history and drifts the first time a write path forgets it. Dormant on arrival; nothing is routed until EN1. Additive, idempotent.",
    },
    {
      id: "1400_openproduct_integrity_state",
      context: "openproduct",
      path: "1400_openproduct_integrity_state/up.sql",
      checksum:
        "5b51b7d0685fc833c1b6e23dca08bede66eb3f4023c0b8aabc1dc8c3df36a33d",
      description:
        "EN3 (openproduct-commons) \u2014 one row, so the integrity sweep has a floor. EN3 ships a model that reads a week of endorsements, and the thing that runs it is the gateway's scheduled sweep \u2014 which fires on whatever cadence each environment's cron is set to, and which this repository cannot see, because the cron is per-environment configuration rather than committed code. That is the problem this table solves: a sweep walking a week of endorsements on every tick would, on a one-minute cron, read that week sixty times an hour to discover nothing changed. Putting the floor in the WORKER instead would put it in worker memory, and there is no single worker \u2014 an isolate with its own timer sweeps once per isolate, which is exactly the sixty sweeps the floor exists to prevent. DS0 made this argument first for the same reason, and this is deliberately the same shape as search_index_state. The two floors are not merged into one row because they are about different work on different cadences, and one row holding both means changing one cadence risks the other; two singletons cost one table. There is no dirty_at here, unlike DS0's: the search index is dirtied by a WRITE, because a listing changed and the index is wrong NOW. Integrity is not like that \u2014 an endorsement arriving does not make the last assessment wrong, it makes it slightly less complete, and the model is about patterns across a window rather than about any one row. So the floor is purely temporal and swept_at is the whole of the state. A null swept_at means one has never run, which is due: a fresh estate should assess as soon as it is asked to. Additive, idempotent.",
    },
    {
      id: "1410_openproduct_product_people",
      context: "openproduct",
      path: "1410_openproduct_product_people/up.sql",
      checksum:
        "9cf2dccccc1b36873eb9b447d88326a265730b73da280495735b30602cdecbc4",
      description:
        "CG3 (openproduct-commons) \u2014 consent, as a row. OD0 gave a listing published_maintainers: the list its maintainers write, naming who is on the product \u2014 and the people on it never agreed to be, so a maintainer types a name and a stranger appears on a public page. OPC-5 says nobody appears publicly without their own act, and this table is that rule given somewhere to live: an edge is created by the maintainer and becomes PUBLIC only when the person themselves confirms it. Three states, and the middle one is the point: pending (the maintainer named them; the public cannot see it, and it is visible to exactly two parties \u2014 the maintainers who need to know their invitation is out, and the named person who needs to answer it), confirmed (they said yes; only now does it reach a public surface), retired (either side ended it, and the row survives because CG4's 'contributes to' counts over history and somebody who spent two years on a product did that whether or not they are on it today). DECLINING IS NOT A STATE and leaves no row: the point of declining is 'I was never part of this', and a declined row is a durable record that somebody was asked and refused, which is a fact about them we have no business keeping. Retiring is different \u2014 it ends something real. origin is the honest half of grandfathering (OPC-G): the epic makes existing published_maintainers into confirmed edges because the alternative is every roster emptying on deploy, and that has a cost worth naming \u2014 those people confirmed nothing, so confirmed would mean two things at once and a column meaning two things is a column nobody can audit. The provenance is therefore recorded; a grandfathered edge renders exactly like a confirmed one, but the estate can say how many of its consents it assumed, TS5 can publish that number, and the seam notification reaches exactly the right set. invited_by is the listing's owner where there is one and the literal 'grandfathered' where there is not, never a guess: an audit trail that attributes an invitation to somebody who did not make it is worse than one that admits it does not know. published_maintainers is NOT dropped and NOT merged \u2014 it stays the maintainer's publication list, and the public roster is the reconciliation of 'the maintainer published them' with 'they consented', because merging would either discard the maintainer's ordering and labels or silently publish unconsented rows. Additive, idempotent.",
    },
    {
      id: "1420_openproduct_launches",
      context: "openproduct",
      path: "1420_openproduct_launches/up.sql",
      checksum:
        "81f646b5673df6ed70e17371a8b6af346f2362444064c7c8b2c77ba4cc2592ff",
      description:
        "LC0 (openproduct-commons) \u2014 the day a product is introduced, as a row. OD0 gave a listing a published_at doing two jobs at once: making the page exist, and being the only date anything orders by. LC-1 separates them, because the day a product is introduced is the one thing a maker gets exactly one of \u2014 and under a conflated model that day is whenever the page first worked, which is the worst available day: the pitch is half-written, the screenshot is a placeholder, the README still says TODO. This table lets somebody publish quietly, fix the tagline twice, and choose the morning. Four states. scheduled: a moment is set and nothing public renders it \u2014 this IS the embargo, and there is no second mechanism because 'scheduled but visible' is not a thing anybody asked for. live: the moment arrived, the listing was published, and it is on the record; terminal, because a launch people have seen cannot be moved or cancelled. cancelled: called off before it fired. missed: the moment passed and the listing was NOT published. missed is the one worth defending \u2014 a launch cannot fire while its listing is unpublished, since announcing a page that 404s is worse than announcing nothing, so somebody who unpublishes on Thursday night has a Friday launch that cannot happen; leaving it scheduled would fire it at an arbitrary later moment whenever they happened to republish, and a surprise announcement is worse than a missed one, so it misses, says so, and offers a reschedule. The once-per-version rule (LC-1) stops the board becoming a re-post treadmill, and a major version is TWO things because neither half works alone: the label, typed by the maintainer and unique among launches that consumed one, which catches the honest 'did I already launch this?'; and the cooldown, enforced in core against launched_at and published at /docs, which catches the deliberate treadmill and is the half a label cannot argue past. The uniqueness is a PARTIAL index because only scheduled and live consume a version \u2014 a cancelled or missed launch announced nothing and releases its label, the alternative being a maker who unpublished for an hour losing their 2.0 launch forever. It normalises the label the way the contract's sameVersion does (lowered, whitespace collapsed, a leading v before a digit dropped), or 2.0 and V2.0 are two versions to Postgres and one to every reader, and the rule becomes a spelling test. launched_at is the moment the maintainer CHOSE, not the moment the sweep happened to run: LC-2 tie-breaks the board by earliest launch time, and a board ordered by cron jitter is a board ordered by nothing \u2014 so on firing launched_at := scheduled_for, and fired_at records when we actually noticed, which is operational and never ordered by. board_rank_at is carried now but written by nothing until LC3, because LC-1's own tuple in the epic names it and one documented nullable column is less churn than a second twin-synced migration for one timestamptz. Additive, idempotent.",
    },
    {
      id: "1430_openproduct_digest_notes",
      context: "openproduct",
      path: "1430_openproduct_digest_notes/up.sql",
      checksum:
        "84d09868b98db583daf371b3855c01b886352992be0de097e187ebab40388359",
      description:
        "LC1 (openproduct-commons) \u2014 one signed sentence per week. The digest is otherwise entirely computed \u2014 what launched, and what people endorsed while it was launching \u2014 and both are facts rather than judgements. The note is the one place on the page where somebody says what they thought mattered, which makes it the one place editorial judgement lives, and LC-4's rule is that editorial judgement is allowed exactly where it is ATTRIBUTABLE. So author_subject_id is NOT NULL and there is no anonymous path to a row here: an unsigned weekly note is the thumb on the scale this product's default ordering refuses to be, wearing a friendlier voice \u2014 it reads as the platform's opinion, which is precisely the authority OPC-6 says the estate does not hold. A named person's opinion is a different object, and a reader can weigh it because they can see whose it is. The week is the key, as an ISO week id (2026-w34), rather than a date range: a range invites two rows describing overlapping windows, and the digest's whole value is that one week is one document at one address. A CHECK pins the spelling so the table cannot hold 2026-w4 and 2026-w04 as two weeks \u2014 the same normalisation the route enforces, held one layer lower. written_at is never rewritten by an edit: the date is part of what a reader weighs when reading somebody's opinion of a week. The subject id is opaque, never a name and never an email (I3); the page resolves it to a CG handle at read time and renders plain text when they have no public profile (XP-5). Additive, idempotent.",
    },
    {
      id: "1440_openproduct_moderation_state",
      context: "openproduct",
      path: "1440_openproduct_moderation_state/up.sql",
      checksum:
        "808f79d977a7bdfed9a390b4593a2ac72869a400bb794e968c187e8f99e5c71b",
      description:
        "TS3 (openproduct-commons) \u2014 what the ESTATE did to a listing, kept apart from what its maintainer wants. 1330 gave this schema reports (what people told us) and moderation_acts (what we did): the LEDGER but not the STATE, so a removal could be recorded and the listing still served, because nothing on the listing said so. This column is that missing half, and where it lives is the whole design. NOT a value of visibility, for two reasons either of which is fatal. First, visibility is the MAINTAINER'S OWN SWITCH \u2014 they set it from their own studio whenever they like \u2014 so a removal written into it is one the person it was applied to can undo, which is not a removal but a suggestion; moderation and authorship cannot share a column for the same reason a lock and a door handle cannot share a mechanism. Second, a private listing 404s, and TS-3 exists to forbid exactly that: on a linkable, crawlable, permanent surface silent deletion is indistinguishable from a bug and reads as censorship to the person it happened to, so removed content renders AS removed. Two independent facts about one listing therefore \u2014 the maintainer means this to be public, and the estate has acted on it \u2014 and the public read renders their intersection: a delisted listing whose maintainer privates it and publishes again is still delisted, because nothing they can reach touches this column. Three states, and the middle one is the point: delisted takes a listing off the directory, search, the digest and the feeds while its own page keeps rendering it in full; removed takes the content off the page too. Delisting is not a weaker removal but a different claim \u2014 'this should not be amplified here' rather than 'this should not exist here' \u2014 and collapsing them would force every act to be the maximal one, which is how a moderation surface becomes feared. moderated_at is the date the tombstone shows and the ONLY thing besides the state it may carry: a reason is a judgement about a person published at their own address before they have had any chance to answer it, and TS5 publishes reasons in aggregate, which is where that asymmetry is bearable. A CHECK pins the two halves together so a row cannot claim to be removed with no date. moderation_act_id traces every tombstone back to an appealable ledger row, opaque and with no FK because moderation_acts is append-only and outlives everything. The partial index is deliberately 1320's public index plus this filter: the two are always used together, because 'public AND not acted on' is what the word listed means from here on. Additive, idempotent \u2014 every existing row lands visible, which is what they all are.",
    },
    {
      id: "1450_openproduct_discussions",
      context: "openproduct",
      path: "1450_openproduct_discussions/up.sql",
      checksum:
        "53a1cf63f930c96a7543ccb8904209a8ca0c7185d5ad38ab125c808eb14b8ed9",
      description:
        "CB0 (openproduct-commons) \u2014 the conversation that leads to the join, DORMANT on arrival: nothing routes to these tables until CB1, whose gate is the heaviest in the epic (TS2 velocity AND TS3 removal, both now on main). CB-1 is native and NEVER SOURCED INBOUND, and this schema is shaped so it cannot become a mirror: there is no upstream id, no sync cursor and no external author. The argument is that the decision trail is the product \u2014 'every accepted contributor arrived through this page, and the thread that led to it stays public' is only true if the thread lives where the join lives \u2014 and that federating inbound would strand every product whose code is not on GitHub, making this a GitHub client rather than a commons. CB-2: every post is SIGNED, author_subject_id NOT NULL on both tables and no anonymous or pseudonymous path anywhere, because an anonymous post on an anonymously-readable crawlable page is an unattributable permanent claim about somebody else's software; requiring a signature also inherits CG-2's eligibility bound, which is most of the spam defence for free. CB-3's six tags are a CHECK rather than a lookup table: a closed set makes threads filterable and the page scannable, and an open tag space becomes a folksonomy nobody navigates and a second place to write whatever you like. BODIES ARE STORED AUTHORED and rendered through the contract's restricted subset on read \u2014 storing rendered output would freeze today's subset into every old row, so the day something must come out we could take it out of the renderer and every post written before that day would still carry it; authored text is also what an author asked to edit and what an appeal is about. posts carries TS3's moderation axis in the same shape as profiles, for the same reason: a removed post renders as removed rather than vanishing, because a reply that disappears makes the replies around it unreadable. threads.answer_post_id is opaque with no FK on purpose \u2014 a post can be removed after being marked as the answer, and a cascade would silently un-answer a thread rather than leaving a question somebody can see was answered once. last_post_at is carried rather than derived because a thread list ordered by a subquery over posts scans every post on the estate to draw one page. Additive, idempotent.",
    },
    {
      id: "1460_openproduct_seam_activity",
      context: "openproduct",
      path: "1460_openproduct_seam_activity/up.sql",
      checksum:
        "0450c6d7e6d06249580f1c7f754880094a7cb55f174e4797c7eb214dee8c554b",
      description:
        "CB3 (openproduct-commons) \u2014 activity the SEAM told us about. 1340 gave activity_events four sources and all of them are ingestion: three ways of reading a repository, plus operator for something a human entered by hand. An accepted offer is neither \u2014 it arrives over the JR seam, the estate's own boundary, from the system that owns the join lifecycle (CB-5) \u2014 and calling that operator would say a person typed it. The source column is PROVENANCE, and provenance is the one thing this epic refuses to fudge (OPC-7): a reader who asks where a fact came from gets an answer that is true, or the column is decoration. So the seam gets its own name rather than borrowing one that means something else. Deliberately NOT added to signal_sources: that table is what gets POLLED, and a seam is not pollable because it pushes \u2014 the two tables share a column name and not a meaning, and the contract keeps them as separate types for the same reason. Additive, idempotent; no existing row changes.",
    },
    {
      id: "1470_openproduct_notifications",
      context: "openproduct",
      path: "1470_openproduct_notifications/up.sql",
      checksum:
        "4e50c81946717f12b1519859c870f8d640fc9b4a3dcf34db2ab3dbf7231cf7fa",
      description:
        "CB4 (openproduct-commons) \u2014 telling people something happened without ever learning how to reach them. I3 is the whole shape of this: no address is stored here, not an email, not a phone number, not a push token, not a hashed one. openproduct holds an opaque subject id and a preference; the PLATFORM holds the address and does the sending. A schema that cannot hold an address cannot leak one and cannot grow a 'just this once' export either. WHO IS NOTIFIED IS DERIVED, NOT STORED \u2014 there is deliberately no subscriptions table, because participation IS the subscription: you posted in the thread, or you started it. A subscription row would be a second source of truth about who cares, and the first time it disagreed with the posts it would be silently wrong in whichever direction is worse. What IS stored is the opposite: the people who have said stop. A mute cannot be derived from anything, and it is the one notification fact somebody has actually asked us to remember. notification_prefs follows 1330's trust_levels posture \u2014 absence of a row means NOTIFY, so only somebody who changed the default appears at all, and the table never becomes a shadow user directory. One switch rather than a per-kind matrix: a preference grid is a settings page nobody finishes reading and a rule nobody can predict, and the kinds here are all 'something happened in a conversation you are in'. The OUTBOX exists because notifying is a side effect of a write that already happened: calling out inline would either fail a post because a notifier was down \u2014 losing something a person wrote to save a message they would have got anyway \u2014 or swallow the error and lose the message silently. A unique index on (subject_id, event_ref) makes 'notified once per event per person' a property of the schema rather than of every caller remembering to check, so a retry, a double-delivered seam event and two racing workers all collide instead of sending somebody the same message twice. Additive, idempotent.",
    },
    {
      id: "1480_openproduct_flags",
      context: "openproduct",
      path: "1480_openproduct_flags/up.sql",
      checksum:
        "8a61d8e419671ff36c97ec3e123a503089730ad2982e8b561c4c7b801ff2869b",
      description:
        "TS4 (openproduct-commons) \u2014 what a MACHINE noticed, addressed to a person. Deliberately NOT written into openproduct.reports, and the reason is not tidiness: a report is a PERSON saying 'look at this' and every property of 1330's table follows from somebody being behind the row (it names its reporter because standing is TS-1's first layer, and a flood of anonymous ones attacks the queue itself), while a flag is a DETECTOR saying 'this matched a pattern' and claims no standing at all. A flag must also be idempotent, because the sweep runs on a cron and must not file the same observation every hour, and it must be countable apart from reports, because TS4's entire defensibility rests on a measurable false-positive rate and 'we received 4,000 reports this quarter' must not come to mean 'a cron ran'. THE TABLE CANNOT EXPRESS A REMOVAL. TS-5 says only a person removes and 1330 already enforces it on moderation_acts; TS4 is the milestone most likely to erode that rule because it is the one holding the detectors, so the rule is structural twice over \u2014 the contract's FlagConsequence type has no member that deletes, and flags_consequence_check refuses the value at the database, so a flag that wanted to remove something could not be stored. ONE FLAG PER PATTERN PER THING while it is open, via a partial unique index: the sweep re-raises every run and the re-raise collapses into the row already in the queue. A RESOLVED flag deliberately does not block a later one \u2014 a listing flagged, dismissed, rewritten and flagged again is a new observation, and suppressing it would make dismissal permanent immunity. 'dismissed' IS A FIRST-CLASS OUTCOME AND IS COUNTED: a triager saying 'this was wrong' is the only measurement of the false-positive rate that comes from production rather than from a fixture, and a detector that cannot be shown to be wrong is a detector nobody can argue with. NO SCORE COLUMN \u2014 the evidence is prose quoting what was found, because a number beside an accusation invites acting on the number and a triager who reads '0.94' learns nothing they could check. No subject ids in the evidence either: a cohort flag says 'four accounts', never which four (EN-4 says there is no per-person integrity record anywhere, and a moderation queue is somewhere). defence_sweep_state is the sweep's floor, in the same shape as EN3's integrity_sweep_state and DS0's index state and for the same reason each gave \u2014 the cron cadence is per-environment configuration this repository cannot see, and a floor in worker memory is a floor per isolate. It is a separate row rather than a column on EN3's because the two sweeps read different things over different windows and will not stay on one cadence. Additive, idempotent.",
    },
    {
      id: "1490_openproduct_collections",
      context: "openproduct",
      path: "1490_openproduct_collections/up.sql",
      checksum:
        "c09bc758f028ce20e636a9ca65dae45c4130c635437af7399741ae4cad60ad1e",
      description:
        "LC4 (openproduct-commons) \u2014 the one place editorial judgement is allowed, and ATTRIBUTION is what buys the exception (LC-4). Every other ordering on this estate is a published rule with no thumb on it (DS2's three sorts, DS4's similar panel, LC1's digest, LC3's board), because OPC-4 forbids an order a reader cannot reproduce from a sentence \u2014 and that forbidding is what makes the directory trustworthy. 'These eight, in this order, because I say so' is a fine thing for a PERSON to publish and an intolerable thing for a PLATFORM to publish; the difference is a name. So curator_subject_id is NOT NULL, never 'automatic' and never an org. WHAT 'SIGNED' HAD TO MEAN: not 'has a subject id in a column' \u2014 that is signed the way an unsigned editorial is signed by the CMS user who pasted it. It means the curator is somebody a reader can go and look at: a public contributor profile, at a handle that resolves, held by somebody who has actually shipped here. That is CG4's biconditional (handleJoinFor), leaned on rather than re-invented. The consequence is real and intended \u2014 somebody who has published nothing here cannot publish a collection here, and a curator who takes their profile private takes their collections with it, because the judgement was only ever publishable while it was attributable. ORDER IS THE CURATION. `position` is the curator's and nothing re-ranks it: this is the one surface on the estate with no sort control, deliberately, because offering 'sort by most active' over somebody's curation destroys the thing it is \u2014 a collection sorted by the reader is just the directory with fewer rows. AN ITEM THAT STOPPED BEING PUBLIC IS HIDDEN, NOT BROKEN. The public read joins items through listed(), so a delisted, removed or unpublished listing simply is not in the collection today; the ROW SURVIVES, so if the listing comes back so does the item. What must never happen is the whole collection 404ing because one of eight items went away. The count a reader sees is therefore computed from what is SHOWN and never from collection_items \u2014 a page saying '8 products' above three cards is a page lying about a number it could have counted correctly. One listing once per collection is the PRIMARY KEY rather than a separate index: naming the same product twice is a mistake in every case, and the curator meant to move it. Additive, idempotent.",
    },
    {
      id: "1500_openproduct_digest_subscriptions",
      context: "openproduct",
      path: "1500_openproduct_digest_subscriptions/up.sql",
      checksum:
        "e555882edc1af4e53bf1a0b1500972984740ae5eba4e0242932896211b716887",
      description:
        "LC5 (openproduct-commons) \u2014 the weekly digest by email, and I3 re-asserted for the second time. CB4 established the shape (openproduct holds an opaque subject id and a preference, the PLATFORM holds the address and sends, and a schema that cannot hold an address cannot leak one); this applies it to a weekly send and adds no column that changes it. WHY A SECOND TABLE WHEN notification_prefs EXISTS: that one uses ABSENCE = NOTIFY, which is correct there and would be indefensible here, and the difference is this milestone's whole consent model. A discussion notification is about something YOU DID \u2014 you posted in the thread, and the message tells you what happened next in a conversation you joined \u2014 so opting out is the exceptional act and the exception gets the row. A weekly digest is a BROADCAST nobody asked for by acting; sending it to everybody who ever signed in and making them opt out is how a directory becomes a mailing list people have to escape. So this table is OPT-IN and its absence means SILENCE. Two tables with opposite defaults is not an inconsistency to tidy away: the defaults encode two different consents, and collapsing them into one switch would have to pick one to get wrong. UNSUBSCRIBING IS A ROW THAT SURVIVES (unsubscribed_at rather than DELETE): somebody who leaves and later returns should not look, to us, like somebody who has never been asked, and 'how many left after the change we made in week 34' is a question an estate should be able to ask itself about its own sending. The row still holds nothing but an opaque id and two timestamps \u2014 no name, no address, and deliberately no free-text 'reason for leaving', which is the field that always gets added and always becomes a place people type things about themselves that we then have to defend. The outbox's kind CHECK is WIDENED rather than replaced with open text (the shape 1460 used for activity_events): the CHECK is what stops a caller inventing a kind nobody wrote copy for, and a digest is a fourth known kind rather than the start of an open vocabulary. thread_id stays null for a digest \u2014 a digest is not about a conversation \u2014 and CB4's unique index on (subject_id, event_ref) makes 'one digest per person per week' true for free with the week id as the ref, rather than being re-implemented here. Additive, idempotent.",
    },
    {
      id: "1510_openproduct_appeals",
      context: "openproduct",
      path: "1510_openproduct_appeals/up.sql",
      checksum:
        "48921e5b0255bed80b66a186c22b45881831c4995370cc19843176d4b2f5800e",
      description:
        "TS5 (openproduct-commons) \u2014 the answer to an act, and the half of TS-4 that 1330 was pointing at when it wrote moderation_acts append-only with a NOT NULL reason because \"an act nobody wrote a reason for is an act nobody can appeal\". A ROW RATHER THAN A MAIL ADDRESS IN A FOOTER, and the reason is not convenience: TS-4 says every act is appealable AND COUNTED IN PUBLIC, a mailbox produces no number, and a transparency report showing removals with no denominator is a boast. THE APPEAL POINTS AT THE ACT, NOT THE CONTENT. A listing delisted in March and removed in June has been acted on twice; an appeal \"about the listing\" cannot say which decision it disputes, so an upheld one cannot say what to put back. Naming the act makes the reversal mechanical, and it is what finally spends the pairing 1330 built into the vocabulary on purpose (remove/restore, delist/relist, deindex/reindex) with the note that an act which cannot be undone in the same vocabulary is one TS5's report cannot show the reversal of. Opaque act_id and no FK, with subject_kind/subject_ref COPIED rather than joined, so an appeal stays readable after the thing it concerns is gone \u2014 the case where it matters most. TWO REVERSAL COLUMNS, NOT ONE: outcome_act_id is the appeal_upheld/appeal_refused row recording the judgement, reversal_act_id is the restore/relist/reindex row recording that the content actually came back, and a reader of the ledger needs both because agreeing and undoing are different facts. reversal_act_id is nullable EVEN WHEN UPHELD, deliberately: somebody else may have undone the act while the appeal waited, and a NOT NULL would force a handler to invent a reversal act that reversed nothing, which is a false row in an append-only ledger. THE CHECKS HOLD THE ONE RULE ONLY A DATABASE CAN \u2014 a decided appeal names its decider, its moment and its ledger row, an open one names none of the three, and a refusal reverses nothing \u2014 while the vocabulary of what is appealable stays in the contract, because a list with two homes is a list that one day gives two answers. ONE OPEN APPEAL PER ACT via a partial unique index, the same shape 1330 used for open reports; one appeal per person per act EVER is enforced in the INSERT instead, because an index covering decided rows would also stop a second maintainer of the same listing appealing an act nobody has appealed. A refused appeal deliberately cannot be re-filed \u2014 unlike a report, which can, because a re-filed report is new information about content while a re-filed appeal is the same argument to the same reader, and permitting it turns the queue into a place one determined person can occupy. Additive, idempotent.",
    },
    {
      id: "1670_openproduct_follows",
      context: "openproduct",
      path: "1670_openproduct_follows/up.sql",
      checksum:
        "68733c9f398da4111b3553aed6ae4cca5b9763f7c9629898fa39bb43f5cc80bc",
      description:
        "FL0 (openproduct-launch) \u2014 following a topic and following a person, in ONE table. EN0 argued the opposite way about saves and endorsements and was right to: those are two ACTS with different meanings, one private and one public, and merging them would have retroactively published a private gesture. A topic follow and a person follow are ONE act with two targets \u2014 both mean 'put this in my notifications', both are private in the same way, both are counted the same way, both are withdrawn by the same control \u2014 and two tables would be two write paths, two overlay reads, two velocity rules and two count queries for one idea, drifting on the day somebody can unfollow a topic but not a maker. UNFOLLOWING DELETES, AND ENDORSING DOES NOT, deliberately: endorsements are append-only with withdrawn_at because EN3's sweep must RESTATE a public total without erasing what it restated, and a follow has no restatement \u2014 nothing discounts it and no public number is recomputed from its history. What a tombstone would be here is a durable private record that this person once followed that person, kept by us, asked for by nobody, and exactly the row that leaks through a join written in a hurry; CG3's declineRosterEdge deletes for the same reason. NO FOLLOWER LISTS, and the schema declines to help build one: the count index leads with (kind, target) so a follower COUNT is cheap and a follower LIST is no cheaper than a scan. A public follower list turns a private subscription into a crawlable social graph, and the people most harmed have the least say in it. NO COUNTER COLUMN (EN0's rule): the count is one indexed count(*) against one target, honest on the request path, where a counter would drift the first time a write path forgot it and drift silently because nothing recomputes it. The kind vocabulary is a CLOSED check rather than open text \u2014 a third kind should cost a migration and a conversation, not a typo in a handler \u2014 while the TARGET is validated in core, the same division product_people.subject_id already makes. NOBODY FOLLOWS THEMSELVES, in the schema rather than in two handlers: the button renders on a maker page, a maker opening their own page finds it there, and a self-follow inflates a number on your own page with your own click. Additive, idempotent.",
    },
    {
      id: "1680_openproduct_launch_thread",
      context: "openproduct",
      path: "1680_openproduct_launch_thread/up.sql",
      checksum:
        "dbaf870ef3d054f3e1467fe01a80bf58ef966e6d6c831b8d88614327ed8e703b",
      description:
        "DQ0b (openproduct-launch) \u2014 one discussion per listing, created by the first person who says something. A SEVENTH TAG RATHER THAN A SEVENTH TABLE: the design draws a comment box on a product page with no title and no tag, and that is not a different object from a thread \u2014 it is a thread nobody was asked to name. Every rule already written about a thread applies unchanged (TS3 removes it through the same ledger, TS2 gates the same write, CB4 notifies the same participants, the render subset is the same subset), and a parallel comments table would have been all of those rules again, diverging the day one of them changed. `launch` IS ADMITTED HERE AND DELIBERATELY ABSENT FROM THREAD_TAGS: CB-3's six are what a person PICKS, and this one is written by the system, so the composer's select cannot offer it and a hand-made second one cannot exist. AT MOST ONE, ENFORCED BY A PARTIAL UNIQUE INDEX rather than by a handler: two people commenting on a quiet listing within the same second is the ordinary case, and a read-then-write would give them a thread each \u2014 after which the page shows one and the other is unreachable, holding somebody's words. REMOVED THREADS ARE OUTSIDE THE INDEX so a listing whose discussion was removed can have another; LOCKED ONES ARE INSIDE IT, because replacing a locked thread would be a way around the lock. The check is replaced rather than dropped-and-added so a row cannot fall between two statements. Additive, idempotent.",
    },
    {
      id: "1690_openproduct_post_votes",
      context: "openproduct",
      path: "1690_openproduct_post_votes/up.sql",
      checksum:
        "cb72f9c8147a9ea70739f9a766993426b5a391dc6dd8235118fa0050bdee6d91",
      description:
        "DQ1 (openproduct-launch) \u2014 an upvote on a comment. APPEND-ONLY WITH withdrawn_at, like an endorsement and unlike a follow, and the split is the point: FL0's follows delete because nothing restates them and a tombstone would be a durable private record kept by us and asked for by nobody, while a comment vote moves a PUBLIC number \u2014 and a public number anything may ever have to RESTATE needs a log rather than a presence test, which is EN3's whole design. Re-voting clears withdrawn_at on the SAME row rather than writing a second. NO DISCOUNT TABLE, DELIBERATELY, and this departs from the plan's line: EN3's discount exists because an endorsement total ORDERS things (the directory's sort, the board's rank, the leaderboard), so a brigade there decides what other people are shown; a comment's votes order nothing, because comments render in the order they were written, and a brigaded comment count is a wrong number beside one comment rather than a wrong page. Shipping an empty post_vote_integrity would be dormant machinery whose only effect is a LEFT JOIN that always misses, which is how a rule comes to look enforced without being \u2014 and the log above is already the shape a discount needs, so the day comments are ordered by their votes it is a second table and a join rather than a rewrite of how the act is recorded. ONE PERSON ONE VOTE via the pair as primary key. NOBODY UPVOTES THEIR OWN COMMENT, enforced by a TRIGGER rather than a CHECK because the author lives on posts, and by the schema rather than only a handler because a future write path that forgets is still a write path and this is a public number somebody could inflate with their own click. NO COUNTER COLUMN (EN0's rule): one indexed count(*), honest on the request path, where a counter drifts the first time a write path forgets it and drifts silently. Additive, idempotent.",
    },
    {
      id: "1700_openproduct_inbox",
      context: "openproduct",
      path: "1700_openproduct_inbox/up.sql",
      checksum:
        "d7e4315d9908034951995c13315bccc5c28d33a3fd98b947f37273ae9cd61fce",
      description:
        "NF0 (openproduct-launch) \u2014 the on-site inbox, BESIDE CB4's outbox rather than inside it. That table exists to DELIVER (delivered_at, attempts, consumed by a sweep); this one is a list a person reads \u2014 never consumed, ordered for a page, counted against a cursor. They also disagree about CONTENT: CB4's mail deliberately names nobody, because a name in a subject line is searchable and forwardable, while this list renders on a page that already shows the same names under the same rules, and one table would have had to pick one policy for both channels. NO TEXT IS STORED: a row holds a kind and its referents, and the sentence is composed at read time from the contract's phrasebook \u2014 stored prose is prose that cannot be corrected without a backfill, and a table full of English is a translation problem the day anybody wants a second language. READ STATE IS A CURSOR, NOT A FLAG PER ROW: the only read action this product has is 'Mark all as read', so a cursor makes the unread count one comparison instead of a column to keep in step, and rendering the inbox writes nothing at all. FOUR KINDS SHIP, NOT THE DESIGN'S FIVE, and the fifth is refused rather than deferred: FL0 published a promise on the page where somebody decides to make their profile public \u2014 'How many people follow you \u2014 a count only, never who they are, not even to you' \u2014 and follow.maker breaks it outright when it names the follower and quietly when it does not, because a message at 14:03 is a TIMING signal and timing plus any other trace narrows a private act to a person. The shape that would keep the promise is a COUNT crossing a threshold, which is a new published rule and belongs to the milestone that wants it. Once per event per person is a unique index, so a retried sweep, a redelivered seam event and two workers racing all collide there. Additive, idempotent.",
    },
    {
      id: "1710_openproduct_credentials",
      context: "openproduct",
      path: "1710_openproduct_credentials/up.sql",
      checksum:
        "57dd8a52e7f8551846f4bbe879f0d18d361f08129678b20fce49d0424eed7050",
      description:
        "AC0 (openproduct-launch) — the credential store, DORMANT: schema and contract only, no route and no UI. IT HOLDS NO ADDRESS AT ANY POINT, which is the milestone's whole design. The plan's AC0 line asked for `openproduct.credentials (subject, email, argon2id verifier, verified_at)` and R1's binding text allowed an address column until `verified_at` was set; both are leftovers from before R1 was settled and both lose to two things that are not. I3, as written: 'No email column exists anywhere in the openproduct schema' — not a per-table claim but an information_schema query in repository-pg.test.ts, written that way so it covers every table added from here on without anyone remembering to extend it. And R1's own decision (a): the platform keeps the address against the subject id and openproduct asks it to send, HOLDING NOTHING. AC0 is the first milestone that would have wanted an exception to I3, and refusing to take one is the point: a guard with one carve-out is a guard that has learned to have carve-outs, and the next author finds the precedent before the argument. HOW THE GAP IS CROSSED: at sign-up there is no subject id yet, so the TOKEN carries the address and the PLATFORM holds it — openproduct stores only the token's hash beside the waiting verifier, hands the platform the address and the token together exactly as CB4 hands it a subject id and a kind, and on return receives a SUBJECT ID rather than the address. Two things fall out: enumeration becomes STRUCTURAL (openproduct cannot tell a known address from an unknown one, so AC1's 'answer identically' is not a rule anybody can forget), and there is NO WINDOW in which a row holds an address to leak, to appear in a backup, or to reach a log. The cost, stated plainly: the platform is in the loop on every sign-in, because openproduct has no address to match a typed one against — R1 already accepted that cost for reset, and this extends it rather than inventing it. ONE TOKEN TABLE FOR TWO PURPOSES: verify and reset carry different payloads (a waiting verifier and no subject; a subject and no verifier) but an identical lifecycle — issue, send, consume EXACTLY ONCE, expire — and the consume is the security-critical operation in both, so one table is one atomic UPDATE guarded on consumed_at where two would be two copies and the second is where the race gets forgotten; the payload difference is a CHECK showing both shapes at once. THE HASH IS STORED, NEVER THE TOKEN. A sign-up's verifier waits on the token table rather than on credentials, so an unverified sign-up cannot create a row meaning 'this person has an account'. Additive, idempotent.",
    },
    {
      id: "1730_openproduct_sessions",
      context: "openproduct",
      path: "1730_openproduct_sessions/up.sql",
      checksum:
        "8ec4235d3516f31bf1ddf7e6d04752ace9a87549d0f5af6876daa972f38431b4",
      description:
        "AC2b (openproduct-launch) — the session for the door the platform does not know about. Every signed-in visitor until now arrived through the platform's OAuth flow and carries an identity-scoped token the gateway RE-RESOLVES on every request; R2's safety argument is that a forged cookie buys nothing because the thing inside is checked against somebody else's authority. A password sign-in has no such token — the platform mints one only after a magic-link round trip — so openproduct mints its own, and this table is what keeps R2's argument TRUE rather than merely restated. A SIGNED BLOB WAS THE OBVIOUS ALTERNATIVE AND IS REFUSED, for two reasons about this estate rather than about JWTs: it would make one cookie a pointer that gets resolved and the other a claim that gets verified, so every later question (sign this person out, this subject was removed, is this still good) would have two answers and the first person to forget which door they hold writes the first security bug — and revocation would become a promise rather than a mechanism, since TS3 can remove somebody and a signed blob honours that whenever it happens to expire. So both doors keep the same shape: an unguessable token in the cookie, the row here, and the gateway resolves it against core exactly as it resolves a platform token against the platform. Same staleness bound, same answer to 'sign this person out'. THE HASH IS STORED, NEVER THE TOKEN — same rule as credential_tokens, because a readable token is the difference between losing a database and losing every account — and SHA-256 rather than argon2id, because a 32-byte token this app generated has no low-entropy guess for argon2id's cost to defend against and the read sits on every authenticated request. NOT HERE, DELIBERATELY: last_seen_at (it would turn every authenticated read into a write, on the hottest path this app has, to power nothing anybody asked for), user agent and IP (a durable record of where somebody reads from, powering a session list this product does not have — 'sign out everywhere' needs the subject id and nothing else, which is already here), and an address. Revocation is a TIMESTAMP rather than a delete: 'this session ended at 14:02' and 'this session never existed' are different answers, and incident response asks for the first. Additive, idempotent.",
    },
    {
      id: "1780_openproduct_repo_observed",
      context: "openproduct",
      path: "1780_openproduct_repo_observed/up.sql",
      checksum:
        "a7af264f48eac1bd051d795f0da3fcea6079fdb1fc5ae0159191fad2b4936ada",
      description:
        "openproduct: what the repository says about itself — observed name, description and topics (IN2)",
    },
    {
      id: "1790_openproduct_post_replies",
      context: "openproduct",
      path: "1790_openproduct_post_replies/up.sql",
      checksum:
        "698a286d9d06df5fa2327e85476a2722ed1f0f9432e48f37f90b5fd7261cde9a",
      description:
        "openproduct: one level of replies — posts may name the post they answer (CV1)",
    },
    {
      id: "1800_openproduct_mentions",
      context: "openproduct",
      path: "1800_openproduct_mentions/up.sql",
      checksum:
        "e88a0d64da500a22f33a68293724830a3b9b4b8614b359db6695e4b29baa904d",
      description:
        "openproduct: a mention is a delivery kind — widen the outbox vocabulary (CV3)",
    },
    {
      id: "1810_openproduct_repo_signals",
      context: "openproduct",
      path: "1810_openproduct_repo_signals/up.sql",
      checksum:
        "5beaca7a1d9ceb473de8b0811a7205222f3886f8364c945934e841a1cf6df698",
      description:
        "openproduct: observed repository signals — language, last push, open issues (PV0)",
    },
    {
      id: "1820_openproduct_media",
      context: "openproduct",
      path: "1820_openproduct_media/up.sql",
      checksum:
        "98a4028791511246542b294b67209be40b21ae23ae683c04045decf3bbb71e0d",
      description:
        "openproduct: the media model — three kinds, one table, provenance per row (MD0)",
    },
    {
      id: "1830_openproduct_install_line",
      context: "openproduct",
      path: "1830_openproduct_install_line/up.sql",
      checksum:
        "a9afcf4fa9769c6adb63f50941f4621797274d87545c33a1c70bfbcfc0aadba8",
      description:
        "openproduct: one copyable install command, authored and never derived (PV2)",
    },
    {
      id: "1840_openproduct_clean_votes",
      context: "openproduct",
      path: "1840_openproduct_clean_votes/up.sql",
      checksum:
        "7be10aef2dc9396a4bb445d9ec43a5dec77af791a3d4574ea8b3e970240ed79b",
      description:
        "openproduct: the clean-vote mark — a boolean over a ratio, never a count (PV3)",
    },
    {
      id: "1850_openproduct_snapshots",
      context: "openproduct",
      path: "1850_openproduct_snapshots/up.sql",
      checksum:
        "5a8375715019a654d37e39987ccf55ff802fbde3f703e6388de006a48d615c02",
      description:
        "openproduct: what a listing looked like on a day, so a diff has a baseline (PV4)",
    },
    {
      id: "1860_openproduct_sweep_errors",
      context: "openproduct",
      path: "1860_openproduct_sweep_errors/up.sql",
      checksum:
        "2a6a7969ac2a3b8b241174662f50aec90f3f39afc5f16737e800a42667857dd2",
      description:
        "openproduct: a sweep phase records why it failed beside when it ran; the board and digest cuts get a state row (LI0)",
    },
    {
      id: "1870_openproduct_jsonb_repair",
      context: "openproduct",
      path: "1870_openproduct_jsonb_repair/up.sql",
      checksum:
        "33dffba600a4541d8a8e60f866ad49d8a9eaf8db1de1b7a94b4c61b45bd1ac7a",
      description:
        "openproduct: every JSON parameter written through the production driver was double-encoded; the rows are put back (LI1)",
    },
    {
      id: "1880_openproduct_post_tags",
      context: "openproduct",
      path: "1880_openproduct_post_tags/up.sql",
      checksum:
        "5fb92257ca9eb1358b49eb54538d7a130ff15e7cdd61322c9fed35edc50d7207",
      description:
        "openproduct: a comment in the one conversation may carry the tag a titled discussion used to be classified by (PP0, WC-6)",
    },
    {
      id: "1890_openproduct_listing_follows",
      context: "openproduct",
      path: "1890_openproduct_listing_follows/up.sql",
      checksum:
        "cda8a644a6377f82ada0b2aab6ba47961e7fe3f12f329f6c8de12ba2d1aad9e8",
      description:
        "openproduct: a listing can be followed, targeted by slug; the count is public and the list is not (PP1)",
    },
    {
      id: "1895_openproduct_snapshot_sweep_state",
      context: "openproduct",
      path: "1895_openproduct_snapshot_sweep_state/up.sql",
      checksum:
        "b00cd318b2b0c157ebfd25e383f73204b82b1aebf716f557ca537aa2e304c506",
      description:
        "openproduct: the snapshot sweep's floor, which PV4 shipped without (OS2)",
    },
    {
      id: "1900_openproduct_pricing",
      context: "openproduct",
      path: "1900_openproduct_pricing/up.sql",
      checksum:
        "e59bca828e88cdbb3fe211fde854f32a2a3b94f687c628f403e490f547514e86",
      description:
        "openproduct: pricing as one enumerated, authored field on a listing (PP3)",
    },
    {
      id: "1905_openproduct_screenshot_captures",
      context: "openproduct",
      path: "1905_openproduct_screenshot_captures/up.sql",
      checksum:
        "5a85610c67198a9821f3045bdc1e64533e7e02bc08d6ca4450f640a0b2e80803",
      description:
        "openproduct: the screenshot capture ledger — one row per listing the sweep has tried to photograph (MD4)",
    },
    {
      id: "1915_openproduct_scale_indexes",
      context: "openproduct",
      path: "1915_openproduct_scale_indexes/up.sql",
      checksum:
        "898595a0eaf2dbbbd7355da171aaf9859fd22fa1e2e0c102d8c94a1c575249d4",
      description:
        "openproduct: the two indexes the plan test found missing — threads by last reply, endorsements by when (OS4)",
    },
    {
      id: "1925_openproduct_catalog",
      context: "openproduct",
      path: "1925_openproduct_catalog/up.sql",
      checksum:
        "e81e687d203329a96e1837e5cf3f14c833963b87324a5d2310ec0592410517a7",
      description:
        "openproduct: the catalogue materialised — catalog_cards in the published order by index, catalog_state with the census and the phase's health row (OS5)",
    },
    {
      id: "2255_openproduct_logo_media",
      context: "openproduct",
      path: "2255_openproduct_logo_media/up.sql",
      checksum:
        "d61c76af179997fc94bd11fdc4ca00b27cd7688afbf63e9808b0314d9180f780",
      description:
        "openproduct: logo joins the authored media kinds — product_media's kind and provenance CHECKs widened under their own names (openproduct-studio OSD2)",
    },
    {
      id: "2260_openproduct_search_index_checked",
      context: "openproduct",
      path: "2260_openproduct_search_index_checked/up.sql",
      checksum:
        "251aca780644579d7c9da580f4c02398c8ce9041c28ee634346de205744ca904",
      description:
        "openproduct: search_index_state.checked_at — a clean index the sweep checked is a run, so /health stops calling a quiet index stale (OPN-11)",
    },
  ],
};
