// The listing editor's shell (openproduct redesign).
//
// THE DESIGN DRAWS A LISTING'S EDITOR AS ONE PAGE: a hero card that carries
// the cover, the tile, the name, the one-line description, the meta line and
// the stack, with a strip of sections along its bottom edge; five section
// cards under it; and a rail of three panels beside them. Every field a
// person wrote is edited where it is printed, behind a pencil; what is
// observed is shown and locked.
//
// HERE THAT PAGE IS FIVE ADDRESSES. IN1 made each step of a listing its own
// URL — a save comes back to the step that made it, the session token never
// reaches the browser, and there is no client-side draft to lose — and every
// one of those properties is worth more than the pencil toggling in place. So
// the overview renders every card in its read state, each pencil is a LINK to
// the step that edits it, and the step renders this same shell with that one
// card open. The eye sees one page whose sections open; the address bar sees
// the steps IN1 shipped.
//
// What lives here is the frame: the head row, the hero and the two-column
// grid. The cards are in `sections.tsx`; the rail's panels are the
// completeness meter, the publish disclosure and the import panel, each still
// its own file.

import type { ReactNode } from "react";

import { canonicaliseStack, labelOf, listingBasePath, topicPath } from "@openproduct/contracts";
import type { MaintainerProfile } from "@openproduct/contracts";

import { AppLink } from "../../../ui/link";
import { LogoTile } from "../../../ui/logo-tile";
import { BTN_OUTLINE, BTN_PRIMARY, H2, INSET, PAGE_TITLE, TILE } from "../../../ui/design";
import { STEP_CARD } from "./step-card";
import {
  BTN_GHOST,
  GLYPH_BACK,
  GLYPH_CROSS,
  GLYPH_LOCK,
  GLYPH_PENCIL,
  GLYPH_PLUS,
  Glyph,
  StatusChip,
  coverOf,
} from "../../frame";

/** Where each step's editor lives, so a pencil is one link from its field. */
export interface StepHrefs {
  readonly overview: string;
  readonly details: string;
  readonly media: string;
  readonly topics: string;
  readonly people: string;
  readonly launches: string;
  readonly discussions: string;
}

export function stepHrefs(org: string, profileId: string): StepHrefs {
  const base = listingBasePath(org, profileId);
  return {
    overview: base,
    details: `${base}/details`,
    media: `${base}/media`,
    topics: `${base}/topics`,
    people: `${base}/people`,
    launches: `${base}/launches`,
    discussions: `${base}/discussions`,
  };
}

/**
 * The head row: the way back on the left, the status pill and the one or two
 * acts on the right. On the overview the way back is the listings; on a step
 * it is the listing itself.
 */
export function EditorHead({
  back,
  profile,
  action,
  publishHref,
}: {
  back: { href: string; label: string };
  profile: Pick<MaintainerProfile, "slug" | "visibility">;
  /** The listing's own act route, for unpublish. */
  action: string;
  /** The overview's "Before you publish" panel — the one place a publish is made. */
  publishHref: string;
}) {
  const published = profile.visibility === "public";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <AppLink
        prefetch="auto"
        href={back.href}
        className="tap inline-flex items-center gap-1.5 text-[13px] text-muted-foreground no-underline hover:text-foreground"
      >
        <Glyph d={GLYPH_BACK} />
        {back.label}
      </AppLink>
      <span className="flex-1" />
      <StatusChip published={published} />
      {published ? (
        <>
          <AppLink prefetch="auto" href={`/${profile.slug}`} className={`${BTN_OUTLINE} no-underline`}>
            View public page
          </AppLink>
          {/* A publish or an unpublish changes the PAGE — the pill, the rail,
              the launches card — so it keeps the `303` (OPP15). */}
          <form method="post" action={action}>
            <input type="hidden" name="intent" value="unpublish" />
            <button type="submit" className={BTN_GHOST}>
              Unpublish
            </button>
          </form>
        </>
      ) : (
        // ONE PUBLISH PLACE (openproduct-studio OSD7). The head used to post
        // `intent=publish` itself — no disclosure, no optional components —
        // while the overview's "Before you publish" panel posted the same act
        // with both. Two doors to one act meant the quicker one skipped what
        // a maker should read first. The head's draft-state act is now a LINK
        // to that panel (`#publish`), so every publish goes through the
        // disclosure; unpublishing stays a one-click form, it discloses
        // nothing.
        <AppLink prefetch="auto" href={publishHref} className={`${BTN_PRIMARY} no-underline`}>
          Publish…
        </AppLink>
      )}
    </div>
  );
}

/**
 * The hero card: the cover, the tile over its bottom edge, the name and the
 * line under it, the meta line, the stack as chips, and the strip of
 * sections along the bottom.
 *
 * The licence is OBSERVED and is drawn behind a lock; the topic, the two
 * links and the two facets are the maintainer's own and edit behind the
 * pencil. A stack chip the vocabulary counts is filled on `--secondary`; one it
 * does not is dashed, in the maintainer's own words, and is not counted.
 */
export function ListingHero({
  profile,
  hrefs,
  action,
  strip,
  tile,
}: {
  profile: MaintainerProfile;
  hrefs: StepHrefs;
  action: string;
  /** The logo control (openproduct-studio OSD4) — or, where there is none,
   *  the monogram. */
  tile?: ReactNode;
  /** The step strip, handed in by the page so each says which step it is. */
  strip: ReactNode;
}) {
  const stack = canonicaliseStack(profile.stack);
  const counted = profile.stackCanonical.map((value) => labelOf("stack", value) ?? value);
  const facets = [
    profile.hosting ? labelOf("hosting", profile.hosting) : null,
    profile.pricing ? labelOf("pricing", profile.pricing) : null,
  ].filter((label): label is string => label !== null);

  return (
    <section aria-label="Listing" className={`-mt-3 ${TILE}`}>
      <div aria-hidden="true" className="h-[96px] rounded-t-[16px]" style={{ background: coverOf(profile.slug) }} />
      <div className="-mt-9 flex flex-wrap items-start gap-5 px-6 max-sm:px-4">
        {tile ?? (
          <LogoTile
            slug={profile.slug}
            size={72}
            className="box-border border-[3px] border-card"
          />
        )}
        <div className="min-w-[260px] flex-1 pt-11 max-sm:min-w-0 max-sm:basis-full max-sm:pt-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className={PAGE_TITLE}>{profile.slug}</h1>
              <p
                className={`m-0 mt-1.5 max-w-[60ch] text-[16px] leading-[1.5] [text-wrap:pretty] ${
                  profile.tagline ? "text-copy" : "text-faint"
                }`}
              >
                {profile.tagline ?? "No one-line description yet."}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] leading-[1.4] text-muted-foreground">
                {profile.category ? (
                  <AppLink
                    href={topicPath(profile.category)}
                    className="text-muted-foreground no-underline hover:text-foreground hover:underline hover:underline-offset-[3px]"
                  >
                    {labelOf("category", profile.category) ?? profile.category}
                  </AppLink>
                ) : (
                  <span className="text-warning-strong">No topic yet</span>
                )}
                {profile.repoLicence ? (
                  <>
                    <Dot />
                    <span title="Observed from the repository. Not a field." className="inline-flex items-center gap-[5px]">
                      <Glyph d={GLYPH_LOCK} size={13} />
                      {profile.repoLicence}
                    </span>
                  </>
                ) : null}
                {profile.repoUrl ? (
                  <>
                    <Dot />
                    <a
                      href={profile.repoUrl}
                      rel="noreferrer noopener"
                      className="text-muted-foreground no-underline hover:text-foreground hover:underline hover:underline-offset-[3px]"
                    >
                      Repository
                    </a>
                  </>
                ) : null}
                {profile.liveUrl ? (
                  <>
                    <Dot />
                    <a
                      href={profile.liveUrl}
                      rel="noreferrer noopener"
                      className="text-muted-foreground no-underline hover:text-foreground hover:underline hover:underline-offset-[3px]"
                    >
                      Website
                    </a>
                  </>
                ) : null}
                {facets.map((label) => (
                  <span key={label} className="inline-flex items-center gap-2.5">
                    <Dot />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <Pencil href={hrefs.details} label="Edit intro" />
          </div>
        </div>
      </div>

      {/* The stack, as chips. Removing one posts the rest — the topics step's
          own intent, with the facets carried so the save cannot clear them. */}
      <div className="mt-[18px] flex flex-wrap items-center gap-1.5 px-6 max-sm:px-4">
        {profile.stack.map((entry) => {
          const known = !stack.unrecognised.includes(entry);
          const rest = profile.stack.filter((other) => other !== entry).join(", ");
          return (
            <span
              key={entry}
              title={known ? "Counted in the filters" : "Not in the filters — stays in your words, not counted"}
              className={`inline-flex h-[28px] items-center gap-1 rounded-full pl-2.5 pr-1.5 text-[13px] font-medium ${
                known
                  ? "bg-secondary text-foreground"
                  : "border border-dashed border-border-strong text-muted-foreground"
              }`}
            >
              {entry}
              <form method="post" action={action} className="inline-flex">
                <input type="hidden" name="intent" value="update-topics" />
                <input type="hidden" name="stack" value={rest} />
                <input type="hidden" name="category" value={profile.category ?? ""} />
                <input type="hidden" name="hosting" value={profile.hosting ?? ""} />
                <input type="hidden" name="pricing" value={profile.pricing ?? ""} />
                <button
                  type="submit"
                  aria-label={`Remove ${entry}`}
                  className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full opacity-70 hover:bg-accent hover:opacity-100"
                >
                  <Glyph d={GLYPH_CROSS} size={10} strokeWidth={2} />
                </button>
              </form>
            </span>
          );
        })}
        <AppLink
          prefetch="auto"
          href={hrefs.topics}
          className="tap inline-flex h-[28px] items-center gap-[5px] rounded-full border border-dashed border-border-strong pl-2 pr-2.5 text-[13px] font-medium text-muted-foreground no-underline hover:border-faint hover:text-foreground"
        >
          <Glyph d={GLYPH_PLUS} />
          Stack
        </AppLink>
      </div>
      <p className="m-0 mt-2 px-6 text-[13px] leading-[1.5] text-muted-foreground max-sm:px-4">
        {profile.stack.length === 0 ? (
          "No stack yet."
        ) : (
          <>
            Counted as{" "}
            {counted.length > 0 ? (
              <span className="text-foreground">{counted.join(" · ")}</span>
            ) : (
              <span className="text-foreground">nothing yet</span>
            )}
            {stack.unrecognised.length > 0 ? (
              <>
                {" "}
                — <span className="font-mono">{stack.unrecognised.join(", ")}</span> not in the filters.
              </>
            ) : (
              "."
            )}
          </>
        )}
      </p>

      {strip}
    </section>
  );
}

/** The design's two columns under the hero: the cards beside a 320px rail. */
export function EditorColumns({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_320px] items-start gap-x-6 gap-y-4 max-lg:grid-cols-[minmax(0,1fr)]">
      <div className="grid min-w-0 gap-4">{children}</div>
      <aside className="grid min-w-0 gap-4">{rail}</aside>
    </div>
  );
}

/** A section card: 12px radius on a hairline, `16px 24px 20px`, a 32px head
 *  row with the title on the left and its meta or its pencil on the right. */
export function SectionCard({
  id,
  title,
  meta,
  action,
  children,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={STEP_CARD}>
      <div className="flex min-h-[32px] items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className={H2}>
          {title}
        </h2>
        {action ?? (meta ? <span className="text-[13px] text-muted-foreground">{meta}</span> : null)}
      </div>
      {children}
    </section>
  );
}

/** A small heading inside a card: 13px/500, `--muted`, the design's `h3`. */
export function CardSubhead({ children }: { children: ReactNode }) {
  return <h3 className="m-0 text-[13px] font-medium tracking-[0.01em] text-muted-foreground">{children}</h3>;
}

/** The pencil: a 32px ghost button that is a link to the step editing this card. */
export function Pencil({ href, label }: { href: string; label: string }) {
  return (
    <AppLink
      prefetch="auto"
      href={href}
      aria-label={label}
      title={label}
      className="tap inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground no-underline hover:bg-accent hover:text-foreground"
    >
      <Glyph d={GLYPH_PENCIL} />
    </AppLink>
  );
}

/** The "add" affordance (OPR1): a full-width link to the step that adds
 *  it, on the shared sunken inset — flat, where the dashed box used to be. */
export function DashedAdd({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AppLink
      prefetch="auto"
      href={href}
      className={`tap flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[15px] text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground ${INSET} ${className}`}
    >
      <Glyph d={GLYPH_PLUS} />
      {children}
    </AppLink>
  );
}

/** The quiet "Cancel" beside a step's save: back to the overview. */
export function CancelLink({ href }: { href: string }) {
  return (
    <AppLink prefetch="auto" href={href} className={`${BTN_GHOST} no-underline`}>
      Cancel
    </AppLink>
  );
}

/** The footer of a step's form: the save on the left, the cancel beside it. */
export const FORM_FOOT = "flex flex-wrap items-center gap-2 pt-1";

/** A step's form inside its card: 14px between fields, 70ch wide. */
export const CARD_FORM = "mt-2 grid max-w-[70ch] gap-3.5";

/** Two fields side by side, wrapping under 240px each. */
export const FIELD_PAIR = "grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]";

/** The rule between a card's parts: 20px above, 16px of padding under. */
export const CARD_RULE = "mt-5 border-t border-line pt-4";

function Dot() {
  return (
    <span aria-hidden="true" className="text-border-strong">
      ·
    </span>
  );
}
