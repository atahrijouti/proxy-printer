// The layout engine: canvaskit measures, shapes, wraps, and positions the text, and we
// read finished device-pixel coordinates back out as placed primitives. This is skia's
// analogue of the canvas2d printer's flow.ts — the difference is that canvaskit (not a
// hand-rolled measurer) is the engine. render.ts only draws what this returns.

import type { Image, Paragraph, ParagraphBuilder, TextStyle as CkTextStyle } from "canvaskit-wasm"
import { CARD_WIDTH_MM } from "./card"
import type { ComposedText, StyledRun } from "./compose"
import type { RenderContext } from "./engine"
import type { Style } from "./types"
import { toMillimetres } from "./units"

// An inline {abbr} symbol is sized to 1.15× the surrounding text's cap height and centred
// on the cap-box middle — matching the canvas2d printer (the DB carries only the URL).
const INLINE_IMAGE_CAP_RATIO = 1.15
const UNBOUNDED_WIDTH_PX = 1e6 // an inline (single-line) style never wraps

// ── Placed primitives (device px) — the whole engine output render.ts consumes ─────
export interface PlacedParagraph {
  paragraph: Paragraph // owned by the caller: draw it, then delete it
  x: number
  y: number
}
export interface PlacedPill {
  left: number
  top: number
  right: number
  bottom: number
  radius: number
  fill: string // hex; render turns it into a canvaskit colour
}
export interface PlacedSymbol {
  image: Image
  x: number
  y: number
  size: number
}
export interface Placed {
  paragraphs: PlacedParagraph[]
  pills: PlacedPill[]
  symbols: PlacedSymbol[]
}

export function layoutOverlay(ctx: RenderContext, composed: ComposedText): Placed {
  const fontSizeMm = toMillimetres(composed.style.fontSize)
  const placed: Placed = { paragraphs: [], pills: [], symbols: [] }

  if (composed.mode === "block") {
    const boxX = px(composed.boxXMm, ctx)
    const wrapWidth = px(composed.boxWidthMm, ctx)
    const gap = px(toMillimetres(composed.style.paragraphGap, fontSizeMm), ctx)
    const built = composed.paragraphs.map((runs) =>
      buildParagraph(ctx, composed.style, runs, fontSizeMm, wrapWidth),
    )
    const total =
      built.reduce((sum, b) => sum + b.paragraph.getHeight(), 0) +
      gap * Math.max(0, built.length - 1)
    const spare = px(composed.boxHeightMm, ctx) - total
    let y =
      composed.style.valign === "center"
        ? px(composed.boxYMm, ctx) + Math.max(0, spare / 2)
        : px(composed.boxYMm, ctx)
    for (const b of built) {
      place(placed, ctx, b, boxX, y, fontSizeMm)
      y += b.paragraph.getHeight() + gap
    }
  } else {
    const runs = composed.paragraphs[0] ?? []
    const built = buildParagraph(ctx, composed.style, runs, fontSizeMm, UNBOUNDED_WIDTH_PX)
    const width = built.paragraph.getMaxIntrinsicWidth()
    const x =
      composed.style.align === "center"
        ? (px(CARD_WIDTH_MM, ctx) - width) / 2
        : px(composed.boxXMm, ctx)
    const y = capTop(ctx, composed.style, px(composed.boxYMm, ctx), fontSizeMm, built.paragraph)
    place(placed, ctx, built, x, y, fontSizeMm)
  }

  return placed
}

// ── Building a canvaskit paragraph from composed runs ────────────────────────────────
interface InlineSymbol {
  image: Image
  drop: number
}
interface PillRange {
  start: number
  end: number
  style: Style
}
interface Built {
  paragraph: Paragraph
  placeholders: (InlineSymbol | null)[] // index-aligned with the paragraph's placeholders
  pills: PillRange[]
}

function buildParagraph(
  ctx: RenderContext,
  base: Style,
  runs: StyledRun[],
  fontSizeMm: number,
  wrapWidthPx: number,
): Built {
  const paragraphStyle = new ctx.ck.ParagraphStyle({
    textStyle: textStyle(ctx, base, fontSizeMm),
    textAlign: ctx.ck.TextAlign.Left,
  })
  const builder = ctx.ck.ParagraphBuilder.MakeFromFontProvider(paragraphStyle, ctx.fonts)
  const placeholders: (InlineSymbol | null)[] = []
  const pills: PillRange[] = []

  let offset = 0
  for (const run of runs)
    offset = addRun(ctx, builder, run, fontSizeMm, offset, placeholders, pills)

  const paragraph = builder.build()
  builder.delete()
  paragraph.layout(wrapWidthPx)
  return { paragraph, placeholders, pills }
}

function addRun(
  ctx: RenderContext,
  builder: ParagraphBuilder,
  run: StyledRun,
  fontSizeMm: number,
  offset: number,
  placeholders: (InlineSymbol | null)[],
  pills: PillRange[],
): number {
  if ("symbolSrc" in run) {
    const image = ctx.images.get(run.symbolSrc)
    if (!image) return offset
    const cap = capHeightPx(ctx, run.style, fontSizeMm)
    const size = cap * INLINE_IMAGE_CAP_RATIO
    builder.addPlaceholder(
      size,
      size,
      ctx.ck.PlaceholderAlignment.Middle,
      ctx.ck.TextBaseline.Alphabetic,
      0,
    )
    placeholders.push({ image, drop: (cap * (1 - INLINE_IMAGE_CAP_RATIO)) / 2 })
    return offset + 1
  }

  const text = run.style.uppercase ? run.text.toUpperCase() : run.text
  builder.pushStyle(textStyle(ctx, run.style, fontSizeMm))
  builder.addText(text)
  builder.pop()
  if (!run.style.background) return offset + text.length

  pills.push({ start: offset, end: offset + text.length, style: run.style })
  // margin.after is the flow gap after the pill; the box itself extends via outset (placePills)
  const gap = px(toMillimetres(run.style.margin?.after, fontSizeMm), ctx)
  builder.addPlaceholder(
    gap,
    1,
    ctx.ck.PlaceholderAlignment.Middle,
    ctx.ck.TextBaseline.Alphabetic,
    0,
  )
  placeholders.push(null)
  return offset + text.length + 1
}

// ── Positioning one built paragraph and deriving its pills / symbols ──────────────────
function place(
  into: Placed,
  ctx: RenderContext,
  built: Built,
  x: number,
  y: number,
  fontSizeMm: number,
) {
  into.paragraphs.push({ paragraph: built.paragraph, x, y })
  into.pills.push(...placePills(ctx, built, x, y, fontSizeMm))
  into.symbols.push(...placeSymbols(built, x, y))
}

function placePills(
  ctx: RenderContext,
  built: Built,
  originX: number,
  originY: number,
  fontSizeMm: number,
): PlacedPill[] {
  const lines = built.paragraph.getLineMetrics()
  const placed: PlacedPill[] = []
  for (const pill of built.pills) {
    const background = pill.style.background
    if (!background) continue
    const outset = resolveOutset(background.outset, fontSizeMm)
    const radius = px(toMillimetres(background.corners?.bottomRight), ctx)
    const capHeight = capHeightPx(ctx, pill.style, fontSizeMm)
    for (const { rect } of built.paragraph.getRectsForRange(
      pill.start,
      pill.end,
      ctx.ck.RectHeightStyle.Max,
      ctx.ck.RectWidthStyle.Tight,
    )) {
      const line =
        lines.find((l) => pill.start >= l.startIndex && pill.start < l.endIndex) ?? lines[0]
      const baseline = originY + (line?.baseline ?? 0)
      placed.push({
        left: originX + rect[0] - px(outset.left, ctx),
        top: baseline - capHeight - px(outset.top, ctx),
        right: originX + rect[2] + px(outset.right, ctx),
        bottom: baseline + px(outset.bottom, ctx),
        radius,
        fill: background.fill,
      })
    }
  }
  return placed
}

function placeSymbols(built: Built, originX: number, originY: number): PlacedSymbol[] {
  const lines = built.paragraph.getLineMetrics()
  const placed: PlacedSymbol[] = []
  built.paragraph.getRectsForPlaceholders().forEach(({ rect }, i) => {
    const symbol = built.placeholders[i]
    if (!symbol) return
    const size = rect[2] - rect[0]
    const midY = (rect[1] + rect[3]) / 2
    const line =
      lines.find((l) => midY >= l.baseline - l.ascent && midY <= l.baseline + l.descent) ?? lines[0]
    placed.push({
      image: symbol.image,
      x: originX + rect[0],
      y: originY + (line?.baseline ?? 0) - size - symbol.drop,
      size,
    })
  })
  return placed
}

// where the first line's cap-top sits relative to box.y (so box.y is the glyph top)
function capTop(
  ctx: RenderContext,
  style: Style,
  boxYPx: number,
  fontSizeMm: number,
  paragraph: Paragraph,
): number {
  const ascent = paragraph.getLineMetrics()[0]?.ascent ?? 0
  return boxYPx - (ascent - capHeightPx(ctx, style, fontSizeMm))
}

// ── canvaskit + geometry helpers ─────────────────────────────────────────────────────
const px = (mm: number, ctx: RenderContext) => mm * ctx.scale

const capHeightPx = (ctx: RenderContext, style: Style, fontSizeMm: number) =>
  (ctx.capRatios.get(style.fontFamily ?? "Bogle") ?? 0.7) * px(fontSizeMm, ctx)

const resolveOutset = (
  outset: { top?: string; right?: string; bottom?: string; left?: string } | undefined,
  emMm: number,
) => ({
  top: toMillimetres(outset?.top, emMm),
  right: toMillimetres(outset?.right, emMm),
  bottom: toMillimetres(outset?.bottom, emMm),
  left: toMillimetres(outset?.left, emMm),
})

// hex "#rrggbb" → a canvaskit colour (alpha from opacity); shared with render.ts for pills
export const toColor = (ctx: RenderContext, hex: string, opacity = 1) => {
  const value = hex.replace("#", "")
  const channel = (i: number) => parseInt(value.slice(i, i + 2), 16)
  return ctx.ck.Color(channel(0), channel(2), channel(4), opacity)
}

const weightOf = (ctx: RenderContext, weight = 400) => {
  const w = ctx.ck.FontWeight
  if (weight <= 300) return w.Light
  if (weight <= 400) return w.Normal
  if (weight <= 500) return w.Medium
  if (weight <= 600) return w.SemiBold
  if (weight <= 700) return w.Bold
  if (weight <= 800) return w.ExtraBold
  return w.Black
}

const textStyle = (ctx: RenderContext, style: Style, fontSizeMm: number): CkTextStyle =>
  new ctx.ck.TextStyle({
    color: toColor(ctx, style.color ?? "#000000", style.opacity ?? 1),
    fontFamilies: [style.fontFamily ?? "Bogle"],
    fontSize: px(fontSizeMm, ctx),
    fontStyle: {
      weight: weightOf(ctx, style.fontWeight),
      slant: style.fontStyle === "italic" ? ctx.ck.FontSlant.Italic : ctx.ck.FontSlant.Upright,
    },
    letterSpacing: px(toMillimetres(style.letterSpacing), ctx),
    heightMultiplier: style.lineHeight,
    halfLeading: true,
  })
