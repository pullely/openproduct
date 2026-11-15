import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { publicApexOrigin } from "../../../public-api";
import { SEAT_STAGE_FILTER_LABEL, SEAT_STAGE_SEGMENTS, seatStageOfSegment, seatsPath } from "../../seats";
import { HelpWantedView } from "../../seats-view";

/**
 * Help wanted, on one stage (openproduct-redesign OPR-3; boards `Seats`,
 * `PhoneSeats`): `/help-wanted/stage/ideas`, `…/building`, `…/on-stage`,
 * `…/in-production` (SC-2: the four stages).
 *
 * THE FILTER IS AN ADDRESS, for the reason the Products page's is: a page
 * that reads `?stage=` goes out `no-store`; each of these is one static
 * document, the same bytes for every visitor (I6, design.md §4). All are
 * prerendered; a segment that is not a stage is a 404.
 */
export const revalidate = 60;

export function generateStaticParams() {
  return SEAT_STAGE_SEGMENTS.map((stage) => ({ stage }));
}

export async function generateMetadata({ params }: { params: Promise<{ stage: string }> }): Promise<Metadata> {
  const stage = seatStageOfSegment((await params).stage);
  if (stage === null) return {};
  const origin = publicApexOrigin();
  return {
    title: `Help wanted — ${SEAT_STAGE_FILTER_LABEL[stage].toLowerCase()}`,
    description: "Every open seat on a product built in the open: what it asks for, and where to take it.",
    ...(origin ? { alternates: { canonical: `${origin}${seatsPath(stage)}` } } : {}),
  };
}

export default async function HelpWantedAtStagePage({ params }: { params: Promise<{ stage: string }> }) {
  const stage = seatStageOfSegment((await params).stage);
  if (stage === null) notFound();
  return <HelpWantedView stage={stage} />;
}
