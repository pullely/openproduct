// Threads and posts, as the public sees them (openproduct-commons CB0).
//
// DORMANT. Nothing routes to any of this until CB1, whose gate is the
// heaviest in the plan: TS2's velocity limits AND TS3's removal path, both on
// `main` first. That ordering is the one in this epic that cannot be
// corrected afterwards, because everything else it adds is read-only or a
// single bit, and this adds free text written by strangers on a public page
// attached to somebody else's product, permanently, indexed.
//
// The render subset — what a body may BECOME — is its own module, because it
// is the part with an attacker on the other side of it.

import type { RenderNode } from "./render-subset.js";

// ---------------------------------------------------------------------------
// CB-3 — the closed tag vocabulary
// ---------------------------------------------------------------------------

/**
 * Six tags, and the set is closed.
 *
 * They are the words maintainers already use, they cover every thread the
 * design draws, and a closed set is what makes threads filterable and the
 * page scannable. An open tag space becomes a folksonomy nobody navigates —
 * and, on a surface where strangers write, a second free-text field with none
 * of the first one's defences.
 */
export const THREAD_TAGS = [
  "design",
  "proposal",
  "question",
  "governance",
  "contributing",
  "accessibility",
] as const;

/** A tag a PERSON may pick. Six, and the set is closed. */
export type ChosenThreadTag = (typeof THREAD_TAGS)[number];

/**
 * The seventh tag (openproduct-launch DQ0b), which nobody picks.
 *
 * The design draws a comment box directly on a product page: no title, no tag,
 * no "start a discussion" — you type and you have said something. That is not
 * a different OBJECT from a thread; it is a thread nobody was asked to name.
 * So it IS a thread, written by the system the first time somebody comments,
 * and every rule already written about a thread applies to it unchanged.
 *
 * IT IS NOT IN `THREAD_TAGS`, AND THAT IS THE POINT. That list is what the
 * composer's select offers and what the write path accepts from a form. A
 * `launch` in it would let somebody hand-make a second one, and "one
 * discussion per listing" would become a thing the schema enforced and the UI
 * fought. The database holds the same division: the check admits seven values,
 * and a partial unique index allows one live `launch` thread per listing.
 */
export const LAUNCH_THREAD_TAG = "launch" as const;

/** Every tag that can EXIST, which is the six plus the one. Read paths and
 *  labels use this; write paths that take a tag from a person use the six. */
export const ALL_THREAD_TAGS = [...THREAD_TAGS, LAUNCH_THREAD_TAG] as const;
export type ThreadTag = (typeof ALL_THREAD_TAGS)[number];

/** What each tag is for, said once so no surface invents its own gloss. */
export const THREAD_TAG_LABELS: Record<ThreadTag, string> = {
  design: "Design",
  proposal: "Proposal",
  question: "Question",
  governance: "Governance",
  contributing: "Contributing",
  accessibility: "Accessibility",
  // Never rendered as a filter pill, because it is not a filter — but it is
  // rendered wherever a thread names its own tag, and a missing label there
  // would print `undefined` on a public page.
  launch: "Comments",
};

/** Whether a tag is one a person may choose. The write paths' question. */
export function isChosenThreadTag(tag: string): tag is ChosenThreadTag {
  return (THREAD_TAGS as readonly string[]).includes(tag);
}

/**
 * The title a launch thread carries.
 *
 * A THREAD NEEDS A TITLE and nobody typed one, so the system writes one from
 * the listing's own name rather than leaving it blank or inventing a sentence
 * about the product. It is not shown on the product page — the section is
 * called "Discussion" there — but it IS what a moderator sees in the studio
 * queue and what `/threads/{id}` shows, and "Untitled" in either place is a
 * row nobody can act on.
 */
export function launchThreadTitle(slug: string): string {
  return `Comments on ${slug}`;
}

// ---------------------------------------------------------------------------
// DQ1 — the upvote on a comment
// ---------------------------------------------------------------------------

/**
 * What the control says, and what the act is.
 *
 * THE SAME WORD AS EVERY OTHER UPVOTE ON THIS ESTATE (UV0's rename), because
 * it is the same gesture: public, with your name on it, one per person. What
 * differs is what it moves — see `comment.votes` at `/docs/formulas`.
 */
export const COMMENT_VOTE_LABEL = "Upvote";
export const COMMENT_VOTED_LABEL = "Upvoted";

/**
 * The title on the count.
 *
 * IT SAYS WHAT THE NUMBER DOES NOT DO. An upvote on a comment orders nothing —
 * comments render in the order they were written — and a reader who assumes
 * otherwise is reading a ranking this product did not make.
 */
export const COMMENT_VOTE_NOTE =
  "Upvotes on a comment are public and one per person. They do not change the order comments appear in.";

/** Whether an author may upvote their own comment. They may not — a self-vote
 *  inflates a number on your own words with your own click, and the schema
 *  refuses it as well as this. */
export function canVoteOnComment(
  post: Pick<PublicPost, "state">,
  viewerIsAuthor: boolean,
): boolean {
  return post.state !== "removed" && !viewerIsAuthor;
}

/** What the product page's comment box says when nobody has said anything. */
export const LAUNCH_THREAD_EMPTY = "No comments yet. Ask the makers something.";

// ---------------------------------------------------------------------------
// The two state machines
// ---------------------------------------------------------------------------

/**
 * `answered` is a MAINTAINER'S mark, not a count and not a heuristic.
 *
 * The alternative — inferring it from replies, or from an author accepting —
 * makes the estate the judge of whether a question was answered, which is
 * exactly the authority OPC-6 says it does not hold. A maintainer saying "this
 * one" is a fact about who decided; anything derived is an opinion wearing a
 * badge.
 *
 * `locked` and `removed` are TS3's, arriving through the same ledger every
 * other act does. A locked thread STAYS READABLE — locking ends a
 * conversation, it does not retract it.
 */
export const THREAD_STATES = ["open", "answered", "locked", "removed"] as const;
export type ThreadState = (typeof THREAD_STATES)[number];

/** A post is visible or removed. There is no `hidden` and no `pending`: a
 *  post held for review is a post the author cannot tell from a lost one. */
export const POST_STATES = ["visible", "removed"] as const;
export type PostState = (typeof POST_STATES)[number];

/** Which thread states still accept a post. */
export const POSTABLE_STATES: readonly ThreadState[] = ["open", "answered"];

export function threadAcceptsPosts(state: ThreadState): boolean {
  return POSTABLE_STATES.includes(state);
}

// ---------------------------------------------------------------------------
// The public shapes
// ---------------------------------------------------------------------------

/**
 * A post, as a public page renders it.
 *
 * NOTE WHAT IS ABSENT. No `authorSubjectId` — the opaque id never leaves the
 * estate (I3), and the page shows the handle CG1 resolves or plain text when
 * there is none (XP-5). No `body` either: the authored source is what the
 * AUTHOR edits, not what a reader receives, and shipping both would put the
 * unrendered text on a public page for anybody who read the JSON.
 */
/**
 * PP0 (openproduct-worldclass-v2, WC-6) — one launch, one conversation.
 *
 * The listing page used to render two conversation objects: the launch
 * thread and the titled discussions. WC-B's query — run against the public
 * surface on 10 September 2026 — found no titled discussion anywhere on
 * production, so the collapse is the cheap branch: a comment may carry the
 * tag a titled thread used to be classified by, and the second object is no
 * longer created. Core answers the thread route with this sentence.
 */
// ---------------------------------------------------------------------------
// FO0 — the door (openproduct-worldclass-v2)
// ---------------------------------------------------------------------------

/** Where a thread starts. One address; the product rides in the query. */
export const THREADS_NEW_PATH = "/threads/new";

/** Where the composer's form posts. A sibling of the page, never the page's
 *  own address: Next refuses a `route.ts` beside a `page.tsx`, at build time,
 *  which is the deploy's time and nobody's lane. */
export const THREADS_NEW_ACTION = `${THREADS_NEW_PATH}/actions`;

/** `/threads/new?product=<slug>` — the composer, with the product filled. */
export function threadComposerHref(slug?: string | null): string {
  return slug ? `${THREADS_NEW_PATH}?product=${encodeURIComponent(slug)}` : THREADS_NEW_PATH;
}

export const THREAD_COMPOSER_TITLE = "Start a thread";

/** What the page says over the form. A thread is not a comment: it has a
 *  title, a category, and a product it is about, and it gets its own address. */
export const THREAD_COMPOSER_NOTE =
  "A thread lives on a product's forum. Pick the product it is about, a category, and say it. Public, with your name on it.";

/** What a signed-out reader sees beside the same form. The door, not a wall:
 *  the page is a 200, the form is visible, and signing in brings you back. */
export const THREAD_COMPOSER_SIGNED_OUT = "Sign in to start a thread. You come straight back here.";

export const DISCUSSIONS_COLLAPSED_MESSAGE =
  "Titled discussions have been folded into the listing's one conversation. Post a comment and, if it helps, tag it.";

export interface PublicPost {
  id: string;
  /** PP0 — the tag a titled discussion used to be classified by, or null. */
  tag: ChosenThreadTag | null;
  /** CV1 — the post this one answers, or `null` for a top-level post. One
   *  level only: a reply's parent is always top-level. */
  parentPostId: string | null;
  /** CG1's handle, or null when the author has no public profile. */
  authorHandle: string | null;
  /** The author's display name, or null. Never an email, never a subject id. */
  authorName: string | null;
  /** The rendered tree. A typed tree, never markup — see `render-subset`. */
  body: RenderNode[];
  state: PostState;
  createdAt: string;
  /** Non-null when the post was edited: a decision trail whose posts can be
   *  rewritten silently is a trail nobody can rely on. */
  editedAt: string | null;
  /** True for the post a maintainer marked as the answer. */
  isAnswer: boolean;
  /**
   * CV2 — the author is on this listing's PUBLISHED maintainer roster.
   *
   * DECIDED IN CORE, over subject ids, because that is what the roster holds.
   * The first version of this badge lived in the web layer and compared
   * HANDLES, which made it wrong in a way nobody would have noticed: a
   * maintainer who has not opted into a public profile has no handle, so the
   * comparison silently said "not a maintainer" — turning CG1's opt-in into a
   * status, which is the opposite of what OPC-5 is for.
   */
  authorIsMaintainer: boolean;
  /**
   * DQ1 — how many people upvoted this comment.
   *
   * PUBLIC AND IDENTICAL FOR EVERYBODY, like every other count on this
   * estate. Whether YOU upvoted it arrives after paint from the XP2 overlay,
   * so the anonymous and signed-in renders of a thread stay byte-identical
   * (I6). Honest at zero: something observes a vote, so a zero has been
   * counted and found empty rather than being a claim nobody could make.
   */
  votes: number;
}

export const PUBLIC_POST_KEYS = [
  "id",
  // PP0 — the tag a titled discussion used to carry, or null.
  "tag",
  "authorHandle",
  "authorName",
  "body",
  "state",
  "createdAt",
  "editedAt",
  "isAnswer",
  // CV1 — the edge a reply carries. The nesting is the page's; this is the
  // fact it nests from.
  "parentPostId",
  // CV2 — decided in core over subject ids. The id itself never crosses; only
  // the answer does, which is what keeps I3 true of this shape.
  "authorIsMaintainer",
  "votes",
] as const;

export interface PublicThread {
  id: string;
  tag: ThreadTag;
  title: string;
  authorHandle: string | null;
  authorName: string | null;
  state: ThreadState;
  createdAt: string;
  lastPostAt: string | null;
  /** How many visible posts. A removed one is not counted, because a count
   *  that includes what a reader cannot see is a count that reads as a bug. */
  postCount: number;
}

export const PUBLIC_THREAD_KEYS = [
  "id",
  "tag",
  "title",
  "authorHandle",
  "authorName",
  "state",
  "createdAt",
  "lastPostAt",
  "postCount",
] as const;

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * The standing notice, which is a RULE rather than a warning (CB-2).
 *
 * It says what will happen, in the present tense, before anybody types. A
 * warning phrased as a caution ("be careful, this is public") invites somebody
 * to weigh a risk; this is not a risk to weigh, it is how the surface works.
 */
export const POSTING_NOTICE = "Posts here are public and signed with your profile.";

export const POSTING_PERMANENCE_NOTE =
  "Threads stay readable after a decision is made — that is what makes the trail worth having.";

/** What a locked thread says. Locking ends a conversation; it does not
 *  retract it, and the page has to be clear which of those happened. */
export const THREAD_LOCKED_NOTE =
  "This thread is closed to new posts. Everything in it is still here.";

export const THREAD_REMOVED_NOTE =
  "This thread has been removed. The address still resolves, so links to it do not break.";

export const POST_REMOVED_NOTE = "This post has been removed.";

/** CB0 is dormant, and every inert surface says which milestone lights it
 *  (XP1's rule). Nothing renders this yet; CB1 will. */
export const DISCUSSIONS_PENDING_NOTE =
  "Discussions arrive with CB1, once the report queue and velocity limits have been running.";

// ─── CV1 — one level of replies ────────────────────────────────────────────

/**
 * ONE LEVEL, AND THE REASON IS NOT SIMPLICITY.
 *
 * A deeper tree is a conversation that has to be navigated rather than read.
 * Two people going back and forth at depth nine push everybody else's replies
 * off the right of a phone, and the thread stops being a discussion anybody
 * can follow — which is the only thing a discussion is for. One level keeps
 * every reply legible at 375px and keeps the order of the conversation the
 * order it happened in.
 *
 * It also keeps **WC-6** honest: one conversation per launch means one shape
 * of conversation, not a shape that varies with how deep somebody nested.
 */
export const REPLY_DEPTH = 1;

export const REPLY_NOTE =
  "Replies go one level deep. A reply to a reply answers the post above it, so a conversation stays readable rather than becoming a tree.";

/**
 * THE POLICY THAT HAS TO BE VISIBLE, not merely true (VC).
 *
 * Per-comment upvotes exist and do not order anything: posts are in the order
 * they were written, always. A number beside a post that a reader assumes is
 * sorting the page is worse than no number, so the page says what it does.
 */
export const POST_ORDER_NOTE =
  "Posts are in the order they were written. Upvotes on a post never change that order — they say that somebody agreed, and nothing else.";

export interface PostWithReplies {
  readonly post: PublicPost;
  readonly replies: readonly PublicPost[];
}

/**
 * A flat list of posts, nested one level.
 *
 * ORDER IS PRESERVED ON BOTH LEVELS, and it is the order the API returned —
 * which is the order they were written. Nothing here sorts, and `POST_ORDER_NOTE`
 * is the sentence the page says about that (OL-2a).
 *
 * A REPLY WHOSE PARENT IS NOT IN THE LIST STAYS VISIBLE, at top level. That
 * is not tidiness: a parent can be missing because the list was truncated, and
 * silently dropping a reply would delete somebody's words from a page over a
 * paging artefact. It reads as a top-level post, which is what it is on a page
 * that cannot show its parent.
 *
 * A REPLY TO A REPLY IS FLATTENED TO ITS GRANDPARENT for the same reason: the
 * write path refuses to create one, so a row like that is corruption or a
 * migration artefact, and the honest rendering is still to show it.
 */
export function nestPosts(posts: readonly PublicPost[]): PostWithReplies[] {
  const tops = new Map<string, PublicPost[]>();
  const order: PublicPost[] = [];
  const isTop = new Set(posts.filter((p) => p.parentPostId === null).map((p) => p.id));
  // A reply's parent, resolved to a top-level post: itself if it is one,
  // otherwise its own parent when that is top-level.
  const rootOf = (post: PublicPost): string | null => {
    if (post.parentPostId === null) return null;
    if (isTop.has(post.parentPostId)) return post.parentPostId;
    const parent = posts.find((p) => p.id === post.parentPostId);
    if (parent && parent.parentPostId !== null && isTop.has(parent.parentPostId)) {
      return parent.parentPostId;
    }
    return null;
  };
  for (const post of posts) {
    if (post.parentPostId === null) {
      order.push(post);
      tops.set(post.id, []);
    }
  }
  for (const post of posts) {
    if (post.parentPostId === null) continue;
    const root = rootOf(post);
    const bucket = root === null ? null : tops.get(root);
    if (bucket) bucket.push(post);
    else order.push(post); // orphan — the parent is not on this page
  }
  return order.map((post) => ({ post, replies: tops.get(post.id) ?? [] }));
}

/**
 * How many posts a thread holds, counting replies.
 *
 * WC-7 — the counter and the list are one array. A thread's comment count is
 * what `nestPosts` will render, tops and replies together, so a page cannot
 * say 12 and draw 9.
 */
export function postCount(posts: readonly PublicPost[]): number {
  return posts.length;
}

// ─── CV2 — the maintainer badge ────────────────────────────────────────────

/**
 * ONE COMPONENT, ONE RULE, AND THE RULE IS HERE.
 *
 * The badge says exactly one thing: this person is on the listing's PUBLISHED
 * maintainer roster — the two-sided one (OPC-5), the same list the product
 * page's roster renders. It is not "they work here", not "trust this", and
 * not a moderator mark. A reader seeing it on a comment should conclude that
 * the person answering maintains the thing being discussed, and nothing more.
 */
export const MAINTAINER_BADGE = "Maintainer";

export const MAINTAINER_BADGE_NOTE =
  "On this listing’s published maintainer roster. Both sides confirmed it — the listing named them and they accepted.";

/**
 * Whether a post's author is one of the listing's maintainers.
 *
 * OVER SUBJECT IDS, never handles. A handle is a public profile somebody
 * opted into (CG1); a maintainer is somebody on the roster. Deciding this
 * from handles makes the badge disappear for every maintainer who has not
 * published a profile, which is exactly the drift this function exists to
 * remove — and it is not hypothetical: it is what the product page did until
 * CV2.
 */
export function isMaintainerPost(
  authorSubjectId: string,
  maintainerSubjectIds: ReadonlySet<string>,
): boolean {
  return maintainerSubjectIds.has(authorSubjectId);
}
