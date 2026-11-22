import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  PRODUCT_POST_KIND_LABELS,
  breadcrumbJsonLd,
  labelOf,
  productPostPagePath,
  thumbnailOf,
  type PublicProductPost,
} from "@openproduct/contracts";

import { postAnchor, postHeadline } from "../../../posts/blocks";
import { CrewNoticeLine } from "../../maker/notice";
import { POST_CARD_SHELL, PostCardBody, PostHead, postDate } from "../../../posts/post-card";
import { fetchProductPost, fetchProductPosts } from "../../../posts/posts-api";
import { ReactionPicker, ReactionSummary } from "../../../posts/reaction-control";
import { safeCounts } from "../../../posts/reactions";
import { fetchPublicProfile, fetchThread, publicApexOrigin } from "../../../public-api";
import { LiveCount } from "../../../ui/conversation-live";
import { BOARD_PAGE, EYEBROW, FOCUS, SIDE_CARD, SIDE_TITLE } from "../../../ui/design";
import { BackIcon } from "../../../ui/icons";
import { JsonLd } from "../../../ui/json-ld";
import { AppLink } from "../../../ui/link";
import { conversationKey } from "../../../ui/live-posts";
import { ProductTile } from "../../../ui/product-tile";
import { stageLine } from "../../../ui/stage";

import {
  POST_COMMENT_ID,
  morePostsOf,
  postCommentPath,
  postPageDescription,
  postPageTitle,
  postPageVerdict,
  postThreadState,
  visibleCommentCount,
} from "../post-page";
import { PostShare } from "../post-share";
import { PostThread } from "../post-thread";

/**
 * One post, on its own page (openproduct-redesign OPR-3; boards `Post`,
 * `PhonePost`): the post as its full card, its reactions, *Comment* and
 * *Share*, and the comments under it; beside it on a desktop, the product it
 * is from and that product's other posts.
 *
 * ONE CACHEABLE DOCUMENT, THE SAME FOR EVERYBODY (I6, design §4). Static and
 * revalidated like the product page; it resolves no actor. My reaction, my
 * follow and my votes arrive after load from the overlay, and the comment
 * forms are plain forms whose route reads the session.
 *
 * WHAT IS A 404, AND WHAT IS A REDIRECT (`postPageVerdict`): an unknown id, a
 * draft, a removed post, a post whose product is not listed and a failed
 * read are all the site's not-found, which never says which. A published
 * post reached under a slug that is not its product's — a link from before a
 * rename — redirects to the post's own address.
 *
 * THE HEADING. The card draws the post's headline as the feed's cards do;
 * the page's one `h1` names the product and the headline and is read out.
 *
 * THE MILESTONE BARS ARE HERE, on a Feature shipped post: this page reads
 * the product's document for the side column anyway, and that document has
 * the counts.
 *
 * THE SIDE COLUMN IS THE DESKTOP BOARD'S; the phone board is the post alone,
 * with the shell's bar for everything else.
 */
export const revalidate = 60;

/** Declares the segments so `revalidate` holds (see `[slug]/page.tsx`): no
 *  post is prebuilt, each is rendered on first request and cached. */
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, id } = await params;
  const verdict = postPageVerdict(await fetchProductPost(id), slug);
  if (verdict.kind !== "here") return { title: "Not found" };
  const { post } = verdict;
  const apex = publicApexOrigin();
  const path = productPostPagePath(post.product.slug, post.id);
  const title = postPageTitle(post);
  const description = postPageDescription(post);
  return {
    title,
    description,
    ...(apex ? { alternates: { canonical: `${apex}${path}` } } : {}),
  };
}

/** A row of "More from": the kind as a small label, then the headline. */
function MoreRow({ post }: { post: PublicProductPost }) {
  return (
    <li>
      <AppLink
        href={productPostPagePath(post.product.slug, post.id)}
        className={`flex min-h-[40px] flex-col rounded-[14px] bg-well p-2 px-3 text-foreground no-underline hover:bg-sunken ${FOCUS}`}
      >
        <span className={`${EYEBROW} ${post.kind === "seat" ? "text-seat-ink" : post.kind === "idea" ? "text-idea" : ""}`}>
          {PRODUCT_POST_KIND_LABELS[post.kind]}
        </span>
        <span className="text-[13px] font-semibold [overflow-wrap:anywhere]">{postHeadline(post)}</span>
        <time dateTime={post.publishedAt} className="text-[13px] text-muted-foreground">
          {postDate(post.publishedAt)}
        </time>
      </AppLink>
    </li>
  );
}

export default async function ProductPostPage({ params }: PageProps) {
  const { slug, id } = await params;
  const verdict = postPageVerdict(await fetchProductPost(id), slug);
  if (verdict.kind === "missing") notFound();
  if (verdict.kind === "moved") redirect(verdict.to);
  const { post } = verdict;

  const [profile, thread, others] = await Promise.all([
    fetchPublicProfile(post.product.slug),
    post.threadId ? fetchThread(post.threadId) : Promise.resolve(null),
    fetchProductPosts(post.product.slug),
  ]);

  const apex = publicApexOrigin();
  const here = productPostPagePath(post.product.slug, post.id);
  const product = `/${post.product.slug}`;
  const posts = thread?.posts ?? [];
  const state = postThreadState(post, thread);
  // The thread's own list when it was read; the post's count when it was not.
  const comments = thread ? visibleCommentCount(posts) : Math.max(0, Math.floor(post.commentCount));
  const more = morePostsOf(others?.posts ?? [], post.id);
  const category = profile?.category ? (labelOf("category", profile.category) ?? profile.category) : null;

  return (
    <main className={`${BOARD_PAGE} max-sm:gap-2.5`}>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: "Products", path: "/products" },
            { name: post.product.name, path: product },
            { name: postHeadline(post), path: here },
          ],
          apex,
        )}
      />
      <div className="grid grid-cols-[minmax(0,780px)_minmax(0,340px)] items-start justify-between gap-7 max-[900px]:grid-cols-[minmax(0,1fr)]">
        <article
          id={postAnchor(post.id)}
          aria-label={`${PRODUCT_POST_KIND_LABELS[post.kind]}: ${postHeadline(post)}`}
          data-post-page={post.kind}
          // The feed card's shell, without its clip: the reaction picker and
          // a long thread both need the room.
          className={`${POST_CARD_SHELL[post.kind]} !overflow-visible`}
        >
          {/* What a crew form came back with ("Posted"), for the crew, after
              load — as a toast, so the post under it does not move. */}
          <CrewNoticeLine slug={post.product.slug} toast />
          <div className="relative">
            <PostHead post={post} returnTo={here} />
            {/* THE HEADLINE IS THE PAGE'S ONE `h1`, drawn where the card draws
                it — not a hidden heading beside a visible `h3` saying the
                same words. The product is named in the row above it and in
                the article's label. */}
            <PostCardBody
              post={post}
              variant="feed"
              returnTo={here}
              milestoneCounts={profile?.milestoneCounts ?? null}
              headingLevel={1}
            />
          </div>

          <div
            data-post-summary
            className="flex items-center justify-between gap-2.5 px-6 pt-4 text-[13px] text-muted-foreground max-sm:px-[14px] max-sm:pt-2.5"
          >
            <ReactionSummary postId={post.id} reactions={safeCounts(post.reactions)} />
            {comments > 0 || post.threadId ? (
              <span className="ml-auto" data-post-comment-count>
                {post.threadId ? (
                  <LiveCount base={comments} conversation={conversationKey("thread", post.threadId)} one="comment" many="comments" />
                ) : (
                  `${comments} ${comments === 1 ? "comment" : "comments"}`
                )}
              </span>
            ) : null}
          </div>
          <div className="mx-3 mt-2.5 grid grid-cols-3 gap-0.5 border-t border-line pb-1.5 pt-1 max-sm:mx-2 max-sm:mt-2">
            <ReactionPicker postId={post.id} returnTo={here} />
            <a
              href={`#${POST_COMMENT_ID}`}
              className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-full text-[13px] font-medium text-copy no-underline hover:bg-foreground/[0.04] max-sm:min-h-[44px] ${FOCUS}`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 5h16v11H8l-4 4z" />
              </svg>
              Comment
            </a>
            <PostShare path={here} url={apex ? `${apex}${here}` : null} />
          </div>

          <PostThread
            posts={posts}
            state={state}
            threadId={post.threadId}
            action={postCommentPath(post.product.slug, post.id)}
            returnTo={here}
            draftKey={`op.draft.post.${post.id}`}
          />
        </article>

        <aside className="flex min-w-0 flex-col gap-[18px] max-[900px]:hidden" data-post-side>
          <section aria-label={`About ${post.product.name}`} className={SIDE_CARD}>
            <span className={EYEBROW}>About</span>
            <div className="flex items-center gap-3">
              <AppLink href={product} tabIndex={-1} aria-hidden="true" className="shrink-0">
                <ProductTile slug={post.product.slug} thumbnail={profile ? thumbnailOf(profile.media) : post.product.logo} size={44} />
              </AppLink>
              <div className="flex min-w-0 flex-1 flex-col">
                <AppLink href={product} className={`self-start text-[16px] font-semibold text-foreground no-underline hover:underline ${FOCUS}`}>
                  {post.product.name}
                </AppLink>
                <span className="text-[13px] text-muted-foreground" data-post-product-line>
                  {category ? `${category} · ` : null}
                  {stageLine(profile?.stage ?? post.product.stage, profile?.milestoneCounts ?? null)}
                </span>
              </div>
            </div>
            {profile?.tagline ? <p className="m-0 text-[15px] text-copy">{profile.tagline}</p> : null}
            <AppLink href={product} className={`text-[13px] font-semibold no-underline hover:underline ${FOCUS}`}>
              Open {post.product.name}
            </AppLink>
          </section>

          {more.length > 0 ? (
            <section aria-labelledby="post-more" className={`${SIDE_CARD} gap-2`}>
              <h2 id="post-more" className={`${SIDE_TITLE} mb-1 ml-1`}>
                More from {post.product.name}
              </h2>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {more.map((other) => (
                  <MoreRow key={other.id} post={other} />
                ))}
              </ul>
            </section>
          ) : null}

          <AppLink
            href="/"
            className={`flex min-h-[40px] items-center gap-1.5 self-start px-1.5 text-[13px] font-semibold no-underline hover:underline ${FOCUS}`}
          >
            <BackIcon className="h-[15px] w-[15px]" />
            Back to the feed
          </AppLink>
        </aside>
      </div>
    </main>
  );
}
