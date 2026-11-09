// Numbered-placeholder translation, bind values and the one timestamp format
// (openproduct-standalone OPN, D1 slice proof).
//
// ADAPTED FROM the cirrus baseline's `packages/db/src/d1/sql.ts` in
// pullely/ackstack (read at 20c7e1cd): the same literal-aware scan, so a `$1`
// inside a string literal or a comment stays data.
//
// ONE DELIBERATE DEPARTURE. Cirrus rewrites `$n` to a bare `?` and pushes the
// value once per OCCURRENCE, so `($2 IS NULL AND x = $2)` binds the value
// twice. Here `$n` becomes SQLite's own numbered form `?n`, which D1 accepts,
// and the value is bound ONCE per number. Two reasons:
//
//   1. D1 refuses a statement with more than 100 bound parameters (local
//      workerd enforces it: "variable number must be between ?1 and ?100").
//      Counting distinct numbers rather than occurrences is the difference
//      between a keyset predicate that references its cursor four times
//      costing four parameters or one.
//   2. The repository's SQL keeps its Postgres reading: `$3` is the third
//      argument, wherever and however often it appears.
//
// A statement that is handed more parameters than it references is REFUSED
// rather than silently trimmed — Postgres refuses it too ("bind message
// supplies 3 parameters, but prepared statement requires 2"), and a parameter
// the text forgot is a bug worth hearing about on either engine.

/** D1's per-statement ceiling on bound parameters. */
export const D1_MAX_BOUND_PARAMETERS = 100;

export interface TranslatedSql {
  /** The statement with every `$n` replaced by `?n`. */
  text: string;
  /** Bind values, positionally: `values[i]` binds `?{i+1}`. */
  values: unknown[];
}

export function translatePlaceholders(text: string, params: readonly unknown[]): TranslatedSql {
  let out = "";
  let highest = 0;

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    // ── Regions where a `$n` is not a placeholder ──
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < text.length) {
        out += text[i];
        // '' (or "") inside a literal is an escaped quote, not its end.
        if (text[i] === quote) {
          if (text[i + 1] === quote) {
            out += text[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "-" && next === "-") {
      while (i < text.length && text[i] !== "\n") {
        out += text[i];
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "/*";
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i];
        i += 1;
      }
      out += "*/";
      i += 2;
      continue;
    }

    // ── The placeholder itself ──
    if (ch === "$" && next !== undefined && next >= "0" && next <= "9") {
      let j = i + 1;
      let digits = "";
      for (; j < text.length; j += 1) {
        const digit = text[j];
        if (digit === undefined || digit < "0" || digit > "9") break;
        digits += digit;
      }
      const index = Number(digits);
      if (index < 1 || index > params.length) {
        throw new Error(
          `d1: statement references $${index} but ${params.length} parameter(s) were supplied`,
        );
      }
      if (index > D1_MAX_BOUND_PARAMETERS) {
        throw new Error(`d1: $${index} exceeds D1's ${D1_MAX_BOUND_PARAMETERS} bound parameters per statement`);
      }
      highest = Math.max(highest, index);
      out += `?${index}`;
      i = j;
      continue;
    }

    out += ch;
    i += 1;
  }

  if (params.length > highest) {
    throw new Error(
      `d1: ${params.length} parameter(s) supplied but the statement references only ${highest}`,
    );
  }
  return { text: out, values: params.slice(0, highest) };
}

/** D1 binds JS primitives only. Anything richer (Date, plain object, array —
 *  the JSON columns this schema stores as TEXT) is normalized here so callers
 *  keep writing natural values. Booleans become 0/1: SQLite has no boolean.
 *  (Verbatim from cirrus, with the Date case routed through `toInstant`.) */
export function toBindValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return toInstant(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/**
 * THE ONE TIMESTAMP FORMAT. Every instant this schema stores is TEXT in
 * exactly `YYYY-MM-DDTHH:MM:SS.sssZ` (UTC, milliseconds, 24 bytes), which is
 * what `Date#toISOString` produces and what
 * `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` produces. In that one format the
 * LEXICAL order of the text is the TIME order of the instants, so `<`, `>=`,
 * `ORDER BY` and an index over the column all mean what they meant on
 * `timestamptz` — and in no other format do they: `…:00Z` sorts AFTER
 * `…:00.500Z` (`Z` is 0x5A, `.` is 0x2E).
 *
 * So every instant is normalised HERE before it is bound, and the schema's
 * CHECKs refuse any stored value that is not in the format.
 *
 * Precision: milliseconds. Postgres keeps microseconds; the JS side of this
 * product never had them (every instant it reads is a `Date` or an ISO string
 * from one), and V8 truncates the extra digits, as pglite does. The one
 * observable difference is two instants in the same millisecond: distinct on
 * Postgres, equal here.
 */
export function toInstant(value: string | number | Date): string {
  const at = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(at)) throw new Error(`d1: not an instant: ${String(value)}`);
  const text = new Date(at).toISOString();
  // Years outside 0000–9999 render as `+010000-…`, which is not the format and
  // would sort wrongly against every other row.
  if (text.length !== 24) throw new Error(`d1: instant outside the four-digit years: ${text}`);
  return text;
}

/** `toInstant` for a value that may be absent. */
export function toInstantOrNull(value: string | number | Date | null | undefined): string | null {
  return value === null || value === undefined ? null : toInstant(value);
}
