"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { ProductStage } from "@openproduct/contracts";

import { FOCUS } from "../../ui/design";
import { nextStageLine } from "../../ui/stage";
import { StageBadge } from "../../ui/stage-mark";
import type { StageStart } from "../where-it-runs";

import type { Look } from "./details";
import { CHANGE_STAGE_TITLE, movedLine } from "./stage-form";
import { useMaker } from "./use-maker";

/** The popup, fetched when Change stage is pressed: the crew only. */
const StageDialog = React.lazy(() => import("./stage-dialog").then((module) => ({ default: module.StageDialog })));

/**
 * The Stage row inside Edit details (openproduct-stages-crew SC-2; board
 * `Product`): the product's stage badge, "Next: in production", and Change
 * stage. There is no stage button on the page itself (design §1.4).
 *
 * THE ROW KEEPS THE STAGE IT MOVED TO. The public page is cached for a
 * minute, so after a move the row shows the new stage and says the page is
 * catching up, and the router refreshes behind it; the popup opens from the
 * new stage next time.
 */
export function StageRow({ slug, start, look }: { slug: string; start: StageStart; look: Look }) {
  const { managing } = useMaker(slug);
  const router = useRouter();
  const [stage, setStage] = React.useState<ProductStage>(start.stage);
  const [open, setOpen] = React.useState(false);
  const [moved, setMoved] = React.useState<ProductStage | null>(null);
  const next = nextStageLine(stage);
  const close = React.useCallback(() => setOpen(false), []);
  // The crew on Manage only, like every piece in this folder.
  if (!managing) return null;

  return (
    <div data-stage-row className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-foreground">Stage</span>
      <div
        className={`flex min-h-[44px] flex-wrap items-center gap-2.5 rounded-[14px] py-1 pl-3.5 pr-1.5 ring-1 ring-inset ring-foreground/[0.08] ${
          look === "idea" ? "bg-well" : "bg-card max-sm:bg-well"
        }`}
      >
        <StageBadge stage={stage} />
        <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{next ?? "The last stage"}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          data-change-stage
          className={`inline-flex h-[34px] cursor-pointer items-center rounded-full border-0 bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 max-sm:h-[44px] ${FOCUS}`}
        >
          {CHANGE_STAGE_TITLE}
        </button>
      </div>
      {moved ? (
        <span role="status" className="text-[13px] text-success">
          {movedLine(moved)}
        </span>
      ) : null}
      {open ? (
        <React.Suspense fallback={null}>
          <StageDialog
            slug={slug}
            start={{ ...start, stage }}
            onClose={close}
            onMoved={(to) => {
              setStage(to);
              setMoved(to);
              setOpen(false);
              router.refresh();
            }}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
}
