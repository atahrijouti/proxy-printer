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

// Content, not presentation: `{sym NAME}` → the URL of an image substituted inline into
// text. This registry exists for that one purpose — it is never drawn as an overlay of
// its own, which is why it sits beside `presentation` rather than inside it.
export type Symbols = Record<string, string>

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
}

export interface DB {
  name?: string
  cardBack?: string
  presentation?: Presentation
  symbols?: Symbols
  cards: Card[]
}
