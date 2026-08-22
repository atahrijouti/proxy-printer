export type Mm = number

export interface FontFace {
  fontFamily: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  src: string
}

export interface Background {
  fill: string
  outset?: { top?: Mm; right?: Mm; bottom?: Mm; left?: Mm }
  corners?: { topLeft?: Mm; topRight?: Mm; bottomRight?: Mm; bottomLeft?: Mm }
}

export interface Style {
  fontFamily?: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  fontSize?: Mm
  color?: string
  opacity?: number
  letterSpacing?: Mm
  uppercase?: boolean
  lineHeight?: number
  paragraphGap?: Mm
  background?: Background
  margin?: { before?: Mm; after?: Mm }
  mode?: "inline" | "block"
  box?: { x?: Mm; y?: Mm; w?: Mm; h?: Mm }
  align?: "left" | "center"
  valign?: "top" | "center"
}

export type Overlay =
  | { type: "image"; src: string }
  | { type: "shape"; style: string }
  | { type: "text"; style: string; content: string | string[] }

export interface CardSpec {
  id: string
  image: string
  overlays?: Overlay[]
}

export interface Presentation {
  fonts: FontFace[]
  styles: Record<string, Style>
}

export type Symbols = Record<string, string>

export interface DB {
  name?: string
  cardBack?: string
  presentation?: Presentation
  symbols?: Symbols
  cards: CardSpec[]
}
