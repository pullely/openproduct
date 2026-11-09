import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_COPY,
  NOTIFICATION_DELIVERY_KEYS,
  NOTIFICATION_KINDS,
  NOTIFICATION_PRIVACY_NOTE,
  eventRef,
  notificationRecipients,
} from "./notifications.js";

const ADA = "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const GRACE = "usr_gggggggggggggggggggggggggggggggg";
const LIN = "usr_llllllllllllllllllllllllllllllll";

const base = {
  participants: [ADA, GRACE, LIN],
  actorSubjectId: GRACE,
  threadMuted: [] as string[],
  globallyMuted: [] as string[],
};

describe("who gets one", () => {
  it("never notifies somebody about their own act", () => {
    // Being told about something you just did is the fastest way to make
    // somebody turn all of it off — and then they miss the one that mattered.
    expect(notificationRecipients(base)).toEqual([ADA, LIN]);
  });

  it("counts somebody who posted three times as one participant", () => {
    const out = notificationRecipients({ ...base, participants: [ADA, ADA, ADA, LIN] });
    expect(out).toEqual([ADA, LIN]);
  });

  it("subtracts a thread mute and a global mute alike", () => {
    expect(notificationRecipients({ ...base, threadMuted: [ADA] })).toEqual([LIN]);
    expect(notificationRecipients({ ...base, globallyMuted: [LIN] })).toEqual([ADA]);
    expect(
      notificationRecipients({ ...base, threadMuted: [ADA], globallyMuted: [LIN] }),
    ).toEqual([]);
  });

  it("can only ever SUBTRACT — no preference adds anybody", () => {
    // The property that makes it safe to change the inputs later: every rule
    // in this function removes people, so no combination of them can put
    // somebody in front of a message they are not already a participant in.
    const everyone = new Set([ADA, GRACE, LIN]);
    for (const threadMuted of [[], [ADA], [ADA, LIN]]) {
      for (const globallyMuted of [[], [LIN], [ADA, GRACE, LIN]]) {
        const out = notificationRecipients({ ...base, threadMuted, globallyMuted });
        expect(out.every((s) => everyone.has(s))).toBe(true);
        expect(out).not.toContain(GRACE);
      }
    }
  });

  it("notifies nobody when the only participant is the actor", () => {
    expect(notificationRecipients({ ...base, participants: [GRACE] })).toEqual([]);
  });
});

describe("once per event", () => {
  it("keys on the CAUSE, so a retry collides instead of sending twice", () => {
    // A timestamp here would make every retry a new event.
    expect(eventRef("reply", "post-1")).toBe(eventRef("reply", "post-1"));
    expect(eventRef("reply", "post-1")).not.toBe(eventRef("reply", "post-2"));
    expect(eventRef("reply", "post-1")).not.toBe(eventRef("answered", "post-1"));
  });
});

describe("I3 — nothing here can hold an address", () => {
  it("gives the delivery shape three fields, and none of them is an address", () => {
    expect([...NOTIFICATION_DELIVERY_KEYS]).toEqual(["subjectId", "kind", "link"]);
    for (const forbidden of ["email", "address", "to", "phone", "token", "recipient"]) {
      expect(NOTIFICATION_DELIVERY_KEYS).not.toContain(forbidden);
    }
  });

  it("says so where somebody sets the preference", () => {
    expect(NOTIFICATION_PRIVACY_NOTE).toContain("does not store your email address");
  });
});

describe("the body carries nothing that is not already public", () => {
  it("quotes no post and names no person", () => {
    // A notification is read in a mail client, forwarded, quoted and
    // screenshotted; it reaches places the page's own rules do not. Putting a
    // post's text in it would publish, to a channel with no moderation path,
    // something TS3 can remove from the page.
    for (const kind of NOTIFICATION_KINDS) {
      const { subject, body } = NOTIFICATION_COPY[kind];
      expect(`${subject} ${body}`).not.toMatch(/\{|\}|\$\{/);
      // "Somebody", never a name: a name in a subject line is a name in
      // somebody's inbox, searchable and forwardable.
      expect(subject.toLowerCase()).not.toContain("ada");
    }
  });

  it("has copy for every kind and nothing else", () => {
    expect(Object.keys(NOTIFICATION_COPY).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it("sends people to the page rather than telling them the answer", () => {
    // The page decides what a reader may see, at the moment they open it,
    // under its own rules.
    for (const kind of NOTIFICATION_KINDS) {
      expect(NOTIFICATION_COPY[kind].body.toLowerCase()).toMatch(/open|see it/);
    }
  });
});
