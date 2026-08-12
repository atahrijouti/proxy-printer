export type Length = string

export interface FontFace {
  family: string
  src: string
}

export interface Background {
  fill: string
  padding?: string
  bleedLeft?: Length
  corners?: { topLeft?: Length; topRight?: Length; bottomRight?: Length; bottomLeft?: Length }
}

export interface Style {
  font?: string
  weight?: number
  style?: "normal" | "italic"
  size?: Length
  color?: string
  opacity?: number
  letterSpacing?: Length
  uppercase?: boolean
  lineHeight?: number
  paragraphGap?: Length
  background?: Background
  kind?: "line" | "block"
  box?: { x?: Length; y?: Length; w?: Length; h?: Length }
  align?: "left" | "center"
  valign?: "top" | "center"
}

export type Abbreviation =
  { type: "image"; src: string; height: Length; baseline: Length } | { type: "text"; value: string }

export type Overlay =
  | { type: "image"; src: string }
  | { type: "shape"; style: string }
  | { type: "text"; style: string; content: string | string[]; size?: Length }

export interface Card {
  id: string
  image: string
  overlays?: Overlay[]
}

export interface Presentation {
  fonts: FontFace[]
  styles: Record<string, Style>
  abbreviations: Record<string, Abbreviation>
}

export interface DB {
  name?: string
  cardBack?: string
  presentation: Presentation
  cards: Card[]
}
