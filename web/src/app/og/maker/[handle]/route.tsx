import { fetchMakerPage } from "../../../public-api";
import { ogResponse } from "../../card";
import { makerCardMark } from "@openproduct/contracts";

import { makerCopy } from "../../../ui/og";

/** A maker's card (openproduct-worldclass RE0). See `og/product` for the
 *  cache note. */
export const revalidate = 600;

export async function generateStaticParams() {
  return [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
): Promise<Response> {
  const { handle } = await params;
  // The `launched` tab, because it is the one the profile page itself opens
  // on and the card only needs the contributor header it carries.
  const doc = await fetchMakerPage(handle, "launched");
  if (doc === null) return new Response("not found", { status: 404 });
  return ogResponse(makerCopy(doc.contributor.handle, doc.contributor.displayName, makerCardMark(doc.marks)));
}
