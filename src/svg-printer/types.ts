// DB schema for the SVG printer — the unified schema (shared with the canvas2d and
// skia printers): CSS-named text properties, a style registry, and a {sym} symbol
// registry of plain URLs.
//
// A card is `id` + base `image` + an ordered `overlays` array drawn in painter's order
// (first element on the base image, each next on top). Each overlay is one typed
// primitive — image / shape / text — referencing a named style in `presentation.styles`.
// The renderer is domain-agnostic: it knows the three primitives, named styles, and the
// {t}/{sym} inline markup — never game concepts like "keyword" or "trait". The frame
// (card size, corner radius, page, grid) is owned by the printer, not the DB.

export type Length = string // "63mm" | "0.92em" | "6px"

export interface FontFaceSource {
  fontFamily: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  src: string
}

// A background box — drawn behind a styled run (the ability-name pill) or as a standalone
// `shape` overlay. `outset` extends the box beyond the text on each side; `corners` rounds
// it. Generic: any style that declares it gets it, no special-casing.
export interface BackgroundStyle {
  fill: string
  outset?: { top?: Length; right?: Length; bottom?: Length; left?: Length }
  corners?: { topLeft?: Length; topRight?: Length; bottomRight?: Length; bottomLeft?: Length }
}

// A named style: text properties plus optional positioning. Overlay-level styles
// (referenced by a text/shape overlay) carry `box`/`mode`; inline styles (referenced by
// {t NAME …}) carry only text properties.
export interface Style {
  fontFamily?: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  fontSize?: Length
  color?: string
  opacity?: number
  letterSpacing?: Length
  uppercase?: boolean
  background?: BackgroundStyle
  margin?: { before?: Length; after?: Length } // inline flow gap before/after the run
  // positioning — present on overlay-level styles only
  mode?: "inline" | "block"
  box?: { x?: Length; y?: Length; w?: Length; h?: Length }
  align?: "left" | "center" // horizontal (inline styles)
  valign?: "top" | "center" // vertical (block styles)
  lineHeight?: number
  paragraphGap?: Length
}

// One typed overlay, drawn in the array's order (painter's order).
export type Overlay =
  | { type: "image"; src: string }
  | { type: "shape"; style: string }
  | { type: "text"; style: string; content: string | string[] }

export interface Card {
  id: string
  image: string
  overlays?: Overlay[]
}

// How the DB's text looks: the faces to load and the named styles that reference them.
export interface Presentation {
  fonts: FontFaceSource[]
  styles: Record<string, Style>
}

// Content, not presentation: `{sym NAME}` → the URL of an image substituted inline into
// text. This registry exists for that one purpose — it is never drawn as an overlay of
// its own, which is why it sits beside `presentation` rather than inside it.
export type Symbols = Record<string, string>

export interface DB {
  name?: string
  cardBack?: string
  presentation?: Presentation
  symbols?: Symbols
  cards: Card[]
}
