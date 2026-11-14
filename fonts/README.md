# Lao fonts used by Sykhai Editor (lazy-loaded from the editor's font gallery)

All fonts are free and licensed under the SIL Open Font License 1.1 (commercial use allowed).

- Formal fonts: **Noto Sans Lao**, **Noto Serif Lao**, **Noto Sans Lao Looped** (Noto Project Authors / Google) and **Phetsarath** (Google Fonts). Lao-only subsets from the Fontsource packages. License texts: `LICENSE-*.txt`.
- 44 display fonts (handwritten, script, brush, painted, traditional, fancy, stencil) by Robert Martin Campbell — https://github.com/rcampbellbassac/fonts (version 0.1xx beta, SIL OFL 1.1). Letters are derived from Noto Sans Lao / Thai / Khmer / Noto Sans. Here each file is subset to Lao + Thai + Latin + punctuation (OFL allows modification; the Reserved Font Name rules of each upstream repo's OFL.txt still apply — keep the original font names, as done here).

- Noto Sans Lao / Serif Lao / Sans Lao Looped extra weights (100, 200, 300, 500, 600, 800 — together with 400/700/900 the families have all 9 weights), subset to Lao + Latin; same OFL licence.
- The shop's own Lao fonts (219 families) are **not** in this public repo — their licences were not checked. They live on the shop server (`app/fonts/`) and the editor loads them from there.

To add a font: put `<Id>.woff2` here and add one row to `LAOFONTS` in `src/js/58-fonts.js`.
