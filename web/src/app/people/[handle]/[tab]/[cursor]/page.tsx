import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { parseHistoryCursor, parseMakerTab } from "@openproduct/contracts";

import { loadMaker, makerMetadata } from "../../maker-view";
import { MakerTabBody } from "../page";

/**
 * `/@handle/history/<moment>` — the history page before a moment
 * (openproduct-worldclass-v2 PE1).
 *
 * A PATH SEGMENT, NOT A QUERY STRING (OPC-1): every page of a person's
 * history is one cacheable document at an address that names a stable slice
 * of the past. Only `history` has pages; a cursor under any other tab is a
 * 404, as is a cursor that is not a moment. Not indexed: the first page is
 * the address search engines should hold, and the rest is reachable from it.
 */
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ handle: string; tab: string; cursor: string }>;
}

function pageOf(rawTab: string, rawCursor: string): { before: string } | null {
  if (parseMakerTab(rawTab) !== "history") return null;
  const before = parseHistoryCursor(rawCursor);
  return before ? { before } : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle, tab, cursor } = await params;
  const page = pageOf(tab, cursor);
  if (page === null) return { title: "Not found", robots: { index: false, follow: false } };
  const meta = makerMetadata(await loadMaker(handle, "history", page.before), "history");
  return { ...meta, robots: { index: false, follow: true } };
}

export default async function MakerHistoryPage({ params }: PageProps) {
  const { handle, tab, cursor } = await params;
  const page = pageOf(tab, cursor);
  if (page === null) notFound();
  return <MakerTabBody handle={handle} tab="history" before={page.before} />;
}
