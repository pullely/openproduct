import {
  BUILD_ORDER_CAPTION,
  BUILD_ORDER_EMPTY,
  BUILD_ORDER_FORMULA,
  buildsMeta,
  catalogueMomentCopy,
  formulaHref,
  type BuildOrder,
  type PublicProfileCard,
} from "@openproduct/contracts";

import { BuildTile } from "./build-tile";
import { MoreBuilds } from "./more-builds";
import { SortControl } from "./sort-control";

import { AppLink } from "../ui/link";

/**
 * The list of builds, in one order (openproduct-open-builds OB4, D1; drawn as
 * render C since openproduct-calm CL2).
 *
 * THE PAGE IS THE LIST, AND THE LIST IS ONE COLUMN (CL-R5). No card around
 * it and no margin beside it: the sort tabs, one quiet line that says how
 * many and as of when, and one tile per build.
 *
 * THE TABS STAY IN REACH (CL-R6). The strip is sticky at the top of the
 * window from `sm` up — the bar scrolls away (CL1), so this is the one strip
 * that stays — on the page's own ground, with the order's formula as a
 * one-line caption at its right that links to the published sentence
 * (OPC-4). On a phone it stays where it is: the 56px bar is already sticky
 * there, and two sticky strips on a phone is a third of the screen.
 *
 * A SERVER COMPONENT, and nothing here decides an order: the tiles arrive
 * already ordered by `orderBuilds` (the contract), and this draws them.
 *
 * THE LIST DOES NOT END ON A BUTTON (CL-R7). Most active continues on scroll
 * from the paged address a crawler follows (`more-builds.tsx`). The other
 * three are views of the whole list; their line says "first N of M".
 */
export function Builds({
  order,
  builds,
  belowFloor = 0,
  next = null,
  total = null,
  computedAt = null,
}: {
  order: BuildOrder;
  builds: readonly PublicProfileCard[];
  belowFloor?: number;
  next?: string | null;
  total?: number | null;
  computedAt?: string | null;
}) {
  const moment = catalogueMomentCopy(computedAt);
  const returnTo = order === "most-active" ? "/" : `/builds/${order}`;
  return (
    <section aria-labelledby="builds-heading" className="mt-[48px] max-sm:mt-8">
      <h2 id="builds-heading" className="sr-only">
        Builds
      </h2>
      <div
        data-builds-strip
        className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-b border-line bg-background max-sm:static max-sm:border-0"
      >
        <SortControl current={order} />
        <AppLink
          href={formulaHref(BUILD_ORDER_FORMULA[order])}
          className="tap font-mono text-[13px] text-faint hover:text-foreground"
          data-builds-caption
        >
          {BUILD_ORDER_CAPTION[order]}
        </AppLink>
      </div>
      {/* THE LINE IS THE LIST'S OWN, drawn above the tiles it counts (WC-7):
          the count, the order in words, what the floor holds back (HB0), and
          the moment the catalogue was computed (OS5). Quiet: one line, faint. */}
      <p className="m-0 mt-5 text-[13.5px] text-faint" data-builds-meta>
        {buildsMeta(order, builds.length, belowFloor, total)}
        {moment !== null ? (
          <>
            {" · "}
            <time dateTime={computedAt ?? undefined} data-catalogue-moment>
              {moment}
            </time>
          </>
        ) : null}
      </p>
      {builds.length > 0 ? (
        <ul className="m-0 mt-4 grid list-none gap-[14px] p-0" data-build-tiles>
          {builds.map((card) => (
            <BuildTile key={card.slug} card={card} returnTo={returnTo} />
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-4 rounded-[20px] border border-dashed border-border px-6 py-12 text-center text-[15px] text-muted-foreground">
          {BUILD_ORDER_EMPTY[order]}
        </p>
      )}
      {/* OS1 — the page after this one is still a LINK in the HTML: a URL a
          reader can copy, a crawler can follow and the edge can cache (OS-2).
          `MoreBuilds` renders it, and after paint reads the pages behind it as
          the reader nears the end. Absent on the last page, and on every order
          but Most active. */}
      {order === "most-active" && next !== null ? <MoreBuilds next={next} returnTo={returnTo} /> : null}
    </section>
  );
}
