import type { ResolvedBackground, ResolvedTextStyle } from "./types"
import { parseMarkup } from "./markup"

const SHRINK_STEP_PX = 1

export interface Measurer {
  setFont(style: ResolvedTextStyle, sizePx: number): void
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
  style: ResolvedTextStyle
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
  background: ResolvedBackground
}
export interface Layout {
  backgrounds: BackgroundBox[]
  content: (PlacedText | PlacedImage)[]
  sizePx: number
}

// the text being laid out, and everything intrinsic to how it flows
export interface TextBlock {
  paragraphs: string[]
  baseStyle: ResolvedTextStyle
  baseSizePx: number
  minSizePx: number
  boxWidth: number
  boxHeight: number
  lineHeight: number
  paragraphGap: number
  align: "left" | "center"
  valign: "top" | "center"
}

// the shared tools and registries a layout resolves and measures against
export interface LayoutEnv {
  styles: Record<string, ResolvedTextStyle>
  abbreviations: Record<string, string>
  measurer: Measurer
}

interface Token {
  nodeId: number
  isSpace: boolean
  text?: string
  imageSrc?: string
  width: number
  marginBefore: number
  marginAfter: number
  style: ResolvedTextStyle
  background?: ResolvedBackground
}

type PlacedToken = Token & { offset: number }
interface Line {
  tokens: PlacedToken[]
  width: number
}

const mergeStyles = (
  baseStyle: ResolvedTextStyle,
  names: string[],
  styles: Record<string, ResolvedTextStyle>,
): ResolvedTextStyle =>
  names.reduce((acc, name) => ({ ...acc, ...(styles[name] ?? {}) }), baseStyle)

function measure(block: TextBlock, env: LayoutEnv, sizePx: number) {
  const { measurer, styles, abbreviations } = env
  const { baseStyle } = block
  measurer.setFont(baseStyle, sizePx)
  const cap = measurer.capHeight

  let nodeId = 0
  const paragraphs = block.paragraphs.map((markup) => {
    const tokens: Token[] = []
    for (const node of parseMarkup(markup)) {
      const style = mergeStyles(baseStyle, node.styles, styles)
      const marginBefore = style.margin?.before ?? 0
      const marginAfter = style.margin?.after ?? 0
      const id = nodeId++
      measurer.setFont(style, sizePx)

      if (node.type === "abbr") {
        const src = abbreviations[node.id]
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
): BackgroundBox[] {
  const backgrounds: BackgroundBox[] = []
  let segment: {
    nodeId: number
    start: number
    end: number
    background: ResolvedBackground
  } | null = null

  const commit = () => {
    if (!segment) return
    const outset = segment.background.outset ?? {}
    const top = outset.top ?? 0
    const right = outset.right ?? 0
    const bottom = outset.bottom ?? 0
    const left = outset.left ?? 0
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

function tryLayout(block: TextBlock, env: LayoutEnv, sizePx: number): Layout | null {
  const { paragraphs, cap } = measure(block, env, sizePx)
  const wrapped = paragraphs.map((tokens) => wrap(tokens, block.boxWidth))
  const lineStep = sizePx * block.lineHeight

  const lineCount = wrapped.reduce((total, lines) => total + lines.length, 0)
  const blockHeight = lineCount * lineStep + Math.max(0, wrapped.length - 1) * block.paragraphGap
  if (blockHeight > block.boxHeight && sizePx > block.minSizePx) return null

  const backgrounds: BackgroundBox[] = []
  const content: (PlacedText | PlacedImage)[] = []
  let y = block.valign === "center" ? Math.max(0, (block.boxHeight - blockHeight) / 2) : 0

  for (const lines of wrapped) {
    for (const line of lines) {
      const alignOffset = block.align === "center" ? (block.boxWidth - line.width) / 2 : 0
      const baseline = y + cap
      backgrounds.push(...backgroundsOf(line, alignOffset, baseline, cap))
      content.push(...contentOf(line, alignOffset, baseline, cap, sizePx))
      y += lineStep
    }
    y += block.paragraphGap
  }

  return { backgrounds, content, sizePx }
}

export function layout(block: TextBlock, env: LayoutEnv): Layout {
  for (let size = block.baseSizePx; size > block.minSizePx; size -= SHRINK_STEP_PX) {
    const fitted = tryLayout(block, env, size)
    if (fitted) return fitted
  }
  return tryLayout(block, env, block.minSizePx)!
}
