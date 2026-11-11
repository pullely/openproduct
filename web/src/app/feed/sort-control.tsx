import {
  BUILD_ORDERS,
  BUILD_ORDER_LABEL,
  buildOrderPath,
  type BuildOrder,
} from "@openproduct/contracts";

import { ActiveIcon, NewIcon, RoleIcon, UpvoteIcon } from "../ui/icons";
import { AppLink } from "../ui/link";

/**
 * The front page's sort control (openproduct-open-builds OB4, D1).
 *
 * FOUR LINKS, NOT A WIDGET. Each order is its own cacheable address
 * (`build-orders.ts` says why), so the control is a row of plain links that
 * work with no JavaScript, and the current one carries `aria-current`. A
 * select or a client-side re-sort would make the order a state of the page
 * rather than a page, and the page could no longer be cached as one document.
 *
 * ONE GLYPH PER ORDER, each the meaning it has everywhere (D6): the pulse is
 * Most active, the sprout is Newest, the chevron is an upvote, the seat is an
 * open role. The word always sits beside the glyph — the glyph is how an eye
 * finds the chip, the word is what it is.
 *
 * NO ACCENT. The lit tab is a 2px `--foreground` underline under
 * `--foreground` words (openproduct-calm CL2, CL-R6, CL-R8): the endorse
 * accent means one thing (XP-1). The strip that holds these tabs is sticky
 * (`builds.tsx`), so the order stays in reach down a long list.
 */
export function SortControl({ current }: { current: BuildOrder }) {
  return (
    // FOUR EQUAL CELLS ON A PHONE, glyph over word — the bottom bar's own
    // idiom — because four tabs in a row do not fit 324px and a wrapped
    // control reads as two controls. A row of underlined tabs from `sm` up.
    <nav aria-label="Order builds by" className="grid w-full grid-cols-4 gap-1 sm:flex sm:w-auto sm:items-stretch sm:gap-8">
      {BUILD_ORDERS.map((order) => {
        const on = order === current;
        return (
          <AppLink
            key={order}
            href={buildOrderPath(order)}
            aria-current={on ? "page" : undefined}
            data-build-order={order}
            className={`inline-flex items-center justify-center gap-2 text-[15px] font-medium transition-colors sm:-mb-px sm:h-[52px] sm:border-b-2 max-sm:min-h-[48px] max-sm:flex-col max-sm:gap-[3px] max-sm:rounded-[10px] max-sm:px-1 max-sm:py-1.5 max-sm:text-[12px] ${
              on
                ? "text-foreground sm:border-foreground max-sm:bg-secondary"
                : "text-muted-foreground hover:text-foreground sm:border-transparent"
            } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
          >
            <OrderGlyph order={order} />
            {BUILD_ORDER_LABEL[order]}
          </AppLink>
        );
      })}
    </nav>
  );
}

function OrderGlyph({ order }: { order: BuildOrder }) {
  const className = "h-[16px] w-[16px] shrink-0";
  switch (order) {
    case "most-active":
      return <ActiveIcon className={className} />;
    case "newest":
      return <NewIcon className={className} />;
    case "upvoted":
      return <UpvoteIcon className={className} />;
    case "roles":
      return <RoleIcon className={className} />;
  }
}
