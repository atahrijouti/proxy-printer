import type { Background, Props } from "./model"
import { parseMarkup } from "./markup"

export interface Measurer {
  use(props: Props, sizePx: number): void
  width(text: string): number
  readonly capHeight: number
  readonly ascent: number
  readonly descent: number
  imageAspect(src: string): number
}

export type ToPx = (len: string | number | undefined, emPx?: number) => number

export interface PlacedText {
  kind: "text"
  x: number
  baseline: number
  text: string
  props: Props
  sizePx: number
}
export interface PlacedImage {
  kind: "image"
  x: number
  y: number
  w: number
  h: number
  src: string
}
export interface RunBox {
  x: number
  y: number
  w: number
  h: number
  background: Background
}
export interface Layout {
  boxes: RunBox[]
  items: (PlacedText | PlacedImage)[]
  sizePx: number
}

export interface LayoutInput {
  paragraphs: string[]
  base: Props
  baseSizePx: number
  minSizePx: number
  boxWidth: number
  boxHeight: number
  lineHeight: number
  paragraphGap: number
  align: "left" | "center"
  valign: "top" | "center"
  resolve: (name: string) => Props
  resolveAbbr: (id: string) => string
  measurer: Measurer
  toPx: ToPx
}

interface Token {
  runId: number
  isSpace: boolean
  text?: string
  imageSrc?: string
  width: number
  marginBefore: number
  marginAfter: number
  props: Props
  background?: Background
}

type PlacedToken = Token & { offset: number }
interface Line {
  tokens: PlacedToken[]
  width: number
}

const mergeStack = (base: Props, names: string[], resolve: (n: string) => Props): Props =>
  names.reduce((acc, name) => ({ ...acc, ...resolve(name) }), base)

function measure(input: LayoutInput, sizePx: number) {
  const { measurer, base, toPx, resolve, resolveAbbr } = input
  measurer.use(base, sizePx)
  const cap = measurer.capHeight

  let runId = 0
  const paragraphs = input.paragraphs.map((markup) => {
    const tokens: Token[] = []
    for (const run of parseMarkup(markup)) {
      const props = mergeStack(base, run.styles, resolve)
      const marginBefore = toPx(props.margin?.before, sizePx)
      const marginAfter = toPx(props.margin?.after, sizePx)
      const id = runId++
      measurer.use(props, sizePx)

      if (run.kind === "abbr") {
        const src = resolveAbbr(run.id)
        tokens.push({
          runId: id,
          isSpace: false,
          imageSrc: src,
          width: cap * measurer.imageAspect(src),
          marginBefore,
          marginAfter,
          props,
          background: props.background,
        })
        continue
      }

      const text = props.uppercase ? run.text.toUpperCase() : run.text
      const parts = text.split(/(\s+)/).filter((part) => part !== "")
      parts.forEach((part, index) => {
        tokens.push({
          runId: id,
          isSpace: /^\s+$/.test(part),
          text: part,
          width: measurer.width(part),
          marginBefore: index === 0 ? marginBefore : 0,
          marginAfter: index === parts.length - 1 ? marginAfter : 0,
          props,
          background: props.background,
        })
      })
    }
    return tokens
  })
  return { paragraphs, cap }
}

function wrap(tokens: Token[], maxWidth: number): Line[] {
  const lines: Line[] = []
  let current: PlacedToken[] = []
  let cursor = 0

  const commit = () => {
    while (current.length && current[current.length - 1].isSpace) {
      const dropped = current.pop()!
      cursor -= dropped.marginBefore + dropped.width + dropped.marginAfter
    }
    if (current.length) lines.push({ tokens: current, width: cursor })
    current = []
    cursor = 0
  }

  for (const token of tokens) {
    if (token.isSpace && current.length === 0) continue
    const margin = current.length === 0 ? 0 : token.marginBefore
    if (!token.isSpace && current.length && cursor + margin + token.width > maxWidth) commit()
    cursor += current.length === 0 ? 0 : token.marginBefore
    current.push({ ...token, offset: cursor })
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
): RunBox[] {
  const boxes: RunBox[] = []
  let segment: { runId: number; start: number; end: number; background: Background } | null = null

  const commit = () => {
    if (!segment) return
    const o = segment.background.outset ?? {}
    const [top, right, bottom, left] = [toPx(o.top), toPx(o.right), toPx(o.bottom), toPx(o.left)]
    boxes.push({
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
    else if (segment && segment.runId === token.runId) segment.end = start + token.width
    else {
      commit()
      segment = {
        runId: token.runId,
        start,
        end: start + token.width,
        background: token.background,
      }
    }
  }
  commit()
  return boxes
}

function itemsOf(
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
            kind: "image",
            x: alignOffset + token.offset,
            y: baseline - cap,
            w: token.width,
            h: cap,
            src: token.imageSrc,
          }
        : {
            kind: "text",
            x: alignOffset + token.offset,
            baseline,
            text: token.text!,
            props: token.props,
            sizePx,
          },
    )
}

function layoutAt(input: LayoutInput, sizePx: number): Layout | null {
  const { paragraphs, cap } = measure(input, sizePx)
  const wrapped = paragraphs.map((tokens) => wrap(tokens, input.boxWidth))
  const lineStep = sizePx * input.lineHeight

  const lineCount = wrapped.reduce((total, lines) => total + lines.length, 0)
  const blockHeight = lineCount * lineStep + Math.max(0, wrapped.length - 1) * input.paragraphGap
  if (blockHeight > input.boxHeight && sizePx > input.minSizePx) return null

  const boxes: RunBox[] = []
  const items: (PlacedText | PlacedImage)[] = []
  let y = input.valign === "center" ? Math.max(0, (input.boxHeight - blockHeight) / 2) : 0

  for (const lines of wrapped) {
    for (const line of lines) {
      const alignOffset = input.align === "center" ? (input.boxWidth - line.width) / 2 : 0
      const baseline = y + cap
      boxes.push(...backgroundsOf(line, alignOffset, baseline, cap, input.toPx))
      items.push(...itemsOf(line, alignOffset, baseline, cap, sizePx))
      y += lineStep
    }
    y += input.paragraphGap
  }

  return { boxes, items, sizePx }
}

export function layout(input: LayoutInput): Layout {
  for (let size = input.baseSizePx; size > input.minSizePx; size -= 1) {
    const result = layoutAt(input, size)
    if (result) return result
  }
  return layoutAt(input, input.minSizePx)!
}
