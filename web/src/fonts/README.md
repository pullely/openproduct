# openproduct webfonts

Committed so `next build` never reaches Google Fonts (`next/font/local` in
`src/app/layout.tsx`). Each file is the unmodified **latin** subset that
`next/font/google` downloaded for the configuration the app used before, so the
three files and 74,900 bytes that `tests/web-perf` budgets (`FONTS` in
`src/budgets.mjs`) are unchanged.

| File | Family | Axes / weight | Licence |
| --- | --- | --- | --- |
| `geist-latin-wght.woff2` | Geist | variable `wght` (declared 400–600) | `geist.OFL.txt` |
| `newsreader-latin-400.woff2` | Newsreader | static 400, upright | `newsreader.OFL.txt` |
| `geist-mono-latin-wght.woff2` | Geist Mono | variable `wght` (declared 400–500) | `geist-mono.OFL.txt` |

All are licensed under the SIL Open Font License 1.1; the licence texts are
from `github.com/google/fonts` (`ofl/<family>/OFL.txt`).

To replace one, request the same family/axes from the Google Fonts CSS2 API with
a modern Chrome user agent and take the `/* latin */` block's `woff2` URL.
