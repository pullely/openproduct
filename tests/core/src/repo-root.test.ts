// Nothing in this repository reaches above its own root (openproduct-standalone
// design §2, OPN1).
//
// ─── WHY THIS IS A TEST AND NOT A HABIT ───────────────────────────────────
//
// This tree was `apps/openproduct/` inside a monorepo, and every regression
// since the cut was first tried (August 2026) came the same way: a path that
// walked up past `apps/openproduct/` into the monorepo and found something
// there. `web/next.config.mjs` traced from three levels up, so OpenNext failed;
// five suites rooted themselves at the monorepo and read its manifests; a test
// read a budget out of the monorepo's specs; tsconfig mapped six `@saas/*`
// aliases onto platform packages. Inside the monorepo each of those resolved,
// so nothing failed until the tree stood alone.
//
// ─── WHAT IT CHECKS ───────────────────────────────────────────────────────
//
// Every file git knows about (tracked, or untracked and not ignored), read as
// text:
//   - every `../` chain, resolved against the file's own directory: imports,
//     requires, fs reads, `__dirname` / `import.meta.url` walks, `new URL(…)`,
//     markdown links, package scripts. `resolve(here, "..", "..")` is read as
//     one chain. Jest's `<rootDir>` is the package's own directory;
//   - nested `dirname(dirname(…))` walks from a module's own path;
//   - `link:` versions in pnpm-lock.yaml, against the importer that owns them;
//   - tsconfig `extends`, `paths` (against `baseUrl`), `include` and
//     `references`;
//   - component.yaml `path` (against the root), and `workspaceDir` and
//     `appDir` (against the component's path). `workspaceDir` must be the
//     root itself: the compositions install and build from it.
//
// It reads text rather than resolving modules, so it is a floor, not a proof:
// a path assembled at run time from pieces it cannot see would pass. Every
// reach found since August was a literal.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Directories a filesystem walk never enters (git ignores them anyway). */
const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".next", ".open-next", ".turbo", ".wrangler", "coverage", ".orun"]);
const TEXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|ya?ml|md|tf|css|sh|toml|txt|html)$/;

/** Every file git would commit: tracked, or untracked and not ignored. */
function repoFiles(): string[] {
  try {
    return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: ROOT,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\0")
      .filter((f) => f.length > 0 && existsSync(resolve(ROOT, f)));
  } catch {
    // No git (a tarball of the tree): walk it instead.
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue;
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else out.push(relative(ROOT, full).split(sep).join("/"));
      }
    };
    walk(ROOT);
    return out;
  }
}

type Reach = { file: string; line: number; path: string; resolved: string };

/** Root-relative and normalised; starts with `..` when it left the root. */
function within(fromDir: string, path: string): string {
  return posix.normalize(posix.join(fromDir === "" ? "." : fromDir, path));
}
const escapes = (resolved: string) => resolved === ".." || resolved.startsWith("../");

/** A `../` chain not preceded by a word, a dot or a slash (so `a/../b` is not one). */
const CHAIN = /(?<![\w.\/<>${}])(\.\.(?:\/\.\.)*)(?=\/|["'`\s),\]]|$)/g;
/** `"..", ".."` — separate path arguments, read as one chain. */
const ARGS = /(["'`])\.\.(?:\/\.\.)*\/?\1(?:\s*,\s*(["'`])\.\.(?:\/\.\.)*\/?\2)+/g;
/** `dirname(dirname(` …, the walk that names no `..` at all. */
const DIRNAME_WALK = /\b(?:path\.)?dirname\((?:\s*(?:path\.)?dirname\()+/g;

/** The `../` chains, `..` argument runs and dirname walks in one file. */
function chainsIn(file: string, text: string): Reach[] {
  const dir = posix.dirname(file) === "." ? "" : posix.dirname(file);
  // Jest's `<rootDir>` (in package.json) is the package's own directory, and
  // a template literal's `${__dirname}/` is the module's: either way the chain
  // that follows is relative to this file's directory.
  const source = (file.endsWith("package.json") ? text.replaceAll("<rootDir>/", "") : text).replace(
    /\$\{\s*__dirname\s*\}\//g,
    "",
  );
  const found: Reach[] = [];
  source.split("\n").forEach((content, i) => {
    const seen = new Set<string>();
    const add = (path: string) => {
      const resolved = within(dir, path);
      if (escapes(resolved) && !seen.has(path)) {
        seen.add(path);
        found.push({ file, line: i + 1, path, resolved });
      }
    };
    for (const m of content.matchAll(ARGS)) add(m[0].replace(/["'`\s]/g, "").split(",").join("/"));
    for (const m of content.matchAll(CHAIN)) add(m[1]!);
    for (const m of content.matchAll(DIRNAME_WALK)) {
      // dirname(dirname(<this file>)) is the file's parent: depth − 1 levels up.
      const depth = (m[0].match(/dirname\(/g) ?? []).length;
      add(Array.from({ length: depth - 1 }, () => "..").join("/"));
    }
  });
  return found;
}

/** pnpm-lock.yaml's `link:` versions, each against the importer that owns it. */
function lockfileLinks(text: string): Reach[] {
  const found: Reach[] = [];
  let importer: string | null = null;
  let inImporters = false;
  text.split("\n").forEach((content, i) => {
    if (/^\S/.test(content)) inImporters = content === "importers:";
    if (!inImporters) return;
    const key = /^ {2}(\S[^:]*):\s*(\{\})?$/.exec(content);
    if (key) importer = key[1] === "." ? "" : key[1]!;
    const link = /^\s+version: link:(.+)$/.exec(content);
    if (link && importer !== null) {
      const resolved = within(importer, link[1]!);
      if (escapes(resolved)) found.push({ file: "pnpm-lock.yaml", line: i + 1, path: link[1]!, resolved });
    }
  });
  return found;
}

/** JSON with comments and trailing commas, as tsconfig allows. */
function jsonc(text: string): unknown {
  const stripped = text
    .replace(/("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (all, str: string | undefined) => str ?? "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
}

/** tsconfig `extends`, `paths` (against `baseUrl`), `include` and `references`. */
function tsconfigReaches(file: string, text: string): Reach[] {
  const dir = posix.dirname(file) === "." ? "" : posix.dirname(file);
  const config = jsonc(text) as {
    extends?: string | string[];
    include?: string[];
    references?: Array<{ path: string }>;
    compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
  };
  const found: Reach[] = [];
  const check = (base: string, path: string) => {
    if (!path.startsWith(".")) return; // a package name, resolved from node_modules
    const resolved = within(base, path);
    if (escapes(resolved)) found.push({ file, line: 0, path, resolved });
  };
  for (const ext of [config.extends ?? []].flat()) check(dir, ext);
  for (const inc of config.include ?? []) check(dir, inc.startsWith(".") ? inc : `./${inc}`);
  for (const ref of config.references ?? []) check(dir, ref.path);
  const baseUrl = within(dir, config.compilerOptions?.baseUrl ?? ".");
  for (const targets of Object.values(config.compilerOptions?.paths ?? {})) {
    for (const target of targets) check(baseUrl, target.startsWith(".") ? target : `./${target}`);
  }
  return found;
}

/** A component.yaml's active (uncommented) top-level-of-key values. */
function yamlValue(text: string, key: string): string | null {
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("#")) continue;
    const m = new RegExp(`^\\s*${key}:\\s*["']?([^"'#\\s]+)["']?\\s*(#.*)?$`).exec(line);
    if (m) return m[1]!;
  }
  return null;
}

const FILES = repoFiles();
const TEXT_FILES = FILES.filter((f) => TEXT.test(f));
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf-8");
const show = (reaches: Reach[]) => reaches.map((r) => `${r.file}:${r.line}: ${r.path} -> ${r.resolved}`);

describe("nothing reaches above the repository root", () => {
  it("finds the tree at all, so a wrong root cannot read as a pass", () => {
    expect(FILES.length).toBeGreaterThan(500);
    for (const known of ["intent.yaml", "pnpm-lock.yaml", "web/next.config.mjs", "tests/core/src/repo-root.test.ts"]) {
      expect(FILES).toContain(known);
    }
  });

  it("no file names a `../` chain, a `..` argument run or a dirname walk that leaves the root", () => {
    const reaches = TEXT_FILES.filter((f) => f !== "pnpm-lock.yaml").flatMap((f) => chainsIn(f, read(f)));
    expect(show(reaches)).toEqual([]);
  });

  it("no lockfile link leaves the root", () => {
    expect(show(lockfileLinks(read("pnpm-lock.yaml")))).toEqual([]);
  });

  it("no tsconfig extends, maps, includes or references a path above the root", () => {
    const configs = TEXT_FILES.filter((f) => /(^|\/)tsconfig[^/]*\.json$/.test(f));
    expect(configs.length).toBeGreaterThan(5);
    expect(show(configs.flatMap((f) => tsconfigReaches(f, read(f))))).toEqual([]);
  });

  it("every component's path is inside the root, and its workspaceDir IS the root", () => {
    const components = FILES.filter((f) => f.endsWith("component.yaml"));
    expect(components.length).toBeGreaterThan(8);
    const problems: string[] = [];
    for (const file of components) {
      const text = read(file);
      const path = yamlValue(text, "path") ?? posix.dirname(file);
      const at = within("", path);
      if (escapes(at) || !existsSync(resolve(ROOT, at))) problems.push(`${file}: path ${path} -> ${at}`);
      const workspaceDir = yamlValue(text, "workspaceDir");
      if (workspaceDir !== null && within(at, workspaceDir) !== ".") {
        problems.push(`${file}: workspaceDir ${workspaceDir} -> ${within(at, workspaceDir)}, not the root`);
      }
      const appDir = yamlValue(text, "appDir");
      if (appDir !== null && escapes(within(at, appDir))) problems.push(`${file}: appDir ${appDir} leaves the root`);
    }
    expect(problems).toEqual([]);
  });
});
