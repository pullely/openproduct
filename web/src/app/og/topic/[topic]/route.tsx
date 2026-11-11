import { fetchTopic } from "../../../public-api";
import { ogResponse } from "../../card";
import { topicCopy } from "../../../ui/og";

/** A topic's card (openproduct-worldclass RE0). See `og/product` for the
 *  cache note — the same posture, at the topic page's own revalidate. */
export const revalidate = 600;

export async function generateStaticParams() {
  return [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ topic: string }> },
): Promise<Response> {
  const { topic } = await params;
  const doc = await fetchTopic(topic);
  if (doc === null) return new Response("not found", { status: 404 });
  return ogResponse(topicCopy(doc.value, doc.label, doc.description));
}
