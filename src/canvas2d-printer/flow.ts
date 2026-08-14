// A standalone Canvas 2D text-layout engine: it measures, wraps, shrinks-to-fit, and places
// styled spans (text or inline images) inside a box, returning placements for the caller to draw.
// It knows nothing about our card DB, markup, or style registries — the caller hands it
// already-structured spans, a box, and the block's style. Block properties are the defaults a
// span inherits when it leaves them unset.

// ── input ──

export interface SpanStyle {
  fontFamily?: string
  fontSize?: number // px; unset → inherits the block's fontSize
  fontWeight?: number
  italic?: boolean
  uppercase?: boolean // Flow applies the transform
  color?: string
  opacity?: number
  background?: Background
  marginBefore?: number
  marginAfter?: number
}

export type Span =
  | { text: string; style?: SpanStyle }
  | { image: { src: string; aspect: number }; style?: SpanStyle }
export type Paragraph = Span[]

export interface Background {
  fill: string
  outset?: { top?: number; right?: number; bottom?: number; left?: number }
  corners?: { topLeft?: number; topRight?: number; bottomRight?: number; bottomLeft?: number }
}

export interface Box {
  width: number // Infinity ⇒ never wrap
  height: number // Infinity ⇒ never shrink
}

// the block's style: span-inheritable defaults plus block-level layout
export interface BlockStyle extends SpanStyle {
  align?: "left" | "center"
  valign?: "top" | "center"
  lineHeight?: number
  paragraphGap?: number
  minFontSize?: number // shrink floor for the block's fontSize
}

// ── output: placements the caller draws ──

export interface PlacedText {
  type: "text"
  x: number
  baseline: number
  text: string
  style: SpanStyle // resolved (block defaults merged in)
  fontSize: number
}
export interface PlacedImage {
  type: "image"
  x: number
  y: number
  width: number
  height: number
  src: string
}
export interface PlacedBackground {
  x: number
  y: number
  width: number
  height: number
  background: Background
}
export interface Layout {
  backgrounds: PlacedBackground[]
  content: (PlacedText | PlacedImage)[]
  height: number // total height of the laid-out content
}

// ── internals ──

const DEFAULT_FONT_SIZE = 16
const SHRINK_STEP_PX = 1
const FALLBACK_CAP_RATIO = 0.7
const INLINE_IMAGE_CAP_RATIO = 1.15 // inline image height as a multiple of cap-height

// a token after inheritance + tokenizing + uppercase, but before measuring (all scale-independent)
interface Token {
  spanId: number
  isSpace: boolean
  text?: string
  imageSrc?: string
  aspect?: number
  style: SpanStyle
  fontSize: number
  marginBefore: number
  marginAfter: number
}
// a Token plus its measured width and cap-height at its fontSize
interface MeasuredToken extends Token {
  width: number
  cap: number
}
type PlacedToken = MeasuredToken & { offset: number }
interface Line {
  tokens: PlacedToken[]
  width: number
  cap: number
  fontSize: number
}

export const fontString = (style: SpanStyle, sizePx: number) =>
  `${style.italic ? "italic " : ""}${style.fontWeight ?? 400} ${sizePx}px ${JSON.stringify(style.fontFamily ?? "sans-serif")}`

export class Flow {
  private ctx: CanvasRenderingContext2D
  constructor() {
    this.ctx = document.createElement("canvas").getContext("2d")!
  }

  layout(content: Paragraph[], box: Box, style: BlockStyle): Layout {
    const tokenized = content.map((spans) => tokenize(spans, style))
    const baseFontSize = style.fontSize ?? DEFAULT_FONT_SIZE
    const minFontSize = style.minFontSize ?? baseFontSize
    for (let fontSize = baseFontSize; fontSize > minFontSize; fontSize -= SHRINK_STEP_PX) {
      const laid = this.tryLayout(tokenized, box, style, fontSize / baseFontSize)
      if (laid.height <= box.height) return laid
    }
    return this.tryLayout(tokenized, box, style, minFontSize / baseFontSize)
  }

  private tryLayout(tokenized: Token[][], box: Box, style: BlockStyle, scale: number): Layout {
    const lineHeight = style.lineHeight ?? 1
    const paragraphGap = style.paragraphGap ?? 0

    const wrapped = tokenized.map((tokens) =>
      wrap(this.measure(scaleTokens(tokens, scale)), box.width),
    )

    let height = 0
    for (const lines of wrapped) for (const line of lines) height += line.fontSize * lineHeight
    height += Math.max(0, wrapped.length - 1) * paragraphGap

    const backgrounds: PlacedBackground[] = []
    const placed: (PlacedText | PlacedImage)[] = []
    let y =
      style.valign === "center" && Number.isFinite(box.height)
        ? Math.max(0, (box.height - height) / 2)
        : 0

    for (const lines of wrapped) {
      for (const line of lines) {
        const alignOffset = style.align === "center" ? (box.width - line.width) / 2 : 0
        const baseline = y + line.cap
        backgrounds.push(...backgroundsOf(line, alignOffset, baseline))
        placed.push(...contentOf(line, alignOffset, baseline))
        y += line.fontSize * lineHeight
      }
      y += paragraphGap
    }

    return { backgrounds, content: placed, height }
  }

  // the only scale- and canvas-dependent step: width + cap-height at each token's fontSize
  private measure(tokens: Token[]): MeasuredToken[] {
    return tokens.map((token) => {
      this.ctx.font = fontString(token.style, token.fontSize)
      const cap = this.capHeight(token.fontSize)
      const width =
        token.imageSrc !== undefined
          ? cap * INLINE_IMAGE_CAP_RATIO * (token.aspect ?? 1)
          : this.ctx.measureText(token.text ?? "").width
      return { ...token, width, cap }
    })
  }

  private capHeight(sizePx: number): number {
    const capitals = this.ctx.measureText("H")
    return capitals.actualBoundingBoxAscent || sizePx * FALLBACK_CAP_RATIO
  }
}

// inheritance + tokenizing + uppercase — all scale-independent, so done once per layout
function tokenize(spans: Paragraph, style: BlockStyle): Token[] {
  const tokens: Token[] = []
  let spanId = 0
  for (const span of spans) {
    const spanStyle: SpanStyle = { ...style, ...span.style }
    const id = spanId++
    const fontSize = spanStyle.fontSize ?? DEFAULT_FONT_SIZE
    const marginBefore = spanStyle.marginBefore ?? 0
    const marginAfter = spanStyle.marginAfter ?? 0

    if ("image" in span) {
      tokens.push({
        spanId: id,
        isSpace: false,
        imageSrc: span.image.src,
        aspect: span.image.aspect,
        style: spanStyle,
        fontSize,
        marginBefore,
        marginAfter,
      })
      continue
    }

    const text = spanStyle.uppercase ? span.text.toUpperCase() : span.text
    const parts = text.split(/(\s+)/).filter((part) => part !== "")
    parts.forEach((part, index) => {
      tokens.push({
        spanId: id,
        isSpace: /^\s+$/.test(part),
        text: part,
        style: spanStyle,
        fontSize,
        marginBefore: index === 0 ? marginBefore : 0,
        marginAfter: index === parts.length - 1 ? marginAfter : 0,
      })
    })
  }
  return tokens
}

// apply the shrink scale to the base font-sizes before measuring
const scaleTokens = (tokens: Token[], scale: number): Token[] =>
  tokens.map((token) => ({ ...token, fontSize: token.fontSize * scale }))

function wrap(tokens: MeasuredToken[], maxWidth: number): Line[] {
  const lines: Line[] = []
  let pending: PlacedToken[] = []
  let cursor = 0

  const commit = () => {
    while (pending.length && pending[pending.length - 1].isSpace) {
      const dropped = pending.pop()!
      cursor -= dropped.marginBefore + dropped.width + dropped.marginAfter
    }
    if (pending.length) lines.push(toLine(pending, cursor))
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

// a line's cap/fontSize are the max over its spans (mixed sizes sit on a shared baseline)
function toLine(tokens: PlacedToken[], width: number): Line {
  let cap = 0
  let fontSize = 0
  for (const token of tokens) {
    cap = Math.max(cap, token.cap)
    fontSize = Math.max(fontSize, token.fontSize)
  }
  return { tokens, width, cap, fontSize }
}

function backgroundsOf(line: Line, alignOffset: number, baseline: number): PlacedBackground[] {
  const backgrounds: PlacedBackground[] = []
  let segment: {
    spanId: number
    start: number
    end: number
    cap: number
    background: Background
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
      y: baseline - segment.cap - top,
      width: segment.end - segment.start + left + right,
      height: segment.cap + top + bottom,
      background: segment.background,
    })
    segment = null
  }

  for (const token of line.tokens) {
    const start = alignOffset + token.offset
    const background = token.style.background
    if (!background) commit()
    else if (segment && segment.spanId === token.spanId) segment.end = start + token.width
    else {
      commit()
      segment = {
        spanId: token.spanId,
        start,
        end: start + token.width,
        cap: token.cap,
        background,
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
): (PlacedText | PlacedImage)[] {
  return line.tokens
    .filter((token) => !token.isSpace)
    .map((token) =>
      token.imageSrc
        ? {
            type: "image",
            x: alignOffset + token.offset,
            // centered on the line's cap-box middle (baseline − cap/2)
            y: baseline - (token.cap * (1 + INLINE_IMAGE_CAP_RATIO)) / 2,
            width: token.width,
            height: token.cap * INLINE_IMAGE_CAP_RATIO,
            src: token.imageSrc,
          }
        : {
            type: "text",
            x: alignOffset + token.offset,
            baseline,
            text: token.text!,
            style: token.style,
            fontSize: token.fontSize,
          },
    )
}
