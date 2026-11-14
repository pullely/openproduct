// GET /feed/{cursor}/posts — one page of the feed as JSON (openproduct-
// redesign OPR-3), for *Show more* to append in place (`feed-posts.tsx`).
//
// THE SAME ANONYMOUS READ THE PAGE BESIDE IT MAKES (`/feed/{cursor}`), so the
// two can never disagree about what a page of the feed holds. Published posts
// only — `feedPosts` is the page's own check on top of the public read. No
// session is read and nothing personal is answered, so it caches like the
// document does.

import { NextResponse } from "next/server";

import { fetchFeedPage } from "../../../posts/posts-api";

import { feedPosts } from "../../feed-copy";

const CACHE_SECONDS = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ cursor: string }> }): Promise<NextResponse> {
  const { cursor } = await params;
  const page = await fetchFeedPage(cursor);
  if (page === null) {
    // A cursor the feed did not issue, or a feed that could not be read:
    // either way there is no page here, and the list keeps its plain link.
    // Not cached.
    return NextResponse.json({ error: { code: "unavailable", message: "No such page of the feed" } }, { status: 404 });
  }
  return NextResponse.json(
    { posts: feedPosts(page.posts), next: page.next },
    { headers: { "cache-control": `public, max-age=0, s-maxage=${CACHE_SECONDS}` } },
  );
}
