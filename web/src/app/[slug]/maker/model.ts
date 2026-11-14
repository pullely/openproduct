// The maker view's rules, as plain functions (openproduct-redesign OPR-3,
// design §4; boards `Product`, `ProductIdea` in their `view: 'maker'` state).
//
// THE MAKER VIEW IS A CLIENT OVERLAY ON A CACHED PUBLIC PAGE. The server
// renders the visitor's page, the same bytes for everyone. After load the
// overlay answers "is this visitor on this product's crew" (`useCrewOf`), and
// only then do the pieces in this folder draw. Every one of them asks
// `useMaker(slug)` (`use-maker.ts`), which is the single place that calls
// `useCrewOf` — so a maker element cannot exist in server HTML, and a visitor
// who is not on the crew never receives one.
//
// PURE, AND NO JSX: the web test lane is module-level. What a component
// decides, it decides by calling something here.

import {
  AUTHORED_PRODUCT_POST_KINDS,
  MILESTONE_CODE_MAX,
  MILESTONE_SUMMARY_MAX,
  MILESTONE_TITLE_MAX,
  PRODUCT_POST_KIND_LABELS,
  PRODUCT_TAGLINE_MAX,
  ROLE_OPENING_TITLE_MAX,
  composePostPagePath,
  listingBasePath,
  listingSettingsPath,
  type AuthoredProductPostKind,
  type CrewNeedsYou,
  type CrewProductPost,
  type CrewSeatRequest,
  type OverlayCrew,
  type ProductPostKind,
} from "@openproduct/contracts";

import { postHeadline } from "../../posts/blocks";
import { consoleWorkspaceViewUrl } from "../workspace-view";

// The switch, the gate and the two addresses a gate links to live in
// `gate.ts` — the part every visitor's bundle carries. Everything below is
// fetched for the crew only.
export * from "./gate";

// ─── edit details ──────────────────────────────────────────────────────────

/**
 * The one-line pitch's limit: the contract's `PRODUCT_TAGLINE_MAX`, the same
 * constant core refuses by. The counter counts down from it.
 */
export const TAGLINE_LIMIT = PRODUCT_TAGLINE_MAX;

/** `12 left` / `3 over` — the counter beside the pitch field. */
export function taglineCount(value: string): { label: string; over: boolean } {
  const left = TAGLINE_LIMIT - value.length;
  return left < 0 ? { label: `${-left} over`, over: true } : { label: `${left} left`, over: false };
}

/** What the edit form sends to `POST /{slug}/manage/profile`. NEVER `slug`:
 *  the name is the address, and renaming is not offered from the page. */
export const PROFILE_FORM_FIELDS = ["tagline", "tryUrl"] as const;

/** Whether Save is available: a pitch, inside the limit. */
export function canSaveDetails(tagline: string): boolean {
  const trimmed = tagline.trim();
  return trimmed.length > 0 && trimmed.length <= TAGLINE_LIMIT;
}

// ─── new post ──────────────────────────────────────────────────────────────

export interface NewPostKind {
  readonly kind: ProductPostKind;
  readonly label: string;
  /** The builder for this kind; null for a kind that cannot be written yet. */
  readonly href: string | null;
}

/**
 * The board's five kind pills, in its order. Four go to the builder. Demo is
 * drawn DISABLED: a demo is recorded by Orun, not written (design §2.1), and
 * that flow is milestone OPR4.
 */
export function newPostKinds(slug: string): readonly NewPostKind[] {
  const authored = (kind: AuthoredProductPostKind): NewPostKind => ({
    kind,
    label: PRODUCT_POST_KIND_LABELS[kind],
    href: composePostPagePath(slug, kind),
  });
  return [
    authored("feature"),
    authored("version"),
    { kind: "demo", label: PRODUCT_POST_KIND_LABELS.demo, href: null },
    authored("idea"),
    authored("seat"),
  ];
}

/** Every kind a maker writes has a pill. */
export const NEW_POST_AUTHORED: readonly AuthoredProductPostKind[] = AUTHORED_PRODUCT_POST_KINDS;

// ─── needs you ─────────────────────────────────────────────────────────────

/** The block's label, and what a screen reader is told about who sees it. */
export const NEEDS_YOU_LABEL = "Needs you";
export const NEEDS_YOU_ARIA = "Needs you, visible to the crew only";

/**
 * A seat request is DECIDED ON ORUNBASE. It is a join request of the
 * workspace behind the listing; this site holds a snapshot of it and has no
 * way to approve or deny one. So the row's one control is a link there, and
 * there is no Accept and no Decline.
 */
export const SEAT_REQUEST_ACTION = "Review on Orunbase";

/**
 * Where a seat request is reviewed: THE PRODUCT'S WORKSPACE on the Orunbase
 * console — `{console}/view/{org}?from=openproduct`, the workspace landing
 * the seam pins (edge S12, `consoleWorkspaceViewUrl`).
 *
 * NOT AN ADDRESS OF THE REQUEST ITSELF. The console publishes no route that
 * opens one join request, and a query it ignores (`/orgs?request=…`, as this
 * was) is a link that promises a place and lands somewhere else. The
 * workspace is the real address this site can build: the crew member opens
 * it signed in to the console and decides the request there.
 *
 * `org` is the workspace's console ref, from the overlay's crew answer in
 * the crew's own browser. Null when there is nothing to link to (no console
 * origin configured, or no workspace ref).
 */
export function seatRequestReviewHref(consoleOrigin: string, crew: Pick<OverlayCrew, "org"> | null): string | null {
  const origin = consoleOrigin.trim();
  if (origin.length === 0 || !crew || !/^org_[A-Za-z0-9]+$/.test(crew.org)) return null;
  return consoleWorkspaceViewUrl(origin, crew.org);
}

/** Who asked, as the row names them. */
export function seatRequesterName(request: Pick<CrewSeatRequest, "requester">): string {
  return request.requester.displayName?.trim() || request.requester.handle || "Somebody";
}

/** `wants the Frontend contributor seat` / `wants a seat`. */
export function seatRequestText(request: Pick<CrewSeatRequest, "roleTitle">): string {
  return request.roleTitle ? `wants the ${request.roleTitle} seat` : "wants a seat";
}

/** `Draft: The state calendar` — a draft with no headline yet says its kind. */
export function draftLine(post: Pick<CrewProductPost, "kind" | "blocks">): string {
  const headline = postHeadline(post).trim();
  return `Draft: ${headline.length > 0 ? headline : PRODUCT_POST_KIND_LABELS[post.kind]}`;
}

/** The drafts in a needs-you answer (a published post is not one). */
export function draftsOf(needsYou: CrewNeedsYou | null): CrewProductPost[] {
  return (needsYou?.drafts ?? []).filter((post) => post.state === "draft");
}

/** Nothing waits on the crew: the block is not drawn at all. */
export function needsYouEmpty(needsYou: CrewNeedsYou | null): boolean {
  return (
    (needsYou?.requests ?? []).length === 0 &&
    draftsOf(needsYou).length === 0 &&
    (needsYou?.threads ?? []).length === 0
  );
}

/** OPR-4 — a private thread's row, as the two boards word it. */
export const PRIVATE_THREAD_STARTED = "started a private thread";
export const PRIVATE_THREAD_FROM = "Private thread from";

/** Talk on its Private filter: where "Open" on that row goes. A shipping
 *  product's tab; an idea's page forwards the same fragment to its section. */
export function privateThreadsPath(slug: string): string {
  return `/${slug}/talk#private`;
}

// ─── milestones ────────────────────────────────────────────────────────────

export interface MilestoneField {
  readonly name: "code" | "title" | "summary";
  readonly label: string;
  readonly max: number;
  readonly required: boolean;
}

/** The milestone form: three fields, each with the contract's limit. */
export const MILESTONE_FIELDS: readonly MilestoneField[] = [
  { name: "code", label: "Code", max: MILESTONE_CODE_MAX, required: true },
  { name: "title", label: "Title", max: MILESTONE_TITLE_MAX, required: true },
  { name: "summary", label: "Summary", max: MILESTONE_SUMMARY_MAX, required: false },
];

/** The intents `POST /{slug}/manage/milestones` takes, as the page uses them. */
export const MILESTONE_ACTS = ["create", "update", "reorder", "delete", "ship", "unship"] as const;

/** `ids` with `id` moved one place up (`-1`) or down (`1`); unchanged at an end. */
export function movedOrder(ids: readonly string[], id: string, step: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

// ─── seats ─────────────────────────────────────────────────────────────────

/**
 * A SEAT IS A ROLE OPENING: a role, what the person would do, the time it
 * asks for, and whether it is open. It is not the Help wanted post — opening
 * a seat prepares that post as a draft ("Draft post ready").
 *
 * It is added and edited IN PLACE, on the product's Crew tab, through
 * `POST /{slug}/manage/seats`.
 */
export interface SeatField {
  readonly name: "title" | "description" | "commitment";
  readonly label: string;
  readonly max: number;
  readonly required: boolean;
}

/**
 * The seat form's three fields. The role's limit is the contract's (core
 * refuses a longer one); the other two are the form's own bound — core holds
 * them to none — sized so a seat's words still read as a row.
 */
export const SEAT_FIELDS: readonly SeatField[] = [
  { name: "title", label: "Role", max: ROLE_OPENING_TITLE_MAX, required: true },
  { name: "description", label: "What they'd do", max: 600, required: false },
  { name: "commitment", label: "Time", max: 80, required: false },
];

export type SeatValues = Record<SeatField["name"], string>;

/** A seat's words as the form starts with them. */
export function seatValuesOf(seat: { title: string; description: string | null; commitment: string | null } | null): SeatValues {
  return { title: seat?.title ?? "", description: seat?.description ?? "", commitment: seat?.commitment ?? "" };
}

/** Whether Save is available: a role, and every field inside its limit. */
export function canSaveSeat(values: SeatValues): boolean {
  return values.title.trim().length > 0 && SEAT_FIELDS.every((field) => values[field.name].length <= field.max);
}

// ─── more settings ─────────────────────────────────────────────────────────

/**
 * What the product page does not do, and where each is done: the listing's
 * own settings pages. A compact list behind "More settings", built in the
 * crew's own browser from the ids the overlay answered — never in the cached
 * page, which carries no address of a maintainer's surface.
 */
export function moreSettingsLinks(crew: Pick<OverlayCrew, "org" | "profile">): ReadonlyArray<{ label: string; href: string }> {
  const base = listingBasePath(crew.org, crew.profile);
  return [
    { label: "Settings", href: listingSettingsPath(crew.org, crew.profile) },
    { label: "Details", href: `${base}/details` },
    { label: "Media", href: `${base}/media` },
    { label: "Topics", href: `${base}/topics` },
    { label: "People", href: `${base}/people` },
    { label: "Launches", href: `${base}/launches` },
    // OPR-4 — no Discussions entry: it only led to a page that is Talk now,
    // and Talk is this page's own tab.
  ];
}

// ─── the crew routes ───────────────────────────────────────────────────────

/** The crew's own handlers under the product's address. */
export function manageRoute(slug: string, route: "profile" | "milestones" | "posts" | "needs-you" | "seats"): string {
  return `/${slug}/manage/${route}`;
}
