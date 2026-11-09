// The feed's sidebar (openproduct-launch FL1).
//
// PUBLIC, ANONYMOUS, ACTOR-FREE (OPC-1, I6). The same four panels for every
// reader; the visitor's own follow state arrives after paint from the XP2
// overlay, and nothing here knows who is asking.
//
// ONE DOCUMENT, FOUR READS, IN PARALLEL. The panels are independent, so they
// are fetched together rather than in sequence — four serial round trips would
// make a column of furniture the slowest thing on the front page.
//
// A SEPARATE ENDPOINT FROM THE FEED, deliberately. The feed's read budget is
// one and it is the page's SUBJECT; the sidebar is its margin. Folding these
// four reads into `/feed` would make the launch board wait on a collection
// nobody scrolled to, and would mean a sidebar read that failed took the board
// down with it. Two documents, and the page renders the board whatever the
// margin does.
//
// NOTHING HERE IS RECOMMENDED. Each panel's order is published at
// `/docs/formulas`, and the two the design asked for that could not be — a
// "trending" signal this product does not observe, and a ranking of people by
// merit — are named differently and computed from facts instead. The argument
// is at the top of `contracts/sidebar.ts`.

import {
  SIDEBAR_COLLECTION_FORMULA,
  SIDEBAR_OPENINGS_FORMULA,
  SIDEBAR_OPENING_LIMIT,
  SIDEBAR_PEOPLE_FORMULA,
  SIDEBAR_PERSON_LIMIT,
  SIDEBAR_REPLIES_FORMULA,
  SIDEBAR_REPLY_LIMIT,
  SIDEBAR_TOPICS_FORMULA,
  SIDEBAR_TOPIC_LIMIT,
  SIDEBAR_TOPIC_WINDOW_DAYS,
  buildTopicIndex,
  facet,
  feedToday,
  headlineOf,
  orderSidebarTopics,
  previousDay,
  TOPIC_FACET,
  type SidebarPerson,
  type SidebarTopic,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";

export interface SidebarHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listPublicCards"
    | "listFeedLaunches"
    | "countFollowers"
    | "listPublishedCollections"
    | "listOpenRoles"
    | "listPublicContributorCards"
    | "listRecentlyRepliedThreads"
  >;
  now?: () => number;
}

export async function handleSidebar(
  _env: Env,
  request: Request,
  requestId: string,
  deps: SidebarHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const now = deps.now?.() ?? Date.now();
  // The window is decided HERE and handed to the read — OL2's rule, so the
  // panel is a function of the day it names rather than of when the query ran.
  const days: string[] = [];
  let day = feedToday(now);
  for (let i = 0; i < SIDEBAR_TOPIC_WINDOW_DAYS; i += 1) {
    days.push(day.id);
    day = previousDay(day);
  }

  // THE WHOLE VOCABULARY, COUNTED IN THE SAME ROUND TRIP (OPP7).
  //
  // This read used to happen AFTER the five below, bounded to the topics that
  // made the panel, on the reasoning that "counting the whole vocabulary to
  // show five would be reading rows to throw them away". That reasoning
  // weighed the rows and not the WAIT: the topic facet is a fixed contract
  // vocabulary of fourteen values, so the difference is nine rows on a query
  // that was going to run anyway — against a whole round trip to Postgres,
  // which on the front page is the second of two where the board pays one.
  //
  // Safe because the ORDER does not depend on it: `orderSidebarTopics` sorts
  // on `launches` and `label` and never on followers, so the five that make
  // the panel are the same five either way. If that ever changes, this must
  // move back — and the sort is one function, in the contract, with its own
  // test.
  const vocabulary = (facet(TOPIC_FACET)?.values ?? []).map((v) => v.value);

  const [cards, launches, collections, roles, people, followers, replied] = await Promise.all([
    deps.repo.listPublicCards(),
    deps.repo.listFeedLaunches(days),
    // ONE collection, and it is the newest. There is no `featured` flag on
    // this estate: a collection is already an attributable editorial act by a
    // named curator (LC4), and a second layer of selection over the top would
    // be an unattributable one.
    deps.repo.listPublishedCollections(1),
    deps.repo.listOpenRoles(SIDEBAR_OPENING_LIMIT),
    // THE DIRECTORY'S OWN READ, over-read and filtered in code. It has no
    // `openToProject` predicate, and adding one for a sidebar panel would put
    // a page's furniture into the catalogue's own query.
    //
    // WHAT THAT COSTS, said plainly: this is the newest sixty public
    // contributors, not all of them, so if nobody in that window has ticked
    // the opt-in the panel shows fewer than three rows — or none. That is the
    // acceptable direction of failure here, because the panel degrades to
    // ABSENCE, which is what it does when nobody has opted in at all. It never
    // shows the wrong people, and it never claims a list is complete.
    deps.repo.listPublicContributorCards(60),
    deps.repo.countFollowers("topic", vocabulary),
    // HB3 — the threads most recently replied to, in the same round trip.
    // The read keeps the feed row's own three rules (listed listing, thread
    // not removed, visible posts), so the count here is the row's count.
    deps.repo.listRecentlyRepliedThreads(SIDEBAR_REPLY_LIMIT),
  ]);

  const index = buildTopicIndex(cards);
  const launchesByTopic = new Map<string, number>();
  for (const row of launches) {
    if (!row.category) continue;
    launchesByTopic.set(row.category, (launchesByTopic.get(row.category) ?? 0) + 1);
  }

  const group = facet(TOPIC_FACET);
  const candidates: SidebarTopic[] = index.map((topic) => ({
    value: topic.value,
    label: group?.values.find((v) => v.value === topic.value)?.label ?? topic.label,
    launches: launchesByTopic.get(topic.value) ?? 0,
    followers: 0,
  }));
  const ordered = orderSidebarTopics(candidates, SIDEBAR_TOPIC_LIMIT);

  const collection = collections[0];
  const openToProject: SidebarPerson[] = people
    .filter((person) => person.openToProject)
    .slice(0, SIDEBAR_PERSON_LIMIT)
    .map((person) => ({
      handle: person.handle,
      name: person.displayName ?? person.handle,
      // THEIR WORDS, TRIMMED — never summarised and never generated. A
      // headline this product wrote about a person would be the one place a
      // made-up sentence does real harm.
      headline: headlineOf(person.bio),
    }));

  return successResponse(
    {
      topics: ordered.map((topic) => ({
        ...topic,
        followers: followers.get(topic.value) ?? 0,
      })),
      // ABSENT, NEVER EMPTY. A card standing empty under its heading tells a
      // reader something is broken; a panel with nothing to say is not
      // rendered at all (OPC-C applied to furniture).
      collection: collection
        ? {
            slug: collection.slug,
            title: collection.title,
            curator: collection.curatorHandle,
            items: collection.count,
            preview: [],
          }
        : null,
      openings: roles.map((role) => ({
        id: role.id,
        title: role.title,
        slug: role.slug,
        commitment: role.commitment,
      })),
      people: openToProject,
      // HB3 — absent-as-empty like the others: a panel with nothing to say
      // is not rendered.
      replies: replied.map((thread) => ({
        slug: thread.slug,
        title: thread.title,
        repliedAt: thread.lastPostAt,
        posts: thread.postCount,
      })),
      windowDays: SIDEBAR_TOPIC_WINDOW_DAYS,
      // OPC-4 — every panel's order resolves to a published sentence, and the
      // page links each heading to its own.
      formulas: {
        topics: SIDEBAR_TOPICS_FORMULA,
        collection: SIDEBAR_COLLECTION_FORMULA,
        openings: SIDEBAR_OPENINGS_FORMULA,
        people: SIDEBAR_PEOPLE_FORMULA,
        replies: SIDEBAR_REPLIES_FORMULA,
      },
    },
    requestId,
    200,
  );
}
