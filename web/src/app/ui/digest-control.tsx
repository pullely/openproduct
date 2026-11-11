import {
  digestControlLabel,
  type DigestStanding,
} from "@openproduct/contracts";

/**
 * The digest subscription control (openproduct-commons LC5).
 *
 * A SERVER COMPONENT WITH NO CLIENT JS AND NO SESSION READ. It renders on the
 * public digest page, which is anonymous and edge-cached: reading a session
 * here would either break the cache or leak who is looking (OPC-1, I6). The
 * markup is therefore identical for every visitor, and the session is read
 * exactly once — on the POST, in the route handler, which is where the save
 * and endorse controls read it too.
 *
 * `standing` IS OPTIONAL, and its absence is the anonymous case rather than a
 * third state to render: a visitor with no account sees the invitation, posts
 * it, and comes back signed in with their intent intact.
 *
 * THE FEED IS OFFERED FIRST on the public page, and that ordering is the
 * argument: the feed needs nothing from anybody at all, and a product that
 * leads with "give us your address" when it has a better answer available is
 * asking for something it does not need.
 */
export function DigestControl({
  standing,
  returnTo,
  showFeedNote: _showFeedNote = false,
  compact = false,
}: {
  standing?: DigestStanding;
  returnTo: string;
  showFeedNote?: boolean;
  /** HB3 — inside a card that already has a border and a heading, so no
   *  card of its own and no top margin. Same form, same door. */
  compact?: boolean;
}) {
  const current: DigestStanding = standing ?? "never";
  const subscribing = current !== "subscribed";

  return (
    <div className={compact ? "" : "mt-6 max-w-[68ch] rounded-[12px] border border-border bg-card px-4 py-4"}>

      <form
        method="post"
        action="/me/digest"
        className={compact ? "mt-2 flex flex-wrap items-center gap-3" : "flex flex-wrap items-center gap-3"}
      >
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="subscribed" value={String(subscribing)} />
        <button
          type="submit"
          className={
            compact
              ? "inline-flex h-[30px] items-center rounded-full border border-input bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:border-faint"
              : "inline-flex h-[36px] items-center rounded-full border border-border-strong bg-card px-3.5 text-[14px] font-medium text-foreground transition-colors hover:border-faint"
          }
        >
          {digestControlLabel(current)}
        </button>
      </form>

      {/* WHAT WILL ARRIVE, AND WHAT WE DO NOT HAVE. The second half is the one
          worth the words: "we do not store your address" is a strange claim
          for a product sending you email, it is true here, and a reader who
          does not believe it can check the schema. */}
    </div>
  );
}
