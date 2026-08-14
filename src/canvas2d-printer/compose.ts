// Domain glue between our DB/style model and the Flow text-layout library: it parses `{t}`/`{abbr}`
// markup, resolves style-names and abbreviations against the presentation, maps our resolved styles
// into Flow spans, and derives the block style + box + draw origin. Everything markup- or
// registry-shaped lives here, so Flow itself stays a plain text-layout engine.

import { parseMarkup } from "./markup"
import type { BlockStyle, Box, Paragraph, Span, SpanStyle } from "./flow"
import type { ResolvedPresentation } from "./resolve"
import type { ResolvedTextStyle } from "./types"

const MIN_FONT_RATIO = 0.6
const UNBOUNDED = Infinity

export interface Composed {
  content: Paragraph[]
  box: Box
  style: BlockStyle
  originX: number
  originY: number
}

export function composeText(
  styleName: string,
  paragraphs: string[],
  presentation: ResolvedPresentation,
  imageAspect: (src: string) => number,
  cardWidth: number,
): Composed {
  const base = presentation.styles[styleName]
  if (!base) throw new Error(`unknown style: "${styleName}"`)
  const isBlock = base.mode === "block"
  const fontSize = base.fontSize ?? presentation.defaultFontSize

  const style: BlockStyle = {
    ...toSpanStyle(base),
    fontSize,
    align: base.align ?? "left",
    valign: base.valign ?? "top",
    lineHeight: base.lineHeight ?? 1,
    paragraphGap: base.paragraphGap ?? 0,
    minFontSize: fontSize * MIN_FONT_RATIO,
  }

  const content: Paragraph[] = paragraphs.map((markup) => {
    const spans: Span[] = []
    for (const node of parseMarkup(markup)) {
      const style = toSpanStyle(mergeStyleNames(node.styles, presentation.styles))
      if (node.type === "abbr") {
        const src = presentation.abbreviations[node.id]
        if (!src) console.warn(`unknown abbreviation: "${node.id}"`)
        spans.push({ image: { src, aspect: imageAspect(src) }, style })
      } else {
        spans.push({ text: node.text, style })
      }
    }
    return spans
  })

  const box: Box = {
    width: isBlock ? (base.box?.w ?? 0) : base.align === "center" ? cardWidth : UNBOUNDED,
    height: isBlock ? (base.box?.h ?? 0) : UNBOUNDED,
  }
  const originX = isBlock || base.align !== "center" ? (base.box?.x ?? 0) : 0
  const originY = base.box?.y ?? 0

  return { content, box, style, originX, originY }
}

// resolve a style-name stack against the registry, with no base — the span's overrides only,
// so Flow inherits the block defaults for whatever a span leaves unset
function mergeStyleNames(
  names: string[],
  styles: Record<string, ResolvedTextStyle>,
): ResolvedTextStyle {
  return names.reduce<ResolvedTextStyle>((acc, name) => {
    const style = styles[name]
    if (!style) console.warn(`unknown style: "${name}"`)
    return { ...acc, ...style }
  }, {})
}

// map our resolved style vocabulary to Flow's, preserving "unset" as undefined so inheritance works
function toSpanStyle(s: ResolvedTextStyle): SpanStyle {
  const style: SpanStyle = {}
  if (s.fontFamily !== undefined) style.fontFamily = s.fontFamily
  if (s.fontSize !== undefined) style.fontSize = s.fontSize
  if (s.fontWeight !== undefined) style.fontWeight = s.fontWeight
  if (s.fontStyle !== undefined) style.italic = s.fontStyle === "italic"
  if (s.uppercase !== undefined) style.uppercase = s.uppercase
  if (s.color !== undefined) style.color = s.color
  if (s.opacity !== undefined) style.opacity = s.opacity
  if (s.letterSpacing !== undefined) style.letterSpacing = s.letterSpacing
  if (s.background !== undefined) style.background = s.background
  if (s.margin?.before !== undefined) style.marginBefore = s.margin.before
  if (s.margin?.after !== undefined) style.marginAfter = s.margin.after
  return style
}
