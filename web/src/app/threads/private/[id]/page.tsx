import type { Metadata } from "next";

import { PrivateThreadView } from "../../../talk/private-thread-view";

/**
 * `/threads/private/{id}` — a private thread's own address
 * (openproduct-redesign OPR-4, design §7).
 *
 * A SHELL, AND THE SAME ONE FOR EVERY ID AND EVERY READER. This render
 * reads nothing: no session, no thread, no gateway call. So the document
 * says nothing about whether the id is a thread, and it can be cached like
 * any other page without holding anything of anybody's (I6).
 *
 * WHAT IT SHOWS IS DECIDED AFTER LOAD, by one signed-in `no-store` read
 * (`/threads/private/{id}/data`): the thread, for its author and the
 * product's crew — or the site's ordinary not-found for everybody else,
 * signed in or not. A thread that is not yours and a thread that is not
 * there are the same page.
 *
 * NOT INDEXED, and in no sitemap: there is nothing here for a crawler.
 */
export const metadata: Metadata = {
  title: "Private thread",
  robots: { index: false, follow: false },
};

export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

export default async function PrivateThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrivateThreadView id={id} />;
}
