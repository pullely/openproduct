import { BOARD_MEANING, dayLabel, parseDayId } from "@openproduct/contracts";

import { ogResponse } from "../../card";
import { dayCopy } from "../../../ui/og";

/**
 * An archive day's card (openproduct-worldclass RE0).
 *
 * NO READ. The day is entirely decided by the address, and a board that
 * happens to be empty still has a date — so the card renders from
 * `parseDayId` alone and cannot fail because the API is having a bad minute.
 * `parseDayId` IS the guard here: this is an address a stranger typed.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ day: string }> },
): Promise<Response> {
  const { day } = await params;
  const parsed = parseDayId(day);
  if (!parsed.ok) return new Response("not found", { status: 404 });
  return ogResponse(dayCopy(dayLabel(parsed.day), BOARD_MEANING));
}
