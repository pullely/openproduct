// POST /{slug}/posts/{id}/comment — a comment, or a reply to one, on a
// product's post (openproduct-redesign OPR-3; boards `Post`, `PhonePost`).
//
// THE SITE'S OWN POSTING PATH, AT THE POST'S ADDRESS. A post's comments are
// an ordinary thread (design §6), and the write is the one every thread
// takes — `createPost` (`me/me-api.ts`), with what the site requires of a
// commenter today: a session, and whatever core's eligibility rule says.
// What this route adds over `/threads/{id}/reply` is where it comes BACK to:
// the post's page, at the comment box or at the comment answered, rather
// than the thread's forum address.
//
// THE THREAD IS NEVER TAKEN FROM THE FORM. The address names a post; the
// public read of that post says which thread holds its comments. A draft, a
// removed post and one that is not this product's have no public read, so
// nothing can be written under them from here.
//
// ONE ROUTE, TWO ANSWERS — the shape `/comment` and the thread's reply route
// have. A browser posting the form gets a `303` back to the page; a caller
// that says `accept: application/json` (`ui/conversation-live.tsx`, having
// already drawn the comment) gets `201 { data: { postId } }`, `401`, `404`,
// `422` or `502`, and settles or fails the comment with it.

import { NextResponse, type NextRequest } from "next/server";

import { MAX_POST_BODY, productPostPagePath } from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../../../../auth/auth";
import { wantsJson } from "../../../../me/act";
import { createPost } from "../../../../me/me-api";
import { fetchProductPost } from "../../../../posts/posts-api";

import { POST_COMMENT_ID, POST_COMMENT_NOTICES, postPageVerdict } from "../../post-page";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = { "cache-control": "no-store" } as const;

const NOT_FOUND_MESSAGE = "There is no such post to comment on.";

function refused(status: number, message: string): NextResponse {
  return NextResponse.json({ error: { message } }, { status, headers: NO_STORE });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; id: string }> },
): Promise<NextResponse> {
  const json = wantsJson(request);
  const { slug, id } = await context.params;

  const verdict = postPageVerdict(await fetchProductPost(id), slug);
  if (verdict.kind !== "here" || !verdict.post.threadId) {
    return json
      ? refused(404, NOT_FOUND_MESSAGE)
      : NextResponse.redirect(new URL(verdict.kind === "moved" ? verdict.to : `/${encodeURIComponent(slug)}`, request.url), 303);
  }
  const threadId = verdict.post.threadId;

  const here = productPostPagePath(verdict.post.product.slug, verdict.post.id);
  const back = (suffix: string) => NextResponse.redirect(new URL(`${here}${suffix}`, request.url), 303);
  const signIn = () =>
    json
      ? new NextResponse(null, { status: 401, headers: NO_STORE })
      : NextResponse.redirect(
          new URL(`/signin?return_to=${encodeURIComponent(`${here}#${POST_COMMENT_ID}`)}`, request.url),
          303,
        );

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return signIn();

  const form = await request.formData();
  const body = String(form.get("body") ?? "").trim();
  if (body.length === 0 || body.length > MAX_POST_BODY) {
    return json ? refused(422, POST_COMMENT_NOTICES.invalid ?? "") : back(`?commented=invalid#${POST_COMMENT_ID}`);
  }

  // The words are the part somebody typed. Losing them to a mangled hidden
  // field would be the worse failure, so a malformed parent is a top-level
  // comment rather than a refusal (the thread route's rule).
  const parentRaw = String(form.get("parentPostId") ?? "").trim();
  const parentPostId = UUID_RE.test(parentRaw) ? parentRaw : null;

  const result = await createPost(session.accessToken, threadId, body, parentPostId);
  if (result.kind === "unauthorized") return signIn();
  if (result.kind !== "ok") {
    return json ? refused(502, POST_COMMENT_NOTICES.failed ?? "") : back(`?commented=failed#${POST_COMMENT_ID}`);
  }

  if (json) {
    return NextResponse.json({ data: { postId: result.data.postId, threadId } }, { status: 201, headers: NO_STORE });
  }
  return back(parentPostId === null ? `#${POST_COMMENT_ID}` : `#post-${parentPostId}`);
}
