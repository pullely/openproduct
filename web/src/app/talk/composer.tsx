import {
  TALK_COMPOSER_LABEL,
  TALK_KIND_GROUP_LABEL,
  TALK_POST_PRIVATE,
  TALK_POST_PUBLIC,
  TALK_VISIBILITY_GROUP_LABEL,
  THREAD_KINDS,
  THREAD_KIND_LABELS,
  THREAD_VISIBILITIES,
  THREAD_VISIBILITY_LABELS,
} from "@openproduct/contracts";

import { FOCUS } from "../ui/design-core";

import { TALK_SEGMENTS, TALK_SEGMENT_FACE } from "./classes";
import { GlobeGlyph, LockGlyph } from "./glyphs";
import {
  TALK_FIELD_KIND,
  TALK_FIELD_VISIBILITY,
  TALK_KIND_DEFAULT,
  TALK_VISIBILITY_DEFAULT,
  talkStartRoute,
} from "./model";
import { TalkTitleField } from "./gates";

/**
 * "Start a thread" (boards `Product` Talk tab, `PhoneProduct`): one field,
 * the kind, who can see it, and the button.
 *
 * A PLAIN FORM, THE SAME FOR EVERYBODY. It is drawn into the cached page
 * with no session read (I6): the session is read once, on the POST, which
 * sends a signed-out visitor through sign-in and back. It works with
 * scripts off.
 *
 * THE STATE IS THE FORM'S OWN. The kind and the visibility are radio groups
 * drawn as segments; the button reads "Post publicly" or "Send to the crew"
 * from which visibility is checked, and is quiet until something is typed —
 * both by CSS (`:has`), so neither needs a script and the markup does not
 * change with the reader. Quiet is the sunken fill under body ink: the
 * board's grey-on-grey is 4.1:1, under the 4.5:1 this site holds.
 *
 * PRIVATE IS NOT A WARNING. It is slate on the list and plain here.
 */
export function TalkComposer({ slug, returnTo }: { slug: string; returnTo: string }) {
  return (
    <form
      method="post"
      action={talkStartRoute(slug)}
      aria-label={TALK_COMPOSER_LABEL}
      data-talk-composer
      className="group/compose flex flex-col gap-2.5 rounded-[16px] bg-card p-3 max-sm:gap-2 max-sm:p-2.5"
    >
      <input type="hidden" name="return_to" value={returnTo} />
      <TalkTitleField slug={slug} />
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={TALK_KIND_GROUP_LABEL} className={TALK_SEGMENTS}>
          {THREAD_KINDS.map((kind) => (
            <label key={kind} className="flex">
              <input
                type="radio"
                name={TALK_FIELD_KIND}
                value={kind}
                defaultChecked={kind === TALK_KIND_DEFAULT}
                className="peer sr-only"
              />
              <span className={TALK_SEGMENT_FACE}>{THREAD_KIND_LABELS[kind]}</span>
            </label>
          ))}
        </div>
        <div role="radiogroup" aria-label={TALK_VISIBILITY_GROUP_LABEL} className={TALK_SEGMENTS}>
          {THREAD_VISIBILITIES.map((visibility) => (
            <label key={visibility} className="flex">
              <input
                type="radio"
                name={TALK_FIELD_VISIBILITY}
                value={visibility}
                defaultChecked={visibility === TALK_VISIBILITY_DEFAULT}
                className="peer sr-only"
              />
              <span className={TALK_SEGMENT_FACE}>
                {visibility === "private" ? <LockGlyph /> : <GlobeGlyph />}
                {THREAD_VISIBILITY_LABELS[visibility]}
              </span>
            </label>
          ))}
        </div>
        <span className="flex-1" />
        <button
          type="submit"
          data-talk-post
          className={`inline-flex h-[40px] shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 bg-primary px-[18px] text-[15px] font-semibold text-primary-foreground transition-colors hover:opacity-90 group-has-[input[name=title]:placeholder-shown]/compose:cursor-default group-has-[input[name=title]:placeholder-shown]/compose:bg-foreground/[0.1] group-has-[input[name=title]:placeholder-shown]/compose:text-copy max-sm:h-[44px] max-sm:px-4 ${FOCUS}`}
        >
          {/* Which sentence shows follows the checked visibility; the short
              forms are the phone board's. Hidden ones are `display: none`,
              so the button has one accessible name at a time. */}
          <span className="group-has-[input[value=private]:checked]/compose:hidden">
            <span className="max-sm:hidden">{TALK_POST_PUBLIC}</span>
            <span className="sm:hidden">Post</span>
          </span>
          <span className="hidden group-has-[input[value=private]:checked]/compose:inline">
            <span className="max-sm:hidden">{TALK_POST_PRIVATE}</span>
            <span className="sm:hidden">Send to crew</span>
          </span>
        </button>
      </div>
    </form>
  );
}
