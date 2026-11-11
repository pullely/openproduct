// The remote D1 limits local workerd does not enforce, checked statically
// (OPN D1 slice).
//
// Local D1 enforces 100 bound parameters, 100 KB of SQL and 50-byte GLOB
// patterns (all verified in engine.test.ts). It does NOT enforce 32
// arguments per SQL function (a 34-argument json_object runs locally) or the
// 2 MB ceiling on a string value (a 3 MB parameter binds locally) — both are
// documented D1 limits that remote enforces. A test suite on local D1 alone
// would pass code that fails in production, which is exactly how the cirrus
// port's Postgres-only SQL survived (RUNBOOK trap 16). So every statement the
// D1 repository issues is recorded in tests and measured here.

import type { SqlExecutorResult, SqlRow } from "../executor.js";

import type { D1SqlExecutor, D1Statement } from "./executor.js";

export const D1_LIMITS = {
  boundParameters: 100,
  statementBytes: 100_000,
  valueBytes: 2_000_000,
  functionArguments: 32,
  likePatternBytes: 50,
} as const;

/** Words that may be followed by `(` without being a function call. */
const NOT_FUNCTIONS = new Set([
  "in", "values", "exists", "as", "on", "using", "over", "filter", "where", "and", "or", "not",
  "select", "from", "into", "key", "check", "is", "then", "else", "when", "join", "by", "set",
  "materialized", "returning", "unique", "references", "conflict", "do", "update", "insert",
  "with", "case", "end", "all", "union", "between", "limit", "offset", "group", "order", "having",
]);

/** A name after one of these opens a column list. */
const COLUMN_LIST_AFTER = new Set(["table", "exists", "into", "on", "references"]);

/** The largest argument count of any function call in `sql`, with its name. */
export function widestFunctionCall(sql: string): { name: string; args: number } {
  let widest = { name: "", args: 0 };
  // Each open paren: the function it belongs to (or null) and its comma count.
  const stack: Array<{ name: string | null; commas: number; empty: boolean }> = [];
  let i = 0;
  let lastWord = "";
  let lastWordEnd = -1;
  // The word before `lastWord`: a name after TABLE / INTO / ON / REFERENCES
  // opens a column list, not an argument list.
  let wordBefore = "";
  while (i < sql.length) {
    const ch = sql[i]!;
    if (ch === "'" || ch === '"' || ch === "`") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      i += 1;
      if (stack.length > 0) stack[stack.length - 1]!.empty = false;
      lastWord = "";
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j]!)) j += 1;
      wordBefore = lastWord === "" ? wordBefore : lastWord;
      lastWord = sql.slice(i, j);
      lastWordEnd = j;
      if (stack.length > 0) stack[stack.length - 1]!.empty = false;
      i = j;
      continue;
    }
    if (ch === "(") {
      const between = sql.slice(lastWordEnd, i);
      const isCall =
        lastWord !== "" &&
        /^\s*$/.test(between) &&
        !NOT_FUNCTIONS.has(lastWord.toLowerCase()) &&
        !COLUMN_LIST_AFTER.has(wordBefore.toLowerCase());
      if (stack.length > 0) stack[stack.length - 1]!.empty = false;
      stack.push({ name: isCall ? lastWord : null, commas: 0, empty: true });
      lastWord = "";
      i += 1;
      continue;
    }
    if (ch === ")") {
      const frame = stack.pop();
      if (frame?.name) {
        const args = frame.empty ? 0 : frame.commas + 1;
        if (args > widest.args) widest = { name: frame.name, args };
      }
      lastWord = "";
      i += 1;
      continue;
    }
    if (ch === ",") {
      if (stack.length > 0) stack[stack.length - 1]!.commas += 1;
    } else if (!/\s/.test(ch) && stack.length > 0) {
      stack[stack.length - 1]!.empty = false;
    }
    if (!/\s/.test(ch)) lastWord = "";
    i += 1;
  }
  return widest;
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export interface LimitBreach {
  readonly limit: keyof typeof D1_LIMITS;
  readonly detail: string;
  readonly statement: string;
}

/** Every remote D1 limit one statement (as the repository wrote it, `$n` form) would break. */
export function remoteLimitBreaches(statement: D1Statement): LimitBreach[] {
  const out: LimitBreach[] = [];
  const head = statement.text.replace(/\s+/g, " ").trim().slice(0, 120);
  const bytes = utf8Bytes(statement.text);
  if (bytes > D1_LIMITS.statementBytes) out.push({ limit: "statementBytes", detail: `${bytes} bytes`, statement: head });
  const numbers = [...statement.text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  const highest = numbers.length > 0 ? Math.max(...numbers) : 0;
  if (highest > D1_LIMITS.boundParameters) out.push({ limit: "boundParameters", detail: `$${highest}`, statement: head });
  for (const value of statement.params ?? []) {
    if (typeof value === "string" && utf8Bytes(value) > D1_LIMITS.valueBytes) {
      out.push({ limit: "valueBytes", detail: `${utf8Bytes(value)}-byte parameter`, statement: head });
    }
  }
  const widest = widestFunctionCall(statement.text);
  if (widest.args > D1_LIMITS.functionArguments) {
    out.push({ limit: "functionArguments", detail: `${widest.name}() takes ${widest.args}`, statement: head });
  }
  return out;
}

/** An executor that keeps every statement it ran (batches flattened) for `remoteLimitBreaches`. */
export function recordingD1Executor(inner: D1SqlExecutor): { sql: D1SqlExecutor; statements: D1Statement[] } {
  const statements: D1Statement[] = [];
  const sql: D1SqlExecutor = {
    async execute<T extends SqlRow = SqlRow>(text: string, params?: unknown[]): Promise<SqlExecutorResult<T>> {
      statements.push({ text, params: params ?? [] });
      return inner.execute<T>(text, params);
    },
    async batch(list: readonly D1Statement[]) {
      statements.push(...list);
      return inner.batch(list);
    },
  };
  return { sql, statements };
}
