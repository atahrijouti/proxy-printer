# printer/ boundary

- **Imposition chunks the card list into pages.** `paginate` moves out of
  `app/document.tsx` into `printer/imposition.ts`. `document.tsx` and `pdf.ts` receive
  pages and just render them — neither redoes the chunking (`pdf.ts` stops deriving
  slots from a flat index). `CARDS_PER_PAGE` comes off the barrel.
- **`render.ts` stops threading the whole `DB`.** `renderCard` and `rasterizeText` take
  `styles` and `symbols` directly instead of `db`.
- **Leaf functions take the field they use, not the whole `Environment`.**
  `colorFromHex`, `ckFontWeight`, `capHeightPx` and `symbolAspect` take `ck` /
  `capRatios` / `symbolSources`. Chain-carriers (`layoutText` → `layoutBlockText` →
  `buildParagraph` → `layoutSpan`, `placeParagraph`) keep taking the struct, so no
  parameter drilling — call sites read `environment.capRatios`. `symbolImageForHeight`
  and `rasterizeSvg` keep the struct: they need several fields. No grouping
  (item rejected); `Environment` stays flat.
- **`environment.ts` keeps only load-time work.** Wasm init, font registration,
  cap-ratio probing, symbol source loading, `loadEnvironment`. The draw-time helpers
  each follow their only caller:
  - `symbolImageForHeight` → `render.ts`, and `rasterizeSvg` + `bucketedHeightPx`
    follow it there since it is their only caller.
  - `symbolAspect` → `text-layout.ts`; one-line lookup.
  - `colorFromHex` → `printer/ck-utils.ts`.

  The `rasters` cache stays a field on `Environment`, initialised by `loadEnvironment`
  and read from `render.ts` — same as `capRatios` is read from `text-layout.ts`.
