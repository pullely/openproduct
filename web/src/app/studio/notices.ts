// What a studio surface says after an act (openproduct-performance OPP15).
//
// ─── WHY THIS IS ITS OWN MODULE ───────────────────────────────────────────
//
// Six studio surfaces each posted a form, redirected back to themselves with
// `?notice=…`, `?error=…` or `?refused=…`, and turned that code into a
// sentence with their own copy of the same eight-line block. Six copies of
// one decision, differing in ways nobody chose: two spellings of "try again",
// one surface falling back for an unknown token and three rendering nothing.
//
// OPP15 needs a SEVENTH reader, and that is what forced the tidy: the save
// island (`live-save.tsx`) posts the same form without the reload, gets the
// same code back in JSON, and has to render the same sentence — a maintainer
// must not learn one word for a saved listing and another for a saved listing
// that did not reload. A client component cannot import a surface's page
// module (they read the session), so the words live here, where both a server
// page and an island can have them.
//
// NOTHING IN THIS FILE TOUCHES THE SERVER. No `next/headers`, no session, no
// fetch — the vocabulary, and the two functions that read it.
//
// A REFUSAL IS ALWAYS A TOKEN FROM A CLOSED SET, never a message carried in
// the query. That rule was already written on four of the six surfaces and is
// restated here because this is now the only place it can be enforced:
// rendering a sentence somebody put in a URL would let anybody with a link
// print arbitrary words on a maintainer's own screen.

import {
  APPEAL_REFUSALS,
  COLLECTION_REFUSALS,
  LAUNCH_REFUSALS,
  MODERATION_REFUSALS,
} from "@openproduct/contracts";

/**
 * A result to report, from one vocabulary.
 *
 * `said` is the outcome of something the maintainer asked for. `refused` is
 * the outcome of something they asked for that did not happen. There is no
 * third kind: a warning that is neither is a sentence looking for a home, and
 * belongs in the surface's own copy where it can say what it means.
 */
export interface StudioNotice {
  readonly kind: "said" | "refused";
  readonly message: string;
}

/** One surface's words, in the three shapes an address can carry them. */
export interface StudioVocabulary {
  /** `?notice=<code>` — something that happened. */
  readonly notices: Readonly<Record<string, string>>;
  /** `?error=<code>` — something that did not, in this surface's own words. */
  readonly errors?: Readonly<Record<string, string>> | undefined;
  /** `?refused=<token>` — something the API refused, in the CONTRACT's words:
   *  the same sentence it answered with. */
  readonly refusals?: Readonly<Record<string, { readonly says: string }>> | undefined;
  /** What an `?error=` this surface does not name says. Absent means such an
   *  error says nothing at all, which is what three of the six surfaces do. */
  readonly errorFallback?: string | undefined;
  /** What a `?refused=` token this surface does not name says. */
  readonly refusalFallback?: string | undefined;
}

// ── a listing's steps ───────────────────────────────────────────────────────

export const LISTING_NOTICES: Readonly<Record<string, string>> = {
  // MD2 — the media step's two outcomes. The upload's refusals travel as
  // `why` beside `media_refused` below, in the gateway's own words.
  media_added: "Image added. It shows on the listing as soon as the page is next rendered.",
  media_removed: "Image removed. The listing no longer shows it.",
  media_described: "Saved. The picture now says what you wrote.",
  gallery_reordered: "Saved. The gallery shows in this order.",
  created: "Listing created. Everything below can be edited before publishing.",
  linked: "Linked. This listing can publish against its workspace again.",
  saved: "Saved.",
  checked: "Repository checked.",
  reviewed: "Reviewed. This listing can now be published.",
  published: "Published. The public page serves within a minute.",
  unpublished: "Unpublished. The public page clears within a minute.",
  opening_saved: "Role opening saved.",
  opening_deleted: "Role opening removed.",
  maintainers_saved: "Published maintainers saved.",
};

export const LISTING_ERRORS: Readonly<Record<string, string>> = {
  save_failed: "That edit was not saved — the service did not accept it.",
  slug_taken: "That name is taken.",
  check_failed: "The repository could not be checked right now.",
  review_refused: "Only an openproduct operator can review a listing for publication.",
  action_failed: "That action did not complete. Try again in a moment.",
  // PV2 — the refusal a maintainer is most likely to hit, and the one where a
  // generic message would be useless: somebody who typed a piped installer
  // needs to know it was the pipe. The specific reason travels in `why` and
  // the step prints it; this is the fallback when it does not arrive.
  install_refused: "That install command was not accepted — it must be one command.",
  // MD2 — the upload's refusal. The specific reason — too large, not an
  // image, too small, a full gallery, a second hero — arrives in `why` from
  // the gateway or core, which is the only way a maintainer learns WHICH.
  media_refused: "That image was not added.",
  // openproduct-studio OSD7 — the People step's refusal. Which line was
  // wrong ("No one here goes by @x") arrives in `why` from core.
  maintainers_refused: "Those maintainers were not saved.",
};

export const LISTING_VOCABULARY: StudioVocabulary = {
  notices: LISTING_NOTICES,
  errors: LISTING_ERRORS,
  errorFallback: LISTING_ERRORS.action_failed!,
};

// ── the other five surfaces ─────────────────────────────────────────────────

export const LAUNCH_VOCABULARY: StudioVocabulary = {
  notices: {
    scheduled: "Scheduled. Nobody sees it until its moment.",
    moved: "Moved. Still nobody sees it until its moment.",
    cancelled: "Cancelled. Nothing was announced, and this version is free again.",
  },
  refusals: LAUNCH_REFUSALS,
  errorFallback: "That did not go through. Try again in a moment.",
};

export const DISCUSSION_VOCABULARY: StudioVocabulary = {
  notices: {
    locked: "Locked. The thread is still readable; nobody can add to it.",
    unlocked: "Open again.",
    answered: "Marked as the answer.",
  },
  errorFallback: "That did not go through. Try again.",
};

export const REPORT_VOCABULARY: StudioVocabulary = {
  notices: {
    claimed: "Yours. Nobody else will pick it up.",
    declined: "Declined, and counted. The transparency record includes it.",
    acted: "Done. The listing has been changed and the act is on the record.",
    "flag-actioned":
      "Marked as acted on. If the listing itself needs changing, that is a separate act with its own reason.",
    "flag-dismissed":
      "Dismissed, and counted — the dismissal rate is how we know whether the checks are any good.",
  },
  refusals: MODERATION_REFUSALS,
};

export const APPEAL_VOCABULARY: StudioVocabulary = {
  notices: {
    filed: "Filed. It will be read in the order it arrived, and whatever is decided is counted publicly.",
    upheld: "Upheld. The act has been reversed and both the judgement and the reversal are on the record.",
    // Filled by the page, which owns the contract sentence for this one.
    refused: "Refused, and counted. The record shows refusals beside upholds.",
  },
  refusals: APPEAL_REFUSALS,
  // The one surface that answers an UNKNOWN token rather than staying silent:
  // an appeal is filed against an act, and "we do not recognise that act" is
  // the likeliest refusal there is.
  refusalFallback: APPEAL_REFUSALS["unknown-act"]?.says,
};

export const COLLECTION_VOCABULARY: StudioVocabulary = {
  notices: {
    created: "Made. Add some products to it, then publish.",
    added: "Added, at the end of your order.",
    removed: "Removed.",
    published: "Published. It is in the index now, with your name on it.",
    retired:
      "Retired. Its address stays yours, so old links do not become somebody else's page.",
  },
  refusals: COLLECTION_REFUSALS,
};

/**
 * A surface with no acts of its own.
 *
 * The studio's landing lists listings and posts nothing; the frame still asks
 * for a vocabulary, because a surface that GROWS an act should have to say
 * which words report it rather than quietly reporting none. Passing this is
 * how a surface says "there is nothing to report here yet".
 */
export const NO_ACTS: StudioVocabulary = { notices: {} };

/** What a surface reads out of its own address. */
export interface NoticeSearch {
  notice?: string | undefined;
  error?: string | undefined;
  refused?: string | undefined;
  /** PV2 — the specific reason behind a known error code. Rendered only
   *  beside a code the vocabulary holds; see below. */
  why?: string | undefined;
}

/**
 * ONE notice, from one vocabulary.
 *
 * XP3 — a refusal and a success cannot both be true of the same post, and
 * rendering both would leave a maintainer to work out which one described
 * what just happened. So a refusal wins, then an error, and the success is
 * only read when neither is there.
 *
 * PV2 — `why` CARRIES THE CONTRACT'S OWN SENTENCE for an install refusal,
 * because "that was not accepted" tells somebody who typed a pipe nothing
 * about the pipe. It is appended only to an error code the vocabulary KNOWS,
 * so a crafted `?why=` on any other code cannot put arbitrary text on screen.
 */
export function noticeFrom(
  search: NoticeSearch,
  vocabulary: StudioVocabulary,
): StudioNotice | undefined {
  if (search.refused) {
    const says = vocabulary.refusals?.[search.refused]?.says ?? vocabulary.refusalFallback;
    return says === undefined ? undefined : { kind: "refused", message: says };
  }
  if (search.error) {
    const known = vocabulary.errors?.[search.error];
    const message = known ?? vocabulary.errorFallback;
    if (message === undefined) return undefined;
    return {
      kind: "refused",
      message: search.why && known ? `${message} ${search.why}` : message,
    };
  }
  if (search.notice) {
    const message = vocabulary.notices[search.notice];
    if (message !== undefined) return { kind: "said", message };
  }
  return undefined;
}

/**
 * The same reading, from the address the save island was handed rather than
 * from a page's `searchParams`.
 *
 * A route decides ONE address after an act — `?notice=saved`,
 * `?error=slug_taken`, `?error=publish_refused&blockers=a,b` — and answers it
 * either as a `303` or, to a caller that asked for JSON, as that same address
 * in a body (`answer.ts`). This turns the second one back into what the first
 * one would have rendered, so the two paths cannot drift.
 */
export function noticeFromUrl(
  to: string,
  vocabulary: StudioVocabulary,
): { notice: StudioNotice | undefined; blockers: string[]; pathname: string } {
  // A relative address from our own route. The base is only there because
  // `URL` demands one; the pathname is read back rather than trusted.
  const url = new URL(to, "https://studio.invalid");
  const notice = noticeFrom(
    {
      notice: url.searchParams.get("notice") ?? undefined,
      error: url.searchParams.get("error") ?? undefined,
      refused: url.searchParams.get("refused") ?? undefined,
      why: url.searchParams.get("why") ?? undefined,
    },
    vocabulary,
  );
  const blockers = (url.searchParams.get("blockers") ?? "")
    .split(",")
    .filter((blocker) => blocker.length > 0);
  return { notice, blockers, pathname: url.pathname };
}
