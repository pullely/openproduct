import type { Metadata } from "next";

import {
  MAX_POST_BODY,
  MAX_THREAD_TITLE,
  THREADS_NEW_ACTION,
  THREAD_COMPOSER_SIGNED_OUT,
  THREAD_COMPOSER_TITLE,
  THREAD_TAGS,
  THREAD_TAG_LABELS,
  isChosenThreadTag,
  threadComposerHref,
} from "@openproduct/contracts";

import { readSession } from "../../auth/session-server";
import { fetchPublicDirectory } from "../../public-api";
import { SignInCard } from "../../signin/sign-in-card";
import {
  BTN_PRIMARY,
  CHIP_BTN,
  FIELD,
  FOCUS,
  LABEL,
  LINK_QUIET,
  NOTICE_ERROR,
  PAGE_TITLE,
  TEXTAREA,
} from "../../ui/design";
import { AppLink } from "../../ui/link";

/**
 * `/threads/new` — the door (openproduct-worldclass-v2 FO0).
 *
 * THE AUDIT'S W·11: signed out, this address answered an error status. A
 * person who followed a "start a thread" link and got a 401 page learned
 * that the product does not know what a door is. Now the anonymous read is
 * a 200: the same sign-in panel the modal holds, rendered in the page with
 * a return into this composer, and the form itself under it so the reader
 * can see what they are signing in for.
 *
 * THE RETURN IS THE ADDRESS (FR3). `return_to` carries the composer with the
 * small fields — product, category, title — in its query, so a reader who
 * typed before signing in lands back on a form that still says what they
 * said. The BODY is not carried: a URL is not a place for eight thousand
 * characters, and the sign-in panel is in the page before the first
 * keystroke precisely so nobody has to find that out.
 *
 * NOT AN ANONYMOUS DOCUMENT. It reads the session and its own query, which
 * makes it dynamic — as `/me` is — and it is `noindex`: a form is a step,
 * not a page a search result should hold.
 */
export const metadata: Metadata = {
  title: THREAD_COMPOSER_TITLE,
  robots: { index: false, follow: false },
};

/** PERSONAL, in the route census's vocabulary: it reads a session, so it is
 *  rendered per request and never cached — as `/me` is. */
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export default async function NewThreadPage(props: {
  searchParams: Promise<{ product?: string; tag?: string; title?: string; error?: string }>;
}) {
  const [session, params, cards] = await Promise.all([
    readSession(),
    props.searchParams,
    fetchPublicDirectory(),
  ]);
  const product = params.product && SLUG_RE.test(params.product) ? params.product : "";
  const tag = params.tag && isChosenThreadTag(params.tag) ? params.tag : null;
  const title = (params.title ?? "").slice(0, MAX_THREAD_TITLE);
  const returnTo = threadComposerHref(product || null);

  return (
    // The composer: a 720px column with the calm frame's room above (CL-R2).
    <main className="mx-auto box-border w-full max-w-[720px] px-7 pb-[104px] pt-[80px] max-sm:px-4 max-sm:pb-[72px] max-sm:pt-12">
      <h1 className={PAGE_TITLE}>{THREAD_COMPOSER_TITLE}</h1>

      {session === null ? (
        // THE DOOR. The same panel the header's modal opens, in the page,
        // with a return into this composer — not a wall, and not a 401.
        <section aria-label="Sign in" className="mt-6">
          <p className="m-0 mb-3 text-[15px] text-muted-foreground">{THREAD_COMPOSER_SIGNED_OUT}</p>
          <SignInCard returnTo={returnTo} />
        </section>
      ) : null}

      {params.error ? (
        <p
          role="alert"
          className={`m-0 mt-5 ${NOTICE_ERROR}`}
        >
          {params.error === "invalid"
            ? "Every field is needed: the product, a category, a title and what you want to say."
            : "That did not post — nothing you wrote was published. A product this directory does not list is the usual reason; otherwise try again in a moment."}
        </p>
      ) : null}

      <form
        method="post"
        action={THREADS_NEW_ACTION}
        className="mt-7 grid gap-5"
        aria-disabled={session === null ? "true" : undefined}
      >
        <div>
          <label htmlFor="product" className={LABEL}>
            Product
          </label>
          <input
            id="product"
            name="product"
            list="products"
            defaultValue={product}
            required
            autoComplete="off"
            pattern="[a-z0-9][a-z0-9-]{0,63}"
            className={FIELD}
          />
          {/* THE DIRECTORY'S OWN LIST, as a datalist: any public listing, by
              slug. Core refuses a slug it does not list, so the datalist is
              help, not a gate. */}
          <datalist id="products">
            {(cards ?? []).map((card) => (
              <option key={card.slug} value={card.slug} />
            ))}
          </datalist>
        </div>

        <fieldset className="m-0 border-0 p-0">
          <legend className={LABEL}>Category</legend>
          {/* The category chips, as a picker (OPR1): the shared 32px pill,
              44px on a phone, filled with ink when chosen. */}
          <div className="flex flex-wrap gap-1.5">
            {THREAD_TAGS.map((t) => (
              <label
                key={t}
                className={`${CHIP_BTN} cursor-pointer bg-card text-muted-foreground hover:text-foreground has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring max-sm:min-h-[44px]`}
              >
                <input
                  type="radio"
                  name="tag"
                  value={t}
                  defaultChecked={tag === t}
                  required
                  className="sr-only"
                />
                {THREAD_TAG_LABELS[t]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="title" className={LABEL}>
            Title
          </label>
          <input
            id="title"
            name="title"
            defaultValue={title}
            required
            maxLength={MAX_THREAD_TITLE}
            placeholder="One sentence, and make it a question if it is one"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="body" className={LABEL}>
            What you want to say
          </label>
          <textarea
            id="body"
            name="body"
            required
            maxLength={MAX_POST_BODY}
            rows={8}
            placeholder="What you tried, what happened, and what you want to know."
            className={`${TEXTAREA} leading-[1.6]`}
          />
        </div>

        <div className="flex items-center gap-4">
          {/* The one act on the page, in ink (CP-R1); the way out beside it. */}
          <button
            type="submit"
            className={`${BTN_PRIMARY} ${FOCUS} max-sm:h-[44px]`}
          >
            Post thread
          </button>
          <AppLink href="/threads" className={`tap-h inline-flex items-center text-[13px] text-muted-foreground ${LINK_QUIET}`}>
            Cancel
          </AppLink>
        </div>
        <p className="m-0 text-[13px] leading-[1.6] text-muted-foreground">Public, with your name on it.</p>
      </form>
    </main>
  );
}
