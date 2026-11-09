// The public contributor profile (openproduct-commons CG1).
//
// This is the most exposed thing this estate publishes about a person: a
// permanent URL, crawled, carrying their name and their words. Three rules
// shape every line below, and each is a rule about somebody else's dignity
// rather than about our data model.
//
// CG-4 — NOTHING IS COPIED FROM `identity.*`. Every field here is text the
// contributor typed on this surface. A copied display name goes stale against
// a platform rename and carries platform authority onto a public page; an
// authored one carries only its author's voice. A copied email would be a
// leak outright (I3), and there is no field here that could hold one. The
// page says this out loud in its footer, and the sentence is only true
// because of this shape.
//
// CG-5 — STATS REFUSE TO INVENT. A profile stat is a claim about a person's
// work, which is the one place a fabricated number does real harm. Every stat
// is `number | null`, and null means "we cannot see this", which is a
// different sentence from zero. `Reviews 0` says somebody reviewed nothing;
// absent says we could not look.
//
// CG-2 — A PROFILE IS NOT A PRESENCE. It exists only for somebody who opted
// in AND who maintains a public listing. Both gates live in the read; this
// module describes what comes out the other side.

import type { MediaThumbnail } from "./media.js";

/** One listing on a profile. The card's identity, nothing more. */
export interface PublicProfileListing {
  readonly slug: string;
  readonly tagline: string | null;
  /** The listing's logo, for the card's tile; `null` keeps the monogram
   *  (openproduct-studio OSD3). */
  readonly thumbnail: MediaThumbnail | null;
}

export const PUBLIC_PROFILE_LISTING_KEYS = ["slug", "tagline", "thumbnail"] as const;

/**
 * A contributor's public page.
 *
 * Composed literally from this list at the projection, never spread from a
 * record — the OD3 rule, applied to the surface where getting it wrong would
 * publish somebody's private field under their own name.
 */
export interface PublicContributor {
  readonly handle: string;
  /**
   * Authored here. Null when they never set one, and the page then renders
   * the handle — NEVER a platform display name, and never an id.
   */
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly githubUrl: string | null;
  readonly siteUrl: string | null;
  /** The design's pill. Authored, and false by default: nobody is advertised
   *  as looking for work without having said so. */
  readonly openToProject: boolean;
  /** When the PUBLIC page began. Not when the account was created. */
  readonly publishedAt: string;
  /** Public listings this person maintains. The standing that earned the page. */
  readonly maintains: readonly PublicProfileListing[];
  /**
   * CG-5 — `null` where the observation tier cannot see it, never `0`.
   *
   * `contributesTo` waits on CG3's two-sided edges, and `reviews` on CG4's
   * observation. Both are null today and the page says which, rather than
   * printing a zero that reads as a judgement about the person.
   */
  readonly contributesTo: number;
  readonly reviews: number | null;
  /** CG4 — the listings behind `contributesTo`, so the stat is checkable
   *  rather than something a reader takes on trust. */
  readonly contributesToListings: readonly PublicProfileListing[];
  /**
   * FL0 — how many people follow them. COUNTED, NEVER LISTED.
   *
   * The one stat on this page that is NOT checkable, and deliberately so —
   * `maintains` and `contributesTo` name their listings because a number a
   * reader cannot expand is one they must take on trust, and that argument
   * stops exactly where the evidence would be OTHER PEOPLE. Naming them would
   * turn a private subscription into a crawlable social graph, which is worth
   * more than the checkability. Nothing on this estate answers who they are,
   * including to the person followed.
   *
   * Honest at zero: something observes a follow now, so a zero has been
   * measured rather than assumed (OPC-C).
   */
  readonly followers: number;
}

/**
 * The exact key set. Pinned as a literal for the same reason the listing
 * projections are — a shape derived from an interface widens silently, and on
 * this surface a silent widening is a disclosure about a person.
 */
export const PUBLIC_CONTRIBUTOR_KEYS = [
  "bio",
  "contributesTo",
  "contributesToListings",
  "displayName",
  "followers",
  "githubUrl",
  "handle",
  "maintains",
  "openToProject",
  "publishedAt",
  "reviews",
  "siteUrl",
] as const;

// ---------------------------------------------------------------------------
// AG3 — open to one more project
// ---------------------------------------------------------------------------
//
// TWO THIRDS OF THIS MILESTONE WERE ALREADY SHIPPING, which is worth stating
// because it changes what the third is. AG3 asks for *"makers marked open,
// matched to listings with open roles, with observed contribution history
// under OPC-5's two-sided consent"*:
//
//   marked open              CG1/CG2. The control is on `/me`, the field is
//                            on the public projection, `/people` counts them
//                            and filters on them.
//   contribution history     CG3. `contributesToListings` renders on a maker's
//                            page under the heading "Contributes to", and
//                            OPC-5's rule is already what fills it: a
//                            `product_people` row renders only `confirmed`,
//                            which is a maintainer creating the edge and the
//                            contributor confirming it.
//   MATCHED                  Not built, and this is it.
//
// ─── AND "MATCHED" IS THE ONE THAT NEEDED THINKING ABOUT ──────────────────
//
// The obvious reading — draw a line from each open maker to each listing that
// wants people — is exactly what OPC-5 exists to prevent. `product_people` is
// two-sided BY CONSTRUCTION because an edge that renders without both sides is
// a claim about a relationship neither of them made, and a "suggested match"
// on a public page is that claim with a hedge on it. Ada being open and
// kettleworks wanting a frontend contributor are two facts; the pairing is a
// third, and nobody has asserted it.
//
// So this surface renders the two SIDES and no edge between them. The reader
// makes the connection, which is the only party entitled to. `ASKING_NOTE`
// says so on the page rather than leaving it to be inferred from an absence.

/** The design's pill, in one place. It was a string literal in the directory's
 *  list and nowhere else, so the page a card links to could not say what the
 *  card said about the person — which is the defect AG3 found. */
export const OPEN_TO_PROJECT_LABEL = "open to one more project";

/** Whose claim the pill is. Authored, and by them: nobody is advertised as
 *  looking for work without having ticked it themselves. */
export const OPEN_TO_PROJECT_NOTE =
  "They ticked this on their own profile. Nothing observes whether somebody is available — it is their claim, and they can untick it.";

/** The design's heading for the second list. It names what the list is —
 *  listings, asking — and promises no pairing with the people above it. */
export const ASKING_HEADING = "Listings asking for people";

/**
 * THE SENTENCE THAT KEEPS THIS FROM BEING A MATCHMAKER.
 *
 * Two lists on one page invite a reader to pair them up, and a reader pairing
 * them up is fine — a page doing it for them is not. Every edge this product
 * renders between a person and a listing is one both sides made (OPC-5), and
 * this page holds no edges at all.
 */
export const ASKING_NOTE =
  "These are two lists, not pairs. Nobody here has been matched to anybody: people put their hand up on their own profile, maintainers opened roles on their own listing, and the only links this site draws between a person and a product are ones both of them confirmed.";

/** One listing that is asking, as this surface needs it. */
export interface AskingListing {
  readonly slug: string;
  readonly tagline: string | null;
  /** Authored — roles the maintainers opened. Nothing observes whether one is
   *  still wanted, which is why the number is theirs and not ours. */
  readonly roleOpeningCount: number;
}

/**
 * The listings currently asking for people.
 *
 * PURE, over the catalogue the page already read — no second query, and the
 * count beside a listing is the field the same card carries (WC-7).
 *
 * ORDER IS THE DOCUMENT'S OWN. This does not rank listings by how many people
 * they want: a listing asking for four is not more deserving than one asking
 * for one, and an order that implied otherwise would be this page inventing a
 * merit it has no formula for.
 */
export function listingsAsking(
  cards: readonly { slug: string; tagline: string | null; roleOpeningCount: number }[],
): readonly AskingListing[] {
  return cards
    .filter((card) => card.roleOpeningCount > 0)
    .map((card) => ({
      slug: card.slug,
      tagline: card.tagline,
      roleOpeningCount: card.roleOpeningCount,
    }));
}

/**
 * How many asking listings the People page shows before its link to the Roles
 * order (openproduct-calm CL4, CL-R4). The page is about people; the whole
 * list of builds with an open role is `/builds/roles`, one click away, so
 * thirty rows of builds under the people was the page saying the same thing
 * twice.
 */
export const ASKING_PREVIEW_LIMIT = 5;

/** The first few asking listings, in the document's own order. */
export function askingPreview(asking: readonly AskingListing[]): readonly AskingListing[] {
  return asking.slice(0, ASKING_PREVIEW_LIMIT);
}

/** The link under the preview, to the Roles order. */
export function askingAllLabel(count: number): string {
  return count === 1 ? "See it in Roles" : `See all ${count} in Roles`;
}

// ---------------------------------------------------------------------------
// The directory card (openproduct-commons CG2)
// ---------------------------------------------------------------------------

/**
 * One person, as the contributors directory draws them.
 *
 * A DELIBERATELY SMALLER SHAPE THAN THE PAGE, and the difference is the
 * point. The card carries what a reader needs to decide whether to open
 * somebody's page: a name, an address, a line about them, and what they are
 * on. It does NOT carry their links — a directory that shipped every
 * contributor's GitHub and personal site in one response would be a
 * link-harvesting endpoint wearing a card grid, and a reader who wants
 * somebody's links can open their page and take them one at a time.
 *
 * That is the same OD3 discipline every other projection follows: carry what
 * the surface needs, and let the widening be a literal edit somebody reviews.
 */
export interface PublicContributorCard {
  readonly handle: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  /** The design's pill. Authored, false by default. */
  readonly openToProject: boolean;
  /** The slugs behind `Maintains N`. Slugs, not taglines: the card names the
   *  count's evidence without becoming a second listing directory. */
  readonly maintains: readonly string[];
  /**
   * CG4 — a real count now that CG3 built the edges behind it.
   *
   * NOT NULLABLE ANY MORE, and the distinction is the one OPC-C turns on:
   * this is a fact we can OBSERVE COMPLETELY. We hold every confirmed edge, so
   * `0` here means "nobody has named them on a product they do not run, and
   * they have confirmed nothing" — which is true, and different in kind from
   * `reviews`, where we cannot look at all and a `0` would be invented. The
   * card still renders the clause only when there is something to say.
   */
  readonly contributesTo: number;
  /** PE3 — a listing they maintain has gone live. A fact, never a count. */
  readonly launched: boolean;
}

export const PUBLIC_CONTRIBUTOR_CARD_KEYS = [
  "bio",
  "contributesTo",
  "displayName",
  "handle",
  "launched",
  "maintains",
  "openToProject",
] as const;

/**
 * THE SENTENCE THAT MAKES THIS SURFACE SELF-LIMITING.
 *
 * Not copy. `[decided]` in the reference design, and CG-2 in the epic: a
 * public profile directory open to anyone who can sign in is a spam directory
 * within a month; one bounded by "you are on a product somebody published"
 * cannot be, because the bound costs an attacker a listing that a person has
 * to publish and that anyone can report.
 *
 * It is rendered in the header rather than a footnote because it is also the
 * answer to the question a reader actually has — "who are these people and
 * why are they here" — and because a rule stated where people read it is a
 * rule they can hold us to.
 */
export const DIRECTORY_ELIGIBILITY_NOTE =
  "Everyone here maintains or contributes to a listed product. Profiles are public and live at a short link you can hand to anyone.";

/**
 * The second sentence, and the one that is about consent rather than spam.
 *
 * OPC-5 in the visitor's words: a maintainer naming somebody on a listing
 * does not put that person here. Only their own act does.
 */
export const DIRECTORY_CONSENT_NOTE =
  "Nobody appears here without their own act. A maintainer can name you on their listing, and you decide whether that becomes a page.";

/** What a card shows as its name — the SAME rule as the page, so a person is
 *  called one thing in both places. */
export function cardTitle(card: Pick<PublicContributorCard, "handle" | "displayName">): string {
  return profileTitle(card);
}

// ---------------------------------------------------------------------------
// The four stats (openproduct-commons CG4)
// ---------------------------------------------------------------------------

/**
 * Every stat on a profile, and the published sentence behind it.
 *
 * WRITTEN AS A MAP so invariant I7 is checkable on this surface rather than
 * argued about: a stat that appears here without a formula does not compile,
 * and a stat rendered on the page that is not here fails a test. Four numbers
 * about a person, four sentences a reader can look up.
 *
 * `reviews` IS HERE AND IS STILL ABSENT, which is the point of listing it. A
 * profile stat is a claim about somebody's work, and the one thing worse than
 * not having it is inventing it. Its sentence already says "absent — not zero
 * — where the repository's reviews cannot be observed", and nothing observes
 * per-person reviews yet, so every profile renders a dash. Publishing the
 * rule before the number is deliberate: the rule is what a reader can hold us
 * to when the number arrives.
 */
export const PROFILE_STAT_FORMULAS = {
  maintains: "contributor.maintains",
  contributesTo: "contributor.contributes-to",
  reviews: "contributor.reviews.12mo",
  since: "contributor.since",
} as const;

export type ProfileStat = keyof typeof PROFILE_STAT_FORMULAS;

/** The note under each stat, in a reader's words. */
export const PROFILE_STAT_NOTES: Record<ProfileStat, string> = {
  maintains: "listings they run, published",
  contributesTo: "confirmed a place on, ever",
  reviews: "on linked repositories · last 12 months",
  since: "profile public since",
};

/**
 * The footer under the `Contributes to` section (CG4).
 *
 * IT SAYS WHOSE ACT PUT EACH NAME THERE, because that is the one thing a
 * reader cannot infer from a list of slugs. Without it the section reads as
 * "products that mention this person", which is precisely the claim CG3's
 * two-sided edge exists to stop us making.
 *
 * And it says retired places stay, in plain words rather than as a footnote:
 * a person deciding whether to leave a product should be able to read what
 * leaving costs them here, which is nothing.
 */
export const CONTRIBUTES_TO_NOTE =
  "Each of these is a place this person confirmed themselves. A maintainer can name someone, but only that person can make it public — and a role they have since ended still appears here, because the work happened.";

/** The footer sentence, and it is the most important one on the page. */
export const PROFILE_PROVENANCE_NOTE =
  "Profile authored on openproduct. Nothing here is copied from an Orunbase account.";

/** What a profile shows as its name. Never an id, never a platform name. */
export function profileTitle(profile: Pick<PublicContributor, "handle" | "displayName">): string {
  const name = (profile.displayName ?? "").trim();
  return name.length > 0 ? name : `@${profile.handle}`;
}

// ---------------------------------------------------------------------------
// Authored links
// ---------------------------------------------------------------------------

/**
 * Hosts a GitHub link may point at. A one-entry allowlist rather than a
 * pattern, because the field is called `githubUrl` and a `githubUrl` that
 * renders somewhere else is a mislabelled link on a page a stranger is
 * reading — which is the shape of a phishing link, whoever typed it.
 */
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

export type LinkRefusal = "not-https" | "not-a-url" | "wrong-host" | "too-long";

export const LINK_REFUSAL_COPY: Record<LinkRefusal, string> = {
  "not-a-url": "That does not look like a web address.",
  "not-https": "Links must start with https:// — an http link on a public page is a downgrade for whoever clicks it.",
  "wrong-host": "That is not a github.com address.",
  "too-long": "That address is too long.",
};

export type LinkCheck =
  | { readonly ok: true; readonly url: string | null }
  | { readonly ok: false; readonly reason: LinkRefusal; readonly message: string };

const MAX_LINK = 300;

/**
 * Validate an authored link, or refuse with a reason.
 *
 * HTTPS ONLY, and that is not pedantry: this link renders on a public page
 * under somebody's name, and an `http://` link is a downgrade we would be
 * handing to every stranger who clicks it.
 *
 * An empty string is `ok` with a null url — clearing a link is a thing people
 * do, and making them delete their profile to do it would be absurd.
 */
export function parseProfileLink(
  input: string | null | undefined,
  kind: "github" | "site",
): LinkCheck {
  const raw = (input ?? "").trim();
  if (raw.length === 0) return { ok: true, url: null };
  if (raw.length > MAX_LINK) return refuseLink("too-long");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return refuseLink("not-a-url");
  }
  if (url.protocol !== "https:") return refuseLink("not-https");
  if (kind === "github" && !GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    return refuseLink("wrong-host");
  }
  // Re-serialised rather than returned verbatim: `URL` normalises the host's
  // case and the default port, so two spellings of one address cannot become
  // two different links on two different profiles.
  return { ok: true, url: url.toString() };
}

function refuseLink(reason: LinkRefusal): LinkCheck {
  return { ok: false, reason, message: LINK_REFUSAL_COPY[reason] };
}

/**
 * What a maker is told BEFORE they opt in (the OD6 discipline).
 *
 * Every line names one thing that becomes public and who can see it. Derived
 * from the projection's own key list at the test boundary, so a field cannot
 * be added to the page without a line appearing here.
 */
export const PROFILE_DISCLOSURE: ReadonlyArray<{ readonly key: string; readonly label: string }> = [
  { key: "handle", label: "Your handle, as the address of the page — openproduct.live/@you" },
  { key: "displayName", label: "The name you type here — not your Orunbase account name" },
  { key: "bio", label: "Your bio, as written" },
  { key: "githubUrl", label: "Your GitHub link, if you add one" },
  { key: "siteUrl", label: "Your site link, if you add one" },
  { key: "openToProject", label: "Whether you are open to one more project, if you tick it" },
  { key: "publishedAt", label: "The month your profile became public" },
  { key: "maintains", label: "The published listings you maintain, by name" },
  {
    key: "contributesTo",
    label: "How many published products you have confirmed a place on and do not maintain",
  },
  {
    // CG4 — BY NAME, and the line says so. The count alone would have been a
    // weaker disclosure than the page makes: somebody deciding whether to
    // confirm an invitation is deciding whether that product's name appears
    // beside theirs, and "how many" does not tell them that.
    key: "contributesToListings",
    label: "Those products by name, including ones you have since left",
  },
  { key: "reviews", label: "Reviews we can observe on linked repositories, if any" },
  {
    // FL0 — the line says what CANNOT be seen as well as what can, which no
    // other line here needs to. Every other field is something the person
    // themselves wrote or did; this one is a number about what OTHER people
    // did, and the question it raises — "will they know who?" — has to be
    // answered where they are deciding, not in a policy.
    key: "followers",
    label: "How many people follow you — a count only, never who they are, not even to you",
  },
];
