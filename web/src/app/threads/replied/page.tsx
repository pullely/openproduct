import type { Metadata } from "next";

import { ForumView, forumMetadata } from "../forum-view";

/** `/threads/replied` — every thread, most replied first (FO1). */
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = forumMetadata("replied", null);

export default function RepliedThreadsPage() {
  return <ForumView order="replied" tag={null} />;
}
