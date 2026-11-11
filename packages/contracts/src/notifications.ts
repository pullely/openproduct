// Telling somebody something happened (openproduct-commons CB4).
//
// I3 IS THE SHAPE OF THIS MODULE, not a rule applied to it. Nothing here has
// a field for an address, and there is no function that takes one. openproduct
// knows an opaque subject id and whether that subject wants to hear from us;
// the platform knows how to reach them. Those two facts live in different
// systems on purpose, and the seam between them carries the id.
//
// THE BODY CONTAINS NOTHING THAT IS NOT ALREADY PUBLIC. A notification is
// read in a mail client, forwarded, quoted, and screenshotted; it reaches
// places the page's own access rules do not. So it says what happened and
// where, and the reader follows a link to a page that decides for itself what
// they may see. Putting the post's text in the mail would publish, to a
// channel with no moderation path, something TS3 can remove from the page.

// ---------------------------------------------------------------------------
// The kinds
// ---------------------------------------------------------------------------

/**
 * Three, and all of them are "something happened in a conversation you are
 * in". That is why the preference is one switch rather than a matrix:
 * somebody who does not want one of these does not want the others.
 */
export const NOTIFICATION_KINDS = ["reply", "answered", "decision", "mention"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * What each one says. NO CONTENT — the title of the thread is already on a
 * public page, and everything else is a link.
 *
 * Deliberately not "Ada replied": a name in a subject line is a name in
 * somebody's inbox, searchable and forwardable, and the page will say who it
 * was under the rules the page enforces (XP-5, OPC-5).
 */
export const NOTIFICATION_COPY: Record<NotificationKind, { subject: string; body: string }> = {
  reply: {
    subject: "New reply in a discussion you are in",
    body: "Somebody replied in a discussion you posted in. Open it to read the thread.",
  },
  answered: {
    subject: "A maintainer marked an answer",
    body: "A maintainer marked one of the posts in your discussion as the answer. Open it to read.",
  },
  decision: {
    subject: "There is a decision on your offer",
    body: "The maintainers have decided on an offer you made. Open your listings to see it.",
  },
  // CV3 — A NEW KIND, NOT A NEW ADDRESS (I3). The platform still looks the
  // subject up and still holds the only address; openproduct hands it a
  // subject id and this word. And still no name in the subject line: "Ada
  // mentioned you" is a name in somebody's inbox, searchable and forwardable,
  // where the page will say who it was under the page's own rules (OPC-5).
  mention: {
    subject: "Somebody mentioned you in a discussion",
    body: "Your handle was mentioned in a discussion. Open it to read the thread.",
  },
};

// ---------------------------------------------------------------------------
// Who gets one
// ---------------------------------------------------------------------------

export interface NotifyInput {
  /** Everybody who has posted in the thread, plus whoever started it. */
  participants: readonly string[];
  /** Whoever did the thing. Never notified about their own act. */
  actorSubjectId: string;
  /** Subjects who muted this thread. */
  threadMuted: readonly string[];
  /** Subjects who muted everything. */
  globallyMuted: readonly string[];
}

/**
 * The recipients, in one place.
 *
 * PARTICIPATION IS THE SUBSCRIPTION — there is no subscription list to keep
 * in step with the posts, because the posts are the list. What is subtracted
 * from it is the actor and the mutes, in that order, and the order does not
 * matter because they are all subtractions: no combination of preferences can
 * ADD somebody to this set, which is the property that makes it safe to
 * change the inputs later.
 */
export function notificationRecipients(input: NotifyInput): string[] {
  const muted = new Set([...input.threadMuted, ...input.globallyMuted]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const subject of input.participants) {
    // NEVER FOR YOUR OWN ACT. Being told about something you just did is the
    // fastest way to make somebody turn all of it off, and then they miss the
    // one that mattered.
    if (subject === input.actorSubjectId) continue;
    if (muted.has(subject)) continue;
    // Somebody who posted three times is one participant.
    if (seen.has(subject)) continue;
    seen.add(subject);
    out.push(subject);
  }
  return out;
}

/**
 * The key that makes "once per event" true.
 *
 * The EVENT's id, not the moment: a retry, a redelivered seam event and two
 * racing workers all produce the same ref and collide on the unique index,
 * rather than each sending a copy. A timestamp here would make every retry a
 * new event.
 */
export function eventRef(kind: NotificationKind, causeId: string): string {
  return `${kind}:${causeId}`;
}

// ---------------------------------------------------------------------------
// What crosses the seam
// ---------------------------------------------------------------------------

/**
 * The delivery request. Note what it cannot carry.
 *
 * No address, no name, no body text from anybody's post — the platform looks
 * the subject up and renders the copy above. `link` is a path on the public
 * site, so what the reader eventually sees is decided by the page, under the
 * page's own rules, at the moment they open it.
 */
export interface NotificationDelivery {
  subjectId: string;
  kind: NotificationKind;
  /** A path, never an absolute URL: the origin is the platform's to decide. */
  link: string;
}

export const NOTIFICATION_DELIVERY_KEYS = ["subjectId", "kind", "link"] as const;

/** Bounded so a stuck row stops being retried rather than queueing forever. */
export const MAX_NOTIFICATION_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Copy for the preference surfaces
// ---------------------------------------------------------------------------

export const MUTE_THREAD_LABEL = "Stop notifying me about this discussion";
export const UNMUTE_THREAD_LABEL = "Notify me about this discussion again";

export const GLOBAL_MUTE_LABEL = "Email me when something happens in a discussion I am in";

/** Said where the preference is, because it is the thing people assume. */
export const NOTIFICATION_PRIVACY_NOTE =
  "openproduct does not store your email address. It knows an opaque id and whether you want to " +
  "be told; the address stays with your account.";

export const NOTIFICATION_CONTENT_NOTE =
  "Notifications say what happened and link to the page. They never quote what anybody wrote.";
