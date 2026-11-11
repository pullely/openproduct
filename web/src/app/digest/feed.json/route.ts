// The JSON Feed (openproduct-commons LC1, LC-5).
//
// THE SAME DOCUMENT IN THE FORMAT A PROGRAM WOULD RATHER HAVE. RSS exists
// because readers accept it; this exists because anything building on the
// digest — a bot, a newsletter somebody else runs, a dashboard — should not
// have to parse XML to find out what launched last week.
//
// JSON Feed 1.1, whose `version` string is a URL and is checked by validators
// against exactly that value. `_openproduct` is the extension namespace the
// spec reserves for exactly this: the week id, so a consumer can address the
// page without parsing it back out of a URL.

import { FEED_DESCRIPTION, parseWeekId, weekDates } from "@openproduct/contracts";

import { fetchDigestWeeks, publicApexOrigin } from "../../public-api";

export const revalidate = 300;

const FEED_WEEKS = 52;

export async function GET(): Promise<Response> {
  const weeks = await fetchDigestWeeks();
  if (weeks === null) {
    // Same rule as the RSS feed: an empty feed is a claim that nothing has
    // ever happened, and a failed read is not that claim.
    return Response.json(
      { error: "The digest archive could not be read." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const origin = publicApexOrigin() ?? "";

  return Response.json(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: "openproduct · the digest",
      home_page_url: `${origin}/digest`,
      feed_url: `${origin}/digest/feed.json`,
      description: FEED_DESCRIPTION,
      language: "en",
      items: weeks.slice(0, FEED_WEEKS).map((id) => {
        const parsed = parseWeekId(id);
        const url = `${origin}/digest/${id}`;
        return {
          // The week's address, unchanging — which is what stops a reader
          // being shown the same week twice.
          id: url,
          url,
          title: parsed.ok ? `Week ${parsed.week.week}, ${parsed.week.year}` : id,
          summary: `Everything launched on openproduct in the week of ${
            parsed.ok ? weekDates(parsed.week) : id
          }.`,
          ...(parsed.ok ? { date_published: mondayOf(parsed.week) } : {}),
          _openproduct: { week: id },
        };
      }),
    },
    {
      headers: {
        "content-type": "application/feed+json; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    },
  );
}

function mondayOf(week: { year: number; week: number }): string {
  const jan4 = Date.UTC(week.year, 0, 4);
  const monday1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000;
  return new Date(monday1 + (week.week - 1) * 7 * 86_400_000).toISOString();
}
