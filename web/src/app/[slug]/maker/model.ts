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
  composePostPagePath,
  type AuthoredProductPostKind,
  type CrewNeedsYou,
  type CrewProductPost,
  type CrewSeatRequest,
  type OverlayCrew,
  type ProductPostKind,
} from "@openproduct/contracts";

import { postHeadline } from "../../posts/blocks";

// ─── the Manage / Visitor switch ───────────────────────────────────────────

/** `manage` shows the maker's controls; `visitor` shows the crew the public
 *  page exactly as everybody else gets it. */
export const VIEW_MODES = ["manage", "visitor"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  manage: "Manage",
  visitor: "Visitor",
};

/** The switch's accessible name (boards `Product`, `PhoneProduct`). */
export const VIEW_SWITCH_LABEL = "View this page as";

/** Where the header keeps the switch: the one named slot in `top-panel.tsx`. */
export const VIEW_SWITCH_SLOT_ID = "page-view-switch";

/** The session key the choice is remembered under: one per product. */
export function viewModeKey(slug: string): string {
  return `openproduct.view.${slug}`;
}

/** A stored value as a mode. Anything else is `manage`: the crew's default. */
export function viewModeOf(stored: string | null | undefined): ViewMode {
  return stored === "visitor" ? "visitor" : "manage";
}

/**
 * Whether the maker's controls draw. Both halves are required: the overlay
 * said this visitor is on the crew, and the switch is on Manage. "Visitor"
 * hides every maker element, so the crew sees the public page.
 */
export function isManaging(crew: OverlayCrew | null, mode: ViewMode): boolean {
  return crew !== null && mode === "manage";
}

// ─── edit details ──────────────────────────────────────────────────────────

/**
 * The one-line pitch's limit. Core's own (`MAX_TAGLINE` in
 * `core/src/handlers/profiles.ts`); the counter counts down from it and core
 * refuses anything longer with a field error either way.
 */
export const TAGLINE_LIMIT = 200;

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

/** The builder, opened on a post the crew already has (a draft to continue,
 *  or a published post to edit). */
export function continuePostPath(slug: string, postId: string): string {
  return `${composePostPagePath(slug)}?draft=${encodeURIComponent(postId)}`;
}

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
 * Where a seat request is reviewed: the Orunbase console, carrying the
 * request's reference. Null when there is nothing to link to (no console
 * origin configured, or the request has no reference yet).
 */
export function seatRequestReviewHref(consoleOrigin: string, request: Pick<CrewSeatRequest, "requestRef">): string | null {
  const origin = consoleOrigin.trim().replace(/\/+$/, "");
  if (origin.length === 0 || !request.requestRef) return null;
  return `${origin}/orgs?${new URLSearchParams({ request: request.requestRef }).toString()}`;
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
  return (needsYou?.requests ?? []).length === 0 && draftsOf(needsYou).length === 0;
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

/** What shipping a milestone offers: the draft post core prepared. */
export const OFFERED_POST_LABEL = "Draft post ready";

// ─── seats ─────────────────────────────────────────────────────────────────

/**
 * Where a seat is added or edited today: the studio's People step. The
 * role-opening write routes are addressed by the workspace and listing ids
 * and are reached only through the studio's own form handler, so the page
 * links there instead of copying that form.
 */
export function studioSeatsPath(crew: Pick<OverlayCrew, "org" | "profile">): string {
  return `/studio/${encodeURIComponent(crew.org)}/${encodeURIComponent(crew.profile)}/people`;
}

// ─── the crew routes ───────────────────────────────────────────────────────

/** The crew's own handlers under the product's address. */
export function manageRoute(slug: string, route: "profile" | "milestones" | "posts" | "needs-you"): string {
  return `/${slug}/manage/${route}`;
}
