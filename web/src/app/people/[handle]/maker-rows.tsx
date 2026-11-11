import {
  MAKER_HISTORY_VERB,
  MAKER_TAB_EMPTY,
  UPVOTE_LABEL,
  makerTruncationNote,
  type MakerComment,
  type MakerCounts,
  type MakerHistoryEntry,
  type MakerLaunch,
  type MakerTab,
  type MakerUpvote,
} from "@openproduct/contracts";

import { CARD } from "../../ui/design";
import { ProductTile } from "../../ui/product-tile";
import { ordinal } from "../../ui/ordinal";
import { VoteBox } from "../../ui/vote-box";

import { AppLink } from "../../ui/link";

/**
 * The three tabs' rows (openproduct-launch MP0).
 *
 * THREE SHAPES, NOT ONE WITH NULLS. A launch carries a day and the board's
 * ordinal; an upvote carries the moment somebody made it; a commented listing
 * carries how many of their comments are on it. Folding these into one row
 * type would leave two thirds of every row empty and make an absent fact and
 * an inapplicable one look identical, which is exactly what OPC-C forbids.
 *
 * THE FEED ROW'S GEOMETRY, NOT THE FEED ROW. The design draws a maker's tabs
 * as one card of feed rows — the same 52px tile, the same name and tagline —
 * and this draws exactly that. But `FeedRow` takes a `FeedEntry`, fourteen
 * card facts that a maker's record does not carry (licence, topics, stack,
 * openings, the discussion's size), so the row is drawn here at the feed
 * row's measurements with the record's own facts on its meta line. A launch,
 * which does carry its rank and its counted upvotes, gets the rank before
 * its name and the vote box; the other two, which carry neither, get nothing
 * there rather than a zero (OPC-C).
 *
 *   card     `CARD`, 20px under the tab strip, 860px at most
 *   row      flex, centred, gap 16px, `16px 20px` under a `--line` rule,
 *            hover --accent; the title's stretch makes the row the target
 *   tile     52×52; name 16px/600; tagline 15px/1.45 --copy
 *   meta     13px --muted, · separated, margin-top 7px
 *   empty    padding 40px 20px, 1px dashed, radius 12px, centred 15px --muted
 */
export function MakerRows({
  tab,
  rows,
  counts,
  now,
  returnTo,
}: {
  tab: MakerTab;
  rows: readonly (MakerLaunch | MakerUpvote | MakerComment | MakerHistoryEntry)[];
  counts: MakerCounts;
  now: number;
  /** Where a vote from a launched row returns to — the tab it is on. */
  returnTo: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="m-0 mt-5 max-w-[860px] rounded-[12px] border border-dashed border-border px-5 py-10 text-center text-[15px] text-muted-foreground">
        {/* Each tab names what is absent and what would fill it. "Nothing"
            three times over would leave a reader unable to tell an empty
            record from a broken page (the OD5 finding, at the level of a
            tab) — and none of these is a judgement: a maker who has not
            launched has not failed at anything. */}
        {MAKER_TAB_EMPTY[tab]}
        {/* CF5 — under "0 launched", the act named and linked. A person who
            maintains listings and has launched none is usually a person who
            has not been told there is a button. */}
      </p>
    );
  }

  const total = totalFor(counts, tab);
  // PE1 — history is paged, not truncated: its "Earlier" link is the rest.
  const note = tab === "history" ? null : makerTruncationNote(total, rows.length);

  return (
    <section aria-label={GROUP_LABELS[tab]} className="mb-7 mt-5 max-w-[860px]">
      {/* The design draws no heading over the card: the tab above it is the
          heading, and its number is the TAB'S number — the document's count,
          never `rows.length`, so the strip and the list cannot disagree. A
          screen reader still gets the group's name. */}
      <h2 className="sr-only">
        {GROUP_LABELS[tab]} <span className="tabular-nums">{total}</span>
      </h2>
      <ul className={`m-0 list-none p-0 ${CARD}`}>
        {rows.map((row) => (
          <Row key={keyOf(row)} tab={tab} row={row} now={now} returnTo={returnTo} />
        ))}
      </ul>
      {/* THE COUNTER AND THE LIST DISAGREE ABOVE THE LIMIT, and the page says
          so rather than letting a reader count the rows and conclude the
          number in the tab is wrong. */}
      {note ? <p className="m-0 mt-4 text-[13.5px] text-muted-foreground">{note}</p> : null}
    </section>
  );
}

/** The design's group labels — the past tense of the act, not the tab's name. */
const GROUP_LABELS: Record<MakerTab, string> = {
  launched: "Launched",
  upvoted: "Upvoted",
  comments: "Commented on",
  // PE1 — the ledger's own label: every act, dated.
  history: "History",
};

function Row({
  tab,
  row,
  now,
  returnTo,
}: {
  tab: MakerTab;
  row: MakerLaunch | MakerUpvote | MakerComment | MakerHistoryEntry;
  now: number;
  returnTo: string;
}) {
  const slug = row.slug;
  const href = `/${slug}`;
  const launch = tab === "launched" ? (row as MakerLaunch) : null;
  return (
    // FR2 — the row is the target: the title's `::after` is stretched over
    // the `<li>`, so the whole row is what a finger presses.
    <li
      data-keyrow
      className="relative flex list-none items-center gap-4 border-t border-line px-5 py-4 transition-colors first:border-t-0 hover:bg-accent max-sm:gap-3 max-sm:px-4"
    >
      <AppLink
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="shrink-0 rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ProductTile slug={slug} thumbnail={row.thumbnail} size={52} />
      </AppLink>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex min-w-0 items-baseline gap-[5px]">
            {/* A launch has a place on its day's board, drawn as the feed
                draws a rank: the number before the name, in the name's own
                size, outside the anchor. The other acts have no position,
                and a day the sweep has not counted yet renders nothing here
                rather than a zero (OPC-C). */}
            {launch && launch.rank !== null ? (
              <span className="shrink-0 text-[16px] font-semibold leading-tight tabular-nums text-muted-foreground">
                {launch.rank}.
              </span>
            ) : null}
            <AppLink
              href={href}
              className="text-[16px] font-semibold leading-tight tracking-[-0.005em] text-foreground after:absolute after:inset-0 after:content-[''] hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {slug}
            </AppLink>
          </span>
        </div>
        {/* Not a link: it went where the title goes, and the title now
            covers the row (FR2). */}
        {row.tagline ? (
          <p className="m-0 mt-[2px] text-[15px] leading-[1.45] text-copy">{row.tagline}</p>
        ) : null}
        {/* `relative z-10` — the history line carries its own links, and they
            must sit above the title's stretch. */}
        <div className="relative z-10 mt-[7px] flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
          {tab === "launched" ? <LaunchMeta row={row as MakerLaunch} /> : null}
          {tab === "upvoted" ? <UpvoteMeta row={row as MakerUpvote} now={now} /> : null}
          {tab === "comments" ? <CommentMeta row={row as MakerComment} /> : null}
          {tab === "history" ? <HistoryMeta row={row as MakerHistoryEntry} now={now} /> : null}
        </div>
      </div>

      {/* UV0's control, where the design reserves it. The count is the day's
          — the same `counted` that decided the rank — and `null` until the
          sweep has reached the day, which the box draws as a dash.
          `relative z-10` keeps it above the title's stretch. */}
      {launch ? (
        <div className="relative z-10 flex shrink-0 items-center">
          <VoteBox
            slug={slug}
            count={launch.rank === null ? null : launch.counted}
            returnTo={returnTo}
          />
        </div>
      ) : null}
    </li>
  );
}

/** The day, and the board's ordinal for it when there is one. */
/**
 * PE1 — one act, as a sentence: the verb, then what it touched, then when.
 * No number anywhere on the row: this is the ledger beneath the counters,
 * and a row that carried a score would be a fourth counter nobody defined.
 */
function HistoryMeta({ row, now }: { row: MakerHistoryEntry; now: number }) {
  return (
    <>
      <span className="text-foreground">{MAKER_HISTORY_VERB[row.kind]}</span>
      {row.detail ? (
        <>
          <span className="text-faint">·</span>
          {row.kind === "commented" && row.ref ? (
            <AppLink href={`/threads/${encodeURIComponent(row.ref)}`} className="underline underline-offset-4">
              {row.detail}
            </AppLink>
          ) : (
            <span>{row.detail}</span>
          )}
        </>
      ) : null}
      <span className="text-faint">·</span>
      <span>{whenOf(row.at, now)}</span>
    </>
  );
}

function LaunchMeta({ row }: { row: MakerLaunch }) {
  return (
    <>
      <span className="font-mono text-[12px]">{row.day}</span>
      <span className="text-faint">·</span>
      {/* A DAY THE SWEEP HAS NOT COUNTED YET HAS NO POSITION, and the row says
          nothing rather than printing `#1`. An ordinal nobody computed is the
          most confident-looking wrong number a page can carry (OPC-C). */}
      <span>{row.rank === null ? "not counted yet" : `${ordinal(row.rank)} that day`}</span>
    </>
  );
}

/** When they upvoted it, and whether that upvote counts yet. */
function UpvoteMeta({ row, now }: { row: MakerUpvote; now: number }) {
  return (
    <>
      <span>{whenOf(row.at, now)}</span>
      {/* TS1's trust floor, said plainly rather than hidden. A new account's
          upvote is recorded and does not move the listing's total yet — the
          act is theirs either way, so it is listed, and the row does not let a
          reader assume it was counted. */}
      {row.counting ? null : (
        <>
          <span className="text-faint">·</span>
          <span>{UPVOTE_LABEL.toLowerCase()} not counted yet</span>
        </>
      )}
    </>
  );
}

/** How many of THEIR comments are on it. */
function CommentMeta({ row }: { row: MakerComment }) {
  return (
    <span>
      {row.comments} {row.comments === 1 ? "comment" : "comments"}
    </span>
  );
}

function keyOf(row: MakerLaunch | MakerUpvote | MakerComment | MakerHistoryEntry): string {
  // PE1 — an act is unique by its moment and its kind; a slug repeats.
  if ("kind" in row) return `${row.kind}:${row.at}:${row.slug}`;
  if ("launchId" in row) return row.launchId;
  if ("at" in row) return `upvote:${row.slug}`;
  return `comments:${row.slug}`;
}

function totalFor(counts: MakerCounts, tab: MakerTab): number {
  if (tab === "upvoted") return counts.upvotesGiven;
  if (tab === "comments") return counts.comments;
  return counts.launched;
}

/** A date a reader can hold on to. Coarse, and never a relative string that
 *  goes stale inside a cached document (I9's problem, avoided rather than
 *  solved). */
function whenOf(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const sameYear = new Date(at).getUTCFullYear() === new Date(now).getUTCFullYear();
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}
