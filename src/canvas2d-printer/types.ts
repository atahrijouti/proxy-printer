// Types for the canvas2d printer: the DB schema and the inline content model it embeds.
//
// A text overlay's `content` is {t <style> …} / {abbr <name>} markup (string, or string[] of
// paragraphs) — the same grammar every printer uses. `parseMarkup` compiles it to nodes; a node's
// effective style is the base style merged with its style-name stack, resolved against the DB's
// `styles` registry. `{abbr name}` resolves against the `abbreviations` registry to an image src.
//
// Flow rules (how nodes lay out — the self-laying-out backends share `flow.ts`):
//  1. Additive sweep: cursor += margin.before; place content; cursor += width; cursor += margin.after.
//  2. `background` draws behind the node's box, expanded by `outset` per side — never advances the
//     cursor. Spacing between nodes is `margin` (a style property), not the background.
//  3. An {abbr} image is sized to the cap-height of its font, sat on the baseline (like a capital).
//  4. A line's ascent/descent = max over its nodes.
//  5. Wrap between nodes and at spaces inside a node; a backgrounded node never splits; a leading
//     margin is dropped at a line break.
//  6. Shrink-to-fit: if the block overflows its box height, reduce the base size until it fits.

// a measurement with a unit, resolved to device px by lengthToPx
export type Length = string // "3.5mm" | "0.8em" | "6px"
export type StyleName = string // key of a style in the presentation's styles registry

export interface Background {
  fill: string
  outset?: { top?: Length; right?: Length; bottom?: Length; left?: Length }
  corners?: { topLeft?: Length; topRight?: Length; bottomRight?: Length; bottomLeft?: Length }
}

export interface Margin {
  before?: Length
  after?: Length
}

// core text properties every renderer honours (a named style is TextStyle + positioning)
export interface TextStyle {
  fontFamily?: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  fontSize?: Length
  color?: string
  opacity?: number
  letterSpacing?: Length
  uppercase?: boolean
  background?: Background
  margin?: Margin
}

export type Overlay =
  | { type: "image"; src: string }
  | { type: "shape"; style: StyleName }
  | { type: "text"; style: StyleName; content: string | string[] }

// a named style is a TextStyle plus where and how it is placed on the card
export interface Style extends TextStyle {
  mode?: "inline" | "block"
  box?: { x?: Length; y?: Length; w?: Length; h?: Length }
  align?: "left" | "center"
  valign?: "top" | "center"
  lineHeight?: number
  paragraphGap?: Length
}

export interface FontSpec {
  fontFamily: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  src: string
}

export interface Presentation {
  fonts: FontSpec[]
  styles: Record<string, Style>
  abbreviations: Record<string, string>
}

export interface Card {
  id: string
  image: string
  overlays?: Overlay[]
}

export interface DB {
  name?: string
  cardBack?: string
  presentation: Presentation
  cards: Card[]
}
