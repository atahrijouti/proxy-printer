export type Length = string

export interface FontFace {
  fontFamily: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  src: string
}

export interface Background {
  fill: string
  outset?: { top?: Length; right?: Length; bottom?: Length; left?: Length }
  corners?: { topLeft?: Length; topRight?: Length; bottomRight?: Length; bottomLeft?: Length }
}

export interface Style {
  fontFamily?: string
  fontWeight?: number
  fontStyle?: "normal" | "italic"
  fontSize?: Length
  color?: string
  opacity?: number
  letterSpacing?: Length
  uppercase?: boolean
  lineHeight?: number
  paragraphGap?: Length
  background?: Background
  margin?: { before?: Length; after?: Length }
  mode?: "inline" | "block"
  box?: { x?: Length; y?: Length; w?: Length; h?: Length }
  align?: "left" | "center"
  valign?: "top" | "center"
}

export type Overlay =
  | { type: "image"; src: string }
  | { type: "shape"; style: string }
  | { type: "text"; style: string; content: string | string[] }

export interface Card {
  id: string
  image: string
  overlays?: Overlay[]
}

export interface Presentation {
  fonts: FontFace[]
  styles: Record<string, Style>
  abbreviations: Record<string, string> // {abbr NAME} → inline symbol image URL
}

export interface DB {
  name?: string
  cardBack?: string
  presentation: Presentation
  cards: Card[]
}
