import Link from "next/link";

import { LINK_QUIET, PAGE_TITLE, PANEL } from "./design";

import {
  TOMBSTONE_COPY,
  TOMBSTONE_WAYS_ONWARD,
  tombstoneDate,
  type Tombstone,
} from "@openproduct/contracts";

/**
 * What is left where something was (openproduct-commons TS3).
 *
 * TS-3: removed content renders AS REMOVED. It does not vanish. On a
 * linkable, crawlable, permanent surface, silent deletion is
 * indistinguishable from a bug and reads as censorship to the person it
 * happened to — and a 404 gives them nothing to point at, nothing to appeal,
 * and no way to tell "we took this down" from "your link is wrong".
 *
 * WHAT IS DELIBERATELY NOT HERE, and why each one was refused:
 *
 *   the reason      — a judgement about a person, published at their own
 *                     address, before they have had any chance to answer it.
 *                     TS5 publishes reasons in AGGREGATE, which is where the
 *                     asymmetry between an estate and a person is bearable.
 *   who acted       — an operator's name on a page a stranger arrived at is
 *                     an invitation to go and find them.
 *   who reported    — the fastest way to ensure nobody ever reports anything
 *                     again is to print the reporter's name beside the thing
 *                     they reported.
 *   an appeal form  — the person who needs to appeal is the maintainer, and
 *                     they reach it from their own studio where we know who
 *                     they are. A form here is one every passer-by can file.
 *
 * What IS here is the state, the date, and the transparency record — the one
 * place the estate does answer for itself, at a whole-estate level where the
 * answer can be fair.
 *
 * NO PERSONALISATION, no session read, no client JS: identical bytes for
 * every viewer, which is what lets it be cached exactly like the page it
 * replaced (OPC-1) and keeps anonymous and signed-in responses the same (I6).
 */
export function ListingTombstone({ tombstone }: { tombstone: Tombstone }) {
  const copy = TOMBSTONE_COPY[tombstone.state];
  const on = tombstoneDate(tombstone.at);

  return (
    <main className="mx-auto box-border w-full max-w-[720px] px-7 py-16 max-sm:px-4 sm:py-24">
      <div className={`${PANEL} sm:p-7`}>
        <h1 className={PAGE_TITLE}>{copy.title}</h1>
        <p className="m-0 mt-3.5 max-w-[62ch] text-[15px] leading-[1.6] text-muted-foreground">
          {copy.says}
        </p>
        {/* THE DATE, ALWAYS. "When" is the first thing anybody appealing
            needs, and the first thing a reader weighing the page wants. A
            tombstone without one cannot be argued with. */}
        {on ? (
          <p className="m-0 mt-4 font-mono text-[12.5px] text-muted-foreground">
            {tombstone.state === "removed" ? "Removed" : "Delisted"} {on}
          </p>
        ) : null}
      </div>

      <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
        {TOMBSTONE_WAYS_ONWARD.map((way) => (
          <Link
            key={way.href}
            href={way.href}
            className={`tap text-[14px] text-muted-foreground ${LINK_QUIET}`}
          >
            {way.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}

/**
 * The line a DELISTED listing carries while still rendering in full.
 *
 * Delisting is not a weaker removal, it is a different claim — "this should
 * not be amplified here" rather than "this should not exist here" — so the
 * page keeps everything on it and gains one sentence. A reader who followed a
 * link deserves to know the directory no longer carries it; a reader who
 * cannot tell is being quietly misled about what this page's presence means.
 */
export function DelistedNote({ tombstone }: { tombstone: Tombstone }) {
  const on = tombstoneDate(tombstone.at);
  return (
    <aside className="mb-4 rounded-[12px] border border-border bg-muted/40 px-5 py-3">
      <p className="m-0 text-[13.5px] leading-[1.55] text-muted-foreground">
        <span className="font-medium text-foreground">Delisted{on ? ` on ${on}` : ""}.</span>{" "}
        {TOMBSTONE_COPY.delisted.says}
      </p>
    </aside>
  );
}
