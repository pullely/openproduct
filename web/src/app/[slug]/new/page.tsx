import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  PRODUCT_POST_ID_RE,
  isAuthoredProductPostKind,
  prefilledPostBlocks,
  productPostPagePath,
  thumbnailOf,
  type AuthoredProductPostKind,
  type ProductPostBlock,
} from "@openproduct/contracts";

import { readSession } from "../../auth/session-server";
import { listCrewMilestones, listCrewPosts, resolveCrew } from "../../posts/crew-api";
import { crewError, crewNotice } from "../../posts/crew-handler";
import { fetchPublicProfile } from "../../public-api";
import { FailurePanel } from "../../ui/failure";

import { composeDraftPath, composeKindOf, composeTitle } from "./compose";
import { Composer, type ComposeMilestone, type ComposePost, type ComposeSeat } from "./composer";

/**
 * The post builder (openproduct-redesign OPR-3, design §5; boards `Compose`,
 * `PhoneCompose`) — `/{slug}/new`, `?kind=` to open on a kind, `?draft=<ppo>`
 * to carry on a draft or edit a published post.
 *
 * THE CREW'S PAGE, AND NOBODY ELSE'S. Unlike the product page it sits under,
 * nothing here is public: the whole document is one crew member's, so it is
 * rendered per request (`force-dynamic`, which goes out `no-store`) with an
 * EXPLICIT session read, like `/me`. Who is on the crew is decided ON THE
 * SERVER, by core, through `resolveCrew` — the same check the write handlers
 * make — before a byte of the builder is drawn:
 *
 *   signed out, or a dead session   through sign-in, and back to this address
 *   not on this product's crew      the site's 404 — the same answer as a
 *                                   product that does not exist, so the page
 *                                   never says which
 *   the service failed              a failure panel with a way back
 *
 * WHAT IT READS, TOGETHER: the product's public document (its name, logo,
 * stage, Try it address and open seats), the crew's posts (to find the draft
 * the address names) and the milestones (a Feature shipped post may be about
 * a shipped one). The writes are not here: the card posts to
 * `/{slug}/manage/posts`, which resolves the product again from the slug and
 * the session.
 */
export const dynamic = "force-dynamic";

/** The same slug grammar the crew routes use. */
const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

interface Search {
  kind?: string | string[];
  draft?: string | string[];
  post?: string | string[];
  notice?: string | string[];
  error?: string | string[];
  fields?: string | string[];
}

const first = (value: string | string[] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const draft = first((await props.searchParams).draft);
  // A crew-only page is nobody's search result.
  return { title: `${composeTitle(draft ? "draft" : "new")} · ${slug}`, robots: { index: false, follow: false } };
}

export default async function ComposePage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const { slug } = await props.params;
  if (!SLUG_RE.test(slug)) notFound();
  const search = await props.searchParams;
  const requestedKind = first(search.kind);
  const notice = first(search.notice);
  const posted = first(search.post);
  const draftId = first(search.draft) ?? (posted && PRODUCT_POST_ID_RE.test(posted) ? posted : null);
  if (draftId !== null && !PRODUCT_POST_ID_RE.test(draftId)) notFound();

  // A PLAIN FORM'S POST COMES BACK HERE (its `return_to` is this page, so a
  // refusal lands on the builder with what it refused). A post that went out
  // is sent on to its own page.
  if (notice === "posted" && posted && PRODUCT_POST_ID_RE.test(posted)) {
    redirect(`${productPostPagePath(slug, posted)}?notice=posted`);
  }

  const here =
    draftId !== null
      ? composeDraftPath(slug, draftId)
      : isAuthoredProductPostKind(requestedKind)
        ? `/${slug}/new?kind=${requestedKind}`
        : `/${slug}/new`;
  const signIn = `/signin?return_to=${encodeURIComponent(here)}`;

  const session = await readSession();
  if (!session) redirect(signIn);

  // THE GATE. Core says whether this person is on this product's crew.
  const crew = await resolveCrew(session.accessToken, slug);
  if (crew.kind === "unauthorized") redirect(signIn);
  if (crew.kind === "not-crew") notFound();
  if (crew.kind === "unavailable") {
    return (
      <FailurePanel
        kind="unavailable"
        what="The post builder could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: here },
          { label: "Back to the product", href: `/${slug}` },
        ]}
      />
    );
  }
  const ids = { org: crew.crew.org, profile: crew.crew.profile };

  const [product, posts, milestones] = await Promise.all([
    fetchPublicProfile(slug),
    draftId !== null ? listCrewPosts(session.accessToken, ids) : null,
    listCrewMilestones(session.accessToken, ids),
  ]);
  if (posts?.kind === "unauthorized" || milestones.kind === "unauthorized") redirect(signIn);

  let post: ComposePost | null = null;
  if (draftId !== null) {
    if (posts === null || posts.kind === "unavailable") {
      return (
        <FailurePanel
          kind="unavailable"
          what="This post could not be loaded. It is not something you did, and trying again in a moment usually works."
          actions={[
            { label: "Try again", href: here },
            { label: "Back to the product", href: `/${slug}` },
          ]}
        />
      );
    }
    const found = posts.kind === "ok" ? posts.data.posts.find((candidate) => candidate.id === draftId) : undefined;
    // Not this product's post, a removed one, or a demo (recorded, never
    // typed): there is nothing here to edit.
    if (!found || !isAuthoredProductPostKind(found.kind)) notFound();
    post = {
      id: found.id,
      state: found.state,
      kind: found.kind,
      blocks: found.blocks,
      milestoneId: found.milestoneId,
      roleOpeningId: found.roleOpeningId,
    };
  }

  // A Feature shipped post may be about a milestone that shipped.
  const shipped: ComposeMilestone[] =
    milestones.kind === "ok"
      ? milestones.data.milestones
          .filter((milestone) => milestone.shippedAt !== null)
          .map((milestone) => ({ id: milestone.id, code: milestone.code, title: milestone.title }))
      : [];
  // A Help wanted post may be about a seat that is open.
  const seats: ComposeSeat[] = (product?.roleOpenings ?? [])
    .filter((opening) => opening.status === "open")
    .map((opening) => ({ id: opening.id, title: opening.title }));

  // A new Feature shipped post starts with the address the product is tried
  // at; everything else starts empty.
  const starts: Partial<Record<AuthoredProductPostKind, ProductPostBlock[]>> = {
    feature: prefilledPostBlocks("feature", { try: product?.tryUrl ?? null }),
  };

  const errorFields = (first(search.fields) ?? "").split(",").filter((name) => name.length > 0);

  return (
    <Composer
      // A different post is a different builder: its text does not carry over.
      key={post?.id ?? "new"}
      product={{
        slug,
        name: product?.slug ?? slug,
        stage: product?.stage ?? "idea",
        logo: product ? thumbnailOf(product.media) : null,
      }}
      kind={post?.kind ?? composeKindOf(requestedKind)}
      post={post}
      starts={starts}
      milestones={shipped}
      seats={seats}
      notice={crewNotice(notice)}
      error={crewError(first(search.error))}
      errorFields={errorFields}
      now={new Date().toISOString()}
    />
  );
}
