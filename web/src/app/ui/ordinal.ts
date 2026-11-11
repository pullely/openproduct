/**
 * `1st`, `2nd`, `3rd`, `11th` — a position in the form a reader reads
 * (openproduct-launch UV1).
 *
 * ITS OWN MODULE, and not for tidiness: the web test lane is module-level and
 * has no JSX, so a rule that lives inside a `.tsx` is a rule no test in this
 * repository can hold. The teens are exactly the kind of rule worth holding.
 *
 * THE TEENS ARE THE WHOLE REASON THIS IS A FUNCTION rather than a lookup on
 * the last digit: 11, 12 and 13 take `th` while 21, 22 and 23 do not — and a
 * board with eleven launches on it is an ordinary Tuesday, not an edge case.
 */
export function ordinal(n: number): string {
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
