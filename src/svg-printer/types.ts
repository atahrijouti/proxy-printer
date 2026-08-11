// DB schema for the SVG printer (see docs/rendering-ideation.md).
//
// Content lives in `cards`; all geometry/styling lives in `presentation`. The
// renderer is domain-agnostic: it understands generic capabilities (a text style,
// an optional background behind a run, a role that is either a single line or a
// wrapped block) — never game concepts like "keyword" or "trait".

export type Length = string // "63mm" | "0.92em" | "6px" | "2pt"

export interface FontFaceSource {
  family: string
  weight?: number
  style?: "normal" | "italic"
  src: string
}

// A background box drawn behind a styled run (e.g. the keyword highlight). Generic:
// the renderer draws this for ANY style that declares it, with no special-casing.
export interface BackgroundStyle {
  fill: string
  padding?: string // "top right bottom left" shorthand, em-relative
  bleedLeft?: Length // extend the box left of the text without shifting the text
  corners?: { topLeft?: Length; topRight?: Length; bottomRight?: Length; bottomLeft?: Length }
  hug?: "cap" | "line" // fit the box to the cap height or the full line height
}

// Shared shape for a role's base text style and for the named entries in `styles`.
export interface TextStyle {
  font?: string
  weight?: number
  style?: "normal" | "italic"
  size?: Length
  minSize?: Length // lower bound when fit is "shrink"
  color?: string
  opacity?: number
  letterSpacing?: Length
  uppercase?: boolean
  background?: BackgroundStyle
}

export type RoleKind = "line" | "block"

export interface Role {
  kind: RoleKind
  field?: string // which card field feeds this role (defaults to the role's key)
  box: { x?: Length; y?: Length; w?: Length; h?: Length }
  align?: "left" | "center" // horizontal (line roles)
  valign?: "top" | "center" // vertical (block roles)
  trim?: "cap" | "baseline" // where the text sits relative to box.y
  fit?: "shrink" // shrink to fit box height (block roles)
  lineHeight?: number
  paragraphGap?: Length
  text: TextStyle
}

export interface SymbolDefinition {
  src: string
  height: Length // em-relative to the surrounding text size
  baseline: Length // vertical shift from the baseline, em-relative (negative = down)
}

export interface Template {
  roles: Record<string, Role>
}

export interface Presentation {
  card: { w: Length; h: Length; radius?: Length }
  fonts: FontFaceSource[]
  templates: Record<string, Template>
  styles: Record<string, TextStyle> // referenced by {style:NAME} in markup
  symbols: Record<string, SymbolDefinition> // referenced by {sym:NAME} in markup
}

export interface AbilityBlock {
  type?: string
  content: string[]
}

export interface Card {
  id: string
  template: string
  image: string
  frames?: string[]
  name?: string
  version?: string
  traits?: string
  abilities?: AbilityBlock
  [field: string]: unknown
}

export interface DB {
  name: string
  cardBack?: string
  presentation: Presentation
  cards: Card[]
}
