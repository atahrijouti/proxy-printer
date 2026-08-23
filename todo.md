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
- **`Layer` → `RenderedOverlay`, with the src kind made explicit.** Renamed to match
  `OverlaySpec` / `RenderedOverlay`. The shape becomes
  `{ type: "image" | "text"; src: string; srcType: "url" | "inline" }` — `type` keeps
  saying what the overlay is, `srcType` says how to treat `src`. `pdf.ts:20,46` branch
  on `srcType` instead of inferring it from `type`; `document.tsx:33` keeps reading
  `src` unchanged.
- **Overlay dispatch in `render.ts` becomes an exhaustive `switch`.** Replace the
  `if`/`continue`/`if`/`if` chain (`:31-41`) with a `switch` on `overlay.type` plus
  `default: overlay satisfies never`, so an unhandled kind is a compile error instead of
  a silent no-op. `flush()` moves into the `image` and `shape` cases; behaviour identical.
- **`ComposedText` carries one resolved `box` instead of four flattened fields.**
  `{ mode, content, style, box: { x, y, width, height } }`, resolved once from
  `style.box` with its defaults (`compose.ts:39-47`). Unmarked `box` — it is all mm and
  has no px twin in that struct; `text-layout.ts` reads `pixelsFromMm(composed.box.x)`.
  Spelled-out `width`/`height` rather than the schema's `w`/`h`.
- **Drop `compose.ts`'s `Paragraph` alias; alias CanvasKit's.** The alias is used twice
  (`compose.ts:12,55`), so `content: Span[][]` and `composeParagraph(): Span[]` replace
  it — consumers already name the inner array `spans` (`text-layout.ts:64,100`).
  CanvasKit's `Paragraph` gets imported as `CkParagraph`, following the `CkTextStyle`
  convention already in that file (`text-layout.ts:5`).
- **`ComposedText` → `ComposedTextOverlay`, `composeText` → `composeTextOverlay`.** Completes
  the three-phase overlay vocabulary: `OverlaySpec` (db) → `ComposedTextOverlay` (typed
  pieces) → `RenderedOverlay` (raster). `compose.ts` keeps its name — "compose" is now
  one named phase rather than a vague verb. Call sites: `render.ts:5,53`,
  `text-layout.ts:10,55`.
- **`laid` → `layoutAttempt`.** `text-layout.ts:110`, plus its reads in the shrink loop
  (`:111-113`) and at `:121-126`. `tryLayout` keeps its name.
- **`PX_PER_MM` → `RASTER_PX_PER_MM`.** `units.ts:1`. `PT_PER_MM` is a physical fact,
  `PX_PER_MM` is a chosen raster density (16 px/mm, ~406 DPI); the shared shape makes the
  choice look equally fixed. Rename only — `pixelsFromMm` and `pointsFromMm` unchanged.
- **The raw deck text is `deckSource` everywhere.** It is unvalidated text parsed line by
  line, and `deck` currently sits on both sides of that conversion — `selectFromDeck`
  takes a deck and returns a deck. Sites: `deck.ts:3,5,7` (param and its two reads);
  `imposition.ts:6,18` (the `Imposition` field); `app/create-printer.ts:34,67,77`
  (`Settings` field, debounced local, and where the `Imposition` is built);
  `app/sidebar.tsx:27` (textarea binding). `Imposition["kind"]` stays `"deck"` — that
  names the mode, not the text.

# step 2 — needs logic changes

- **Drop the hardcoded `"Bogle"` default font family.** `text-layout.ts:16` hardcodes
  `proxy-db-lorcana`'s typeface as the engine's fallback. Use the DB's own default —
  `db.fonts[0]?.fontFamily`, already computed at `environment.ts:161` but filed under
  `svgFonts` where only resvg reads it — in both places that use the literal: the
  `capRatios` lookup (`text-layout.ts:313`) and `fontFamilies` (`:356`), the latter as a
  list `[style.fontFamily, dbDefault]` so CanvasKit's own fallback does the work.
  Today a non-Bogle DB renders correct glyphs at the wrong vertical placement, because
  `capRatios` misses and every cap height becomes `FALLBACK_CAP_RATIO` 0.7.
