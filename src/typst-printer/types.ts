export type Args = Record<string, unknown>

export interface Style {
  kind?: "line" | "block"
  uppercase?: boolean
  place?: { dx?: string; dy?: string; alignment?: string }
  box?: Args
  align?: string
  text?: Args
  highlight?: Args
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
  fonts: string[]
  styles: Record<string, Style>
  abbreviations: Record<string, Abbreviation>
}

export interface DB {
  name?: string
  cardBack?: string
  presentation: Presentation
  cards: Card[]
}
