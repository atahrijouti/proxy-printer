// Domain glue between the DB and the canvaskit layout engine. It parses `{t}`/`{abbr}`
// markup, resolves style-names against the presentation and abbreviations into inline
// symbol URLs, and derives the block box — all in millimetres, with no canvaskit types.
// layout.ts turns this into a positioned canvaskit paragraph; render.ts draws it.

import { parseMarkup } from "./markup"
import type { Overlay, Style } from "./types"
import { toMillimetres } from "./units"

type TextOverlay = Extract<Overlay, { type: "text" }>

// one span of a paragraph: styled text, or an inline symbol (its resolved image URL)
export type Span = { style: Style; text: string } | { style: Style; symbolSrc: string }
export type Paragraph = Span[]

export interface ComposedText {
  mode: "inline" | "block"
  content: Paragraph[]
  style: Style // the block's base style (font, align, valign, lineHeight, paragraphGap)
  boxXMm: number
  boxYMm: number
  boxWidthMm: number
  boxHeightMm: number
}

export function composeText(
  overlay: TextOverlay,
  styles: Record<string, Style>,
  abbreviations: Record<string, string>,
): ComposedText {
  const base = styles[overlay.style]
  if (!base) throw new Error(`unknown style: "${overlay.style}"`)
  const mode = base.mode === "block" ? "block" : "inline"

  const raw = (Array.isArray(overlay.content) ? overlay.content : [overlay.content]).filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  )
  // a block wraps each paragraph; an inline style is a single line, so join first
  const markups = mode === "block" ? raw : [raw.join(" ")]
  const content = markups.map((markup) => composeParagraph(markup, base, styles, abbreviations))

  return {
    mode,
    content,
    style: base,
    boxXMm: toMillimetres(base.box?.x),
    boxYMm: toMillimetres(base.box?.y),
    boxWidthMm: toMillimetres(base.box?.w),
    boxHeightMm: toMillimetres(base.box?.h),
  }
}

function composeParagraph(
  markup: string,
  base: Style,
  styles: Record<string, Style>,
  abbreviations: Record<string, string>,
): Paragraph {
  const spans: Span[] = []
  for (const node of parseMarkup(markup)) {
    const style = mergeStyleNames(base, node.styles, styles)
    if (node.type === "abbr") {
      const symbolSrc = abbreviations[node.id]
      if (!symbolSrc) {
        console.warn(`unknown abbreviation: {abbr ${node.id}}`)
        continue
      }
      spans.push({ style, symbolSrc })
    } else {
      spans.push({ style, text: node.text })
    }
  }
  return spans
}

// merge a base style with the {t NAME} style-names active over a span, left to right
const mergeStyleNames = (base: Style, names: string[], styles: Record<string, Style>): Style =>
  names.reduce((merged, name) => {
    const style = styles[name]
    if (!style) console.warn(`unknown style: "${name}"`)
    return { ...merged, ...style }
  }, base)
