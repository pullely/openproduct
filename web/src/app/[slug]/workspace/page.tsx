import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { consoleOrigin } from "@/lib/platform";
import { readSession } from "../../auth/session-server";
import { fetchListing } from "../../public-api";
import { AppLink } from "../../ui/link";
import { BTN_OUTLINE, BTN_PRIMARY, PAGE, PAGE_TITLE, PANEL } from "../../ui/design";
import {
  WORKSPACE_VIEW_CONSENT,
  WORKSPACE_VIEW_LABEL,
  consoleWorkspaceViewUrl,
  workspaceConsentPath,
} from "../workspace-view";

/**
 * `/{slug}/workspace` — the consent page in front of the console (openproduct-
 * reader OPR5, seam edge S12).
 *
 * The listing's anchor lands here rather than on the console because the
 * second sign-in deserves one sentence of why before it happens. A server
 * component with an EXPLICIT session read, like `/me`: signed out is a
 * redirect to sign-in with this address as the return, never a 500, and never
 * cached — this is a per-person surface. The listing itself is the same
 * anonymous, cached read the product page makes; a listing with no link grant
 * (no `workspaceRef`) has no door and 404s here exactly as it renders no
 * anchor there.
 *
 * It sends nothing to the platform and stores nothing: the one button is a
 * plain anchor to the console's own landing, which does the joining under the
 * visitor's own console session.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function WorkspaceConsentPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const session = await readSession();
  if (!session) redirect(`/signin?return_to=${encodeURIComponent(workspaceConsentPath(slug))}`);

  const read = await fetchListing(slug);
  const profile = read?.profile;
  if (!profile || !profile.workspaceRef) notFound();

  const href = consoleWorkspaceViewUrl(consoleOrigin(), profile.workspaceRef);

  return (
    <main className={PAGE}>
      <section className={`${PANEL} max-w-[720px]`} aria-labelledby="workspace-view-heading">
        <h1 id="workspace-view-heading" className={PAGE_TITLE}>
          {WORKSPACE_VIEW_LABEL}
        </h1>
        <p className="m-0 mt-3 max-w-[62ch] text-[15px] leading-[1.55] text-copy">
          <strong>{profile.slug}</strong> is built in the open. {WORKSPACE_VIEW_CONSENT}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href={href} className={`tap ${BTN_PRIMARY}`} rel="noopener">
            Continue to Orunbase
          </a>
          <AppLink href={`/${encodeURIComponent(slug)}`} className={`tap ${BTN_OUTLINE}`}>
            Back
          </AppLink>
        </div>
      </section>
    </main>
  );
}
