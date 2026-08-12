// DB schema for the SVG printer — aligned to docs/goal.md.
//
// A card is `id` + base `image` + an ordered `overlays` array drawn in painter's order
// (first element on the base image, each next on top). Each overlay is one typed
// primitive — image / shape / text — referencing a named style in `presentation.styles`.
// The renderer is domain-agnostic: it knows the three primitives, named styles, and the
// {t}/{abbr} inline markup — never game concepts like "keyword" or "trait". The frame
// (card size, corner radius, page, grid) is owned by the printer, not the DB.

export type Length = string // "63mm" | "0.92em" | "6px"

export interface FontFaceSource {
  family: string
  weight?: number
  style?: "normal" | "italic"
  src: string
}

// A background box — drawn behind a styled run (the keyword pill) or as a standalone
// `shape` overlay. Generic: any style that declares it gets it, no special-casing.
export interface BackgroundStyle {
  fill: string
  padding?: string // "top right bottom left" shorthand, em-relative
  bleedLeft?: Length // extend the box left of the text without shifting the text
  corners?: { topLeft?: Length; topRight?: Length; bottomRight?: Length; bottomLeft?: Length }
  hug?: "cap" | "line" // fit the box to the cap height or the full line height
}

// A named style: text properties plus optional positioning. Overlay-level styles
// (referenced by a text/shape overlay) carry `box`/`kind`; inline styles (referenced by
// {t NAME …}) carry only text properties.
export interface Style {
  font?: string
  weight?: number
  style?: "normal" | "italic"
  size?: Length
  color?: string
  opacity?: number
  letterSpacing?: Length
  uppercase?: boolean
  background?: BackgroundStyle
  // positioning — present on overlay-level styles only
  kind?: "line" | "block"
  box?: { x?: Length; y?: Length; w?: Length; h?: Length }
  align?: "left" | "center" // horizontal (line styles)
  valign?: "top" | "center" // vertical (block styles)
  trim?: "cap" | "baseline" // where the text sits relative to box.y
  lineHeight?: number
  paragraphGap?: Length
}

// An abbreviation ({abbr NAME}) expands to registered content: an inline symbol image
// (sized em-relative to the surrounding text) or a literal text expansion.
export type Abbreviation =
  { type: "image"; src: string; height: Length; baseline: Length } | { type: "text"; value: string }

// One typed overlay, drawn in the array's order (painter's order).
export type Overlay =
  | { type: "image"; src: string }
  | { type: "shape"; style: string }
  | { type: "text"; style: string; content: string | string[]; size?: Length } // size: per-card override

export interface Card {
  id: string
  image: string
  overlays?: Overlay[]
}

export interface Presentation {
  fonts: FontFaceSource[]
  styles: Record<string, Style>
  abbreviations: Record<string, Abbreviation>
}

export interface DB {
  name?: string
  cardBack?: string
  presentation: Presentation
  cards: Card[]
}
