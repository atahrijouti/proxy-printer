import type { Background, Props } from "./model"
import { parseMarkup } from "./markup"

// A backend implements this so the engine can measure without knowing the renderer.
export interface Measurer {
  use(props: Props, sizePx: number): void // configure measuring state for a run
  width(text: string): number
  readonly capHeight: number // valid after use()
  readonly ascent: number
  readonly descent: number
  imageAspect(src: string): number // decoded width / height
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
  paragraphs: string[] // {t}/{abbr} markup, one per paragraph
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
  run: number
  space: boolean
  text?: string
  src?: string
  w: number
  marginBefore: number
  marginAfter: number
  props: Props
  background?: Background
}

const mergeStack = (base: Props, names: string[], resolve: (n: string) => Props): Props =>
  names.reduce((acc, name) => ({ ...acc, ...resolve(name) }), base)

function tokenize(input: LayoutInput, sizePx: number) {
  const { measurer, base } = input
  measurer.use(base, sizePx)
  const cap = measurer.capHeight
  const ascent = measurer.ascent
  const descent = measurer.descent

  let run = 0
  const paragraphs = input.paragraphs.map((markup) => {
    const tokens: Token[] = []
    for (const r of parseMarkup(markup)) {
      const props = mergeStack(base, r.styles, input.resolve)
      const marginBefore = input.toPx(props.margin?.before, sizePx)
      const marginAfter = input.toPx(props.margin?.after, sizePx)
      const background = props.background
      const id = run++
      measurer.use(props, sizePx)

      if (r.kind === "abbr") {
        const src = input.resolveAbbr(r.id)
        tokens.push({
          run: id,
          space: false,
          src,
          w: cap * measurer.imageAspect(src),
          marginBefore,
          marginAfter,
          props,
          background,
        })
        continue
      }

      const text = props.uppercase ? r.text.toUpperCase() : r.text
      const parts = text.split(/(\s+)/).filter((p) => p !== "")
      parts.forEach((part, k) => {
        tokens.push({
          run: id,
          space: /^\s+$/.test(part),
          text: part,
          w: measurer.width(part),
          marginBefore: k === 0 ? marginBefore : 0,
          marginAfter: k === parts.length - 1 ? marginAfter : 0,
          props,
          background,
        })
      })
    }
    return tokens
  })
  return { paragraphs, cap, ascent, descent }
}

function layoutAt(input: LayoutInput, sizePx: number): Layout | null {
  const { paragraphs, cap, ascent } = tokenize(input, sizePx)
  const step = sizePx * input.lineHeight
  const lines: { tokens: (Token & { x: number })[]; width: number; blank?: boolean }[] = []

  for (const tokens of paragraphs) {
    let line: (Token & { x: number })[] = []
    let x = 0
    const flush = () => {
      while (line.length && line[line.length - 1].space) {
        const last = line.pop()!
        x -= last.w + last.marginBefore + last.marginAfter
      }
      lines.push({ tokens: line, width: x })
      line = []
      x = 0
    }
    for (const t of tokens) {
      if (t.space && line.length === 0) continue
      const lead = line.length === 0 ? 0 : t.marginBefore
      if (!t.space && line.length > 0 && x + lead + t.w > input.boxWidth) flush()
      x += line.length === 0 ? 0 : t.marginBefore
      line.push({ ...t, x })
      x += t.w + t.marginAfter
    }
    flush()
    lines.push({ tokens: [], width: 0, blank: true })
  }
  lines.pop()

  const tops: number[] = []
  let used = 0
  for (const l of lines) {
    tops.push(used)
    used += l.blank ? input.paragraphGap : step
  }
  const blockHeight = lines.length
    ? tops[tops.length - 1] + (lines[lines.length - 1].blank ? 0 : step)
    : 0
  if (blockHeight > input.boxHeight && sizePx > input.minSizePx) return null

  const yOffset = input.valign === "center" ? Math.max(0, (input.boxHeight - blockHeight) / 2) : 0
  const items: (PlacedText | PlacedImage)[] = []
  const boxes: RunBox[] = []

  lines.forEach((l, i) => {
    if (l.blank) return
    const shift = input.align === "center" ? (input.boxWidth - l.width) / 2 : 0
    const baseline = yOffset + tops[i] + ascent

    let seg: { run: number; start: number; end: number; bg: Background } | null = null
    const flushSeg = () => {
      if (!seg) return
      const o = seg.bg.outset ?? {}
      const left = input.toPx(o.left)
      const right = input.toPx(o.right)
      const top = input.toPx(o.top)
      const bottom = input.toPx(o.bottom)
      boxes.push({
        x: seg.start - left,
        y: baseline - cap - top,
        w: seg.end - seg.start + left + right,
        h: cap + top + bottom,
        background: seg.bg,
      })
      seg = null
    }
    for (const t of l.tokens) {
      if (!t.background) flushSeg()
      else if (seg && seg.run === t.run) seg.end = shift + t.x + t.w
      else {
        flushSeg()
        seg = { run: t.run, start: shift + t.x, end: shift + t.x + t.w, bg: t.background }
      }
    }
    flushSeg()

    for (const t of l.tokens) {
      if (t.space) continue
      if (t.src)
        items.push({ kind: "image", x: shift + t.x, y: baseline - cap, w: t.w, h: cap, src: t.src })
      else
        items.push({
          kind: "text",
          x: shift + t.x,
          baseline,
          text: t.text!,
          props: t.props,
          sizePx,
        })
    }
  })

  return { boxes, items, sizePx }
}

export function layout(input: LayoutInput): Layout {
  for (let size = input.baseSizePx; size > input.minSizePx; size -= 1) {
    const result = layoutAt(input, size)
    if (result) return result
  }
  return layoutAt(input, input.minSizePx)!
}
