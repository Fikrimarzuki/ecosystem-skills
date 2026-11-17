# Self-hosted fonts (ES28)

Imported by `src/index.css` with `@font-face`. Vite fingerprints them into `assets/`, so the service worker precaches
them with the rest of the app shell and they work offline from the first visit. Nothing is requested from a font CDN at
build time or at runtime.

| File                                 | Family                | Style  | Weight | Bytes  | SHA-256 (first 12) |
| ------------------------------------ | --------------------- | ------ | ------ | ------ | ------------------ |
| `AtkinsonHyperlegible-Regular.woff2` | Atkinson Hyperlegible | normal | 400    | 17,208 | `d64ba838ef54`     |
| `AtkinsonHyperlegible-Bold.woff2`    | Atkinson Hyperlegible | normal | 700    | 17,524 | `140e2bd25a73`     |

Total: 34,732 bytes (budget: 80 KB, checked by `src/es28.test.tsx`).

## Source

Copied unchanged on 2026-11-16 from the owner's `web-learning` project (`src/app/fonts/`), whose README records them as
downloaded on 2026-10-15 from the Google Fonts CSS2 API, "latin" subset (U+0000–00FF, U+0131, U+0152–0153,
U+02BB–02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000–206F, U+20AC, U+2122, U+2191, U+2193, U+2212,
U+2215, U+FEFF, U+FFFD). English and Indonesian need only basic Latin. Characters outside the subset (for example `→`
or `⚠`) fall back to the system font in the stack.

## Licence

SIL Open Font License 1.1, with no Reserved Font Name, which permits self-hosting and subsetting. The licence text
ships alongside the files: `OFL-AtkinsonHyperlegible.txt` (Copyright 2020 Braille Institute of America, Inc.).

## Loading without layout shift

`font-display: optional` plus a `<link rel="preload">` for both files (added to the built `index.html` by
`vite.config.ts`). If a font is not ready almost immediately, the page keeps the system font for that view instead of
swapping and reflowing; the cached font is used on the next view.
