import {
  GALLERY_LABEL,
  GALLERY_SIZES,
  HERO_SIZES,
  SCREENSHOT_CAPTION_LEAD,
  SCREENSHOT_CAPTION_TAIL,
  SCREENSHOT_SIZES,
  imageSourceOf,
  mediaPanelIsEmpty,
  mediaPanelOf,
  screenshotCaption,
  type ImageSource,
} from "./media";

import type { MediaFact } from "@openproduct/contracts";

/**
 * The listing's pictures (openproduct-worldclass MD2).
 *
 * ─── THE HERO, THE GALLERY, THE CAPTURE — THREE FRAMES, NOT ONE ──────────
 *
 * The hero and the gallery are the maker's: a bare rounded picture, no
 * caption, no date, because an authored image has no moment (MD0). The
 * screenshot is OURS: it stands inside a sunken well with a caption under it
 * that says what it is and when it was taken. (It was a dashed frame until
 * openproduct-redesign OPR1; the redesign is flat and draws no borders, so
 * the well and the caption carry the difference.) A sighted reader sees the
 * well and reads the caption; a screen-reader user hears the alt, which says
 * the same thing (`screenshotAlt`). WC-3 in the medium that carries no
 * label of its own.
 *
 * ─── OPERABLE BY KEYBOARD ALONE, WITH NO SCRIPT ─────────────────────────
 *
 * The gallery is a list of links to the originals, in a strip that scrolls
 * sideways and snaps. Tab reaches every image, Enter opens it at full size in
 * the browser's own viewer, and the focused link is scrolled into view by the
 * browser — smoothly, except under `prefers-reduced-motion`, where the global
 * rule in `globals.css` collapses `scroll-behavior` to `auto`. No client
 * component: a roving-tabindex carousel would have added a chunk to the
 * listing's JS budget to do what links already do, and FR5's clause — "the
 * gallery is operable by keyboard alone" — is satisfied by the links.
 *
 * ─── CLS ─────────────────────────────────────────────────────────────────
 *
 * Every `<img>` carries `width` and `height` from the row, so the browser
 * reserves the box before a byte arrives. The thumbnails are a fixed height
 * and their width follows from the attributes' ratio — also known before
 * load. The hero is `eager` and `fetchpriority="high"`: it is the largest
 * thing above the fold, which makes it the LCP element, and a lazy LCP is a
 * slow one.
 */
export function MediaPanel({
  media,
  apiBase,
  now,
}: {
  media: readonly MediaFact[];
  apiBase: string;
  now: Date;
}) {
  const plan = mediaPanelOf(media, now);
  if (mediaPanelIsEmpty(plan)) return null;

  return (
    <div className="mt-3 min-w-0 max-w-full" data-media-panel="">
      {plan.hero ? (
        <figure className="m-0 overflow-hidden rounded-[14px] bg-sunken">
          <Img source={imageSourceOf(plan.hero.value, apiBase, HERO_SIZES)} eager />
        </figure>
      ) : null}

      {plan.gallery.length > 0 ? (
        <ul
          aria-label={GALLERY_LABEL}
          className="m-0 mt-3 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto p-0 pb-1 [scroll-behavior:smooth]"
        >
          {plan.gallery.map((item) => {
            const source = imageSourceOf(item.value, apiBase, GALLERY_SIZES);
            return (
              <li key={item.value.id} className="shrink-0 snap-start">
                <a
                  href={source.src}
                  className="block overflow-hidden rounded-[14px] bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Img source={source} thumbnail />
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}

      {plan.screenshot ? (
        <figure className="m-0 mt-3 rounded-[14px] bg-sunken p-2">
          <div className="overflow-hidden rounded-[10px]">
            <Img source={imageSourceOf(plan.screenshot.value, apiBase, SCREENSHOT_SIZES)} />
          </div>
          <figcaption className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">
            {SCREENSHOT_CAPTION_LEAD}{" "}
            <time dateTime={screenshotCaption(plan.screenshot.provenance.observedAt).iso}>
              {screenshotCaption(plan.screenshot.provenance.observedAt).day}
            </time>
            . {SCREENSHOT_CAPTION_TAIL}
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}

/** One image, with everything the model guarantees it has. */
function Img({
  source,
  eager = false,
  thumbnail = false,
}: {
  source: ImageSource;
  eager?: boolean;
  thumbnail?: boolean;
}) {
  // A PLAIN <img>, NOT next/image. The bytes are the gateway's —
  // content-addressed, immutable, already resized at upload by Image
  // Resizing — and next/image would route them back through this worker to
  // re-encode what was encoded once. The attributes it would have added are
  // all here by hand: dimensions, srcset, sizes, lazy/eager, async decode.
  return (
    <img
      src={source.src}
      srcSet={source.srcSet}
      sizes={source.sizes}
      width={source.width}
      height={source.height}
      alt={source.alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      {...(eager ? { fetchPriority: "high" as const } : {})}
      className={thumbnail ? "block h-[160px] w-auto max-w-[80vw]" : "block h-auto w-full"}
    />
  );
}
