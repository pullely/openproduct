import { NextResponse, type NextRequest } from "next/server";

import {
  MAX_POST_BODY,
  MAX_THREAD_TITLE,
  THREADS_NEW_PATH,
  isChosenThreadTag,
} from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../../../auth/auth";
import { actAnswer } from "../../../me/act";
import { createThread } from "../../../me/me-api";

/**
<<<<<<<< HEAD:apps/openproduct/web/src/app/threads/new/submit/route.ts
 * POST `/threads/new/submit` — the composer's door (openproduct-worldclass-v2 FO0).
 *
 * ONE SEGMENT DOWN FROM THE PAGE, AND NOT BY CHOICE. FO0 put this handler at
 * `threads/new/route.ts` beside `threads/new/page.tsx`, and Next refuses that
 * shape outright — "You cannot have two parallel pages that resolve to the
 * same path" — so `next build` failed on `main` for FO0, FO1 and FO2 (three
 * red runs nobody read). The page keeps the composer's address; the act
 * posts here. `THREADS_NEW_SUBMIT_PATH` in the contract is the one spelling,
 * and `forum-door.test.ts` pins that no `route.ts` sits beside the page.
 * Ported into MD2's PR because MD2 could not build either (openproduct-worldclass).
========
 * POST `/threads/new/actions` — the composer's door (openproduct-worldclass-v2
 * FO0).
 *
 * AT `/actions`, NOT AT THE PAGE'S OWN ADDRESS — the studio's convention, and
 * the reason is a build error rather than taste. FO0 first shipped this file
 * as `threads/new/route.ts` beside `threads/new/page.tsx`, and Next refuses
 * a page and a route handler that resolve to one path ("You cannot have two
 * parallel pages that resolve to the same path"). Every lane passed — the
 * module-level tests read source, the contracts never build the app — and
 * the failure was `next build`'s alone, which is the deploy's. Production
 * kept serving the build before it, and FO0–FO3 answered 404 for the hour it
 * took to notice. `tests/web`'s `page-route-collision` check now reads the
 * app tree for the pair, so the next one fails in the lane rather than in
 * the deploy.
>>>>>>>> origin/main:apps/openproduct/web/src/app/threads/new/actions/route.ts
 *
 * SIGNED OUT, THE ACT BOUNCES THROUGH SIGN-IN AND COMES BACK HERE with the
 * small fields in the address (FR3's return contract): the product, the
 * category and the title survive; the body does not, and the page says why
 * before anybody types. No pending-act record is written: a thread is not
 * an act the resume door can replay for somebody, and a cookie is not a
 * place for a body.
 *
 * SIGNED IN, ONE WRITE: core's own thread route, which refuses a product it
 * does not list and a category it does not have, and answers the thread's
 * id — which is its address.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  const text = (key: string) => {
    const value = form?.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const product = SLUG_RE.test(text("product")) ? text("product") : "";
  const tag = isChosenThreadTag(text("tag")) ? text("tag") : "";
  const title = text("title").slice(0, MAX_THREAD_TITLE);
  const body = text("body").slice(0, MAX_POST_BODY);

  const back = new URLSearchParams();
  if (product) back.set("product", product);
  if (tag) back.set("tag", tag);
  if (title) back.set("title", title);
  const composer = back.size > 0 ? `${THREADS_NEW_PATH}?${back.toString()}` : THREADS_NEW_PATH;

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return actAnswer(request, "signin", { returnTo: composer });
  }
  if (!product || !tag || !title || !body) {
    back.set("error", "invalid");
    return NextResponse.redirect(new URL(`${THREADS_NEW_PATH}?${back.toString()}`, request.url), 303);
  }

  const result = await createThread(session.accessToken, { slug: product, tag, title, body });
  if (result.kind === "unauthorized") {
    // A session core no longer honours: the same door, the same return.
    return actAnswer(request, "signin", { returnTo: composer });
  }
  if (result.kind !== "ok") {
    // Nothing was published. Core's own refusals (a product it does not
    // list, a category it does not have) and an outage both land here; the
    // page's sentence says which of the two it is likely to be.
    back.set("error", "failed");
    return NextResponse.redirect(new URL(`${THREADS_NEW_PATH}?${back.toString()}`, request.url), 303);
  }
  return NextResponse.redirect(
    new URL(`/threads/${encodeURIComponent(result.data.threadId)}`, request.url),
    303,
  );
}
