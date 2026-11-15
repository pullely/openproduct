/**
 * Help wanted, as pure functions (openproduct-redesign OPR1; boards `Seats`,
 * `PhoneSeats`).
 *
 * A SEAT IS TODAY'S OPEN ROLE, UNDER THE REDESIGN'S NAME. Nothing new is
 * stored: a maintainer opens a role from the studio, the product's public
 * document lists it (`PublicRoleOpening`), and this module turns the open
 * ones into the tickets the page draws. Pure, so the web test lane — which
 * has no JSX — can hold what a seat says and what its button does.
 */
import {
  PRODUCT_STAGE_LABELS,
  demandLine,
  isProductStage,
  type MediaThumbnail,
  type ProductStage,
  type PublicProfileCard,
  type PublicRoleOpening,
} from "@openproduct/contracts";

/** One open seat, with the product it belongs to. */
export interface Seat {
  /** The role opening's id — unique across products. */
  readonly id: string;
  readonly title: string;
  readonly commitment: string | null;
  /** The apply door's token, or null before the maintainers minted one. */
  readonly joinLinkRef: string | null;
  readonly demand: PublicRoleOpening["demand"];
  readonly product: {
    readonly slug: string;
    readonly thumbnail: MediaThumbnail | null;
    /** OPR-3 — whether the seat is on a shipping product or on an idea; null
     *  when the catalogue did not say. */
    readonly stage: ProductStage | null;
  };
}

/** How many seats the page shows before *Show more*, and how many each press
 *  adds — the boards' ten. */
export const SEATS_STEP = 10;

/**
 * How many products' seats one render reads.
 *
 * A seat's title lives on its product's own document, not on the catalogue
 * card (which carries only the count), so the page reads one document per
 * product that has a seat open. Bounded, like every walk here: past this many
 * products the title line still counts every open seat and the list says how
 * many of them it shows.
 */
export const SEAT_PRODUCT_LIMIT = 40;

/** A product's open seats, in the order its maintainers keep them. */
export function seatsOf(
  product: Pick<PublicProfileCard, "slug" | "thumbnail"> & { stage?: unknown },
  openings: readonly PublicRoleOpening[],
): Seat[] {
  return openings
    .filter((opening) => opening.status === "open")
    .map((opening) => ({
      id: opening.id,
      title: opening.title,
      commitment: opening.commitment,
      joinLinkRef: opening.joinLinkRef,
      demand: opening.demand,
      product: {
        slug: product.slug,
        thumbnail: product.thumbnail,
        stage: isProductStage(product.stage) ? product.stage : null,
      },
    }));
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The line beside the title: every open seat, and how many products they
 *  are spread across — both read off the catalogue, so they are whole even
 *  when the list below is bounded. */
export function seatsCountLine(seats: number, products: number): string {
  return `${count(seats, "open seat", "open seats")} across ${count(products, "product", "products")}`;
}

/** The same two numbers at a phone's width. */
export function seatsCountLineShort(seats: number, products: number): string {
  return `${count(seats, "seat", "seats")} · ${count(products, "product", "products")}`;
}

/** The two numbers themselves, from the catalogue's cards. */
export function seatTotals(cards: readonly Pick<PublicProfileCard, "roleOpeningCount">[]): { seats: number; products: number } {
  const withSeats = cards.filter((card) => card.roleOpeningCount > 0);
  return { seats: withSeats.reduce((sum, card) => sum + card.roleOpeningCount, 0), products: withSeats.length };
}

/**
 * The quiet line under a seat's name: what it asks for, and what is known
 * about the queue.
 *
 * THE COMMITMENT is the maintainers' own words, when they wrote any. THE
 * SECOND HALF is the contract's demand sentence, unedited — it is floored
 * server-side (OPC-F) and it is the only place an opening's AGE is published
 * at all: "Nobody yet — this opening is 7 weeks old." An opening somebody
 * has asked about has no public age, so the board's "open since" is said
 * only in that one case. Empty when neither half exists; the card then draws
 * no line rather than an empty one.
 */
export function seatSub(seat: Pick<Seat, "commitment" | "demand"> & { product?: { stage?: ProductStage | null } }): string {
  // OPR-3 — the line opens with the stage of the seat's product (board
  // `Seats`: "On stage · …", "Idea · …") when the catalogue said it.
  const stage = seat.product?.stage ? PRODUCT_STAGE_LABELS[seat.product.stage] : "";
  return [stage, seat.commitment?.trim() ?? "", demandLine(seat.demand) ?? ""].filter((part) => part.length > 0).join(" · ");
}

/**
 * The filter (openproduct-redesign OPR-3; boards `Seats`, `PhoneSeats`):
 * every seat, then the seats at each of the four stages (SC-2).
 */
export const SEAT_STAGE_FILTERS = ["all", "idea", "building", "stage", "production"] as const satisfies readonly (
  | "all"
  | ProductStage
)[];
export type SeatStageFilter = (typeof SEAT_STAGE_FILTERS)[number];

export const SEAT_STAGE_FILTER_LABEL: Record<SeatStageFilter, string> = {
  all: "All",
  idea: "On ideas",
  building: "Being built",
  stage: "On stage",
  production: "In production",
};

/** The segment the filtered lists live under, and each stage's word in it —
 *  the Products page's own (`/products/stage/ideas`, `…/on-stage`). */
export const SEATS_STAGE_SEGMENT = "stage";
export const SEAT_STAGE_SEGMENT: Record<Exclude<SeatStageFilter, "all">, string> = {
  idea: "ideas",
  building: "building",
  stage: "on-stage",
  production: "in-production",
};
export const SEAT_STAGE_SEGMENTS = Object.values(SEAT_STAGE_SEGMENT);

/**
 * Where a filter lives: `/help-wanted`, `/help-wanted/stage/ideas`,
 * `/help-wanted/stage/on-stage`, …. A PATH, NEVER A QUERY STRING — a page
 * that reads `?stage=` is rendered per request and goes out `no-store`; each
 * of these five is one static document (design.md §4, I6).
 */
export function seatsPath(stage: SeatStageFilter = "all"): string {
  return stage === "all" ? "/help-wanted" : `/help-wanted/${SEATS_STAGE_SEGMENT}/${SEAT_STAGE_SEGMENT[stage]}`;
}

/** The filter a `/help-wanted/stage/<segment>` address names, or null (a 404). */
export function seatStageOfSegment(segment: unknown): Exclude<SeatStageFilter, "all"> | null {
  for (const [stage, word] of Object.entries(SEAT_STAGE_SEGMENT)) {
    if (segment === word) return stage as Exclude<SeatStageFilter, "all">;
  }
  return null;
}

/** How many seats are open under each filter, from the catalogue's cards —
 *  whole even when the list below is bounded. */
export function seatStageCounts(
  cards: readonly (Pick<PublicProfileCard, "roleOpeningCount"> & { stage?: unknown })[],
): Record<SeatStageFilter, number> {
  const sum = (list: typeof cards) => list.reduce((total, card) => total + Math.max(card.roleOpeningCount, 0), 0);
  const at = (stage: ProductStage) => sum(cards.filter((card) => card.stage === stage));
  return {
    all: sum(cards),
    idea: at("idea"),
    building: at("building"),
    stage: at("stage"),
    production: at("production"),
  };
}

/** What a filtered list says when it holds no seat. */
export const SEATS_EMPTY_AT_STAGE: Record<Exclude<SeatStageFilter, "all">, string> = {
  idea: "No idea has an open seat right now.",
  building: "No product being built has an open seat right now.",
  stage: "No product on stage has an open seat right now.",
  production: "No product in production has an open seat right now.",
};

/** The request-to-join door for a seat: the console's `/join/{token}` (OD4,
 *  OX2), told where the visitor came from. */
export function seatDoorHref(consoleOrigin: string, joinLinkRef: string): string {
  return `${consoleOrigin.replace(/\/+$/, "")}/join/${encodeURIComponent(joinLinkRef)}?from=openproduct`;
}

/**
 * What a seat's button is — the card's three states.
 *
 *   open       "Take the seat", in teal: a link to the request-to-join door.
 *              A LINK, not a form: asking requires sign-in, and the door is
 *              the shipped page that handles it.
 *   requested  "Requested", in the teal tint: the visitor has a request
 *              waiting on this seat. It links to their applications, where
 *              the request's standing is.
 *   closed     the seat is listed but its door is not minted yet: no button,
 *              and the product page's own words for it.
 *
 * `requested` WINS OVER `closed`: a request that exists is a fact whatever
 * has happened to the door since.
 */
export type SeatAction =
  | { readonly state: "open"; readonly label: string; readonly href: string }
  | { readonly state: "requested"; readonly label: string; readonly href: string }
  | { readonly state: "closed"; readonly label: string; readonly href: null };

export const SEAT_TAKE_LABEL = "Take the seat";
export const SEAT_REQUESTED_LABEL = "Requested";
/** Where a requested seat's button goes: the visitor's own requests. */
export const SEAT_REQUESTED_HREF = "/me?section=seats";
export const SEAT_CLOSED_LABEL = "Not accepting offers yet";

export function seatAction(
  seat: Pick<Seat, "joinLinkRef">,
  options: { readonly consoleOrigin: string; readonly requested?: boolean },
): SeatAction {
  if (options.requested === true) return { state: "requested", label: SEAT_REQUESTED_LABEL, href: SEAT_REQUESTED_HREF };
  if (seat.joinLinkRef === null) return { state: "closed", label: SEAT_CLOSED_LABEL, href: null };
  return { state: "open", label: SEAT_TAKE_LABEL, href: seatDoorHref(options.consoleOrigin, seat.joinLinkRef) };
}

/** The line beside *Show more*. */
export function seatsShownLine(shown: number, total: number): string {
  return `${Math.min(shown, total).toLocaleString("en-US")} of ${total.toLocaleString("en-US")} shown`;
}

/** What the page says when no seat is open anywhere. */
export const SEATS_EMPTY = "No product has an open seat right now.";

export const SEATS_MORE_LABEL = "Show more";
