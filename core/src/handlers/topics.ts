// Topic pages (openproduct-launch TP0).
//
// PUBLIC, ANONYMOUS, AND THEY RESOLVE NO ACTOR (OPC-1, I6). The same document
// for every reader; the visitor's own vote state arrives after paint from the
// XP2 overlay, and nothing here knows who is asking.
//
// NEITHER HANDLER RANKS. The index orders by a count it took from the
// directory; a topic page orders by day and then by the board's own rank,
// which is what the feed does within a group. The surface that pools days is
// the leaderboard, and it publishes its own formula for doing so (OL-2a).
//
// THE INDEX IS THE GATE. `topicIn` decides whether a value has a page, and it
// reads the same index the cards come from — so "has a card" and "has a page"
// are one answer, and a topic cannot be reachable by URL while being absent
// from the grid that is supposed to list every topic.

import {
  TOPICS_MEANING,
  TOPIC_EMPTY_NOTE,
  TOPIC_WINDOW_DAYS,
  buildTopic,
  buildTopicIndex,
  feedToday,
  topicIn,
  topicMeaning,
  topicWindowDays,
  thumbnailOf,
  type FeedEntry,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { mediaFactOf } from "./media.js";
import { errorResponse, successResponse } from "../http.js";

export interface TopicsHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    "listPublicCards" | "listFeedLaunches" | "countFollowers"
    // MD3 — the rows' tiles, one read for the page.
    | "listPublicMediaForSlugs"
  >;
  now?: () => number;
}

/** `/topics` — every topic a live listing has chosen. ONE READ. */
export async function handleTopics(
  _env: Env,
  request: Request,
  requestId: string,
  deps: TopicsHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const cards = await deps.repo.listPublicCards();
  const index = buildTopicIndex(cards);
  // FL0 — one batched count for the whole grid. TP0 shipped these cards with
  // no follower count at all, because nothing observed a follow and a zero
  // would have been a claim rather than a measurement (OPC-C). It is a
  // measurement now, so it renders — including at zero.
  const followers = await deps.repo.countFollowers(
    "topic",
    index.map((topic) => topic.value),
  );
  return successResponse(
    {
      topics: index.map((topic) => ({ ...topic, followers: followers.get(topic.value) ?? 0 })),
      meaning: TOPICS_MEANING,
      windowDays: TOPIC_WINDOW_DAYS,
    },
    requestId,
    200,
  );
}

/**
 * `/topics/{value}` — one topic.
 *
 * TWO READS, and neither is avoidable. The directory read is what gives the
 * topic its product count and, through `topicIn`, its right to exist; the
 * launch read is the page's body. Deriving the count from the launches instead
 * would count launches and call them products, which is the conflation LC0
 * spent a milestone separating.
 */
export async function handleTopic(
  _env: Env,
  request: Request,
  value: string,
  requestId: string,
  deps: TopicsHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const now = deps.now?.() ?? Date.now();
  const today = feedToday(now);
  const days = topicWindowDays(today);

  const [cards, rows, followers] = await Promise.all([
    deps.repo.listPublicCards(),
    deps.repo.listFeedLaunches(days.map((day) => day.id)),
    // FL0 — asked for THIS topic before knowing whether it exists, so the
    // three reads stay one round trip. A count for a topic that turns out to
    // be a 404 is a wasted lookup, not a wrong answer, and the alternative is
    // paying a serial round trip on every request that is not a 404.
    deps.repo.countFollowers("topic", [value]),
  ]);

  // A TOPIC NOBODY HAS CHOSEN IS A 404, not an empty page. The vocabulary has
  // more values than the catalogue has listings, and a page for a topic with
  // no products is a page about nothing — which a crawler indexes and a reader
  // reports as broken.
  const card = topicIn(buildTopicIndex(cards), value);
  if (card === null) {
    return errorResponse("not_found", "No such topic", 404, requestId);
  }

  // MD3 — the rows' tiles. See feed.ts: one read, never an ordering input.
  const mediaBySlug = await deps.repo.listPublicMediaForSlugs([...new Set(rows.map((row) => row.slug))]);
  const thumbnailFor = (slug: string) =>
    thumbnailOf((mediaBySlug.get(slug.toLowerCase()) ?? mediaBySlug.get(slug) ?? []).map(mediaFactOf));
  const entries: FeedEntry[] = rows.map((row) => ({
    launchId: row.launchId,
    slug: row.slug,
    tagline: row.tagline,
    versionLabel: row.versionLabel,
    launchedAt: row.launchedAt,
    day: row.day,
    rank: row.rank,
    counted: row.counted,
    ineligible: row.ineligible,
    licence: row.licence,
    topics: row.category ? [row.category] : [],
    stack: row.stack,
    roleOpeningCount: row.roleOpeningCount,
    commentCount: row.commentCount,
    thumbnail: thumbnailFor(row.slug),
  }));

  const topic = buildTopic(card, today, entries);
  return successResponse(
    {
      ...topic,
      followers: followers.get(value) ?? 0,
      windowDays: TOPIC_WINDOW_DAYS,
      meaning: topicMeaning(topic),
      // Carried always, not only when empty: the page decides whether to
      // render it, and a string that arrives conditionally is a string that is
      // missing the one time it is needed.
      emptyNote: TOPIC_EMPTY_NOTE,
    },
    requestId,
    200,
  );
}
