import type { Length, Overlay, Props } from "./model"

export interface Style extends Props {
  kind?: "line" | "block"
  box?: { x?: Length; y?: Length; w?: Length; h?: Length }
  align?: "left" | "center"
  valign?: "top" | "center"
  lineHeight?: number
  paragraphGap?: Length
}

export interface FontFace {
  family: string
  weight?: number
  style?: "normal" | "italic"
  src: string
}

export interface Presentation {
  fonts: FontFace[]
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
