import {
  COLLECTION_REFUSALS,
  MAX_COLLECTION_BLURB,
  MAX_COLLECTION_TITLE,
  collectionSummary,
  type CuratorCollection,
} from "@openproduct/contracts";

import { readSession } from "../../auth/session-server";
import { BTN_OUTLINE, BTN_PRIMARY, FIELD, LABEL, TEXTAREA } from "../../ui/design";
import { FailurePanel } from "../../ui/failure";
import { StudioFrame, StudioPanel, StudioSection } from "../frame";
import { noticeFrom, COLLECTION_VOCABULARY } from "../notices";
import { fetchMyCollections } from "../studio-api";

/**
 * The curator's own collections (openproduct-commons LC4), in XP3's frame.
 *
 * TWO QUITE DIFFERENT PAGES LIVE HERE, and the API tells them apart with
 * `eligible` rather than leaving this to infer from an empty list:
 *
 *   NOT YET A CURATOR   the bar and how to clear it. Not an error — they have
 *                       done nothing wrong, they simply have not shipped
 *                       anything here yet, and that IS the bar (LC-4).
 *   A CURATOR           their collections, both counts, and the acts.
 *
 * BOTH COUNTS ON EVERY ROW. `held` is what they chose and `visible` is what a
 * reader sees today; showing only the second would make a listing that went
 * private look like something they had deleted.
 *
 * PROGRESSIVE ENHANCEMENT, no client JS (OX5b). Every act posts to the sibling
 * `actions` route, which reads the session server-side.
 */
export const dynamic = "force-dynamic";


interface PageProps {
  searchParams: Promise<{ notice?: string; refused?: string }>;
}

export default async function StudioCollectionsPage(props: PageProps) {
  const page = "/studio/collections";
  const session = await readSession();
  if (!session) {
    return (
      <FailurePanel
        kind="signedOut"
        what="Making a collection needs an account."
        actions={[{ label: "Sign in", href: `/signin?return_to=${encodeURIComponent(page)}` }]}
      />
    );
  }

  const result = await fetchMyCollections(session.accessToken);
  if (result.kind !== "ok") {
    return (
      <FailurePanel
        kind="unavailable"
        what="Your collections could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: page },
          { label: "Your listings", href: "/studio" },
        ]}
      />
    );
  }

  const search = await props.searchParams;
  const { eligible, curatorHandle, collections } = result.data;

  return (
    <StudioFrame
      vocabulary={COLLECTION_VOCABULARY}
      crumbs={[{ label: "Listings", href: "/studio" }, { label: "Collections" }]}
      title="Collections"
      notice={noticeFrom(search, COLLECTION_VOCABULARY)}
    >
      {!eligible ? (
        // NOT AN ERROR PANEL. They have done nothing wrong; they have not
        // shipped anything here yet, and that IS the bar.
        <StudioPanel title="Not yet">
          {COLLECTION_REFUSALS["not-a-curator"].says}
        </StudioPanel>
      ) : (
        <>
          {collections.length === 0 ? (
            <StudioPanel>
              Nothing yet. Published as{" "}
              <span className="font-medium text-foreground">@{curatorHandle}</span>.
            </StudioPanel>
          ) : (
            <StudioSection title={`${collections.length} of yours`}>
              {collections.map((collection) => (
                <CollectionRow key={collection.id} collection={collection} action={`${page}/actions`} />
              ))}
            </StudioSection>
          )}

          <StudioSection title="Make one">
            <form method="post" action={`${page}/actions`} className="max-w-[62ch]">
              <input type="hidden" name="intent" value="create" />
              <label className="block">
                <span className={LABEL}>Title</span>
                <input
                  name="title"
                  required
                  maxLength={MAX_COLLECTION_TITLE}
                  className={`${FIELD} max-w-[52ch]`}
                  placeholder="Eight things I keep coming back to"
                />
              </label>
              <label className="mt-3 block">
                <span className={LABEL}>
                  Address <span className="font-normal text-muted-foreground">/collections/…</span>
                </span>
                <input
                  name="slug"
                  required
                  pattern="[a-z0-9]([a-z0-9\-]{0,62}[a-z0-9])?"
                  className={`${FIELD} max-w-[52ch]`}
                  placeholder="eight-things"
                />
              </label>
              <label className="mt-3 block">
                <span className={LABEL}>
                  Why these?{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <textarea name="blurb" rows={3} maxLength={MAX_COLLECTION_BLURB} className={`${TEXTAREA} max-w-[62ch]`} />
              </label>

              <button type="submit" className={`${BTN_PRIMARY} mt-3`}>
                Make it
              </button>
            </form>
          </StudioSection>
        </>
      )}
    </StudioFrame>
  );
}

function CollectionRow({
  collection,
  action,
}: {
  collection: CuratorCollection;
  action: string;
}) {
  return (
    <div className="mb-3 max-w-[74ch] rounded-[12px] border border-border bg-card px-4 py-3.5 last:mb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15.5px] font-semibold text-foreground">{collection.title}</span>
        <span className="font-mono text-[12.5px] text-muted-foreground">
          /collections/{collection.slug}
        </span>
      </div>

      <p className="m-0 mt-2 text-[12.5px] text-muted-foreground">
        {collection.state === "published" ? "Published" : collection.state === "retired" ? "Retired" : "Draft"}
        {" · "}
        {collectionSummary(collection.visible)}
        {/* BOTH COUNTS. A listing that went private is not something they
            deleted, and a page that showed only the visible number would say
            it was. */}
        {collection.held > collection.visible ? (
          <> · {collection.held - collection.visible} not public, still yours</>
        ) : null}
      </p>

      <form method="post" action={action} className="mt-3 border-t border-border pt-3">
        <input type="hidden" name="collectionId" value={collection.id} />
        <label className="block">
          <span className={LABEL}>
            Add a product by its address
          </span>
          <input name="slug" className={`${FIELD} max-w-[52ch]`} placeholder="acme-thing" />
        </label>
        <label className="mt-2.5 block">
          <span className={LABEL}>
            Why this one? <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input name="note" className={`${FIELD} max-w-[52ch]`} />
        </label>
        <div className="mt-2.5 flex flex-wrap gap-2.5">
          <button type="submit" name="intent" value="add" className={BTN_OUTLINE}>
            Add it
          </button>
          <button type="submit" name="intent" value="remove" className={BTN_OUTLINE}>
            Remove it
          </button>
          {collection.state === "draft" ? (
            <button type="submit" name="intent" value="publish" className={BTN_OUTLINE}>
              Publish
            </button>
          ) : null}
          {collection.state === "published" ? (
            <button type="submit" name="intent" value="retire" className={BTN_OUTLINE}>
              Retire
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

