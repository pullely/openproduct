import {
  LAUNCH_HEALTH_DISPUTE,
  LAUNCH_HEALTH_HEADING,
  type LaunchHealthItem,
  formulaHref,
} from "@openproduct/contracts";

import { DASH } from "../ui/bits";
import { H3, PANEL } from "../ui/design";
import { AppLink } from "../ui/link";
import { absoluteOf, agoOf } from "../ui/time";
import { HealthIcon } from "../ui/icons";

/**
 * The launch-health checklist (openproduct-worldclass PV1, WC2 PP6).
 *
 * FIVE ROWS AND NO NUMBER. The component receives the items and renders
 * each one; it never counts them, sums them or renders a fraction — the
 * contract test holds `launch-health.ts` to that and the web test holds this
 * file to it. WC-E: a checklist, not a score.
 *
 * A DASH IS NOT AN UNTICKED BOX. An `unobserved` row renders a dash with the
 * sentence that says which read will fill it; a `withdrawn` row keeps its
 * last answer struck through, the way the observed frame does, because a
 * fact that vanished would be indistinguishable from one never read.
 *
 * THE DISPUTE ROUTE IS THE PAGE'S OWN REPORT CONTROL, which a human reads
 * (TS0): a maintainer who thinks an item is wrong opens the same form every
 * other complaint about a listing goes through, rather than a second inbox.
 */
export function LaunchHealth({ items, now }: { items: readonly LaunchHealthItem[]; now: number }) {
  return (
    <section
      id="health"
      aria-labelledby="health-heading"
      className={PANEL}
    >
      {/* OB5 — *Repo health*, with the shield the site uses for it. */}
      <h3 id="health-heading" className={`${H3} flex items-center gap-1.5`}>
        <HealthIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        {LAUNCH_HEALTH_HEADING}
      </h3>
      <ul className="m-0 mt-2 grid list-none p-0">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-baseline justify-between gap-3 border-t border-line py-[9px] text-[13.5px]"
          >
            <span
              className={item.state === "withdrawn" ? "text-faint line-through" : "text-muted-foreground"}
              title={item.note}
            >
              {/* `tap`, NOT `tap-h` (QE3). The link is inline inside a span,
                  and `tap-h` only sets a min-height, which an inline box
                  ignores — so the label was an 18px target at phone width.
                  `tap` makes it an inline-flex 44px row there, and is a no-op
                  above it. */}
              {item.formula ? (
                <AppLink
                  href={formulaHref(item.formula)}
                  className="tap underline decoration-transparent underline-offset-[3px] hover:text-foreground hover:decoration-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {item.label}
                </AppLink>
              ) : (
                item.label
              )}
            </span>
            <span className="flex items-baseline gap-2 tabular-nums text-[13.5px]">
              {item.state === "yes" ? (
                <span className="text-foreground" aria-label="yes">
                  ✓
                </span>
              ) : item.state === "no" ? (
                <span className="text-foreground" aria-label="no">
                  ✗
                </span>
              ) : (
                // Unobserved, or withdrawn: a dash, never an unticked box.
                <span className="text-faint" aria-label={item.state}>
                  {DASH}
                </span>
              )}
              {item.observedAt ? (
                <span className="text-[12px] text-muted-foreground" title={absoluteOf(item.observedAt)}>
                  {agoOf(item.observedAt, now)}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 border-t border-line pt-3 text-[12.5px] text-muted-foreground">
        <AppLink href="#report" className="tap-h underline underline-offset-4">
          {LAUNCH_HEALTH_DISPUTE}
        </AppLink>
        .
      </p>
    </section>
  );
}
