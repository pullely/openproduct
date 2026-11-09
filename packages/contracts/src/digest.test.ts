// The week, published (openproduct-commons LC1).

import { describe, expect, it } from "vitest";

import {
  COLLECTION_PENDING_NOTE,
  DIGEST_ENDORSED_LIMIT,
  DIGEST_LAUNCH_LIMIT,
  DIGEST_ORDER_FORMULA,
  FEED_DESCRIPTION,
  NO_ENDORSEMENTS_NOTE,
  NO_LAUNCHES_NOTE,
  NO_LAUNCHES_WHY,
  digestMaxAge,
  isPublishable,
} from "./digest.js";
import { FORMULAS } from "./provenance.js";
import { weekOf, weekWindow } from "./weeks.js";

describe("the empty week is the design constraint", () => {
  it("says the week was empty, and says why it is not padded", () => {
    // A digest that looks right with twenty launches and broken with none
    // cannot ship until the catalog is already busy — which is backwards,
    // because the digest is one of the few things that makes a quiet catalog
    // compound.
    expect(NO_LAUNCHES_NOTE).toMatch(/Nothing launched this week/);
    // THE TEMPTING FIX IS THE ONE IT REFUSES: widening the window until
    // something appears, under a heading naming one week, on an archive whose
    // only value is that its dates are exact.
    // VC0 moved this behind a disclosure; the sentence is unchanged and still
    // on the page, so the assertion follows it. What it guards — that the
    // refusal is stated rather than assumed — is exactly as before.
    expect(NO_LAUNCHES_WHY).toMatch(/widen the window/);
    expect(NO_ENDORSEMENTS_NOTE.length).toBeGreaterThan(10);
  });

  it("names the collection slot rather than omitting it", () => {
    // A reader who can see collections are coming knows the page is
    // unfinished; one who sees two sections cannot tell whether a third was
    // never built or was empty this week.
    expect(COLLECTION_PENDING_NOTE).toMatch(/curated collection/);
    expect(COLLECTION_PENDING_NOTE).toMatch(/curator/);
  });
});

describe("the digest's one ordering is published (OPC-4, I7)", () => {
  it("resolves to a real formula", () => {
    expect(FORMULAS[DIGEST_ORDER_FORMULA]).toBeDefined();
    expect(FORMULAS[DIGEST_ORDER_FORMULA]!.computedBy).toBe("LC1");
  });

  it("says it counts the WEEK, not a trailing window", () => {
    // THE CORRECTNESS CLAIM. `endorsements.7d` is the last seven days as of
    // the last sweep; for an archived week that is the wrong seven days
    // entirely, and a digest for week 34 read in week 40 would report week
    // 40's numbers under week 34's heading.
    const sentence = FORMULAS[DIGEST_ORDER_FORMULA]!.sentence;
    expect(sentence).toMatch(/DURING that week/);
    expect(sentence).toMatch(/rather than over a trailing window/);
    // ...and it says what an absence means (OPC-C).
    expect(sentence).toMatch(/does not appear/);
    expect(sentence).toMatch(/not that it was judged/);
  });

  it("applies the same integrity discount the product page does", () => {
    expect(FORMULAS[DIGEST_ORDER_FORMULA]!.sentence).toMatch(/after the integrity discount/);
  });
});

describe("a week is published only once it is over", () => {
  it("refuses a week still in progress", () => {
    // "What happened this week" and "what has happened so far" are different
    // claims under one heading — two readers quoting week 34's digest a day
    // apart would be quoting different documents.
    const now = Date.parse("2026-08-20T12:00:00.000Z");
    const current = weekOf(now);
    expect(isPublishable(current, Date.parse(weekWindow(current).end), now)).toBe(false);
    const past = weekOf(Date.parse("2026-08-10T12:00:00.000Z"));
    expect(isPublishable(past, Date.parse(weekWindow(past).end), now)).toBe(true);
  });
});

describe("a settled week is immutable, and caches like it", () => {
  it("caches a finished week for a day and the current one for a minute", () => {
    // Nothing in a week that ended can change, and serving it with sixty
    // seconds of freshness makes every crawler re-fetch an archive.
    expect(digestMaxAge(false)).toBe(86_400);
    expect(digestMaxAge(true)).toBe(60);
  });
});

describe("the feed is the product, not a footnote to an email", () => {
  it("promises no account and no address (LC-5, I3)", () => {
    expect(FEED_DESCRIPTION).toMatch(/No account, no address/);
    expect(FEED_DESCRIPTION).not.toMatch(/subscribe|sign up|email/i);
  });

  it("carries bounded numbers of each thing", () => {
    expect(DIGEST_LAUNCH_LIMIT).toBeGreaterThan(0);
    expect(DIGEST_ENDORSED_LIMIT).toBeGreaterThan(0);
    // The most-endorsed is a SHORT list. A page of forty is a directory, and
    // the digest already links the directory.
    expect(DIGEST_ENDORSED_LIMIT).toBeLessThanOrEqual(10);
  });
});
