# openproduct webfonts

Committed so `next build` never reaches Google Fonts and no visitor's browser
reaches a third-party host (`next/font/local` in `src/app/layout.tsx`; the wire
budget allows none). These are the three families of the redesign
(`specs/epics/openproduct-redesign/design.md` §3), as unmodified **latin**
subsets: five files, 98,664 bytes. A page fetches four of them, 75,924 bytes,
which is what `tests/web-perf` budgets (`FONTS` in `src/budgets.mjs`): Lora's
italic is declared without a preload and is fetched only by a page that sets
a quote in it.

| File | Family | Axes / weight | Bytes | Used for | Licence |
| --- | --- | --- | --- | --- | --- |
| `hanken-grotesk-latin-wght.woff2` | Hanken Grotesk | variable `wght` (declared 400–600), upright | 34,664 | every UI voice | `hanken-grotesk.OFL.txt` |
| `lora-latin-400.woff2` | Lora | static 400, upright | 21,188 | page titles | `lora.OFL.txt` |
| `lora-latin-400-italic.woff2` | Lora | static 400, italic | 22,740 | idea quotes | `lora.OFL.txt` |
| `ibm-plex-mono-latin-400.woff2` | IBM Plex Mono | static 400, upright | 10,016 | machine facts | `ibm-plex-mono.OFL.txt` |
| `ibm-plex-mono-latin-500.woff2` | IBM Plex Mono | static 500, upright | 10,056 | small uppercase labels | `ibm-plex-mono.OFL.txt` |

Weights stop at 600. IBM Plex Mono has no variable build, which is why its two
weights are two files; Lora ships 400 only, in its two styles.

All are licensed under the SIL Open Font License 1.1; the licence texts are
from `github.com/google/fonts` (`ofl/<family>/OFL.txt`).

Geist, Geist Mono and Newsreader — the faces before the redesign — left with
their licence texts when the last reference to them did (openproduct-redesign
OPR1).

To replace one, request the same family/axes from the Google Fonts CSS2 API with
a modern Chrome user agent and take the `/* latin */` block's `woff2` URL.
