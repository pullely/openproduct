// The listing editor's section cards, in their read state (openproduct
// redesign) — and the rows the steps share with them.
//
// Each card prints what the public page prints, from the same profile the
// step edits, and puts a pencil on it that goes to the step. A card with
// nothing in it does not go blank: it draws the dashed affordance the design
// draws, as a link to the step that fills it, so an empty listing is a list
// of doors rather than a list of holes.
//
// The rows a step page also draws — an image with its Remove, a thread with
// its lock, a launch in whatever state it is — live here once, so the
// overview and the step cannot draw one row two ways.

import type { ReactNode } from "react";

import {
  GALLERY_MAX,
  LAUNCH_REFUSALS,
  THREAD_TAG_LABELS,
  galleryOf,
  heroOf,
  logoOf,
  type LaunchPolicy,
  type MaintainerProfile,
  type MediaFact,
  type PublicRoleOpening,
  type PublicThread,
  type StudioLaunch,
} from "@openproduct/contracts";

import { GALLERY_SIZES, imageSourceOf } from "../../../[slug]/media";
import { BTN_SMALL } from "../../../ui/design";
import { AppLink } from "../../../ui/link";
import { LogoTile } from "../../../ui/logo-tile";
import { CARD_RULE, CardSubhead, DashedAdd, Pencil, SectionCard, type StepHrefs } from "./editor";

// ─── About ───────────────────────────────────────────────────────────────

export function AboutCard({
  profile,
  hrefs,
  editing,
}: {
  profile: Pick<MaintainerProfile, "pitch" | "installLine">;
  hrefs: StepHrefs;
  /** The details step's form, when this card is the one open. */
  editing?: ReactNode;
}) {
  return (
    <SectionCard id="about" title="About" action={editing ? undefined : <Pencil href={hrefs.details} label="Edit about" />}>
      {editing ?? (
        <>
          {profile.pitch ? (
            <p className="m-0 mt-2 max-w-[70ch] whitespace-pre-wrap text-[15px] leading-[1.65] text-copy">
              {profile.pitch}
            </p>
          ) : (
            <DashedAdd href={hrefs.details} className="mt-2">
              Add a pitch
            </DashedAdd>
          )}
          <div className={CARD_RULE}>
            <CardSubhead>Install</CardSubhead>
            {profile.installLine ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-[8px] border border-border bg-surface-2 px-3 py-[9px]">
                <code className="min-w-0 overflow-x-auto font-mono text-[13.5px] leading-[1.6] text-foreground">
                  {profile.installLine}
                </code>
              </div>
            ) : (
              <DashedAdd href={hrefs.details} className="mt-2">
                Add an install command
              </DashedAdd>
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ─── Media ───────────────────────────────────────────────────────────────

/** `Nothing yet`, or `Logo · Hero · 2 of 8 in the gallery`. */
export function mediaCount(media: readonly MediaFact[]): string {
  if (media.length === 0) return "Nothing yet";
  const gallery = galleryOf(media).length;
  return `${logoOf(media) ? "Logo" : "No logo"} · ${heroOf(media) ? "Hero" : "No hero"} · ${gallery} of ${GALLERY_MAX} in the gallery`;
}

/**
 * The images, with a Remove on each. `from` is the step to come back to;
 * absent on the overview, where the route's fallback is this page.
 */
export function MediaRows({
  media,
  apiBase,
  action,
  from,
  add,
}: {
  media: readonly MediaFact[];
  apiBase: string;
  action: string;
  from?: string;
  /** The cell after the last image — the dashed add, or nothing while the
   *  upload form is open under the list. */
  add?: ReactNode;
}) {
  const logo = logoOf(media);
  const hero = heroOf(media);
  const gallery = galleryOf(media);
  const rows = [...(logo ? [logo] : []), ...(hero ? [hero] : []), ...gallery];
  return (
    <ul aria-label="Your images" className="m-0 mt-3 grid list-none gap-3 p-0 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
      {rows.map((row) => {
        const source = imageSourceOf(row.value, apiBase, GALLERY_SIZES);
        const { kind } = row.value;
        const label = kind === "logo" ? "Logo" : kind === "hero" ? "Hero" : `Gallery ${row.value.position + 1}`;
        return (
          <li key={row.value.id} className={row.value.kind === "hero" ? "col-span-full" : ""}>
            {/* A logo is drawn as the tile draws it — square, contained —
                not stretched to a gallery cell's width. */}
            <div
              className={
                kind === "logo"
                  ? "grid aspect-square w-[120px] place-items-center overflow-hidden rounded-[14px] border border-border bg-card"
                  : "overflow-hidden rounded-[8px] bg-muted"
              }
            >
              <img
                src={source.src}
                srcSet={source.srcSet}
                sizes={source.sizes}
                width={source.width}
                height={source.height}
                alt={source.alt}
                loading="lazy"
                decoding="async"
                className={kind === "logo" ? "block h-full w-full object-contain" : "block h-auto w-full"}
              />
            </div>
            <div className="mt-2 flex items-start justify-between gap-2">
              <p className="m-0 min-w-0 text-[12.5px] leading-[1.5] text-muted-foreground">
                <span className="font-medium text-foreground">{label}</span> · {row.value.alt}
              </p>
              {/* A removal changes the page, so it keeps the `303` (OPP15). */}
              <form method="post" action={action}>
                <input type="hidden" name="intent" value="remove-media" />
                {from ? <input type="hidden" name="from" value={from} /> : null}
                <input type="hidden" name="mediaId" value={row.value.id} />
                <button
                  type="submit"
                  className={`tap ${BTN_SMALL}`}
                  aria-label={`Remove ${
                    kind === "logo" ? "the logo" : kind === "hero" ? "the hero image" : `gallery image ${row.value.position + 1}`
                  }`}
                >
                  Remove
                </button>
              </form>
            </div>
          </li>
        );
      })}
      {add ? <li className="min-h-[150px]">{add}</li> : null}
    </ul>
  );
}

export function MediaCard({
  media,
  unreadable,
  apiBase,
  action,
  hrefs,
  from,
  editing,
}: {
  media: readonly MediaFact[];
  /** The rows could not be read: the card says so over an empty list rather
   *  than failing the page, because the maintainer can still add one. */
  unreadable: boolean;
  apiBase: string;
  action: string;
  hrefs: StepHrefs;
  from?: string;
  /** The media step's upload form, when this card is the one open. */
  editing?: ReactNode;
}) {
  const hero = heroOf(media);
  const galleryFull = galleryOf(media).length >= GALLERY_MAX;
  const addLabel = !hero ? "Add a hero image" : galleryFull ? "Gallery full" : "Add a gallery image";
  return (
    <SectionCard id="media" title="Media" meta={mediaCount(media)}>
      {unreadable ? (
        <p className="m-0 mt-3 rounded-[8px] bg-warning-soft px-3 py-2 text-[13px] text-warning-strong">
          Your images could not be read just now. You can still add one.
        </p>
      ) : null}
      {/* VISIBLE, and it says what to do (openproduct-studio OSD7). It was
          `sr-only`, so a sighted maker saw a lone dashed box and had to guess
          what the card wanted; now the one line names the three kinds, in
          the words the media step's own island uses. On that step the island
          draws its own line, so the card stays quiet there. */}
      {media.length === 0 && !editing ? (
        <p className="m-0 mt-2 text-[13.5px] text-muted-foreground">
          No images yet — add a logo, a hero and up to {GALLERY_MAX} more.
        </p>
      ) : null}
      <MediaRows
        media={media}
        apiBase={apiBase}
        action={action}
        {...(from ? { from } : {})}
        add={
          editing ? null : galleryFull && hero ? (
            <span className="flex h-full min-h-[150px] flex-col items-center justify-center rounded-[8px] border border-dashed border-border px-3.5 py-3 text-center text-[14px] text-faint">
              {addLabel}
            </span>
          ) : (
            <DashedAdd href={hrefs.media} className="h-full min-h-[150px] flex-col justify-center text-center">
              {addLabel}
            </DashedAdd>
          )
        }
      />
      {editing ? <div className={CARD_RULE}>{editing}</div> : null}
    </SectionCard>
  );
}

// ─── People ──────────────────────────────────────────────────────────────

/** The roster: who agreed to appear, each with the label the maintainer wrote. */
export function MaintainerRows({ maintainers }: { maintainers: MaintainerProfile["maintainers"] }) {
  if (maintainers.length === 0) {
    // OSD7 — an empty state says what to do: people are named by handle.
    return (
      <p className="m-0 mt-2 text-[13.5px] text-muted-foreground">
        Nobody on the roster yet — name people by their @handle.
      </p>
    );
  }
  return (
    <ul className="m-0 mt-1 list-none p-0">
      {maintainers.map((m) => {
        const name = m.displayName ?? (m.handle ? `@${m.handle}` : "A maintainer");
        const line = [m.handle ? `@${m.handle}` : null, m.roleLabel].filter(Boolean).join(" · ");
        return (
          <li key={m.subjectId} className="flex flex-wrap items-center gap-3 border-t border-line py-3">
            <LogoTile slug={m.handle ?? name} size={36} />
            <div className="min-w-[160px] flex-1">
              {m.handle ? (
                <AppLink
                  href={`/@${m.handle}`}
                  className="text-[14.5px] font-medium text-foreground no-underline hover:text-copy"
                >
                  {name}
                </AppLink>
              ) : (
                <span className="text-[14.5px] font-medium text-foreground">{name}</span>
              )}
              {line ? <p className="m-0 mt-[1px] text-[13px] text-muted-foreground">{line}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One opening in its read state: the title, the commitment, its status. */
export function OpeningRow({
  opening,
  children,
}: {
  opening: PublicRoleOpening;
  /** The row's controls — a status select and a Remove on the people step. */
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-2.5">
      <div className="min-w-[180px] flex-1">
        <span className="text-[14.5px] font-medium text-foreground">{opening.title}</span>
        {opening.commitment ? (
          <span className="ml-2 text-[13px] text-muted-foreground">{opening.commitment}</span>
        ) : null}
      </div>
      {children ?? (
        <span
          className={`inline-flex h-[24px] items-center rounded-full px-[9px] text-[12.5px] font-medium ${
            opening.status === "open" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {opening.status}
        </span>
      )}
    </li>
  );
}

export function PeopleCard({
  profile,
  hrefs,
  editing,
}: {
  profile: Pick<MaintainerProfile, "maintainers" | "roleOpenings">;
  hrefs: StepHrefs;
  /** The people step's forms, when this card is the one open. */
  editing?: ReactNode;
}) {
  return (
    <SectionCard id="people" title="People" action={editing ? undefined : <Pencil href={hrefs.people} label="Edit people" />}>
      {editing ?? (
        <>
          <MaintainerRows maintainers={profile.maintainers} />
          <div className={CARD_RULE}>
            <CardSubhead>Where it needs people</CardSubhead>
            {profile.roleOpenings.length > 0 ? (
              <ul className="m-0 mt-1 list-none p-0">
                {profile.roleOpenings.map((opening) => (
                  <OpeningRow key={opening.id} opening={opening} />
                ))}
              </ul>
            ) : null}
            <DashedAdd href={hrefs.people} className="mt-2.5">
              Add an opening
            </DashedAdd>
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ─── Launches ────────────────────────────────────────────────────────────

/** What the scheduler read, or null when that read failed. */
export interface LaunchesRead {
  readonly launches: readonly StudioLaunch[];
  readonly eligibility: { readonly isPublished: boolean; readonly consumedVersions: readonly string[] };
  readonly policy: LaunchPolicy;
}

export function stateLabel(launch: StudioLaunch): string {
  if (launch.state === "live") return `Launched ${day(launch.launchedAt)}`;
  if (launch.state === "cancelled") return `Cancelled ${day(launch.cancelledAt)}`;
  if (launch.state === "missed") return `Missed ${day(launch.missedAt)}`;
  return `Scheduled for ${moment(launch.scheduledFor)}`;
}

export function day(iso: string | null): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  return Number.isNaN(at)
    ? ""
    : new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Rendered in UTC because that is the zone it was entered in — showing it
 *  back in a different one would make the form look like it had moved it. */
export function moment(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  return `${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** An ISO instant as a `datetime-local` value, so Move opens on the moment
 *  that is already set rather than on an empty field. */
export function localValue(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? "" : new Date(at).toISOString().slice(0, 16);
}

/** One launch in whatever state it is: the version, then the state. */
export function LaunchRow({ launch, children }: { launch: StudioLaunch; children?: ReactNode }) {
  return (
    <li className="border-t border-line py-3 text-[14px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex min-w-0 items-baseline gap-2 text-foreground">
          <span className="font-mono text-[13px]">{launch.versionLabel}</span>
          <span className="text-muted-foreground">{stateLabel(launch)}</span>
        </span>
      </div>
      {children}
    </li>
  );
}

/** The scheduled launch, set apart on `--secondary`: the one row a maintainer can still move. */
export function ScheduledBox({ launch, children }: { launch: StudioLaunch; children?: ReactNode }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] bg-secondary px-3.5 py-3">
      <span className="font-mono text-[13.5px] font-medium text-foreground">{launch.versionLabel}</span>
      <span className="flex-1 text-[13.5px] text-copy">Scheduled for {moment(launch.scheduledFor)}</span>
      {children}
    </div>
  );
}

export function LaunchesCard({
  read,
  published,
  hrefs,
  editing,
}: {
  read: LaunchesRead | null;
  published: boolean;
  hrefs: StepHrefs;
  /** The scheduler's forms, when this card is the one open. */
  editing?: ReactNode;
}) {
  const scheduled = read?.launches.find((l) => l.state === "scheduled") ?? null;
  const rest = read?.launches.filter((l) => l.state !== "scheduled") ?? [];
  return (
    <SectionCard
      id="launches"
      title="Launches"
      meta={read ? `One launch per version · ${read.policy.cooldownDays} days between launches` : undefined}
      action={editing ? undefined : <Pencil href={hrefs.launches} label="Edit launches" />}
    >
      {editing ?? (
        <>
          {!published ? (
            <p className="m-0 mt-2 rounded-[8px] bg-muted px-3 py-2 text-[13px] leading-[1.55] text-muted-foreground">
              {LAUNCH_REFUSALS["not-published"].says}
            </p>
          ) : read === null ? (
            <p className="m-0 mt-2 text-[13.5px] text-muted-foreground">The launches could not be read just now.</p>
          ) : scheduled ? (
            <ScheduledBox launch={scheduled}>
              <AppLink prefetch="auto" href={hrefs.launches} className={`tap ${BTN_SMALL} no-underline`}>
                Move or cancel
              </AppLink>
            </ScheduledBox>
          ) : (
            <DashedAdd href={hrefs.launches} className="mt-2">
              Schedule a launch
            </DashedAdd>
          )}
          {rest.length > 0 ? (
            <ul className="m-0 mt-4 list-none p-0">
              {rest.map((launch) => (
                <LaunchRow key={launch.id} launch={launch} />
              ))}
            </ul>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

// ─── Discussions ─────────────────────────────────────────────────────────

/** One thread and the one thing a maintainer may do to it: end it, or open it again. */
export function ThreadRow({ thread, action }: { thread: PublicThread; action: string }) {
  const locked = thread.state === "locked";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-3">
      <div className="min-w-[200px] flex-1">
        <AppLink
          href={`/threads/${thread.id}`}
          className="text-[14.5px] font-medium text-foreground no-underline hover:text-copy"
        >
          {thread.title}
        </AppLink>
        <p className="m-0 mt-[2px] text-[13px] text-muted-foreground">
          {THREAD_TAG_LABELS[thread.tag]} · {locked ? "closed" : "open"} · {thread.postCount}{" "}
          {thread.postCount === 1 ? "post" : "posts"}
        </p>
      </div>
      <form method="post" action={action}>
        <input type="hidden" name="threadId" value={thread.id} />
        <button type="submit" name="intent" value={locked ? "unlock" : "lock"} className={`tap ${BTN_SMALL}`}>
          {locked ? "Open it again" : "Close to new posts"}
        </button>
      </form>
    </li>
  );
}

export function DiscussionsCard({
  threads,
  action,
  forum,
}: {
  /** null when the read failed. */
  threads: readonly PublicThread[] | null;
  /** The discussions act route. */
  action: string;
  /** The listing's forum, for the reader's side of the same threads. */
  forum?: ReactNode;
}) {
  const count =
    threads === null ? undefined : threads.length === 0 ? undefined : `${threads.length} ${threads.length === 1 ? "thread" : "threads"}`;
  return (
    <SectionCard
      id="discussions"
      title="Discussions"
      meta={count}
      action={
        forum ? (
          <span className="flex items-center gap-3 text-[13px] text-muted-foreground">
            {count}
            {forum}
          </span>
        ) : undefined
      }
    >
      {threads === null ? (
        <p className="m-0 mt-2 text-[13.5px] text-muted-foreground">The discussions could not be read just now.</p>
      ) : threads.length === 0 ? (
        // OSD7 — "Nothing yet." left a maker wondering whether they were
        // meant to start one; they are not, and the line says so.
        <p className="m-0 mt-2 text-[13.5px] text-muted-foreground">
          No threads yet — they start when people ask on the listing's public page.
        </p>
      ) : (
        <ul className="m-0 mt-1 list-none p-0">
          {threads.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} action={action} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
