// Types for the canvas2d printer: the DB schema and the inline content model it embeds.
//
// A text overlay's `content` is `{t <style> …}` / `{abbr <name>}` markup (a string, or a string[]
// of paragraphs). `compose.ts` parses it (via `parseMarkup`), resolves style-names against `styles`
// and abbreviations against `abbreviations`, and hands structured spans to the `flow.ts` layout
// engine — see those files for the pipeline and the layout rules.

// a measurement with a unit, resolved to device px by lengthToPx
export type Length = string // "3.5mm" | "6px" | "2pt"
export type StyleName = string // key of a style in the presentation's styles registry

// Length-bearing types are parameterized by how a length is represented: `Length` (mm/px/pt
// strings) while authored, `number` (device px) after `resolvePresentation` scales them.
export interface Background<L = Length> {
  fill: string
  outset?: { top?: L; right?: L; bottom?: L; left?: L }
  corners?: { topLeft?: L; topRight?: L; bottomRight?: L; bottomLeft?: L }
}

export interface Margin<L = Length> {
  before?: L
  after?: L
}

// core text properties every renderer honours (a named style is TextStyle + positioning)
export interface TextStyle<L = Length> {
  fontFamily?: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  fontSize?: L
  color?: string
  opacity?: number
  letterSpacing?: L
  uppercase?: boolean
  background?: Background<L>
  margin?: Margin<L>
}

export type Overlay =
  | { type: "image"; src: string }
  | { type: "shape"; style: StyleName }
  | { type: "text"; style: StyleName; content: string | string[] }

// a named style is a TextStyle plus where and how it is placed on the card
export interface Style<L = Length> extends TextStyle<L> {
  mode?: "inline" | "block"
  box?: { x?: L; y?: L; w?: L; h?: L }
  align?: "left" | "center"
  valign?: "top" | "center"
  lineHeight?: number
  paragraphGap?: L
}

// the same model after lengths have been resolved to device px
export type ResolvedBackground = Background<number>
export type ResolvedTextStyle = TextStyle<number>
export type ResolvedStyle = Style<number>

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
