// The two-sided edge (openproduct-commons CG3).
//
// THE WHOLE MILESTONE IS ONE TABLE, and this file is mostly about its shape.
// `ROSTER_ACTS` says who may do what and from which state; the handlers ask
// it and decide nothing themselves. So the assertions worth writing are
// about the table's structure — one act the maintainer alone may perform,
// one the named person alone, one both — because that structure IS the
// consent model, and four scattered `if`s could not be checked at all.

import { describe, expect, it } from "vitest";

import {
  GRANDFATHERED_SUBJECT_NOTE,
  PENDING_MAINTAINER_NOTE,
  PENDING_SUBJECT_NOTE,
  ROSTER_ACTORS,
  ROSTER_ACTS,
  ROSTER_ORIGINS,
  ROSTER_PROVENANCE_NOTE,
  ROSTER_STATES,
  mayAct,
  rosterAct,
} from "./roster.js";

describe("the permission table's SHAPE is the consent model", () => {
  it("only the NAMED PERSON may confirm", () => {
    // The asymmetry the whole table exists for. If a maintainer could confirm
    // on somebody's behalf, the edge would mean nothing and this would be
    // `published_maintainers` with extra columns.
    expect(rosterAct("confirm").by).toEqual(["subject"]);
    expect(mayAct("confirm", "maintainer", "pending")).toBe(false);
    expect(mayAct("confirm", "subject", "pending")).toBe(true);
  });

  it("only the MAINTAINER may invite", () => {
    // The mirror of the problem this table fixes, with the arrow reversed: a
    // person adding themselves to somebody else's product.
    expect(rosterAct("invite").by).toEqual(["maintainer"]);
    expect(mayAct("invite", "subject", "absent")).toBe(false);
    expect(mayAct("invite", "maintainer", "absent")).toBe(true);
  });

  it("only the named person may DECLINE", () => {
    expect(rosterAct("decline").by).toEqual(["subject"]);
    expect(mayAct("decline", "maintainer", "pending")).toBe(false);
  });

  it("EITHER side may retire, unilaterally", () => {
    // A person must be able to leave a product that has gone somewhere they
    // do not want their name; a maintainer must be able to end a role that
    // ended. Making either ask permission would make leaving a negotiation.
    expect([...rosterAct("retire").by].sort()).toEqual([...ROSTER_ACTORS].sort());
    expect(mayAct("retire", "subject", "confirmed")).toBe(true);
    expect(mayAct("retire", "maintainer", "confirmed")).toBe(true);
    // Including a pending one: withdrawing an invitation, or refusing to let
    // one sit there, are both reasonable.
    expect(mayAct("retire", "subject", "pending")).toBe(true);
    expect(mayAct("retire", "maintainer", "pending")).toBe(true);
  });

  it("gives exactly one act to each side alone, and one to both", () => {
    // The structural claim, asserted directly rather than inferred from the
    // four tests above — so adding a fifth act with the wrong `by` fails
    // here rather than passing quietly.
    const soleMaintainer = ROSTER_ACTS.filter((a) => a.by.length === 1 && a.by[0] === "maintainer");
    const soleSubject = ROSTER_ACTS.filter((a) => a.by.length === 1 && a.by[0] === "subject");
    const both = ROSTER_ACTS.filter((a) => a.by.length === 2);
    expect(soleMaintainer.map((a) => a.act)).toEqual(["invite"]);
    expect(soleSubject.map((a) => a.act)).toEqual(["confirm", "decline"]);
    expect(both.map((a) => a.act)).toEqual(["retire"]);
  });
});

describe("no act reaches a state it should not", () => {
  it("nothing can be done to a RETIRED edge", () => {
    // Retiring is an ending. Re-inviting somebody who left goes through
    // `invite` from `absent` — asking them back is a new invitation, not a
    // resurrection, and they get to answer it again.
    for (const act of ROSTER_ACTS) {
      for (const actor of ROSTER_ACTORS) {
        expect([act.act, actor, mayAct(act.act, actor, "retired")]).toEqual([
          act.act,
          actor,
          false,
        ]);
      }
    }
  });

  it("a confirmed edge cannot be confirmed again, or declined", () => {
    expect(mayAct("confirm", "subject", "confirmed")).toBe(false);
    // Declining is an answer to an INVITATION. Somebody who already said yes
    // and changed their mind is retiring, which is a different event and
    // leaves a different record.
    expect(mayAct("decline", "subject", "confirmed")).toBe(false);
  });

  it("an absent edge cannot be confirmed, declined or retired", () => {
    for (const act of ["confirm", "decline", "retire"] as const) {
      for (const actor of ROSTER_ACTORS) {
        expect([act, actor, mayAct(act, actor, "absent")]).toEqual([act, actor, false]);
      }
    }
  });

  it("inviting requires the edge NOT to exist", () => {
    // Re-inviting somebody who already has a pending invitation, or who
    // already confirmed, must not reset anything — the repository's upsert
    // says the same, and this is the half a reviewer can read.
    expect(mayAct("invite", "maintainer", "pending")).toBe(false);
    expect(mayAct("invite", "maintainer", "confirmed")).toBe(false);
  });
});

describe("the vocabulary is closed, and one word is missing on purpose", () => {
  it("has no `declined` state", () => {
    // A declined invitation leaves NO ROW. "I was never part of this" and "I
    // was, and now I am not" are different claims, and only the second is a
    // fact worth keeping — a `declined` row is a durable record that somebody
    // was asked and refused, which serves nobody but a curious maintainer.
    expect([...ROSTER_STATES]).toEqual(["pending", "confirmed", "retired"]);
    expect(ROSTER_STATES).not.toContain("declined");
    expect(rosterAct("decline").to).toBe("absent");
  });

  it("records whether a `confirmed` edge was actually consented to (OPC-G)", () => {
    // Grandfathering turns pre-CG3 rows into confirmed edges, which is right
    // — the alternative is every roster emptying on deploy — and is not the
    // same thing as consent. Without this, `confirmed` would mean two things
    // and nobody could audit which.
    expect([...ROSTER_ORIGINS]).toEqual(["confirmed_by_subject", "grandfathered"]);
  });

  it("refuses an unknown act loudly rather than answering `undefined`", () => {
    // The one place a missing rule must not read as "allowed".
    expect(() => rosterAct("promote" as never)).toThrow(/unknown roster act/);
  });
});

describe("what each party is told", () => {
  it("tells a maintainer that silence is not refusal", () => {
    expect(PENDING_MAINTAINER_NOTE).toMatch(/Waiting for them to confirm/);
    expect(PENDING_MAINTAINER_NOTE).toMatch(/Nobody sees this on the public page/);
    // ...and that a decline comes with no explanation, so they do not read
    // one into it.
    expect(PENDING_MAINTAINER_NOTE).toMatch(/without telling you why/);
  });

  it("tells the named person exactly what confirming does", () => {
    expect(PENDING_SUBJECT_NOTE).toMatch(/only if you confirm/);
    expect(PENDING_SUBJECT_NOTE).toMatch(/Declining removes it and tells them nothing/);
  });

  it("tells a grandfathered person the truth, plainly", () => {
    // THE SENTENCE THIS EPIC OWES THEM. They are on a public page because
    // somebody listed them before this model existed, and nobody asked. Any
    // softer wording would be us managing our own discomfort at their
    // expense.
    expect(GRANDFATHERED_SUBJECT_NOTE).toMatch(/You did not agree to this/);
    expect(GRANDFATHERED_SUBJECT_NOTE).toMatch(/remove yourself right now/);
    expect(GRANDFATHERED_SUBJECT_NOTE).toMatch(/without telling anyone why/);
    // And it does not pretend the carry-over was a favour to them.
    expect(GRANDFATHERED_SUBJECT_NOTE).not.toMatch(/for your convenience|to help you/i);
  });

  it("says on the public roster what the roster means", () => {
    expect(ROSTER_PROVENANCE_NOTE).toMatch(/confirmed their own place/);
    expect(ROSTER_PROVENANCE_NOTE).toMatch(/only that person can make it public/);
  });
});
