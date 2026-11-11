// The two-sided edge (openproduct-commons CG3).
//
// A LISTING SAYS WHO IS ON IT. A PERSON SAYS WHETHER THAT IS TRUE. Both
// halves are required, and this module is the shape of the agreement between
// them.
//
// The rule it enforces is OPC-5 — nobody appears publicly without their own
// act — and the reason it needs a whole object rather than a boolean is that
// the interesting state is the middle one. A maintainer naming somebody
// creates a real thing that both parties can see and neither has agreed to
// yet, and that thing needs a name, a lifetime, and rules about who may end
// it.
//
// WHAT THE PUBLIC SEES IS ONLY EVER `confirmed`. There is no query parameter,
// no admin flag and no internal caller that widens that: the public read
// filters in SQL, and a `pending` row reaching a cached page would be this
// epic's central promise broken in the one place a stranger would see it.
//
// DECLINING LEAVES NO ROW, and that is a deliberate asymmetry with retiring.
// "I was never part of this" and "I was, and now I am not" are different
// claims, and only the second is a fact worth keeping. A `declined` state
// would be a durable record that somebody was asked and said no — a fact
// about a person, kept by us, that serves nobody but a curious maintainer.

/** Where an edge is in its life. `declined` is deliberately not here. */
export const ROSTER_STATES = ["pending", "confirmed", "retired"] as const;
export type RosterState = (typeof ROSTER_STATES)[number];

/**
 * Whether the consent behind a `confirmed` edge was actually given.
 *
 * `grandfathered` exists because OPC-G turns every pre-CG3
 * `published_maintainers` row into a confirmed edge — which is the right
 * call (the alternative is every roster emptying on deploy) and is not the
 * same thing as consent. Recording it keeps `confirmed` from quietly meaning
 * two things, and lets the estate answer "how many of these did nobody
 * agree to" rather than having to guess.
 */
export const ROSTER_ORIGINS = ["confirmed_by_subject", "grandfathered"] as const;
export type RosterOrigin = (typeof ROSTER_ORIGINS)[number];

/** One person on a listing, as a visitor sees them. */
export interface RosterMember {
  /** Opaque subject id — the join key the page needs, never an email (I3). */
  readonly subjectId: string;
  /** Authored by the maintainer, in their voice. Null when they wrote none. */
  readonly roleLabel: string | null;
  /**
   * CG1's handle, when this person has a public profile — so a name on a
   * roster is a LINK or plain text, never a dead link (XP-5).
   */
  readonly handle: string | null;
  readonly displayName: string | null;
  /** When they became public here. Coarse; the roster renders a month. */
  readonly since: string;
}

export const ROSTER_MEMBER_KEYS = [
  "displayName",
  "handle",
  "roleLabel",
  "since",
  "subjectId",
] as const;

/** One invitation, as its named person sees it in `/me`. */
export interface RosterInvitation {
  readonly slug: string;
  readonly tagline: string | null;
  readonly roleLabel: string | null;
  readonly invitedAt: string;
}

export const ROSTER_INVITATION_KEYS = ["invitedAt", "roleLabel", "slug", "tagline"] as const;

// ---------------------------------------------------------------------------
// Who may do what
// ---------------------------------------------------------------------------

/**
 * The four acts, and who may perform each.
 *
 * WRITTEN AS DATA rather than as `if` statements in four handlers, because
 * the interesting property is the SHAPE of the table: exactly one act belongs
 * to the maintainer alone, exactly one to the named person alone, and one to
 * both. A reviewer can check that in five seconds; four scattered guards
 * cannot be checked at all.
 */
export const ROSTER_ACTORS = ["maintainer", "subject"] as const;
export type RosterActor = (typeof ROSTER_ACTORS)[number];

export interface RosterAct {
  readonly act: "invite" | "confirm" | "decline" | "retire";
  readonly by: readonly RosterActor[];
  /** What the edge must be for this act to be possible. */
  readonly from: readonly RosterState[] | "absent";
  readonly to: RosterState | "absent";
  /** The sentence a refusal carries. */
  readonly refusal: string;
}

export const ROSTER_ACTS: readonly RosterAct[] = [
  {
    act: "invite",
    // The maintainer alone. A person cannot add themselves to somebody
    // else's product — that would be the mirror of the problem this table
    // exists to fix, with the arrow reversed.
    by: ["maintainer"],
    from: "absent",
    to: "pending",
    refusal: "Only this listing's maintainers can add someone to it.",
  },
  {
    act: "confirm",
    // The named person ALONE. This is the whole of OPC-5: if a maintainer
    // could confirm on somebody's behalf, the edge would mean nothing and
    // the table would be `published_maintainers` with extra columns.
    by: ["subject"],
    from: ["pending"],
    to: "confirmed",
    refusal: "Only the person named can confirm that they are on a listing.",
  },
  {
    act: "decline",
    // Also theirs alone, and it DELETES. See the module header.
    by: ["subject"],
    from: ["pending"],
    to: "absent",
    refusal: "Only the person named can decline an invitation.",
  },
  {
    act: "retire",
    // BOTH SIDES, at any time, without the other's agreement. A person must
    // be able to leave a product that has gone somewhere they do not want
    // their name; a maintainer must be able to end a role that ended. Making
    // either ask permission would make leaving a negotiation.
    by: ["maintainer", "subject"],
    from: ["pending", "confirmed"],
    to: "retired",
    refusal: "Only this listing's maintainers, or the person named, can end this.",
  },
] as const;

export function rosterAct(act: RosterAct["act"]): RosterAct {
  const found = ROSTER_ACTS.find((a) => a.act === act);
  // Total by construction — the vocabulary is closed and the list is
  // exhaustive — but a throw here beats `undefined` reaching an authorization
  // check, which is the one place a missing rule must not read as "allowed".
  if (!found) throw new Error(`unknown roster act: ${act}`);
  return found;
}

/** May this actor perform this act on an edge in this state? */
export function mayAct(
  act: RosterAct["act"],
  actor: RosterActor,
  state: RosterState | "absent",
): boolean {
  const rule = rosterAct(act);
  if (!rule.by.includes(actor)) return false;
  return rule.from === "absent" ? state === "absent" : rule.from.includes(state as RosterState);
}

// ---------------------------------------------------------------------------
// What people are told
// ---------------------------------------------------------------------------

/** Shown to a maintainer beside a pending row, so they do not read silence
 *  as a refusal — and do not chase somebody who simply has not looked yet. */
export const PENDING_MAINTAINER_NOTE =
  "Waiting for them to confirm. Nobody sees this on the public page until they do, and they can decline without telling you why.";

/** Shown to the named person, in `/me`. */
export const PENDING_SUBJECT_NOTE =
  "A maintainer says you are on this product. It appears on the public page only if you confirm. Declining removes it and tells them nothing.";

/**
 * Shown to somebody whose edge was grandfathered (OPC-G).
 *
 * THE SENTENCE THIS EPIC OWES THEM. They are on a public page because
 * somebody listed them before this consent model existed, and they were never
 * asked. Saying so plainly — and putting removal one click away — is the
 * whole of what makes the grandfather defensible.
 */
export const GRANDFATHERED_SUBJECT_NOTE =
  "You were already listed on this product before we asked people to confirm, so we carried it over rather than removing you. You did not agree to this and you can remove yourself right now, without telling anyone why.";

/** The roster's own footer, on the public page. */
export const ROSTER_PROVENANCE_NOTE =
  "Everyone here confirmed their own place on this product. A maintainer can name someone, but only that person can make it public.";
