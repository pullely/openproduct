import type { Metadata } from "next";

import { forumCategories } from "@openproduct/contracts";

import { ForumView, forumMetadata, tagOrNotFound } from "../../forum-view";

/** `/threads/tag/<tag>` — one category, newest first (FO1). */
export const revalidate = 60;

export async function generateStaticParams() {
  return forumCategories().map((category) => ({ tag: category.value }));
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  return forumMetadata("latest", tagOrNotFound(tag));
}

export default async function TagThreadsPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  return <ForumView order="latest" tag={tagOrNotFound(tag)} />;
}
