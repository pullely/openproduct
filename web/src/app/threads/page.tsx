import type { Metadata } from "next";

import { ForumView, forumMetadata } from "./forum-view";

/** `/threads` — every thread, newest first (openproduct-worldclass-v2 FO1). */
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = forumMetadata("latest", null);

export default function ThreadsPage() {
  return <ForumView order="latest" tag={null} />;
}
