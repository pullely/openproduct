// The people index's filters, as addresses (PE3).
import { describe, expect, it } from "vitest";

import {
  PEOPLE_FILTERS_EMPTY,
  filterPeople,
  parsePeopleFilters,
  peopleCountLine,
  peopleFiltersQuery,
  peopleTopics,
} from "./people-filters.js";
import type { PublicContributorCard } from "./profiles.js";

const person = (over: Partial<PublicContributorCard>): PublicContributorCard => ({
  handle: "ada",
  displayName: "Ada",
  bio: null,
  openToProject: false,
  maintains: [],
  contributesTo: 0,
  launched: false,
  ...over,
});
const PEOPLE = [
  person({ handle: "ada", maintains: ["a"], launched: true, openToProject: true }),
  person({ handle: "bob", maintains: ["b"] }),
  person({ handle: "cy" }),
];
const TOPIC = { a: "developer-tools", b: "design" };
const title = (p: PublicContributorCard) => p.displayName ?? p.handle;

describe("every filter is an address", () => {
  it("round-trips the state through the query string", () => {
    const state = { q: "ad", open: true, launched: true, maintains: true, topic: "design" };
    expect(parsePeopleFilters(peopleFiltersQuery(state))).toEqual(state);
    expect(peopleFiltersQuery(PEOPLE_FILTERS_EMPTY)).toBe("");
    expect(parsePeopleFilters("?launched=1")).toEqual({ ...PEOPLE_FILTERS_EMPTY, launched: true });
  });

  it("ignores what it does not know and bounds what it does", () => {
    expect(parsePeopleFilters("?sort=best&open=2")).toEqual(PEOPLE_FILTERS_EMPTY);
    expect(parsePeopleFilters(`?q=${"x".repeat(200)}`).q).toHaveLength(80);
  });
});

describe("the rows a state keeps", () => {
  it("filters by each fact, and they combine", () => {
    const handles = (state: Parameters<typeof filterPeople>[1]) =>
      filterPeople(PEOPLE, state, TOPIC, title).map((p) => p.handle);
    expect(handles(PEOPLE_FILTERS_EMPTY)).toEqual(["ada", "bob", "cy"]);
    expect(handles({ ...PEOPLE_FILTERS_EMPTY, launched: true })).toEqual(["ada"]);
    expect(handles({ ...PEOPLE_FILTERS_EMPTY, maintains: true })).toEqual(["ada", "bob"]);
    expect(handles({ ...PEOPLE_FILTERS_EMPTY, topic: "design" })).toEqual(["bob"]);
    expect(handles({ ...PEOPLE_FILTERS_EMPTY, maintains: true, open: true })).toEqual(["ada"]);
    expect(handles({ ...PEOPLE_FILTERS_EMPTY, q: "b" })).toEqual(["bob"]);
  });

  it("offers the topics the listed people's listings carry, sorted", () => {
    expect(peopleTopics(PEOPLE, TOPIC)).toEqual(["design", "developer-tools"]);
  });
});

describe("the count above the list is the filtered list's own (WC-7)", () => {
  it("is the directory's line when nothing is filtered", () => {
    expect(peopleCountLine(3, 1, PEOPLE_FILTERS_EMPTY)).toBe("3 people · 1 open to one more project");
    expect(peopleCountLine(1, 0, PEOPLE_FILTERS_EMPTY)).toBe("1 person · 0 open to one more project");
  });

  it("says what was shown and which filter made it so", () => {
    expect(peopleCountLine(1, 1, { ...PEOPLE_FILTERS_EMPTY, launched: true })).toBe("1 person launched");
    expect(peopleCountLine(2, 1, { ...PEOPLE_FILTERS_EMPTY, maintains: true, topic: "design" })).toBe(
      "2 people maintaining a listing, in design",
    );
  });
});
