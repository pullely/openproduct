// Sharing a listing (openproduct-worldclass RE3).
//
// ─── ZERO THIRD-PARTY REQUESTS, AND THAT STAYS TRUE ───────────────────────
//
// The audit measured **zero** third-party requests on this site and named it
// one of only two dimensions the product already wins. Every share widget on
// the internet is a script from somebody else's origin that reports who looked
// at the page — so there is no widget here. What there is:
//
//   THE BROWSER'S OWN SHEET  `navigator.share`, which is a native dialog on
//                            every phone and on Safari and Edge. No network,
//                            no origin, no script.
//   THE ADDRESS              copyable, because the thing most people actually
//                            want is the URL.
//   PLAIN LINKS              an intent is an `<a href>` the reader may follow.
//                            Nothing is fetched, nothing is embedded, and no
//                            request leaves this page unless a person clicks
//                            — which is a navigation, not a third-party
//                            request, and the distinction is the whole reason
//                            this is allowed at all.
//
// ─── AND THE TEXT IS THE MAKER'S, NOT OURS ────────────────────────────────
//
// The shared sentence is the product's name and the maintainer's own tagline.
// No adjective of ours, no "check out", no ranking — a share that editorialises
// on somebody else's product puts our words in their mouth in front of their
// audience.

/** Where a share points. Canonical, absolute, and never a preview host. */
export function shareUrl(origin: string | null, slug: string): string | null {
  return origin ? `${origin}/${slug}` : null;
}

/**
 * What a share says.
 *
 * The slug and the maintainer's own tagline, and nothing else. A listing with
 * no tagline shares its name — which is honest and short, and better than a
 * sentence we invented to fill the space.
 */
export function shareText(slug: string, tagline: string | null): string {
  return tagline ? `${slug} — ${tagline}` : slug;
}

/** FO3 — a thread's canonical address, for its share control. */
export function threadShareUrl(origin: string | null, threadId: string): string | null {
  return origin ? `${origin}/threads/${encodeURIComponent(threadId)}` : null;
}

/** FO3 — what a shared thread says: its title, and the product it is about. */
export function threadShareText(title: string, slug: string | null): string {
  return slug ? `${title} — ${slug}` : title;
}

/** FO3 — a post's stable address: the thread, and the post as its fragment. */
export function postPermalink(threadId: string, postId: string): string {
  return `/threads/${encodeURIComponent(threadId)}#post-${postId}`;
}

/** A destination a reader may choose to navigate to. */
export interface ShareIntent {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

/**
 * The intents, as ordinary links.
 *
 * THREE, AND THE LIST IS SHORT ON PURPOSE. Every extra row is another logo
 * this page has to carry and another reader wondering why theirs is missing.
 * These are the three places a product launch is actually posted; anywhere
 * else is served by the address itself, which is why `Copy` is not an
 * afterthought here but the first control.
 *
 * NO MASTODON INTENT, and it is the one omission worth explaining: there is no
 * such thing as *the* Mastodon, so an intent needs the reader's own instance —
 * which means either asking them to type it or sending them through a
 * third-party redirector. The first is a form nobody fills in and the second
 * is the third-party request this whole milestone exists to avoid. Copy works,
 * and it works everywhere.
 */
export function shareIntents(url: string, text: string): readonly ShareIntent[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return [
    { id: "x", label: "X", href: `https://x.com/intent/post?text=${t}&url=${u}` },
    { id: "bluesky", label: "Bluesky", href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}` },
    {
      id: "linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    },
  ];
}

/** The origins an intent may point at — exported so a test can assert the
 *  list rather than the absence of everything else. */
export const SHARE_INTENT_ORIGINS = ["https://x.com", "https://bsky.app", "https://www.linkedin.com"] as const;

/** What the control says it does, in the one place both the button and its
 *  accessible name read it from. */
export const SHARE_LABEL = "Share";

/**
 * The sentence under the intents.
 *
 * A reader clicking one of these is leaving, and a page that hands somebody to
 * another site without saying so is a page that decided for them. It also
 * states the property this milestone is protecting, where somebody adding a
 * fourth row will be standing.
 */
export const SHARE_NOTE =
  "These are links, not widgets — nothing here loads anything from another site, and nothing knows you looked.";
