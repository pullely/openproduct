import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { parseMakerTab, type MakerTab } from "@openproduct/contracts";

import { MakerView, loadMaker, makerMetadata } from "../maker-view";

import { BOARD_PAGE } from "../../../ui/design";

/**
 * `/@{handle}/{tab}` (openproduct-launch MP0) — a maker page's other two tabs.
 *
 * TWO ROUTES, ONE BODY. `/@ada` is the launched tab at its bare address and
 * this route serves `upvoted` and `comments`. UV2's leaderboard is the same
 * shape and shipped for the same reason: a tab in a query parameter makes the
 * page dynamic, which makes `revalidate` a no-op and sends every response out
 * `no-store` — invisible from the rendered page and caught only by a lane that
 * reads the response header.
 *
 * `launched` IS NOT AN ADDRESS HERE. `parseMakerTab` accepts it, and this
 * route hands back null for it anyway: `/@ada/launched` and `/@ada` would
 * otherwise be two addresses for one document, which is the duplicate a
 * canonical tag has to clean up afterwards rather than a duplicate that never
 * existed.
 */
export const revalidate = 60;

/** XP4 — without this the `revalidate` above is accepted and ignored, and the
 *  route is served `no-store` to everybody. `[]` prerenders nothing and lets
 *  the ISR cache do the work from the first request onward. */
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ handle: string; tab: string }>;
}

/** The tab this address serves, or null — which is a 404 rather than a
 *  redirect to the bare page, because a wrong address is not a request for a
 *  different one. */
function tabOf(raw: string): MakerTab | null {
  const parsed = parseMakerTab(raw);
  return parsed === null || parsed === "launched" ? null : parsed;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle, tab: raw } = await params;
  const tab = tabOf(raw);
  if (tab === null) return { title: "Not found", robots: { index: false, follow: false } };
  return makerMetadata(await loadMaker(handle, tab), tab);
}

export default async function MakerTabPage({ params }: PageProps) {
  const { handle, tab: raw } = await params;
  const tab = tabOf(raw);
  if (tab === null) notFound();
  return <MakerTabBody handle={handle} tab={tab} before={null} />;
}

/**
 * PE1 — the body, shared with the cursor page beneath: one tab page, two
 * addresses (the first page and every page before a moment), the same
 * breadcrumb and view.
 */
export async function MakerTabBody({
  handle,
  tab,
  before,
}: {
  handle: string;
  tab: MakerTab;
  before: string | null;
}) {
  const doc = await loadMaker(handle, tab, before);
  // Null means the page could not be read at all — not that this person has
  // done nothing. An empty room and a locked door look nothing alike (OD5),
  // and the empty TAB is what says "nothing here yet".
  if (doc === null) notFound();

  return (
    // The profile card's pills are how a reader gets from this section to
    // the others — the bare `/@handle` among them, the address somebody
    // actually handed out — so the page draws no crumb over the card.
    <main className={BOARD_PAGE}>
      <MakerView doc={doc} now={Date.parse(doc.observedAt)} />
    </main>
  );
}
