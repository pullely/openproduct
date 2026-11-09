// The week, as an address (openproduct-commons LC1).
//
// THE DIGEST IS AN ARCHIVE, which is the whole of LC-5's argument for a page
// and a feed before an email: `/digest/2026-w34` is linkable, crawlable, and
// still there in a year. An archive's identity has to be EXACT, and a week is
// the most quietly ambiguous unit of time there is.
//
// ISO 8601 WEEKS, and the reason is that every other definition disagrees
// with somebody. A week "starting Sunday" splits the same seven days
// differently from one starting Monday; a week numbered from January 1st
// gives some years a stub week 1 of two days. ISO says: weeks start Monday,
// and week 1 is the one containing the year's first Thursday — which makes
// every week exactly seven days and makes the boundary rule the same
// everywhere it is implemented.
//
// The consequence a reader will meet: THE WEEK'S YEAR IS NOT ALWAYS THE
// DATE'S YEAR. 30 December 2025 is in 2026-w01, and 1 January 2027 is in
// 2026-w53. That looks like a bug and is the standard behaving correctly, so
// the digest says which dates a week covers rather than leaving somebody to
// work it out.
//
// ONE SPELLING PER WEEK. `2026-w4`, `2026-W04` and `2026-w04` are one week
// and must not be three URLs: an archive with three addresses for one
// document splits its own links and teaches a crawler that the canonical one
// is arbitrary. `parseWeekId` accepts what a person might type and reports
// the CANONICAL form, and the route redirects anything that is not already
// it.

/** A week, in the only form this product stores or links. */
export interface WeekId {
  readonly year: number;
  readonly week: number;
  /** `2026-w34` — lowercase `w`, two-digit week. The one spelling. */
  readonly id: string;
}

const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;

/** `2026-w04`, always. */
export function formatWeekId(year: number, week: number): string {
  return `${year}-w${String(week).padStart(2, "0")}`;
}

/**
 * Which ISO week contains this instant?
 *
 * The standard algorithm: shift to the Thursday of the same ISO week, and
 * read the year and week number off that. Thursday is what makes it work —
 * it is the only weekday guaranteed to fall in the same ISO year as its week.
 */
export function weekOf(at: number | Date): WeekId {
  const date = new Date(typeof at === "number" ? at : at.getTime());
  // UTC throughout. A digest is one document for everybody, so "which week is
  // it" cannot depend on where the reader is standing.
  const thursday = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + 3,
  );
  const year = new Date(thursday).getUTCFullYear();
  const firstThursday = Date.UTC(year, 0, 4);
  const firstThursdayShifted =
    firstThursday - ((new Date(firstThursday).getUTCDay() + 6) % 7) * DAY_MS + 3 * DAY_MS;
  const week = 1 + Math.round((thursday - firstThursdayShifted) / WEEK_MS);
  return { year, week, id: formatWeekId(year, week) };
}

/** The half-open window `[start, end)` a week covers, in UTC. */
export function weekWindow(week: WeekId): { start: string; end: string } {
  // Back from the week's Thursday to its Monday. Derived rather than stored,
  // so a window and its id cannot disagree.
  const firstThursday = Date.UTC(week.year, 0, 4);
  const mondayOfWeek1 =
    firstThursday - ((new Date(firstThursday).getUTCDay() + 6) % 7) * DAY_MS;
  const start = mondayOfWeek1 + (week.week - 1) * WEEK_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + WEEK_MS).toISOString() };
}

/** How many ISO weeks a year has — 52, or 53 for a long year. */
export function weeksInYear(year: number): number {
  // A year has 53 ISO weeks when it starts on a Thursday, or is a leap year
  // starting on a Wednesday. Computed rather than tabled: the last day of the
  // year is in week 53 exactly when there is one.
  return weekOf(Date.UTC(year, 11, 28)).week;
}

export type WeekParse =
  | { ok: true; week: WeekId; canonical: true }
  | { ok: true; week: WeekId; canonical: false }
  | { ok: false };

/**
 * Read a week from a URL segment.
 *
 * ACCEPTS WHAT A PERSON MIGHT TYPE and reports whether it was already the
 * canonical spelling, so the route can redirect rather than serve a second
 * address for the same document. What it does NOT accept is a week that does
 * not exist: `2026-w54` is not a typo of anything and 404s, because inventing
 * a window for it would produce a digest of days in the following year under
 * a heading that named this one.
 */
export function parseWeekId(raw: string): WeekParse {
  const match = /^(\d{4})-w(\d{1,2})$/i.exec(raw.trim());
  if (!match) return { ok: false };
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isInteger(year) || year < 2000 || year > 2999) return { ok: false };
  if (!Number.isInteger(week) || week < 1 || week > weeksInYear(year)) return { ok: false };
  const id = formatWeekId(year, week);
  return { ok: true, week: { year, week, id }, canonical: raw === id };
}

/** The week before this one, crossing a year boundary correctly. */
export function previousWeek(week: WeekId): WeekId {
  return weekOf(Date.parse(weekWindow(week).start) - DAY_MS);
}

/** The week after this one, or null when it has not happened yet. */
export function nextWeek(week: WeekId, now: number): WeekId | null {
  const after = weekOf(Date.parse(weekWindow(week).end));
  // A digest for a week that has not started is a page about the future, and
  // the archive's whole value is that it only ever says what happened.
  return Date.parse(weekWindow(after).start) > now ? null : after;
}

/** `Mon 18 – Sun 24 August 2026`. Said on the page, because the ISO year is
 *  not always the date's year and somebody will think it is a bug. */
export function weekDates(week: WeekId): string {
  const { start, end } = weekWindow(week);
  const from = new Date(Date.parse(start));
  const to = new Date(Date.parse(end) - DAY_MS);
  const day = (d: Date) => d.getUTCDate();
  const month = (d: Date) =>
    d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  return sameMonth
    ? `${day(from)}–${day(to)} ${month(to)} ${to.getUTCFullYear()}`
    : `${day(from)} ${month(from)} – ${day(to)} ${month(to)} ${to.getUTCFullYear()}`;
}
