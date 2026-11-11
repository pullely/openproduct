// The openproduct repository against a live engine — the contributor home, the overlay, the search index, the handle, the trust ladder, the contributor profile.
//
// OH0's home reads, XP2's personalisation overlay, resolving a listing for a public act, DS0's index and the write that marks it stale, DS1's derived facets on the card, CG0's handle namespace, the trust ladder, and CG1/CG4's public contributor profile.
//
// Cut from `repository-pg.test.ts` at openproduct-verification OV3, verbatim:
// the engine, the ids and the two seeds come from `./harness.js`, which
// restores the ladder's template per test instead of re-applying fifty
// migrations. Nothing a test asserts changed; what it costs did.

import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import { sql, repo, ORG, ORG_OTHER, PROJECT_TWO, PROFILE, PROFILE_TWO, OPENING, ACTOR, ADMIN, NOW, REVIEWED_PUBLISH, seedDraft, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

const SUBJECT = "usr_00000000000000000000000000000abc";
const APPLICATION = asUuid("88888888-8888-4888-8888-888888888888");

describe("openproduct contributor home (OH0)", () => {
  it("contributor upsert is idempotent by subject and never touches identity.*", async () => {
    const created = await repo.upsertContributor({ subjectId: SUBJECT, displayName: "Ada", bio: "builds things" });
    expect(created.subjectId).toBe(SUBJECT);
    expect(created.displayName).toBe("Ada");
    const updated = await repo.upsertContributor({ subjectId: SUBJECT, displayName: "Ada L.", bio: null });
    expect(updated.displayName).toBe("Ada L.");
    expect(updated.bio).toBeNull();
    expect(await repo.getContributor("usr_unknown")).toBeNull();
  });

  it("one application per (subject, opening): re-applying re-uses the row and resets it to pending", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    const first = await repo.recordApplication({
      id: APPLICATION,
      subjectId: SUBJECT,
      profileId: PROFILE,
      roleOpeningId: OPENING,
      jrRequestRef: "jrq_1",
    });
    expect(first.status).toBe("pending");
    // JR says approved…
    expect(await repo.setApplicationStatusByRequestRef("jrq_1", "approved")).toBe(1);
    // …then the contributor applies again after a withdrawal elsewhere: the
    // SAME row is re-used with the new request ref, no duplicate accumulates.
    const again = await repo.recordApplication({
      id: asUuid("99999999-9999-4999-8999-999999999999"),
      subjectId: SUBJECT,
      profileId: PROFILE,
      roleOpeningId: OPENING,
      jrRequestRef: "jrq_2",
    });
    expect(again.id).toBe(first.id);
    expect(again.jrRequestRef).toBe("jrq_2");
    expect(again.status).toBe("pending");
    expect(await repo.listApplicationsBySubject(SUBJECT)).toHaveLength(1);
  });

  it("the status snapshot only speaks JR's vocabulary — an invented state is refused by the CHECK", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.recordApplication({
      id: APPLICATION, subjectId: SUBJECT, profileId: PROFILE, roleOpeningId: OPENING, jrRequestRef: "jrq_1",
    });
    await expect(
      sql.execute(`UPDATE openproduct.applications SET status = 'maybe' WHERE jr_request_ref = 'jrq_1'`),
    ).rejects.toThrow();
  });

  it("saved products surface ONLY public cards — an unpublish hides the bookmark, a re-publish restores it", async () => {
    await seedPublished();
    await repo.saveProduct(SUBJECT, PROFILE);
    expect((await repo.listSavedPublicCards(SUBJECT)).map((c) => c.slug)).toEqual(["acme-thing"]);

    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    // The row survives; the read re-asserts visibility instead of trusting
    // save time — no public-read path can return a private row.
    expect(await repo.listSavedPublicCards(SUBJECT)).toEqual([]);

    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);
    expect((await repo.listSavedPublicCards(SUBJECT)).map((c) => c.slug)).toEqual(["acme-thing"]);

    expect(await repo.unsaveProduct(SUBJECT, PROFILE)).toBe(true);
    expect(await repo.unsaveProduct(SUBJECT, PROFILE)).toBe(false);
  });

  it("saves by slug THROUGH the visibility filter; unsave works even after an unpublish", async () => {
    await seedDraft();
    // A draft cannot be saved — unknown and private answer identically.
    expect(await repo.saveProductBySlug(SUBJECT, "acme-thing")).toBe(false);
    expect(await repo.saveProductBySlug(SUBJECT, "no-such-slug")).toBe(false);

    await repo.recordRepoObservation(PROFILE, { repoVisibility: "public", repoLicence: null, observedAt: NOW });
    await repo.reviewProfile(PROFILE, ADMIN, NOW);
    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);
    expect(await repo.saveProductBySlug(SUBJECT, "ACME-THING")).toBe(true); // case-insensitive, like the page URL
    expect((await repo.listSavedPublicCards(SUBJECT)).map((c) => c.slug)).toEqual(["acme-thing"]);

    // The listing goes private: the bookmark hides, but REMOVAL still works —
    // a bookmark you cannot remove is a bug, and removal discloses nothing.
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await repo.listSavedPublicCards(SUBJECT)).toEqual([]);
    expect(await repo.unsaveProductBySlug(SUBJECT, "acme-thing")).toBe(true);
    expect(await repo.unsaveProductBySlug(SUBJECT, "acme-thing")).toBe(false);
  });

  it("the applications list joins the product's public identity — slug and tagline, nothing else", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.recordApplication({
      id: APPLICATION, subjectId: SUBJECT, profileId: PROFILE, roleOpeningId: OPENING,
    });
    const [application] = await repo.listApplicationsBySubject(SUBJECT);
    expect(application!.productSlug).toBe("acme-thing");
    expect(application!.productTagline).toBe("A thing, built in the open");
  });

  it("stores the curated components snapshot at publish and rewrites it wholesale (OH4)", async () => {
    await seedDraft();
    await repo.recordRepoObservation(PROFILE, { repoVisibility: "public", repoLicence: null, observedAt: NOW });
    await repo.reviewProfile(PROFILE, ADMIN, NOW);

    // Publish with a curated list…
    const published = await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, {
      ...REVIEWED_PUBLISH,
      components: [
        { name: "api-edge", kind: "service" },
        { name: "platform-db", kind: null },
      ],
    });
    expect(published!.components).toEqual([
      { name: "api-edge", kind: "service" },
      { name: "platform-db", kind: null },
    ]);
    expect((await repo.getPublicProfile("acme-thing"))!.components).toHaveLength(2);

    // …then re-publish choosing NOTHING: the snapshot is authored by the act
    // of publishing, so it is rewritten wholesale — to null, the default.
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    const republished = await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);
    expect(republished!.components).toBeNull();
  });

  it("resolves an opening by its JR link ref only on a PUBLIC listing (OH3)", async () => {
    await seedDraft();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.setRoleOpeningJoinLink(OPENING, "jl_abc");
    // The bridge write must not confirm anything about drafts.
    expect(await repo.getRoleOpeningByJoinLinkRef("jl_abc")).toBeNull();

    await repo.recordRepoObservation(PROFILE, { repoVisibility: "public", repoLicence: null, observedAt: NOW });
    await repo.reviewProfile(PROFILE, ADMIN, NOW);
    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);
    expect(await repo.getRoleOpeningByJoinLinkRef("jl_abc")).toEqual({
      id: OPENING,
      profileId: PROFILE,
    });
    expect(await repo.getRoleOpeningByJoinLinkRef("jl_unknown")).toBeNull();
  });

  it("deleting a profile cascades through applications and saved rows — the teardown unit holds", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.recordApplication({
      id: APPLICATION, subjectId: SUBJECT, profileId: PROFILE, roleOpeningId: OPENING,
    });
    await repo.saveProduct(SUBJECT, PROFILE);
    await repo.deleteProfile(ORG, PROFILE);
    expect(await repo.listApplicationsBySubject(SUBJECT)).toEqual([]);
    expect(await repo.listSavedPublicCards(SUBJECT)).toEqual([]);
  });

  // ─── openproduct-independence (OX4): the authorization list ───

  describe("listing maintainers — the authority handover's data half", () => {
    it("createProfile records the creator as the listing's first owner", async () => {
      await seedDraft();
      expect(await repo.getListingRole(PROFILE, ACTOR)).toBe("owner");
      expect(await repo.getListingRole(PROFILE, ADMIN)).toBeNull();
    });

    it("addListingMaintainer grants, upserts the role, and cascades with the profile", async () => {
      await seedDraft();
      await repo.addListingMaintainer(PROFILE, ADMIN, "maintainer", ACTOR);
      expect(await repo.getListingRole(PROFILE, ADMIN)).toBe("maintainer");
      // Upsert: a re-grant with a different role changes it rather than duping.
      await repo.addListingMaintainer(PROFILE, ADMIN, "owner", ACTOR);
      expect(await repo.getListingRole(PROFILE, ADMIN)).toBe("owner");
      // The teardown unit holds: deleting the profile deletes the grants.
      await repo.deleteProfile(ORG, PROFILE);
      expect(await repo.getListingRole(PROFILE, ADMIN)).toBeNull();
    });

    it("listMaintainedProfileIds answers per-org and per-subject — the list filter's whole input", async () => {
      await seedDraft();
      await seedDraft(PROFILE_TWO, PROJECT_TWO, "acme-other");
      await repo.addListingMaintainer(PROFILE_TWO, ADMIN, "maintainer", ACTOR);
      expect((await repo.listMaintainedProfileIds(ORG, ACTOR)).sort()).toEqual([PROFILE, PROFILE_TWO].sort());
      expect(await repo.listMaintainedProfileIds(ORG, ADMIN)).toEqual([PROFILE_TWO]);
      expect(await repo.listMaintainedProfileIds(ORG_OTHER, ACTOR)).toEqual([]);
    });

    it("the 1290 backfill made every existing creator an owner (proven by the migration having run)", async () => {
      // The suite applies the real migrations including 1290; a profile
      // created THROUGH the repository exercises the code path, and the
      // migration's INSERT…SELECT is idempotent over it (ON CONFLICT).
      await seedDraft();
      const again = await sql.execute(
        `INSERT INTO openproduct.listing_maintainers (profile_id, subject_id, role, added_by)
         SELECT p.id, p.created_by, 'owner', 'migration:1290' FROM openproduct.profiles p
         WHERE (p.created_by LIKE 'usr_%' OR p.created_by LIKE 'sp_%')
         ON CONFLICT (profile_id, subject_id) DO NOTHING`,
      );
      expect(again.rowCount).toBe(0);
      expect(await repo.getListingRole(PROFILE, ACTOR)).toBe("owner");
    });

    it("refuses a role outside the CHECK", async () => {
      await seedDraft();
      await expect(
        sql.execute(
          `INSERT INTO openproduct.listing_maintainers (profile_id, subject_id, role, added_by)
           VALUES ($1, $2, 'admin', $2)`,
          [PROFILE, ADMIN],
        ),
      ).rejects.toThrow();
    });
  });
});

describe("openproduct — the personalisation overlay (openproduct-commons XP2)", () => {
  const SUBJECT_X = "usr_0000000000000000000000000000000a";
  const APP_X = asUuid("99999999-9999-4999-8999-999999999999");

  it("bounds `saved` to the QUERIED slugs while `savedCount` stays the account total", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.saveProduct(SUBJECT_X, PROFILE);
    await repo.saveProduct(SUBJECT_X, PROFILE_TWO);

    // The page asked about ONE slug, so it is told about one — the overlay's
    // answer is a function of the page, not of the account's history. This is
    // what stops a product page from becoming a listing of everything you
    // ever saved.
    const one = await repo.overlayFor(SUBJECT_X, ["acme-thing"]);
    expect(one.savedSlugs).toEqual(["acme-thing"]);
    // ...but the TOTAL is still the total. Two different numbers, and
    // rendering the first as the second would tell someone with forty saved
    // products that they have one.
    expect(one.savedCount).toBe(2);

    const both = await repo.overlayFor(SUBJECT_X, ["acme-thing", "beta-thing"]);
    expect(both.savedSlugs).toEqual(["acme-thing", "beta-thing"]);
    expect(both.savedCount).toBe(2);
  });

  it("asking about nothing still answers the three counts", async () => {
    await seedPublished();
    await repo.saveProduct(SUBJECT_X, PROFILE);
    // The account chip needs the totals and no per-slug answer at all. It
    // must not have to invent an id to ask.
    const overlay = await repo.overlayFor(SUBJECT_X, []);
    expect(overlay.savedSlugs).toEqual([]);
    expect(overlay.savedCount).toBe(1);
  });

  it("never marks a listing that is not public — an unpublish takes the mark with it", async () => {
    await seedPublished();
    await repo.saveProduct(SUBJECT_X, PROFILE);
    expect((await repo.overlayFor(SUBJECT_X, ["acme-thing"])).savedSlugs).toEqual(["acme-thing"]);

    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    // The bookmark row survives (a re-publish restores it), but the overlay
    // re-asserts visibility rather than trusting save time. Marking a private
    // slug would CONFIRM that a listing by that name exists — the overlay
    // would become an existence oracle for drafts.
    const after = await repo.overlayFor(SUBJECT_X, ["acme-thing"]);
    expect(after.savedSlugs).toEqual([]);
    expect(after.savedCount).toBe(0);
  });

  it("matches the slug case-insensitively, exactly like the page URL does", async () => {
    await seedPublished();
    await repo.saveProduct(SUBJECT_X, PROFILE);
    expect((await repo.overlayFor(SUBJECT_X, ["ACME-Thing"])).savedSlugs).toEqual(["acme-thing"]);
  });

  it("counts requests and listings without multiplying them by each other", async () => {
    // THE BUG THIS EXISTS TO CATCH: three counts fetched by joining three
    // unrelated one-to-many relations, where each count comes back multiplied
    // by the cardinality of the others. With 2 saves x 1 request x 1 listing
    // a join would report 2 requests, not 1.
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.saveProduct(SUBJECT_X, PROFILE);
    await repo.saveProduct(SUBJECT_X, PROFILE_TWO);
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.recordApplication({
      id: APP_X,
      subjectId: SUBJECT_X,
      profileId: PROFILE,
      roleOpeningId: OPENING,
      jrRequestRef: "jrq_overlay",
    });
    await repo.addListingMaintainer(PROFILE, SUBJECT_X, "maintainer", ACTOR);

    const overlay = await repo.overlayFor(SUBJECT_X, []);
    expect(overlay.savedCount).toBe(2);
    expect(overlay.requestCount).toBe(1);
    expect(overlay.listingCount).toBe(1);
  });

  it("a subject with nothing gets zeroes, not a missing row", async () => {
    await seedPublished();
    // A person who has done nothing yet still has an ANSWER — the counts are
    // genuinely zero here, unlike an unread overlay, which is why the client
    // distinguishes "absent" from "ready with zeroes" rather than conflating
    // them into a falsy check.
    expect(await repo.overlayFor("usr_ffffffffffffffffffffffffffffffff", ["acme-thing"])).toEqual({
      savedSlugs: [],
      endorsedSlugs: [],
      savedCount: 0,
      requestCount: 0,
      listingCount: 0,
    });
  });

  // EN1 — the overlay now answers the PUBLIC act too, and the whole value of
  // these four tests is that they are written about a state where the two
  // answers DISAGREE. A subject who saved one listing and endorsed another is
  // the only fixture that can distinguish a real second subquery from a
  // handler that read `savedSlugs` into both fields.
  it("answers saved and endorsed as two separate lists over two separate tables", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.saveProduct(SUBJECT_X, PROFILE);
    await repo.endorse(PROFILE_TWO, SUBJECT_X, "confirmed", NOW);

    const overlay = await repo.overlayFor(SUBJECT_X, ["acme-thing", "beta-thing"]);
    expect(overlay.savedSlugs).toEqual(["acme-thing"]);
    expect(overlay.endorsedSlugs).toEqual(["beta-thing"]);
    // And the SAVE count is untouched by the endorsement. `saved_products`
    // was not widened, not counted and not migrated (EN-1): every row in it
    // was created under a promise that nobody would ever see it.
    expect(overlay.savedCount).toBe(1);
  });

  it("does not multiply the counts by the endorsements — two subqueries, never a join", async () => {
    // THE BUG THIS EXISTS TO CATCH is the same one the three-count test
    // catches, one relation later: joining endorsements in would multiply
    // `savedCount` by the number of endorsements the subject holds.
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.saveProduct(SUBJECT_X, PROFILE);
    await repo.endorse(PROFILE, SUBJECT_X, "confirmed", NOW);
    await repo.endorse(PROFILE_TWO, SUBJECT_X, "confirmed", NOW);

    const overlay = await repo.overlayFor(SUBJECT_X, ["acme-thing", "beta-thing"]);
    expect(overlay.savedCount).toBe(1);
    expect(overlay.savedSlugs).toEqual(["acme-thing"]);
    expect(overlay.endorsedSlugs).toEqual(["acme-thing", "beta-thing"]);
  });

  it("a withdrawn endorsement stops being marked, while the row survives", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, SUBJECT_X, "confirmed", NOW);
    expect((await repo.overlayFor(SUBJECT_X, ["acme-thing"])).endorsedSlugs).toEqual(["acme-thing"]);

    await repo.withdrawEndorsement(PROFILE, SUBJECT_X, "2026-08-19T12:00:00.000Z");
    expect((await repo.overlayFor(SUBJECT_X, ["acme-thing"])).endorsedSlugs).toEqual([]);
    // The row is still there — EN3 must be able to restate a total without
    // erasing what it restated, and a re-endorsement must reuse it.
    expect(await repo.getEndorsement(PROFILE, SUBJECT_X)).not.toBeNull();
  });

  it("a PENDING endorsement is still the visitor's own act, and is marked as theirs", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, SUBJECT_X, "pending", NOW);
    // `pending` means it does not move the PUBLIC total (TS1's floor). It
    // does not mean the person did not do it — showing them an un-endorsed
    // button after they clicked would teach them the button is broken, which
    // is the exact outcome recording-rather-than-refusing exists to avoid.
    expect((await repo.overlayFor(SUBJECT_X, ["acme-thing"])).endorsedSlugs).toEqual(["acme-thing"]);
    expect((await repo.countEndorsements(PROFILE, NOW)).total).toBe(0);
  });

  it("never marks an endorsement of a listing that is no longer public", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, SUBJECT_X, "confirmed", NOW);
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    // Same rule as the save: the overlay re-asserts visibility rather than
    // trusting endorse time, or it becomes an existence oracle for drafts.
    expect((await repo.overlayFor(SUBJECT_X, ["acme-thing"])).endorsedSlugs).toEqual([]);
  });
});

describe("openproduct — resolving a listing for the public act (openproduct-commons EN1)", () => {
  it("resolves a PUBLIC listing by slug, case-insensitively", async () => {
    await seedPublished();
    expect(await repo.getPublicProfileId("acme-thing")).toBe(PROFILE);
    expect(await repo.getPublicProfileId("ACME-Thing")).toBe(PROFILE);
  });

  it("answers null for a DRAFT exactly as it does for a slug that does not exist", async () => {
    await seedPublished();
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    // The two must be indistinguishable at the repository, not merely at the
    // handler: if the id came back and the refusal happened above, the answer
    // would already be in the process, and the next log line would leak it.
    expect(await repo.getPublicProfileId("acme-thing")).toBeNull();
    expect(await repo.getPublicProfileId("no-such-thing")).toBeNull();
  });

  it("but the WITHDRAWAL lookup ignores visibility entirely", async () => {
    await seedPublished();
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    // The mirror of the unsave rule. An endorsement you cannot withdraw
    // because somebody else unpublished their listing is a public act you are
    // stuck with — and withdrawing discloses nothing, because you already
    // knew the listing existed: you endorsed it.
    expect(await repo.getProfileIdBySlug("acme-thing")).toBe(PROFILE);
    expect(await repo.getProfileIdBySlug("no-such-thing")).toBeNull();
  });
});

describe("openproduct — the search index (openproduct-commons DS0)", () => {
  const DOC = (id: string, title = id, terms = [id], summary: string | null = null) => ({
    kind: "product",
    entityId: id,
    title,
    summary,
    terms,
    facets: { stack: ["typescript"] },
  });

  it("the replace is WHOLESALE — what leaves the document leaves the index", async () => {
    await repo.replaceSearchIndex("product", [DOC("acme-thing"), DOC("beta-thing")], NOW);
    expect((await repo.searchCandidates(["acme-thing", "beta-thing"], 10)).map((r) => r.entityId).sort())
      .toEqual(["acme-thing", "beta-thing"]);

    // beta-thing is unpublished, so the next catalog document simply does not
    // contain it. NOBODY had to remember to de-index it — which is the whole
    // reason the replace is wholesale rather than incremental.
    await repo.replaceSearchIndex("product", [DOC("acme-thing")], NOW);
    expect((await repo.searchCandidates(["acme-thing", "beta-thing"], 10)).map((r) => r.entityId))
      .toEqual(["acme-thing"]);
  });

  it("an empty document clears the kind — and only that kind", async () => {
    await repo.replaceSearchIndex("product", [DOC("acme-thing")], NOW);
    await repo.replaceSearchIndex("person", [DOC("ada")], NOW);

    // CG1's people index and this one must not clear each other when either
    // rebuilds alone.
    await repo.replaceSearchIndex("product", [], NOW);
    expect(await repo.searchCandidates(["acme-thing"], 10)).toEqual([]);
    expect((await repo.searchCandidates(["ada"], 10)).map((r) => r.entityId)).toEqual(["ada"]);
  });

  it("narrows by term OVERLAP and carries the facets back", async () => {
    await repo.replaceSearchIndex(
      "product",
      [
        DOC("acme-thing", "acme-thing", ["acme", "thing", "queue"], "A job queue"),
        DOC("beta-thing", "beta-thing", ["beta", "thing", "mail"], "Email"),
      ],
      NOW,
    );
    // OR across terms — the candidate set is deliberately generous, because
    // the RANK (which is a published formula, not this query) decides what
    // survives. A query that pre-filtered to an AND here would be an ordering
    // decision hidden inside a WHERE clause.
    expect((await repo.searchCandidates(["queue"], 10)).map((r) => r.entityId)).toEqual(["acme-thing"]);
    expect((await repo.searchCandidates(["thing"], 10)).map((r) => r.entityId).sort())
      .toEqual(["acme-thing", "beta-thing"]);
    expect(await repo.searchCandidates(["nothing-like-this"], 10)).toEqual([]);
    expect(await repo.searchCandidates([], 10)).toEqual([]);

    const [row] = await repo.searchCandidates(["queue"], 10);
    expect(row!.facets).toEqual({ stack: ["typescript"] });
    expect(row!.summary).toBe("A job queue");
  });

  it("refuses a row with no terms — it could never match, so it is not storable", async () => {
    await expect(
      repo.replaceSearchIndex("product", [DOC("acme-thing", "acme-thing", [])], NOW),
    ).rejects.toThrow();
  });

  it("a rebuild clears dirty; a write sets it and keeps the FIRST dirtying instant", async () => {
    // Seeded dirty by the migration: an index that has never been built must
    // build, because an empty index answers everything with nothing and that
    // reads as "this commons has no products in it".
    const seeded = await repo.getSearchIndexState();
    expect(seeded.builtAt).toBeNull();
    expect(seeded.dirtyAt).not.toBeNull();

    await repo.replaceSearchIndex("product", [DOC("acme-thing")], NOW);
    const built = await repo.getSearchIndexState();
    expect(built.builtAt).not.toBeNull();
    expect(built.dirtyAt).toBeNull();

    const first = "2026-08-17T12:05:00.000Z";
    const later = "2026-08-17T12:09:00.000Z";
    await repo.markSearchIndexDirty(first);
    await repo.markSearchIndexDirty(later);
    // COALESCE, not assignment. The floor is measured from the last BUILD;
    // overwriting on every write would make a steady stream of edits look
    // permanently "just dirtied", which is the busy minute the floor is for.
    expect(Date.parse((await repo.getSearchIndexState()).dirtyAt!)).toBe(Date.parse(first));
  });

  it("there can only ever be one state row", async () => {
    await expect(
      sql.execute(`INSERT INTO openproduct.search_index_state (singleton) VALUES (TRUE)`),
    ).rejects.toThrow();
    await expect(
      sql.execute(`INSERT INTO openproduct.search_index_state (singleton) VALUES (FALSE)`),
    ).rejects.toThrow();
  });
});

describe("openproduct — the index is marked stale by the WRITE, not by a caller (DS0)", () => {
  async function build() {
    await repo.replaceSearchIndex(
      "product",
      [{ kind: "product", entityId: "acme-thing", title: "acme-thing", summary: null, terms: ["acme"], facets: {} }],
      NOW,
    );
  }

  it("publishing marks it stale", async () => {
    await seedDraft();
    await repo.recordRepoObservation(PROFILE, { repoVisibility: "public", repoLicence: null, observedAt: NOW });
    await repo.reviewProfile(PROFILE, ADMIN, NOW);
    await build();
    expect((await repo.getSearchIndexState()).dirtyAt).toBeNull();

    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);
    expect((await repo.getSearchIndexState()).dirtyAt).not.toBeNull();
  });

  it("UNPUBLISHING marks it stale — the one that matters most", async () => {
    await seedPublished();
    await build();
    expect((await repo.getSearchIndexState()).dirtyAt).toBeNull();

    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    // A listing that is still findable after being unpublished is the single
    // worst bug this subsystem can have. The mark lives in the repository so
    // no handler can forget it.
    expect((await repo.getSearchIndexState()).dirtyAt).not.toBeNull();
  });

  it("a write that changed NOTHING does not mark it stale", async () => {
    await seedPublished();
    await build();
    // Wrong org: the UPDATE matches no row, so the document did not change
    // and a rebuild would be pure cost.
    await repo.unpublishProfile(ORG_OTHER, PROFILE, ACTOR);
    expect((await repo.getSearchIndexState()).dirtyAt).toBeNull();
  });
});

describe("openproduct — the card carries what the derived facets need (DS1)", () => {
  it("carries the AUTHORED commitment lines of the OPEN roles only", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({
      id: OPENING,
      profileId: PROFILE,
      title: "Design lead",
      commitment: "One evening a week",
      sortOrder: 1,
    });
    await repo.upsertRoleOpening({
      id: asUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      profileId: PROFILE,
      title: "Closed one",
      commitment: "A few hours a week",
      status: "closed",
      sortOrder: 2,
    });

    const [card] = await repo.listPublicCards();
    // A CLOSED role's commitment must not reach the facet: filtering to
    // "one evening a week" and landing on a listing with nothing open is the
    // exact disappointment the `none-open` bucket exists to prevent.
    expect(card!.openCommitments).toEqual(["One evening a week"]);
    expect(card!.roleOpeningCount).toBe(1);
  });

  it("carries a BOOLEAN for the live URL, never the address", async () => {
    await seedPublished();
    expect((await repo.listPublicCards())[0]!.hasLiveUrl).toBe(false);

    await repo.updateProfile(ORG, PROFILE, { liveUrl: "https://acme.example", updatedBy: ACTOR });
    const [card] = await repo.listPublicCards();
    expect(card!.hasLiveUrl).toBe(true);
    // The card is a list row and does not link out. Carrying the address
    // would widen the public projection for a filter's benefit.
    expect(Object.values(card!)).not.toContain("https://acme.example");
  });

  it("an opening with no commitment line contributes nothing rather than a blank", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Unstated" });
    const [card] = await repo.listPublicCards();
    // A NULL commitment is dropped in SQL, so the contract never has to
    // decide what an empty string means.
    expect(card!.openCommitments).toEqual([]);
  });
});

describe("openproduct — the handle namespace (openproduct-commons CG0)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";

  it("claims a free handle, and re-claiming your OWN is not 'taken'", async () => {
    expect((await repo.claimHandle("ada", ADA, NOW))?.subjectId).toBe(ADA);
    // The commonest way to hit this path is somebody re-submitting their own
    // form. Telling them their own handle is taken is both wrong and alarming.
    expect((await repo.claimHandle("ada", ADA, NOW))?.subjectId).toBe(ADA);
    expect(await repo.claimHandle("ada", BOB, NOW)).toBeNull();
  });

  it("a RELEASED handle is never re-issued — not to anyone, not even its owner", async () => {
    await repo.claimHandle("ada", ADA, NOW);
    const released = await repo.releaseHandle(ADA, "2026-08-18T12:00:00.000Z");
    expect(released?.releasedAt).not.toBeNull();

    // The row survives as a TOMBSTONE. A handle is an identity somebody handed
    // out — it is in commit messages, chat logs, address books — and giving it
    // to somebody else hands them the accumulated trust of a stranger.
    expect(await repo.claimHandle("ada", BOB, NOW)).toBeNull();
    // Not even the original holder: "I released it by mistake" and "I am
    // impersonating the person who released it" are indistinguishable here,
    // and only one of them is safe to be wrong about.
    expect(await repo.claimHandle("ada", ADA, NOW)).toBeNull();
    expect((await repo.getHandle("ada"))?.releasedAt).not.toBeNull();
  });

  it("a RESERVED handle is refused, and is not a free row", async () => {
    // Seeded by the migration, with a reason the API can render.
    const reserved = await repo.getHandle("docs");
    expect(reserved).toMatchObject({ reservedFor: "route", subjectId: null, releasedAt: null });
    expect(await repo.claimHandle("docs", ADA, NOW)).toBeNull();
    expect(await repo.claimHandle("admin", ADA, NOW)).toBeNull();
  });

  it("one ACTIVE handle per subject, but a released one does not block a new claim", async () => {
    await repo.claimHandle("ada", ADA, NOW);
    // A second live handle for the same person is refused by the partial
    // unique index — a person with two addresses has two reputations.
    await expect(repo.claimHandle("ada-two", ADA, NOW)).rejects.toThrow();

    await repo.releaseHandle(ADA, "2026-08-18T12:00:00.000Z");
    // ...but once released, the index no longer covers the row, so a new
    // handle is claimable and BOTH rows exist forever.
    expect((await repo.claimHandle("ada-two", ADA, NOW))?.subjectId).toBe(ADA);
    expect((await repo.getActiveHandleForSubject(ADA))?.handle).toBe("ada-two");
    expect((await repo.getHandle("ada"))?.releasedAt).not.toBeNull();
  });

  it("is case-insensitive: one person, one row, however it was typed", async () => {
    await repo.claimHandle("Ada", ADA, NOW);
    expect((await repo.getHandle("ADA"))?.handle).toBe("ada");
    expect(await repo.claimHandle("ADA", BOB, NOW)).toBeNull();
  });

  it("the CHECK enforces the grammar, not only the application", async () => {
    // This column is a URL segment. A segment only the application validates
    // is one a direct INSERT can break for every reader.
    for (const bad of ["a", "-ada", "ada-", "Ada!", "a".repeat(33), "ada_b"]) {
      await expect(
        sql.execute(`INSERT INTO openproduct.handles (handle, reserved_for) VALUES ($1, 'x')`, [bad]),
      ).rejects.toThrow();
    }
    // And the boundaries are claimable.
    expect((await repo.claimHandle("ab", ADA, NOW))?.handle).toBe("ab");
    expect((await repo.claimHandle("a".repeat(32), BOB, NOW))?.handle).toBe("a".repeat(32));
  });

  it("releasing when you hold nothing is a no-op, not an error", async () => {
    expect(await repo.releaseHandle(ADA, NOW)).toBeNull();
  });

  it("`sitemap.xml` is absent from the reserved list because it is unclaimable", async () => {
    // A reserved list containing entries that could never be claimed teaches
    // its reader that the list is decorative.
    expect(await repo.getHandle("sitemap.xml")).toBeNull();
    expect((await repo.getHandle("sitemap"))?.reservedFor).toBe("route");
  });
});

describe("openproduct — the trust ladder against the engine (openproduct-commons TS1)", () => {
  async function publishable() {
    await seedDraft();
    await repo.recordRepoObservation(PROFILE, { repoVisibility: "public", repoLicence: null, observedAt: NOW });
  }

  it("an UNREVIEWED listing publishes when the ladder waives review", async () => {
    await publishable();
    // OD's rule was `reviewed_at IS NOT NULL`, unconditionally, in this very
    // statement. TS1 makes the predicate the RESOLVED DECISION instead — still
    // re-asserted in SQL so a race cannot slip past, but no longer a blanket
    // rule that outgrows the catalog.
    const published = await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, {
      allowWithoutReview: true,
      indexable: false,
    });
    expect(published?.visibility).toBe("public");
    expect(published?.indexable).toBe(false);
    expect(published?.reviewedAt).toBeNull();
  });

  it("without the waiver, an unreviewed listing still cannot publish", async () => {
    await publishable();
    // The exception route survives, and it is still enforced in SQL.
    expect(
      await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, {
        allowWithoutReview: false,
        indexable: true,
      }),
    ).toBeNull();
  });

  it("a REVIEW raises indexability — the whole remedy a new maker is offered", async () => {
    await publishable();
    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, { allowWithoutReview: true, indexable: false });
    expect((await repo.getPublicProfile("acme-thing"))?.indexable).toBe(false);

    const reviewed = await repo.reviewProfile(PROFILE, ADMIN, NOW);
    // Set unconditionally rather than COALESCEd: a review is a decision about
    // THIS listing and supersedes whatever the ladder decided at publish.
    expect(reviewed?.indexable).toBe(true);
    expect((await repo.getPublicProfile("acme-thing"))?.indexable).toBe(true);
  });

  it("the unreviewed cap counts what a subject MAINTAINS, not what they created", async () => {
    await publishable();
    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, { allowWithoutReview: true, indexable: false });
    // The creator is the first maintainer (migration 1290), so they are counted.
    expect(await repo.countUnreviewedPublished(ACTOR)).toBe(1);

    // A cap keyed on `created_by` is a cap that transferring a listing walks
    // straight around — the authority handover made MAINTAINERS the fact of
    // who holds a listing, so that is what the cap counts.
    await repo.addListingMaintainer(PROFILE, ADMIN, "maintainer", ACTOR);
    expect(await repo.countUnreviewedPublished(ADMIN)).toBe(1);

    // A reviewed listing stops counting: the cap exists only while nothing of
    // the maker's has been cleared.
    await repo.reviewProfile(PROFILE, ADMIN, NOW);
    expect(await repo.countUnreviewedPublished(ACTOR)).toBe(0);
  });

  it("a PRIVATE listing never counts toward the cap", async () => {
    await publishable();
    // Nothing is public, so nothing is being amplified, so there is nothing
    // for a cap on public listings to be about.
    expect(await repo.countUnreviewedPublished(ACTOR)).toBe(0);
  });

  it("existing listings default to indexable — the ladder is about newcomers", async () => {
    await seedPublished();
    // Every listing that existed when 1370 ran was published under OD's rules,
    // which required a human review. Defaulting them to FALSE would de-index
    // the entire live catalog to express a rule about first-timers.
    expect((await repo.getPublicProfile("acme-thing"))?.indexable).toBe(true);
    expect((await repo.listPublicCards())[0]!.indexable).toBe(true);
  });
});

describe("openproduct — the public contributor profile (openproduct-commons CG1)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";

  async function optedIn() {
    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada Fenwick", bio: "Builds queues." });
    await repo.claimHandle("ada", ADA, NOW);
    await repo.setProfileVisibility(ADA, true, NOW);
  }

  // DS4 — the index behind the sitemap. Every test here asserts it AGREES
  // with the single read against the same fixtures, rather than inspecting
  // its SQL: two predicates that are meant to be the same predicate drift the
  // moment one of them is edited, and the symptom is a sitemap full of pages
  // that 404 — which teaches a crawler to stop trusting the document for the
  // pages that are really there.
  it("lists exactly the handles the single read resolves", async () => {
    await optedIn();
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);

    const index = await repo.listPublicContributorHandles();
    expect(index.map((r) => r.handle)).toEqual(["ada"]);
    // The `lastmod` is the moment the PUBLIC page began, and it is the same
    // moment the single read reports — one fact, not two.
    const single = await repo.getPublicContributor("ada");
    expect(single).not.toBeNull();
    expect(index[0]!.publishedAt).toBe(single!.publishedAt);
    // An ISO STRING, not a Date. The contract says string, and the sitemap
    // slices it to a date — `Date.prototype.slice` does not exist, so a raw
    // driver value here is a 500 on `/sitemap.xml` and nowhere else.
    expect(typeof index[0]!.publishedAt).toBe("string");
    expect(index[0]!.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("omits somebody who opted in but has no standing — BOTH gates, again", async () => {
    await optedIn();
    // Gate 1 passed, gate 2 has not. The single read answers null; the index
    // must not advertise a page that would 404.
    expect(await repo.getPublicContributor("ada")).toBeNull();
    expect(await repo.listPublicContributorHandles()).toEqual([]);
  });

  it("omits somebody with standing who never opted in", async () => {
    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada Fenwick", bio: null });
    await repo.claimHandle("ada", ADA, NOW);
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    // OPC-5 in the sitemap: nobody appears publicly without their own act,
    // and a crawler being pointed at a page is an appearance.
    expect(await repo.listPublicContributorHandles()).toEqual([]);
  });

  it("drops a handle the moment its standing lapses, and restores it", async () => {
    await optedIn();
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    expect(await repo.listPublicContributorHandles()).toHaveLength(1);

    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    // The join, not a column: unpublish your last listing and the page stops
    // rendering, so the sitemap must stop naming it in the same breath.
    expect(await repo.listPublicContributorHandles()).toEqual([]);
    expect(await repo.getPublicContributor("ada")).toBeNull();

    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);
    expect(await repo.listPublicContributorHandles()).toHaveLength(1);
  });

  it("never names a RELEASED handle, even while its old holder is public", async () => {
    await optedIn();
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    await repo.releaseHandle(ADA, NOW);
    // A released row is a tombstone. Naming it would send crawlers at an
    // address that resolves to nobody — and would hand the old holder's
    // address to whoever reads the sitemap next.
    expect(await repo.listPublicContributorHandles()).toEqual([]);
  });

  it("orders by handle, so the sitemap is stable between builds", async () => {
    // Not cosmetic: an unordered sitemap changes on every rebuild for no
    // reason, and a document that always looks changed carries no signal
    // about what actually changed.
    await seedPublished();
    for (const handle of ["zed", "ada", "mo"]) {
      const subject = `usr_000000000000000000000000000${handle.padEnd(5, "0")}`;
      await repo.upsertContributor({ subjectId: subject, displayName: null, bio: null });
      await repo.claimHandle(handle, subject, NOW);
      await repo.setProfileVisibility(subject, true, NOW);
      await repo.addListingMaintainer(PROFILE, subject, "maintainer", ACTOR);
    }
    expect((await repo.listPublicContributorHandles()).map((r) => r.handle)).toEqual([
      "ada",
      "mo",
      "zed",
    ]);
  });

  // CG2 — the directory. The eligibility rule is now expressed by three
  // statements (the page, the sitemap index, this), which is two more than
  // anybody wants — so what these tests assert is that the three AGREE
  // against the same fixtures, not what any one of them says.
  it("lists exactly the people the page and the sitemap agree are public", async () => {
    await optedIn();
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);

    const cards = await repo.listPublicContributorCards(50);
    const index = await repo.listPublicContributorHandles();
    expect(cards.map((c) => c.handle)).toEqual(index.map((r) => r.handle));
    expect(cards[0]).toMatchObject({
      handle: "ada",
      displayName: "Ada Fenwick",
      openToProject: false,
      maintains: ["acme-thing"],
    });
    expect(await repo.getPublicContributor("ada")).not.toBeNull();
  });

  it("carries the slugs behind `Maintains N`, and only PUBLIC ones", async () => {
    await optedIn();
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    await repo.addListingMaintainer(PROFILE_TWO, ADA, "maintainer", ACTOR);
    expect((await repo.listPublicContributorCards(50))[0]!.maintains).toEqual([
      "acme-thing",
      "beta-thing",
    ]);

    await repo.unpublishProfile(ORG, PROFILE_TWO, ACTOR);
    // The count on the card is a claim about somebody's public work, and an
    // unpublished listing is not public work. It must drop out of the count
    // in the same breath it drops off the page.
    expect((await repo.listPublicContributorCards(50))[0]!.maintains).toEqual(["acme-thing"]);
  });

  it("carries no links — the projection is narrower than the page's", async () => {
    await optedIn();
    await repo.upsertContributor({
      subjectId: ADA,
      githubUrl: "https://github.com/ada",
      siteUrl: "https://ada.example",
    });
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);

    const card = (await repo.listPublicContributorCards(50))[0]!;
    expect(Object.keys(card).sort()).toEqual([
      "bio",
      // CG4 — a COUNT, and deliberately not a second list of slugs.
      "contributesTo",
      "displayName",
      "handle",
      // PE3 — a live launch on a listed listing they maintain: a fact the
      // index filters by. Added on main with the record; asserted here.
      "launched",
      "maintains",
      "openToProject",
    ]);
    // The page still has them; the DIRECTORY does not.
    expect((await repo.getPublicContributor("ada"))!.githubUrl).toBe("https://github.com/ada");
  });

  it("omits everyone the single read would 404 — all three reasons", async () => {
    await seedPublished();

    // 1. Opted in, no standing.
    await repo.upsertContributor({ subjectId: ADA, displayName: null, bio: null });
    await repo.claimHandle("ada", ADA, NOW);
    await repo.setProfileVisibility(ADA, true, NOW);
    expect(await repo.listPublicContributorCards(50)).toEqual([]);

    // 2. Standing, never opted in.
    const BO = "usr_00000000000000000000000000000bo0";
    await repo.upsertContributor({ subjectId: BO, displayName: null, bio: null });
    await repo.claimHandle("bo", BO, NOW);
    await repo.addListingMaintainer(PROFILE, BO, "maintainer", ACTOR);
    expect(await repo.listPublicContributorCards(50)).toEqual([]);

    // 3. Both, then the handle is released.
    await repo.setProfileVisibility(BO, true, NOW);
    expect((await repo.listPublicContributorCards(50)).map((c) => c.handle)).toEqual(["bo"]);
    await repo.releaseHandle(BO, NOW);
    expect(await repo.listPublicContributorCards(50)).toEqual([]);
  });

  it("bounds the read, and clamps a hostile limit", async () => {
    await seedPublished();
    for (const handle of ["ann", "bea", "cai", "dot"]) {
      const subject = `usr_000000000000000000000000000${handle}00`;
      await repo.upsertContributor({ subjectId: subject, displayName: null, bio: null });
      await repo.claimHandle(handle, subject, NOW);
      await repo.setProfileVisibility(subject, true, NOW);
      await repo.addListingMaintainer(PROFILE, subject, "maintainer", ACTOR);
    }
    expect(await repo.listPublicContributorCards(2)).toHaveLength(2);
    // This is the one public read whose row count grows with PEOPLE rather
    // than with listings, so an unbounded query here is the shape of a slow
    // request somebody discovers by accident.
    expect(await repo.listPublicContributorCards(0)).toHaveLength(1);
    expect(await repo.listPublicContributorCards(-3)).toHaveLength(1);
    expect(await repo.listPublicContributorCards(10_000)).toHaveLength(4);
  });

  it("BOTH gates are required — the opt-in alone is not a profile", async () => {
    await optedIn();
    // Gate 1 passed, gate 2 has not: Ada maintains nothing public. CG-2 is
    // the anti-spam property of the whole people surface — a directory open
    // to anyone who can sign in is a spam directory within a month.
    expect(await repo.getPublicContributor("ada")).toBeNull();

    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    const profile = await repo.getPublicContributor("ada");
    expect(profile).toMatchObject({ handle: "ada", displayName: "Ada Fenwick" });
    // The tagline comes from the LISTING, not from anything the person typed
    // — a profile borrows its products' identity and authors none of it.
    expect(profile!.maintains).toEqual([
      { slug: "acme-thing", tagline: "A thing, built in the open" },
    ]);
  });

  it("standing is a JOIN, so a page cannot outlive it", async () => {
    await optedIn();
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    expect(await repo.getPublicContributor("ada")).not.toBeNull();

    // Unpublish the only listing: the page stops rendering, with nobody
    // having touched the contributor row. A denormalised `has_standing` flag
    // would be a cache of this join, and the bug it produces is exactly a
    // page that outlives the standing it was granted for.
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await repo.getPublicContributor("ada")).toBeNull();

    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);
    expect(await repo.getPublicContributor("ada")).not.toBeNull();
  });

  it("withdrawing the opt-in takes the page down and KEEPS the date", async () => {
    await optedIn();
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);

    await repo.setProfileVisibility(ADA, false, "2026-08-20T12:00:00.000Z");
    expect(await repo.getPublicContributor("ada")).toBeNull();

    // `published_at` is when the public surface BEGAN, and re-stamping it on
    // every toggle would let somebody quietly reset their own history — which
    // an appeal or a transparency record needs to stay fixed.
    const again = await repo.setProfileVisibility(ADA, true, "2026-08-21T12:00:00.000Z");
    expect(Date.parse(again!.publishedAt!)).toBe(Date.parse(NOW));
  });

  it("a RELEASED handle resolves to nobody, even while its old holder is public", async () => {
    await optedIn();
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    await repo.releaseHandle(ADA, "2026-08-20T12:00:00.000Z");

    // The tombstone doing its job on the read side: resolving it would hand
    // the old holder's links and bio to whoever reads them next.
    expect(await repo.getPublicContributor("ada")).toBeNull();
  });

  it("the schema refuses a public row with no moment it became public", async () => {
    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada" });
    await expect(
      sql.execute(`UPDATE openproduct.contributors SET profile_public = TRUE WHERE subject_id = $1`, [ADA]),
    ).rejects.toThrow(/contributors_published_coherent/);
  });

  it("links are separately clearable, and the pill is not touched by a name edit", async () => {
    await repo.upsertContributor({
      subjectId: ADA,
      displayName: "Ada",
      githubUrl: "https://github.com/ada",
      siteUrl: "https://ada.example",
      openToProject: true,
    });
    // A name edit that omits the links must not silently wipe them —
    // `undefined` means unchanged, and only an explicit null clears.
    const renamed = await repo.upsertContributor({ subjectId: ADA, displayName: "Ada F" });
    expect(renamed).toMatchObject({
      displayName: "Ada F",
      githubUrl: "https://github.com/ada",
      siteUrl: "https://ada.example",
      openToProject: true,
    });

    const cleared = await repo.upsertContributor({ subjectId: ADA, displayName: "Ada F", githubUrl: null });
    expect(cleared.githubUrl).toBeNull();
    expect(cleared.siteUrl).toBe("https://ada.example");
  });

  it("the schema bounds every authored string — an unbounded public column is a DoS", async () => {
    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada" });
    await expect(
      sql.execute(`UPDATE openproduct.contributors SET bio = repeat('x', 2001) WHERE subject_id = $1`, [ADA]),
    ).rejects.toThrow(/contributors_bounded_text/);
    await expect(
      sql.execute(`UPDATE openproduct.contributors SET site_url = repeat('x', 301) WHERE subject_id = $1`, [ADA]),
    ).rejects.toThrow(/contributors_bounded_text/);
  });
});
