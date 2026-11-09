import { ogResponse } from "../../card";
import { LIST_CARD_KEYS, isListCardKey, listCopy } from "../../../ui/og";

/**
 * A list route's card (openproduct-worldclass-v2 QE1).
 *
 * STATIC, and it reads nothing: the copy is a registry in `ui/og.ts`, keyed,
 * so every card here is one of nine sentences the site wrote and the address
 * cannot be made to render anything else. An unknown key is a 404, not a
 * blank card.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return LIST_CARD_KEYS.map((key) => ({ key }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await params;
  if (!isListCardKey(key)) return new Response("no such card", { status: 404 });
  return ogResponse(listCopy(key));
}
