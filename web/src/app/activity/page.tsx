import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { inboxHref, inboxSentence, type InboxItem, type InboxKind } from "@openproduct/contracts";

import { readSession } from "../auth/session-server";
import { BTN_SOFT_SMALL, EYEBROW, PAGE_TITLE, SEGMENT, SEGMENT_OFF, SEGMENT_ON, SEGMENTS } from "../ui/design";
import { AppLink } from "../ui/link";
import { agoOf } from "../ui/time";
import { GLYPH_FIRST, GLYPH_LAUNCH, GLYPH_REPLY, GLYPH_UPVOTE, Glyph } from "../me/glyph";
import { fetchInbox } from "../me/me-api";
import { ACTIVITY_MAIN } from "../me/nav";
import { signInFor } from "../me/section";
import { MeUnavailable } from "../me/unavailable";

/**
 * Activity — the inbox (openproduct-launch NF0), at `/activity` since
 * openproduct-redesign OPR1 and rebuilt there to the boards `Activity` and
 * `PhoneActivity`.
 *
 * THE BOARD'S SHAPE: the title with the one read action opposite it, a
 * segmented switch between the whole inbox and its subsets, then the rows
 * in two groups — Today and Earlier — each row a tile for its kind, the
 * sentence, the time, and an amber dot on a faint tint while it is unread.
 *
 * THE ONE OPENPRODUCT SURFACE THAT IS ABOUT THE READER. Every public page here
 * is one cacheable document that resolves no actor (OPC-1, I6); this one is
 * `force-dynamic` and reads the session, because it is not a page about a
 * product with a personal decoration on it — it is a page whose entire content
 * is one person's. The invariant is not bent, it simply does not apply: I6 is
 * about the pages a stranger can crawl.
 *
 * NO PROSE IS STORED. Every sentence below is composed here from the
 * contract's phrasebook and a row that holds a kind and its referents, so a
 * wording somebody regrets is a deploy rather than a backfill.
 *
 * READING IT WRITES NOTHING. The cursor moves only when somebody presses the
 * button — which is the whole reason read state is a cursor rather than a flag
 * per row, on a page whose purpose is to be looked at. Switching the subset
 * is a link, and writes nothing either.
 *
 * A ROW HAS THE ACTIONS ITS KIND HAS, AND TODAY THAT IS ONE: its link. The
 * board draws Accept and Decline on a seat request and Review on a finished
 * demo; no notification kind carries either yet, so no row offers them.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Activity" };

/** The board's label for the one read action. */
const MARK_ALL_READ = "Mark all read";

/**
 * The subsets, named for what they hold.
 *
 * The board's own are Mentions and Seats; today's five kinds are neither. Two
 * of them are about a comment the reader wrote (a reply to it, upvotes on
 * it) and three are about a launch (a product reaching first on its day, a
 * launch in a topic or of a product the reader follows) — so those are the
 * two subsets, and a kind added later is sorted here or the build fails.
 */
const SUBSET_OF: Record<InboxKind, "comments" | "launches"> = {
  "post.reply": "comments",
  "post.upvoted": "comments",
  "rank.first": "launches",
  "launch.topic": "launches",
  "launch.listing": "launches",
};

const TABS = [
  { key: "all", label: "All", href: "/activity" },
  { key: "comments", label: "Comments", href: "/activity?show=comments" },
  { key: "launches", label: "Launches", href: "/activity?show=launches" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** Which subset an address names; anything else is the whole inbox. */
function tabOf(raw: string | string[] | undefined): Tab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "comments" || value === "launches" ? value : "all";
}

/**
 * The tile a kind wears: its glyph on its kind's tint (design.md §3 — slate
 * is a version of something arriving, amber is what shipped and what was
 * endorsed).
 */
const TILE_OF: Record<InboxKind, { glyph: string; tile: string }> = {
  "post.reply": { glyph: GLYPH_REPLY, tile: "bg-version-soft text-version" },
  "post.upvoted": { glyph: GLYPH_UPVOTE, tile: "bg-amber-soft text-amber-ink" },
  "rank.first": { glyph: GLYPH_FIRST, tile: "bg-amber-soft text-amber-ink" },
  "launch.topic": { glyph: GLYPH_LAUNCH, tile: "bg-version-soft text-version" },
  "launch.listing": { glyph: GLYPH_LAUNCH, tile: "bg-version-soft text-version" },
};

/** A kind this build does not know — the service can learn one before the
 *  site does. It is drawn plainly rather than not at all, and is in no
 *  subset but All. */
const TILE_OTHER = { glyph: GLYPH_LAUNCH, tile: "bg-sunken text-foreground" };

/** "Today" is the last day, measured from this render: the server does not
 *  know the reader's midnight, and a row from an hour ago filed under
 *  Earlier because UTC turned over would read as a mistake. */
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function InboxPage(props: {
  searchParams: Promise<{ show?: string | string[] }>;
}) {
  const tab = tabOf((await props.searchParams).show);
  const here = TABS.find((t) => t.key === tab)?.href ?? "/activity";

  const session = await readSession();
  if (!session) redirect(signInFor(here));

  const result = await fetchInbox(session.accessToken);
  if (result.kind === "unauthorized") redirect(signInFor(here));
  if (result.kind === "unavailable") return <MeUnavailable />;

  const { items, unread } = result.data;
  const now = Date.now();
  const shown =
    tab === "all" ? items : items.filter((item) => (SUBSET_OF as Record<string, string>)[item.kind] === tab);
  const isToday = (item: InboxItem) => {
    const at = Date.parse(item.createdAt);
    return !Number.isNaN(at) && now - at < DAY_MS;
  };
  const groups = [
    { label: "Today", rows: shown.filter(isToday) },
    { label: "Earlier", rows: shown.filter((item) => !isToday(item)) },
  ].filter((group) => group.rows.length > 0);

  return (
    <main className={ACTIVITY_MAIN}>
      {/* The title with the read action opposite it, and the switch beneath
          (board `Activity`). On a phone the board has no title row — the lit
          tab in the bar below says where this is — so the title stays for
          the outline only and the action sits opposite the switch. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-5 max-sm:gap-x-2">
        <h1 className={`${PAGE_TITLE} max-sm:sr-only`}>Activity</h1>
        <nav aria-label="Show" className={`${SEGMENTS} justify-self-start sm:col-span-2 sm:row-start-2`}>
          {TABS.map((t) => (
            <AppLink
              key={t.key}
              href={t.href}
              {...(t.key === tab ? { "aria-current": "page" as const } : {})}
              className={`${SEGMENT} ${t.key === tab ? SEGMENT_ON : SEGMENT_OFF}`}
            >
              {t.label}
            </AppLink>
          ))}
        </nav>
        {/* The ONE read action. A form rather than a link, because it changes
            something — and no client JS, like every other act here. With
            nothing unread it is drawn spent, and does nothing. */}
        <form method="post" action="/me/notifications/read" className="sm:col-start-2 sm:row-start-1">
          <button
            type="submit"
            disabled={unread === 0}
            className={`${BTN_SOFT_SMALL} cursor-pointer border-0 text-foreground disabled:cursor-default disabled:bg-foreground/[0.03] disabled:text-muted-foreground max-sm:px-3.5`}
          >
            {MARK_ALL_READ}
          </button>
        </form>
      </div>

      {groups.length === 0 ? (
        <p className="m-0 px-1.5 text-[15px] text-muted-foreground max-sm:rounded-[16px] max-sm:bg-card max-sm:px-3.5 max-sm:py-6 max-sm:text-center">
          Nothing here yet.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.label} aria-label={group.label} className="flex flex-col gap-2 max-sm:gap-1.5">
            <h2 className={`${EYEBROW} m-0 px-1.5 font-normal`}>{group.label}</h2>
            <ul className="m-0 flex list-none flex-col gap-0.5 rounded-[16px] bg-card p-1.5" data-activity-rows>
              {group.rows.map((item) => (
                <Row key={item.id} item={item} now={now} />
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

/**
 * One notification (boards `Activity`, `PhoneActivity`): the kind's 40px
 * tile, the sentence over its time, and the dot at the far edge — a row in
 * the group's card, 14px round, tinted while it is unread. The dot keeps its
 * column when the row is read, so the text does not shift.
 */
function Row({ item, now }: { item: InboxItem; now: number }) {
  const kind = (TILE_OF as Record<string, { glyph: string; tile: string }>)[item.kind] ?? TILE_OTHER;
  return (
    <li
      className={`relative flex items-center gap-3.5 rounded-[14px] px-3.5 py-3 max-sm:items-start max-sm:gap-2.5 max-sm:p-2.5 ${
        item.unread ? "bg-amber-soft/[0.35]" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] max-sm:h-9 max-sm:w-9 ${kind.tile}`}
      >
        <Glyph d={kind.glyph} size={17} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* The whole sentence is the link — it is the contract's own string,
            and the row has one place to go — and the whole ROW is its
            target: the link is stretched over the row. */}
        <AppLink
          href={inboxHref(item)}
          className="text-[15px] text-copy no-underline [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-[14px] after:content-[''] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:leading-[1.4]"
        >
          {inboxSentence(item)}
        </AppLink>
        <time dateTime={item.createdAt} className="font-mono text-[11px] text-muted-foreground">
          {agoOf(item.createdAt, now)}
        </time>
      </div>
      {/* UNREAD IS A DOT, and it carries a word for anybody not reading the
          colour. A bare coloured dot is a state a screen reader cannot
          report and a colour-blind reader cannot see. */}
      <span
        aria-hidden={item.unread ? undefined : "true"}
        className={`h-2 w-2 shrink-0 rounded-full max-sm:mt-[7px] ${item.unread ? "bg-brand-amber-inverted" : "bg-transparent"}`}
      >
        {item.unread ? <span className="sr-only">Unread</span> : null}
      </span>
    </li>
  );
}
