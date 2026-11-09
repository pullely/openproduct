// The log vocabulary, enforced (openproduct-operations OO2).
//
// The way `SweepPhaseName` is pinned: a `console.warn` / `console.error` /
// structured `console.log` in the gateway or in core whose `msg` is not in
// `LOG_MESSAGES` fails here — and so does an entry in `LOG_MESSAGES` that no
// source emits, and a line that names a field the vocabulary does not.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LOG_MESSAGES, LOG_MESSAGE_NAMES, isLogMessage } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
// OO1 — the synthetic is a third source. It is its own worker (OO-1) and
// its lines are the alert's raw material, so they are held to the same list.
const ROOTS = [
  resolve(__dirname, "../../../gateway/src"),
  resolve(__dirname, "../../../core/src"),
  resolve(__dirname, "../../../infra/synthetic/src"),
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

interface Line {
  file: string;
  method: string;
  msg: string | null;
  literal: string;
}

/** Every `console.<method>(` call, with the object literal it stringifies. */
function consoleLines(): Line[] {
  const out: Line[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const source = readFileSync(file, "utf-8");
      const re = /console\.(warn|error|log|info|debug)\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(source)) !== null) {
        // The argument, up to the matching close of the call.
        let depth = 1;
        let i = re.lastIndex;
        for (; i < source.length && depth > 0; i += 1) {
          if (source[i] === "(") depth += 1;
          else if (source[i] === ")") depth -= 1;
        }
        const literal = source.slice(re.lastIndex, i - 1);
        const msg = /msg:\s*"([^"]+)"/.exec(literal);
        out.push({ file: file.slice(file.indexOf("apps/")), method: m[1]!, msg: msg ? msg[1]! : null, literal });
      }
    }
  }
  return out;
}

describe("OO2 — every structured line the gateway and core emit is in the vocabulary", () => {
  const lines = consoleLines();

  it("finds the lines at all, so an empty walk cannot pass", () => {
    expect(lines.length).toBeGreaterThan(12);
  });

  it("every console line carries a `msg`, and every `msg` is in the list", () => {
    const bare = lines.filter((l) => l.msg === null).map((l) => `${l.file}: console.${l.method}(${l.literal.slice(0, 60)}…)`);
    expect(bare).toEqual([]);
    const unknown = lines.filter((l) => l.msg !== null && !isLogMessage(l.msg)).map((l) => `${l.file}: ${l.msg}`);
    expect(unknown).toEqual([]);
  });

  it("every entry in the list is emitted by some source — no stale vocabulary", () => {
    const emitted = new Set(lines.map((l) => l.msg));
    const stale = LOG_MESSAGE_NAMES.filter((name) => !emitted.has(name));
    expect(stale).toEqual([]);
  });

  it("a line's level is the vocabulary's, every field it carries is named, and every named field is carried somewhere", () => {
    const wrong: string[] = [];
    const carried = new Map<string, Set<string>>();
    for (const line of lines) {
      if (line.msg === null || !isLogMessage(line.msg)) continue;
      const kind = LOG_MESSAGES[line.msg];
      const fields = kind.fields as readonly string[];
      const level = /level:\s*"([a-z]+)"/.exec(line.literal)?.[1] ?? null;
      if (level !== kind.level) wrong.push(`${line.file}: ${line.msg} logs at ${level}, vocabulary says ${kind.level}`);
      // The keys of the object literal: `key:` and shorthand `key,` / `key }`.
      // A key sits after `{` or `,`; an identifier after `: ` is a value.
      const keys = [...line.literal.matchAll(/(?:^|[{,])\s*([a-zA-Z]+)\s*(?=[:,}])/g)]
        .map((m) => m[1]!)
        .filter((k) => !["level", "msg"].includes(k) && !/^(JSON|stringify|String|Error|Date|now|instanceof|null|undefined)$/.test(k) && !/[A-Z]/.test(k[0]!));
      const seen = carried.get(line.msg) ?? new Set<string>();
      for (const key of new Set(keys)) {
        seen.add(key);
        if (!fields.includes(key)) wrong.push(`${line.file}: ${line.msg} carries ${key}, which the vocabulary does not name`);
      }
      carried.set(line.msg, seen);
    }
    for (const name of LOG_MESSAGE_NAMES) {
      const seen = carried.get(name) ?? new Set<string>();
      for (const field of LOG_MESSAGES[name].fields as readonly string[]) {
        if (!seen.has(field)) wrong.push(`${name} names ${field}, which no line carries`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
