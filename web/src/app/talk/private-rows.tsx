"use client";

import type { PrivateThread } from "@openproduct/contracts";

import { talkThreadOf } from "./model";
import { ThreadRow } from "./thread-row";

/**
 * The reader's private threads, as rows (openproduct-redesign OPR-4).
 *
 * ITS OWN CHUNK, fetched only by a browser that has private threads to
 * draw: a signed-out visitor — and a signed-in one with none — never
 * downloads the row's client code, as a visitor never downloads the maker
 * view (`[slug]/maker/lazy.tsx`). Nothing here is ever rendered on the
 * server.
 */
export default function PrivateRows({
  slug,
  threads,
  now,
  heading,
}: {
  slug: string;
  threads: readonly PrivateThread[];
  now: number;
  heading: "h2" | "h3";
}) {
  return (
    <>
      {threads.map((thread) => (
        <ThreadRow key={thread.id} slug={slug} thread={talkThreadOf(thread)} now={now} heading={heading} />
      ))}
    </>
  );
}
