// The publish dialog's disclosure list (saas-openproduct OD6).
//
// The plan requires the dialog's list to be GENERATED from the projection
// contract "so it cannot drift". This file is what makes that a property rather
// than an intention: a field added to `PublicProfile` without matching copy
// fails here, before a maintainer is reassured about a shape that has changed
// underneath them.

import {
  PUBLIC_MAINTAINER_KEYS,
  PUBLIC_PROFILE_KEYS,
  PUBLIC_ROLE_OPENING_KEYS,
} from "@openproduct/contracts";
import {
  blockerCopy,
  BLOCKER_COPY,
  disclosureGaps,
  MAINTAINER_FIELDS,
  NEVER_PUBLIC,
  publishDisclosure,
  ROLE_OPENING_FIELDS,
  showsPromotionBanner,
} from "@openproduct-web/app/studio/publish-disclosure";
import { PUBLISH_BLOCKERS } from "@openproduct/contracts";

describe("the disclosure list is derived, not written", () => {
  it("accounts for every key in PublicProfile, in the contract's order", () => {
    expect(publishDisclosure().map((line) => line.key)).toEqual([...PUBLIC_PROFILE_KEYS]);
  });

  // The anti-drift assertion. If this fails, someone widened the public
  // projection and the dialog would have gone on describing the old one.
  it("has copy for every projected field — no silent gaps", () => {
    expect(disclosureGaps()).toEqual([]);
  });

  it("says something a maintainer can read for every line", () => {
    for (const line of publishDisclosure()) {
      expect(`${line.key}: ${line.label.length > 0 && line.label !== line.key}`).toBe(
        `${line.key}: true`,
      );
    }
  });

  it("names the nested shapes from the contract too", () => {
    expect([...MAINTAINER_FIELDS]).toEqual([...PUBLIC_MAINTAINER_KEYS]);
    expect([...ROLE_OPENING_FIELDS]).toEqual([...PUBLIC_ROLE_OPENING_KEYS]);
  });

  // The reassurance a maintainer actually wants is about the private plane.
  it("states what stays private, including the things org viewer can read", () => {
    const text = NEVER_PUBLIC.join(" ").toLowerCase();
    for (const claim of ["secret", "audit", "run", "agent", "spend", "catalog", "email"]) {
      expect(`${claim}: ${text.includes(claim)}`).toBe(`${claim}: true`);
    }
  });

  it("promises no email anywhere, in either direction", () => {
    const disclosure = JSON.stringify(publishDisclosure()).toLowerCase();
    // The maintainers line may mention emails only to say they are excluded.
    expect(disclosure).not.toMatch(/\bshows? (your |their )?email\b/);
    expect(NEVER_PUBLIC.join(" ").toLowerCase()).toContain("email");
  });
});

describe("blocker copy names a remedy, not a state", () => {
  it("covers every blocker the API can return", () => {
    for (const blocker of PUBLISH_BLOCKERS) {
      expect(`${blocker}: ${blocker in BLOCKER_COPY}`).toBe(`${blocker}: true`);
    }
  });

  it("tells a maintainer what to DO for each one", () => {
    for (const blocker of PUBLISH_BLOCKERS) {
      const copy = blockerCopy(blocker);
      expect(copy.remedy.length).toBeGreaterThan(20);
    }
  });

  it("sends a private-repo refusal to GitHub, where the fix actually is", () => {
    expect(blockerCopy("repo_private").remedy).toContain("GitHub");
  });

  it("degrades to something honest for an unknown blocker", () => {
    expect(blockerCopy("something_new").title.length).toBeGreaterThan(0);
  });
});

describe("the promotion banner (README §The private-repo case)", () => {
  // Keyed off the API’s own capability answer (review is the operator’s act
  // owner/admin only), so the console keeps no second copy of the role model.
  it("shows when the repo has gone private and the caller could act", () => {
    expect(showsPromotionBanner({ canReview: true, repoVisibility: "private" })).toBe(true);
  });

  // A builder cannot change repository visibility, so telling them about it is
  // noise aimed at someone who cannot act.
  it.each([false, null, undefined])("does not show for canReview=%p", (canReview) => {
    expect(showsPromotionBanner({ canReview, repoVisibility: "private" })).toBe(false);
  });

  it.each(["public", null, undefined])("does not show when repo visibility is %p", (repoVisibility) => {
    expect(showsPromotionBanner({ canReview: true, repoVisibility })).toBe(false);
  });
});
