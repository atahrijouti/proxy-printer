import type { Background, TextStyle } from "./types"
import { parseMarkup } from "./markup"

const SHRINK_STEP_PX = 1

export type ToPx = (len: string | number | undefined, emPx?: number) => number

export interface Measurer {
  setFont(style: TextStyle, sizePx: number): void
  measureWidth(text: string): number
  readonly capHeight: number
  readonly ascent: number
  readonly descent: number
  imageAspect(src: string): number
}

export interface PlacedText {
  type: "text"
  x: number
  baseline: number
  text: string
  style: TextStyle
  sizePx: number
}
export interface PlacedImage {
  type: "image"
  x: number
  y: number
  w: number
  h: number
  src: string
}
export interface BackgroundBox {
  x: number
  y: number
  w: number
  h: number
  background: Background
}
export interface Layout {
  backgrounds: BackgroundBox[]
  content: (PlacedText | PlacedImage)[]
  sizePx: number
}

export interface LayoutInput {
  paragraphs: string[]
  baseStyle: TextStyle
  baseSizePx: number
  minSizePx: number
  boxWidth: number
  boxHeight: number
  lineHeight: number
  paragraphGap: number
  align: "left" | "center"
  valign: "top" | "center"
  resolveStyle: (name: string) => TextStyle
  resolveAbbr: (id: string) => string
  measurer: Measurer
  toPx: ToPx
}

interface Token {
  nodeId: number
  isSpace: boolean
  text?: string
  imageSrc?: string
  width: number
  marginBefore: number
  marginAfter: number
  style: TextStyle
  background?: Background
}

type PlacedToken = Token & { offset: number }
interface Line {
  tokens: PlacedToken[]
  width: number
}

const mergeStyles = (
  baseStyle: TextStyle,
  names: string[],
  resolveStyle: (name: string) => TextStyle,
): TextStyle => names.reduce((acc, name) => ({ ...acc, ...resolveStyle(name) }), baseStyle)

function measure(input: LayoutInput, sizePx: number) {
  const { measurer, baseStyle, toPx, resolveStyle, resolveAbbr } = input
  measurer.setFont(baseStyle, sizePx)
  const cap = measurer.capHeight

  let nodeId = 0
  const paragraphs = input.paragraphs.map((markup) => {
    const tokens: Token[] = []
    for (const node of parseMarkup(markup)) {
      const style = mergeStyles(baseStyle, node.styles, resolveStyle)
      const marginBefore = toPx(style.margin?.before, sizePx)
      const marginAfter = toPx(style.margin?.after, sizePx)
      const id = nodeId++
      measurer.setFont(style, sizePx)

      if (node.type === "abbr") {
        const src = resolveAbbr(node.id)
        tokens.push({
          nodeId: id,
          isSpace: false,
          imageSrc: src,
          width: cap * measurer.imageAspect(src),
          marginBefore,
          marginAfter,
          style,
          background: style.background,
        })
        continue
      }

      const text = style.uppercase ? node.text.toUpperCase() : node.text
      const parts = text.split(/(\s+)/).filter((part) => part !== "")
      parts.forEach((part, index) => {
        tokens.push({
          nodeId: id,
          isSpace: /^\s+$/.test(part),
          text: part,
          width: measurer.measureWidth(part),
          marginBefore: index === 0 ? marginBefore : 0,
          marginAfter: index === parts.length - 1 ? marginAfter : 0,
          style,
          background: style.background,
        })
      })
    }
    return tokens
  })
  return { paragraphs, cap }
}

function wrap(tokens: Token[], maxWidth: number): Line[] {
  const lines: Line[] = []
  let pending: PlacedToken[] = []
  let cursor = 0

  const commit = () => {
    while (pending.length && pending[pending.length - 1].isSpace) {
      const dropped = pending.pop()!
      cursor -= dropped.marginBefore + dropped.width + dropped.marginAfter
    }
    if (pending.length) lines.push({ tokens: pending, width: cursor })
    pending = []
    cursor = 0
  }

  for (const token of tokens) {
    if (token.isSpace && pending.length === 0) continue
    const margin = pending.length === 0 ? 0 : token.marginBefore
    if (!token.isSpace && pending.length && cursor + margin + token.width > maxWidth) commit()
    cursor += pending.length === 0 ? 0 : token.marginBefore
    pending.push({ ...token, offset: cursor })
    cursor += token.width + token.marginAfter
  }
  commit()
  return lines
}

function backgroundsOf(
  line: Line,
  alignOffset: number,
  baseline: number,
  cap: number,
  toPx: ToPx,
): BackgroundBox[] {
  const backgrounds: BackgroundBox[] = []
  let segment: { nodeId: number; start: number; end: number; background: Background } | null = null

  const commit = () => {
    if (!segment) return
    const outset = segment.background.outset ?? {}
    const top = toPx(outset.top)
    const right = toPx(outset.right)
    const bottom = toPx(outset.bottom)
    const left = toPx(outset.left)
    backgrounds.push({
      x: segment.start - left,
      y: baseline - cap - top,
      w: segment.end - segment.start + left + right,
      h: cap + top + bottom,
      background: segment.background,
    })
    segment = null
  }

  for (const token of line.tokens) {
    const start = alignOffset + token.offset
    if (!token.background) commit()
    else if (segment && segment.nodeId === token.nodeId) segment.end = start + token.width
    else {
      commit()
      segment = {
        nodeId: token.nodeId,
        start,
        end: start + token.width,
        background: token.background,
      }
    }
  }
  commit()
  return backgrounds
}

function contentOf(
  line: Line,
  alignOffset: number,
  baseline: number,
  cap: number,
  sizePx: number,
): (PlacedText | PlacedImage)[] {
  return line.tokens
    .filter((token) => !token.isSpace)
    .map((token) =>
      token.imageSrc
        ? {
            type: "image",
            x: alignOffset + token.offset,
            y: baseline - cap,
            w: token.width,
            h: cap,
            src: token.imageSrc,
          }
        : {
            type: "text",
            x: alignOffset + token.offset,
            baseline,
            text: token.text!,
            style: token.style,
            sizePx,
          },
    )
}

function tryLayout(input: LayoutInput, sizePx: number): Layout | null {
  const { paragraphs, cap } = measure(input, sizePx)
  const wrapped = paragraphs.map((tokens) => wrap(tokens, input.boxWidth))
  const lineStep = sizePx * input.lineHeight

  const lineCount = wrapped.reduce((total, lines) => total + lines.length, 0)
  const blockHeight = lineCount * lineStep + Math.max(0, wrapped.length - 1) * input.paragraphGap
  if (blockHeight > input.boxHeight && sizePx > input.minSizePx) return null

  const backgrounds: BackgroundBox[] = []
  const content: (PlacedText | PlacedImage)[] = []
  let y = input.valign === "center" ? Math.max(0, (input.boxHeight - blockHeight) / 2) : 0

  for (const lines of wrapped) {
    for (const line of lines) {
      const alignOffset = input.align === "center" ? (input.boxWidth - line.width) / 2 : 0
      const baseline = y + cap
      backgrounds.push(...backgroundsOf(line, alignOffset, baseline, cap, input.toPx))
      content.push(...contentOf(line, alignOffset, baseline, cap, sizePx))
      y += lineStep
    }
    y += input.paragraphGap
  }

  return { backgrounds, content, sizePx }
}

export function layout(input: LayoutInput): Layout {
  for (let size = input.baseSizePx; size > input.minSizePx; size -= SHRINK_STEP_PX) {
    const fitted = tryLayout(input, size)
    if (fitted) return fitted
  }
  return tryLayout(input, input.minSizePx)!
}
