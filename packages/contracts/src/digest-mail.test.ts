import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DIGEST_ORDER_FORMULA } from "./digest.js";
import {
  DIGEST_DELIVERY_KEYS,
  DIGEST_FEED_FIRST_NOTE,
  DIGEST_MAIL_FORMULA,
  DIGEST_NOTIFICATION_KIND,
  DIGEST_REFUSALS,
  DIGEST_SUBSCRIBE_LABEL,
  DIGEST_SUBSCRIBE_NOTE,
  DIGEST_SUBSCRIPTION_KEYS,
  DIGEST_UNSUBSCRIBE_LABEL,
  DIGEST_UNSUBSCRIBE_NOTE,
  MAX_DIGEST_QUEUE_PER_RUN,
  digestControlLabel,
  digestEventRef,
  digestLink,
  isSubscribed,
  type DigestDelivery,
  type DigestSubscription,
} from "./digest-mail.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("I3 — nothing here can hold an address", () => {
  it("a delivery carries exactly three fields, and none is an address", () => {
    const delivery: DigestDelivery = {
      subjectId: "usr_aaaa",
      week: "2026-W34",
      link: "/digest/2026-W34",
    };
    expect(Object.keys(delivery).sort()).toEqual([...DIGEST_DELIVERY_KEYS].sort());
    expect(DIGEST_DELIVERY_KEYS).not.toContain("email");
    expect(DIGEST_DELIVERY_KEYS).not.toContain("address");
    expect(DIGEST_DELIVERY_KEYS).not.toContain("recipient");
  });

  it("the module's source names no address-shaped field", () => {
    // A weekly send to a list is the shape that historically makes products
    // decide they "need" the addresses after all — for the previews, for the
    // bounce handling, for the export somebody asked for once. This is the
    // assertion that notices the day one appears.
    const source = readFileSync(resolve(__dirname, "digest-mail.ts"), "utf-8")
      // Comments argue ABOUT addresses on purpose; the check is about code.
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    for (const forbidden of ["email:", "address:", "emailAddress", "recipientEmail", "toAddress"]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it("the migration's own table holds an id and timestamps, and nothing else", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../db/src/migrations/1500_openproduct_digest_subscriptions/up.sql"),
      "utf-8",
    ).replace(/--[^\n]*/g, " ");
    const table = /CREATE TABLE IF NOT EXISTS openproduct\.digest_subscriptions\s*\(([\s\S]*?)\n\);/.exec(sql);
    expect(table).not.toBeNull();
    const columns = table![1]!;
    for (const forbidden of ["email", "address", "phone", "push_token", "recipient"]) {
      expect(columns.toLowerCase(), forbidden).not.toContain(forbidden);
    }
    // And no free-text field: the "reason for leaving" box is the one that
    // always gets added and always becomes a place people type things about
    // themselves that we then have to defend.
    expect(columns.toLowerCase()).not.toContain("reason");
    expect(columns.toLowerCase()).not.toContain("note");
  });
});

describe("the consent model inverts CB4's, deliberately", () => {
  it("distinguishes never-asked from asked-and-left", () => {
    // Different to the person looking at the control: the first is an
    // invitation, the second has to say "you can come back" rather than
    // pretending the earlier decision never happened.
    expect(digestControlLabel("never")).toBe(DIGEST_SUBSCRIBE_LABEL);
    expect(digestControlLabel("subscribed")).toBe(DIGEST_UNSUBSCRIBE_LABEL);
    expect(digestControlLabel("unsubscribed")).toMatch(/again/i);
    expect(digestControlLabel("unsubscribed")).not.toBe(digestControlLabel("never"));
  });

  it("only the subscribed standing is subscribed", () => {
    const at = (standing: DigestSubscription["standing"]): DigestSubscription => ({
      standing,
      since: null,
    });
    expect(isSubscribed(at("subscribed"))).toBe(true);
    // ABSENCE MEANS SILENCE. A digest is a broadcast nobody asked for by
    // acting, unlike a reply in a thread they posted in.
    expect(isSubscribed(at("never"))).toBe(false);
    expect(isSubscribed(at("unsubscribed"))).toBe(false);
  });

  it("says what will arrive AND what the estate does not have", () => {
    expect(DIGEST_SUBSCRIBE_NOTE).toMatch(/one email a week/i);
    // The half worth the words: a strange claim for a product sending you
    // email, true here, and checkable against the schema.
    expect(DIGEST_SUBSCRIBE_NOTE).toMatch(/does not store your address/i);
    expect(DIGEST_SUBSCRIBE_NOTE).toMatch(/no list here to leak/i);
  });

  it("promises unsubscribe reaches an already-queued send", () => {
    // The thing people have learned not to expect. The send path is built to
    // make it true — the pending read joins the subscription rather than
    // trusting what was queued.
    expect(DIGEST_UNSUBSCRIBE_NOTE).toMatch(/immediately/i);
    expect(DIGEST_UNSUBSCRIBE_NOTE).toMatch(/queued but not yet sent/i);
  });

  it("offers the feed first, since it needs nothing from anybody", () => {
    expect(DIGEST_FEED_FIRST_NOTE).toMatch(/no account and no address/i);
    expect(DIGEST_FEED_FIRST_NOTE).toMatch(/same content/i);
  });

  it("carries exactly the subscription keys a surface needs", () => {
    expect(DIGEST_SUBSCRIPTION_KEYS).toEqual(["standing", "since"]);
  });
});

describe("one digest per person per week", () => {
  it("derives a stable ref from the week", () => {
    expect(digestEventRef("2026-W34")).toBe("digest:2026-W34");
    expect(digestEventRef("2026-W34")).toBe(digestEventRef("2026-W34"));
    expect(digestEventRef("2026-W35")).not.toBe(digestEventRef("2026-W34"));
  });

  it("points at the page the digest already is", () => {
    // A link rather than a rendered body: carrying HTML across the seam would
    // put a week of other people's taglines in a queue row and let an email
    // opened a month late show a stale copy instead of the week.
    expect(digestLink("2026-W34")).toBe("/digest/2026-W34");
  });

  it("is a fourth KNOWN kind, not an open vocabulary", () => {
    expect(DIGEST_NOTIFICATION_KIND).toBe("digest");
  });

  it("resolves to LC1's formula rather than a second one", () => {
    // The email and the page must not be able to disagree about the order,
    // which they could the moment there were two constants for it.
    expect(DIGEST_MAIL_FORMULA).toBe(DIGEST_ORDER_FORMULA);
  });

  it("bounds one run, so a timeout is recoverable", () => {
    // The unique index makes re-queueing the already-queued a no-op, so the
    // next run picks up the remainder rather than double-sending.
    expect(MAX_DIGEST_QUEUE_PER_RUN).toBeGreaterThan(100);
  });
});

describe("what is refused, published", () => {
  it("names the three things a mailing product normally does", () => {
    const refused = DIGEST_REFUSALS.map((r) => r.refused.toLowerCase()).join(" ");
    expect(refused).toMatch(/opened it/);
    expect(refused).toMatch(/personalising/);
    expect(refused).toMatch(/storing your address/);
  });

  it("each refusal explains itself in terms of what it would cost the reader", () => {
    for (const refusal of DIGEST_REFUSALS) {
      expect(refusal.because.length).toBeGreaterThan(80);
      expect(refusal.because).not.toMatch(/we may|reserve the right|from time to time/i);
    }
    // The tracking-pixel one says what a pixel actually IS, because "we do not
    // track opens" means nothing to somebody who does not know how it worked.
    const pixel = DIGEST_REFUSALS.find((r) => /opened it/i.test(r.refused))!;
    expect(pixel.because).toMatch(/request your mail client makes/i);
  });

  it("states the address refusal as a property rather than a policy", () => {
    const address = DIGEST_REFUSALS.find((r) => /storing your address/i.test(r.refused))!;
    // "There is no column that could hold one" is a stronger promise than a
    // policy saying we would not look.
    expect(address.because).toMatch(/no column/i);
    expect(address.because).toMatch(/stronger promise/i);
  });
});
