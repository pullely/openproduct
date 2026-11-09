// The RSS feed (openproduct-commons LC1, LC-5).
//
// A FEED, NOT AN EMAIL, and that is the whole argument. A feed needs no
// address, works at any volume, cannot leak a subscriber list because there
// is not one, and reaches a reader who has already decided how they want to
// be reached. Email is delivery; this is the thing being delivered, and it
// has to be good on its own before anybody is asked for an address (I3).
//
// RSS 2.0 rather than Atom, for one reason: it is what readers accept without
// argument. The `atom:link rel="self"` is the one Atom borrowing, because
// validators want it and it costs nothing.
//
// ONE ENTRY PER WEEK. Not one per launch: a launch is not a thing you can
// subscribe to — it happens once and its page is already in the sitemap — and
// a per-launch feed on a quiet week is silence, while on a busy one it is a
// flood. A week is the unit this product publishes in.

import { FEED_DESCRIPTION, parseWeekId, weekDates } from "@openproduct/contracts";

import { fetchDigestWeeks, publicApexOrigin } from "../../public-api";

export const revalidate = 300;

/** How many weeks a feed carries. A year, which is what a reader who
 *  subscribed today would want if they went looking backwards. */
const FEED_WEEKS = 52;

export async function GET(): Promise<Response> {
  const weeks = await fetchDigestWeeks();
  if (weeks === null) {
    // A FAILED READ IS NOT AN EMPTY FEED. Serving `<channel>` with no items
    // tells every subscribed reader that nothing has ever happened, and some
    // of them cache that. 503 is the honest answer and readers retry.
    return new Response("The digest archive could not be read.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const origin = publicApexOrigin() ?? "";
  const items = weeks.slice(0, FEED_WEEKS).map((id) => {
    const parsed = parseWeekId(id);
    const link = `${origin}/digest/${id}`;
    const title = parsed.ok ? `Week ${parsed.week.week}, ${parsed.week.year}` : id;
    const dates = parsed.ok ? weekDates(parsed.week) : id;
    return [
      "    <item>",
      `      <title>${escapeXml(title)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      // The GUID is the week's address and it never changes, which is what
      // stops a reader being shown the same week twice.
      `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `      <description>${escapeXml(`Everything launched on openproduct in the week of ${dates}.`)}</description>`,
      ...(parsed.ok ? [`      <pubDate>${rfc822(parsed.week)}</pubDate>`] : []),
      "    </item>",
    ].join("\n");
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>openproduct · the digest</title>",
    `    <link>${escapeXml(`${origin}/digest`)}</link>`,
    `    <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    "    <language>en</language>",
    `    <atom:link href="${escapeXml(`${origin}/digest/feed.xml`)}" rel="self" type="application/rss+xml" />`,
    ...items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

/**
 * The five XML entities, and all five of them.
 *
 * Every value here comes from our own week ids and our own copy, so nothing
 * hostile reaches it today — which is exactly why it is easy to skip and
 * exactly why it is not skipped. A feed is parsed by machines that fail
 * loudly on malformed XML, and the day a tagline reaches this function is not
 * the day to discover it.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The week's Monday, in the format RSS insists on. */
function rfc822(week: { year: number; week: number }): string {
  const jan4 = Date.UTC(week.year, 0, 4);
  const monday1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000;
  return new Date(monday1 + (week.week - 1) * 7 * 86_400_000).toUTCString();
}
