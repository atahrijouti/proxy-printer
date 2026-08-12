// DB schema for the Typst printer — aligned to docs/goal.md, but its styles speak Typst.
//
// A card is `id` + base `image` + an ordered `overlays` array (painter's order). Each
// overlay is one typed primitive referencing a named style. A style is a thin set of
// PRINTER DIRECTIVES (which engine element, uppercase) around open, FORWARDED arg-dicts —
// `text` / `box` / `image` / `highlight` — spliced straight into the matching Typst call.
// The printer never enumerates those arg names; add one in the DB, no printer change.

export type Args = Record<string, unknown>

export interface Style {
  kind?: "line" | "block" // printer directive: single line vs a wrapped box
  uppercase?: boolean // printer directive: wrap content in #upper
  place?: { dx?: string; dy?: string; alignment?: string } // #place(alignment, dx, dy)
  box?: Args // forwarded to #box(...) (block styles: width/height/inset/…)
  align?: string // #align(<keyword>) inside the box (e.g. "horizon")
  text?: Args // forwarded to #text(...)
  highlight?: Args // forwarded to #highlight(...) — the run background
}

export type Abbreviation =
  { type: "image"; src: string; height: string; baseline: string } | { type: "text"; value: string }

export type Overlay =
  | { type: "image"; src: string }
  | { type: "shape"; style: string }
  | { type: "text"; style: string; content: string | string[]; size?: string }

export interface Card {
  id: string
  image: string
  overlays?: Overlay[]
}

export interface Presentation {
  fonts: string[] // font file URLs, preloaded into the Typst compiler
  styles: Record<string, Style>
  abbreviations: Record<string, Abbreviation>
}

export interface DB {
  name?: string
  cardBack?: string
  presentation: Presentation
  cards: Card[]
}
