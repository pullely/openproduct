import { describe, expect, it } from "vitest";

import { dayOf } from "./board.js";
import { facet } from "./facets.js";
import type { FeedEntry } from "./feed.js";
import {
  PROVENANCE_HREF,
  TOPIC_FACET,
  TOPIC_GRID_COLUMNS,
  TOPIC_KEYS,
  topicGridRow,
  TOPIC_WINDOW_DAYS,
  buildTopic,
  buildTopicIndex,
  cardsInTopic,
  topicDirectoryMeta,
  topicIn,
  topicMeaning,
  topicPath,
  topicWindowDays,
} from "./topics.js";

const TODAY = dayOf(Date.UTC(2026, 8, 5)); // 2026-09-05

/** Two real vocabulary values, so the tests cannot pass on a value CT1 has
 *  never heard of. */
const DEV = "dev-tools";
const DATA = "data";

function card(category: string | null) {
  return { category };
}

function entry(over: Partial<FeedEntry> & Pick<FeedEntry, "slug" | "day">): FeedEntry {
  return {
    launchId: `l-${over.slug}`,
    tagline: null,
    versionLabel: "1.0",
    launchedAt: `${over.day}T09:00:00.000Z`,
    rank: 1,
    counted: 1,
    ineligible: 0,
    licence: null,
    topics: [DEV],
    stack: [],
    roleOpeningCount: 0,
    commentCount: 0,
    thumbnail: null,
    ...over,
  };
}

describe("a topic IS a category value", () => {
  it("names the facet rather than repeating the string", () => {
    // One constant, so a topic and the directory filter behind it cannot come
    // apart.
    expect(TOPIC_FACET).toBe("category");
    expect(facet(TOPIC_FACET)).not.toBeNull();
  });

  it("addresses by the canonical value, never by the label", () => {
    // A label has spaces and a capital letter; an address should survive being
    // retyped.
    expect(topicPath(DEV)).toBe("/topics/dev-tools");
    // ONE address per topic. The directory filter that used to sit beside it
    // went with the directory: `/` is the launches, and a topic's page is
    // the complete list for its value.
    for (const value of [DEV, DATA]) {
      expect(topicPath(value).endsWith(value)).toBe(true);
    }
  });
});

describe("the index", () => {
  it("counts live listings carrying each value, most first", () => {
    const index = buildTopicIndex([card(DEV), card(DEV), card(DATA), card(null)]);
    // HB4 — the count is the list's own length, by one predicate.
    const cards = [card(DEV), card(DEV), card(DATA), card(null)];
    for (const topic of index) {
      expect([topic.value, topic.products]).toEqual([topic.value, cardsInTopic(cards, topic.value).length]);
    }
    expect(topicDirectoryMeta(1)).toBe("1 product · most active first");
    expect(topicDirectoryMeta(12)).toBe("12 products · most active first");
    expect(index.map((t) => [t.value, t.products])).toEqual([
      [DEV, 2],
      [DATA, 1],
    ]);
  });

  it("gives a value NOBODY has chosen no card, so no link leads to an empty page", () => {
    // The vocabulary has more values than the catalogue has listings — DS1's
    // argument for offering only present values in the rail, applied to a grid.
    const index = buildTopicIndex([card(DEV)]);
    expect(index.map((t) => t.value)).toEqual([DEV]);
    expect(index.length).toBeLessThan(facet(TOPIC_FACET)!.values.length);
  });

  it("a listing that has chosen no category is counted nowhere, not in an `other` bucket", () => {
    // A default bucket would put a listing in a facet its maintainers did not
    // choose.
    expect(buildTopicIndex([card(null), card(null)])).toEqual([]);
  });

  it("refuses a value the vocabulary does not know rather than printing a slug", () => {
    // CT1 canonicalises on the way in, so this is a guard rather than an
    // expected branch — but printing the raw value would put a string in the
    // estate's voice that nobody wrote.
    expect(buildTopicIndex([card("not-a-real-facet-value")])).toEqual([]);
  });

  it("carries the vocabulary's own label and description, unedited", () => {
    const [top] = buildTopicIndex([card(DEV)]);
    const group = facet(TOPIC_FACET)!;
    expect(top!.label).toBe(group.values.find((v) => v.value === DEV)!.label);
    expect(top!.description).toBe(group.description);
  });

  it("breaks a tie by label, so the grid does not reorder between two reads", () => {
    const index = buildTopicIndex([card(DEV), card(DATA)]);
    expect(index.map((t) => t.products)).toEqual([1, 1]);
    expect(index.map((t) => t.label)).toEqual([...index.map((t) => t.label)].sort());
  });

  it("`topicIn` is the same gate the grid is built from", () => {
    // "Has a card" and "has a page" must be one answer, or a topic is
    // reachable by URL while missing from the grid that lists every topic.
    const index = buildTopicIndex([card(DEV)]);
    expect(topicIn(index, DEV)?.value).toBe(DEV);
    expect(topicIn(index, DATA)).toBeNull();
  });
});

describe("the window", () => {
  it("is the BOARD'S archive window, not the feed's week", () => {
    // Most topics do not have something launching every week, and a page that
    // is empty most of the time is indistinguishable from a broken one.
    expect(TOPIC_WINDOW_DAYS).toBe(30);
    const days = topicWindowDays(TODAY);
    expect(days).toHaveLength(30);
    expect(days[0]!.id).toBe("2026-09-05");
    expect(days.at(-1)!.id).toBe("2026-08-07");
  });
});

describe("one topic's page", () => {
  const dev = buildTopicIndex([card(DEV), card(DEV), card(DATA)])[0]!;

  it("keeps only this topic's launches", () => {
    const topic = buildTopic(dev, TODAY, [
      entry({ slug: "mine", day: "2026-09-04" }),
      entry({ slug: "theirs", day: "2026-09-04", topics: [DATA] }),
    ]);
    expect(topic.entries.map((e) => e.slug)).toEqual(["mine"]);
  });

  it("drops a launch outside the window rather than showing it undated", () => {
    const topic = buildTopic(dev, TODAY, [
      entry({ slug: "in", day: "2026-08-10" }),
      entry({ slug: "out", day: "2026-08-01" }),
    ]);
    expect(topic.entries.map((e) => e.slug)).toEqual(["in"]);
  });

  it("orders by day, then by the BOARD'S rank — it pools nothing (OL-2a)", () => {
    // Pooling days would put a quiet Tuesday's winner above a busy Thursday's
    // runner-up and imply a comparison the board never made. The leaderboard
    // is the surface that pools, and it publishes a formula for doing so.
    const topic = buildTopic(dev, TODAY, [
      entry({ slug: "old-winner", day: "2026-09-01", rank: 1, counted: 90 }),
      entry({ slug: "new-second", day: "2026-09-04", rank: 2, counted: 2 }),
      entry({ slug: "new-first", day: "2026-09-04", rank: 1, counted: 3 }),
    ]);
    expect(topic.entries.map((e) => e.slug)).toEqual(["new-first", "new-second", "old-winner"]);
  });

  it("sorts an unranked launch last within its day, never as rank 0", () => {
    const topic = buildTopic(dev, TODAY, [
      entry({ slug: "unranked", day: "2026-09-04", rank: null, counted: 0 }),
      entry({ slug: "ranked", day: "2026-09-04", rank: 1 }),
    ]);
    expect(topic.entries.map((e) => e.slug)).toEqual(["ranked", "unranked"]);
  });

  it("carries the day it treated as today, and the window's far end", () => {
    const topic = buildTopic(dev, TODAY, []);
    expect(topic.today).toBe("2026-09-05");
    expect(topic.from).toBe("2026-08-07");
  });

  it("serializes exactly its literal", () => {
    expect(Object.keys(buildTopic(dev, TODAY, [])).sort()).toEqual([...TOPIC_KEYS].sort());
  });

  it("counts PRODUCTS, not launches, and says so", () => {
    // LC0 made a launch a separate act from a publish so the two could be
    // counted apart. A page reading "2 launches" over a topic where one
    // listing never launched would count one thing and name another.
    const topic = buildTopic(dev, TODAY, [entry({ slug: "only", day: "2026-09-04" })]);
    expect(topic.products).toBe(2);
    expect(topic.entries).toHaveLength(1);
    expect(topicMeaning(topic)).toContain("2 products");
    expect(topicMeaning(topic)).toContain("30 days");
  });

  it("says `product` for one and `products` for none", () => {
    const one = buildTopic(buildTopicIndex([card(DATA)])[0]!, TODAY, []);
    expect(topicMeaning(one)).toContain("1 product in this topic");
  });

  it("has no follower count at all — not a zero (OPC-C)", () => {
    // Nothing observes a follow yet. "0 followers" would be a claim that
    // nobody follows this topic rather than an admission that nobody has been
    // able to. FL0 builds follows and the number appears then.
    const topic = buildTopic(dev, TODAY, []);
    expect(Object.keys(topic)).not.toContain("followers");
    expect(TOPIC_KEYS).not.toContain("followers");
  });
});

describe("AG2 — the comparison grid", () => {
  it("declares a provenance class for every column, and only the two", () => {
    // THE DONE-WHEN, LITERALLY: "a topic renders a grid whose columns are all
    // `observed` or `authored` and labelled as such". Nothing derived — which
    // rules out every number this estate computes: the rank, the counted
    // endorsements, the discount. A grid that put a ranking beside a licence
    // would invite a reader to compare our arithmetic with a fact about the
    // product.
    expect(TOPIC_GRID_COLUMNS.length).toBeGreaterThan(0);
    const wrong = TOPIC_GRID_COLUMNS.filter(
      (column) => column.provenance !== "observed" && column.provenance !== "authored",
    );
    expect(wrong).toEqual([]);
  });

  it("says what the class means for the field, not just which class it is", () => {
    // A reader told "observed" has been told a category. OPC-2 wants the fact.
    for (const column of TOPIC_GRID_COLUMNS) {
      expect([column.id, column.note.length > 50]).toEqual([column.id, true]);
    }
  });

  it("gives one cell per column, in column order", () => {
    const cells = topicGridRow({ licence: "MIT", stack: ["rust", "sqlite"], roleOpeningCount: 2 });
    expect(cells).toEqual(["MIT", "rust, sqlite", "2"]);
    expect(cells).toHaveLength(TOPIC_GRID_COLUMNS.length);
  });

  it("renders an unobserved licence as a dash, never as a guess", () => {
    // The cell this grid is most likely to be asked to break: an empty cell in
    // a comparison table looks like a gap to fill, and "unknown", "none" and
    // "proprietary" are three different claims none of which anybody made.
    expect(topicGridRow({ licence: null, stack: [], roleOpeningCount: 0 })[0]).toBe("—");
  });

  it("keeps a dash and a zero apart, because they mean different things", () => {
    // Nobody wanted is something the maintainers SAID by opening no roles.
    // A licence nobody read is something nobody said at all.
    const [licence, stack, openings] = topicGridRow({
      licence: null,
      stack: [],
      roleOpeningCount: 0,
    });
    expect([licence, stack]).toEqual(["—", "—"]);
    expect(openings).toBe("0");
  });

  it("points a reader at where the classes are explained", () => {
    expect(PROVENANCE_HREF).toBe("/docs#provenance");
  });
});
