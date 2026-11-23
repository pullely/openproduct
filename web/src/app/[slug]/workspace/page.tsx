import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { consoleOrigin } from "@/lib/platform";
import { fetchListing } from "../../public-api";
import { consoleWorkspaceViewUrl } from "../workspace-view";

/**
 * `/{slug}/workspace` — the door to the workspace behind a product
 * (openproduct-reader OPR5, seam edge S12).
 *
 * A REDIRECT, FOR EVERYONE (openproduct-left-rail LR-9). This was a consent
 * page behind this site's sign-in: a signed-out visitor was sent to sign in
 * here, then shown a sentence and a "Continue to Orunbase" button. The
 * owner's rule is that the link goes straight to Orunbase's sign-in, and
 * that a visitor with no account here lands in the same place. So the
 * address reads no session and draws nothing: it answers with a redirect to
 * the console's landing, which signs the visitor in and does the joining
 * under their own console session.
 *
 * The listing is the same anonymous, cached read the product page makes; a
 * listing with no link grant (no `workspaceRef`) has no door and 404s here
 * exactly as it renders no button there. It sends nothing to the platform
 * and stores nothing.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function WorkspaceDoorPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;

  const read = await fetchListing(slug);
  const profile = read?.profile;
  if (!profile || !profile.workspaceRef) notFound();

  redirect(consoleWorkspaceViewUrl(consoleOrigin(), profile.workspaceRef));
}
