import { ogResponse } from "../card";
import { SITE_CARD_DESCRIPTION, siteCopy } from "../../ui/og";

/**
 * The card every address that is not a listing, a topic, a maker or a day
 * falls back to (openproduct-worldclass RE0).
 *
 * STATIC, and it reads nothing: the home page's own card must never be the
 * surface that goes blank because a read failed, since it is the one a
 * stranger meets first.
 */
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return ogResponse(siteCopy(SITE_CARD_DESCRIPTION));
}
