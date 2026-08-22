import { parseMarkup } from "./markup"
import type { Overlay, Style, Symbols } from "./types"

type TextOverlay = Extract<Overlay, { type: "text" }>

export type Span = { style: Style; text: string } | { style: Style; symbolUrl: string }
export type Paragraph = Span[]

export interface ComposedText {
  mode: "inline" | "block"
  content: Paragraph[]
  style: Style
  boxXMm: number
  boxYMm: number
  boxWidthMm: number
  boxHeightMm: number
}

export function composeText(
  overlay: TextOverlay,
  styles: Record<string, Style>,
  symbols: Symbols,
): ComposedText {
  const base = styles[overlay.style]
  if (!base) throw new Error(`unknown style: "${overlay.style}"`)
  const mode = base.mode === "block" ? "block" : "inline"

  const raw = (Array.isArray(overlay.content) ? overlay.content : [overlay.content]).filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  )
  const markups = mode === "block" ? raw : [raw.join(" ")]
  const content = markups.map((markup) => composeParagraph(markup, base, styles, symbols))

  return {
    mode,
    content,
    style: base,
    boxXMm: base.box?.x ?? 0,
    boxYMm: base.box?.y ?? 0,
    boxWidthMm: base.box?.w ?? 0,
    boxHeightMm: base.box?.h ?? 0,
  }
}

function composeParagraph(
  markup: string,
  base: Style,
  styles: Record<string, Style>,
  symbols: Symbols,
): Paragraph {
  const spans: Span[] = []
  for (const node of parseMarkup(markup)) {
    const style = mergeStyleNames(base, node.styles, styles)
    if (node.type === "symbol") {
      const symbolUrl = symbols[node.id]
      if (!symbolUrl) {
        console.warn(`unknown symbol: {sym ${node.id}}`)
        continue
      }
      spans.push({ style, symbolUrl })
    } else {
      spans.push({ style, text: node.text })
    }
  }
  return spans
}

const mergeStyleNames = (base: Style, names: string[], styles: Record<string, Style>): Style =>
  names.reduce((merged, name) => {
    const style = styles[name]
    if (!style) console.warn(`unknown style: "${name}"`)
    return { ...merged, ...style }
  }, base)
