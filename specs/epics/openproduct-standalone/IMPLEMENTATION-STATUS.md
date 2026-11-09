# openproduct-standalone (OPN) — implementation status

As-built ≠ intent. This file records what actually shipped, and every place
the code departed from `design.md`.

| Milestone | State | PR |
|---|---|---|
| OPN0 — the spec | | |
| OPN1 — the tree, with D1 proven on one slice | | |
| OPN2 — live on its own URLs, all on D1 | | |
| OPN3 — openproduct.live served from here | | |
| OPN4 — openproduct, listed on openproduct.live | | |

## Inputs

- Source: `sourceplane/orun-cloud` `origin/main` `b421bc672` (2026-11-09). The cut is re-taken at OPN-2, and that commit is the one recorded here.
- The cut script and the public-exposure audit were re-checked on 2026-11-09. Findings are in design §2 and §7.

## Estate (as created)

| Thing | Value |
|---|---|
| Account | openproduct account `ws_SMS84Q22` (account kind `openproduct`) |
| Workspace | `ws_VTNEQKAP`, `openproduct`, slug `openproduct-live`, public (2026-11-09) |
| Project and repo link | `openproduct` ← `github.com/pullely/openproduct`, allow-listed for the OIDC exchange |
| GitHub | `pullely/openproduct`, public. First commit `7475226` (README, LICENSE, .gitignore) |
| Cloudflare connection | `openproduct` (`int_7fbdaafa…`), inherited from the account |
| Epic in Orunbase | `openproduct-standalone`, EP-1 (`epc_0TXVHJ8Z`) |
| Milestones | OPN0 `mls_VEMWNC1J` · OPN1 `mls_GPBDDEE7` · OPN2 `mls_GQ855EQV` · OPN3 `mls_QJP277KN` · OPN4 `mls_GFTKS4Q0` |
| Tasks | OPN-1 `tsk_N14BB1XD` (OPN0, contract attached) |

## D1 slice proof

### Local half: done ahead of OPN1 (2026-11-09) — GO, with conditions

This ran in a scratch copy of the cut (orun-cloud `b421bc672`), outside this
repository. OPN-2 carries it into the tree.
- **Engine.** Local D1 is real workerd SQLite (miniflare `5.20261104.0-beta`).
- **Scope.** All six slice methods run on D1 behind the unchanged repository interface. The Postgres implementation and its tests are untouched.
- **Differential suite.** 41 cases (19 catalogue, 22 search), with Postgres as the oracle: **0 mismatches.** Results are compared field by field, including order, cursors, census windows, `RETURNING` counts and ISO timestamps, and the tables each method writes are compared row by row. The cases:
  - every existing test case for the slice, ported;
  - the empty or never-computed catalogue, a cursor past the end, a null-activity cursor, the four ways a listing stops being listed, and a quiet tick that writes nothing;
  - emoji, CJK and accented slugs, ordered by bytes;
  - a 5,000-document replace in two chunks, plus a forced 40-chunk run.
- **Test counts.** The db package, run alone: 649 passed, 12 opt-in skipped (the 569 existing tests plus 80 new D1 tests). The 80 D1 tests were re-run and confirmed on 2026-11-09.
- **Query plans.** EXPLAIN on D1 shows one full scan, the rebuild's read of `profiles`, which is by design. Postgres made 6 sequential scans on the same statements. D1's search is index-driven, where Postgres scanned `search_index` sequentially.

| Operation (5,000 listings) | PGlite | Local D1 |
|---|---|---|
| Catalogue rebuild, cold | 486–638 ms | 483–658 ms |
| Catalogue rebuild, quiet tick | 381–415 ms | 372–471 ms |
| Catalogue page, first or deep | 2.3 ms | 8–9 ms wall, 1–1.5 ms SQL |
| `replaceSearchIndex`, 5,000 documents, cold | 91–101 ms | 178–188 ms (7 statements, 1 batch) |
| `searchCandidates` | 0.6–2.4 ms | 3–6 ms wall, ≤ 1 ms SQL |

Local timings are not remote timings. With the factory's ~0.3 s per remote
write statement, the estimate is about 1.2–1.5 s per rebuild tick and about
2.2 s per 5,000-document replace. Both are inside design §5.3.

The incompatibilities found are now rules in design §3.3 and §3.4:
- the 32-argument function limit;
- the 50-byte pattern limit;
- REAL-bound numbers;
- `NULLS` refused in indexes;
- join order not kept;
- NUL handling;
- the missing or blocked functions.

Two of these limits (32 arguments, 2 MB per value) are not enforced by local
workerd. That is why the static remote-limits guard exists.

### Remote half: open, OPN1

The probe on stage (design §5.2) is still to run. It must show three things:
- every remote result equals local;
- the 1.3 MB, 7-statement replace batch is accepted;
- remote D1 refuses the three negative probes.

It also records the rebuild's single-writer pause. The formal go/no-go is
written here after that run.

## Departures from the design

(One subsection per departure: what the design said, what was built, why.)
