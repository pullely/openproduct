// Splitting the slice migration into statements, and the slice's table list
// (openproduct-standalone OPN). Workers-safe: no node:* — the D1 probe Worker
// (infra/d1-probe) applies the migration through its binding with this same
// splitter, so the file it applies is byte-for-byte the one tests apply.
//
// `wrangler d1 migrations apply` splits a migration file itself. D1's own
// `exec()` cannot: it splits on newlines, so a multi-line CREATE TABLE fails
// as "incomplete input" (verified on local workerd). This splitter is
// literal- and comment-aware, and aware that a CREATE TRIGGER body holds `;`
// up to its END.

/** Split a SQL file into statements: comments dropped, literals respected. */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      current += ch;
      i += 1;
      while (i < sql.length) {
        const c = sql[i]!;
        current += c;
        i += 1;
        if (c === ch) {
          if (sql[i] === ch) {
            current += ch;
            i += 1;
            continue;
          }
          break;
        }
      }
      continue;
    }
    if (ch === ";") {
      const statement = current.trim();
      // A trigger's body is `BEGIN stmt; stmt; END` — only the `;` after END ends it.
      if (/^CREATE\s+TRIGGER\b/i.test(statement) && !/\bEND$/i.test(statement)) {
        current += ch;
        i += 1;
        continue;
      }
      if (statement.length > 0) out.push(statement);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim().length > 0) out.push(current.trim());
  return out;
}

/** The slice's tables, children first — the order they can be dropped in. */
export const SLICE_TABLES_CHILDREN_FIRST: readonly string[] = [
  "search_index_terms",
  "catalog_cards",
  "metrics",
  "product_media",
  "role_openings",
  "search_index",
  "search_index_state",
  "catalog_state",
  "profiles",
];
