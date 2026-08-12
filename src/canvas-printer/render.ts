import type {
  Canvas,
  Image,
  Paragraph,
  ParagraphBuilder,
  TextStyle as CkTextStyle,
} from "canvaskit-wasm"
import type { Engine } from "./engine"
import { parseMarkup, type Run } from "./markup"
import type { Card, Overlay, Presentation, Style } from "./types"
import { parseEdges, toMillimetres } from "./units"

export const CARD_WIDTH_MM = 63
export const CARD_HEIGHT_MM = 88
export const CARD_RADIUS_MM = 2

export interface RenderContext extends Engine {
  styles: Record<string, Style>
  abbreviations: Presentation["abbreviations"]
  scale: number
}

interface Pill {
  start: number
  end: number
  style: Style
}

interface InlineSymbol {
  image: Image
  drop: number
}

interface Built {
  paragraph: Paragraph
  placeholders: (InlineSymbol | null)[]
  pills: Pill[]
}

const px = (mm: number, ctx: RenderContext) => mm * ctx.scale
const capHeightPx = (ctx: RenderContext, style: Style, fontSizeMm: number) =>
  (ctx.capRatios.get(style.font ?? "Bogle") ?? 0.7) * px(fontSizeMm, ctx)

const color = (ctx: RenderContext, hex: string, opacity = 1) => {
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

const mergeStyle = (base: Style, names: string[], styles: Record<string, Style>): Style =>
  names.reduce((merged, name) => ({ ...merged, ...(styles[name] ?? {}) }), base)

const textStyle = (ctx: RenderContext, style: Style, fontSizeMm: number): CkTextStyle =>
  new ctx.ck.TextStyle({
    color: color(ctx, style.color ?? "#000000", style.opacity ?? 1),
    fontFamilies: [style.font ?? "Bogle"],
    fontSize: px(fontSizeMm, ctx),
    fontStyle: {
      weight: weightOf(ctx, style.weight),
      slant: style.style === "italic" ? ctx.ck.FontSlant.Italic : ctx.ck.FontSlant.Upright,
    },
    letterSpacing: px(toMillimetres(style.letterSpacing), ctx),
    heightMultiplier: style.lineHeight,
    halfLeading: true,
  })

const drawImageBox = (
  canvas: Canvas,
  ctx: RenderContext,
  image: Image,
  l: number,
  t: number,
  w: number,
  h: number,
) => {
  const paint = new ctx.ck.Paint()
  const src = ctx.ck.LTRBRect(0, 0, image.width(), image.height())
  canvas.drawImageRect(image, src, ctx.ck.LTRBRect(l, t, l + w, t + h), paint)
  paint.delete()
}

const fullBleed = (canvas: Canvas, ctx: RenderContext, url: string) => {
  const image = ctx.images.get(url)
  if (image) drawImageBox(canvas, ctx, image, 0, 0, px(CARD_WIDTH_MM, ctx), px(CARD_HEIGHT_MM, ctx))
}

const addRun = (
  ctx: RenderContext,
  builder: ParagraphBuilder,
  base: Style,
  fontSizeMm: number,
  run: Run,
  offset: number,
  placeholders: (InlineSymbol | null)[],
  pills: Pill[],
): number => {
  const merged = mergeStyle(base, run.styles, ctx.styles)

  if (run.kind === "abbr") {
    const entry = ctx.abbreviations[run.id]
    if (!entry) throw new Error(`unknown abbreviation: {abbr ${run.id}}`)
    if (entry.type === "text") {
      builder.pushStyle(textStyle(ctx, merged, fontSizeMm))
      builder.addText(entry.value)
      builder.pop()
      return offset + entry.value.length
    }
    const image = ctx.images.get(entry.src)
    if (!image) return offset
    const size = px(toMillimetres(entry.height, fontSizeMm), ctx)
    builder.addPlaceholder(
      size,
      size,
      ctx.ck.PlaceholderAlignment.Middle,
      ctx.ck.TextBaseline.Alphabetic,
      0,
    )
    placeholders.push({ image, drop: px(toMillimetres(entry.baseline, fontSizeMm), ctx) })
    return offset + 1
  }

  const text = merged.uppercase ? run.text.toUpperCase() : run.text
  builder.pushStyle(textStyle(ctx, merged, fontSizeMm))
  builder.addText(text)
  builder.pop()
  if (!merged.background) return offset + text.length

  pills.push({ start: offset, end: offset + text.length, style: merged })
  const padRight = px(parseEdges(merged.background.padding, fontSizeMm).right, ctx)
  builder.addPlaceholder(
    padRight,
    1,
    ctx.ck.PlaceholderAlignment.Middle,
    ctx.ck.TextBaseline.Alphabetic,
    0,
  )
  placeholders.push(null)
  return offset + text.length + 1
}

const buildParagraph = (
  ctx: RenderContext,
  style: Style,
  markup: string,
  fontSizeMm: number,
  wrapWidth: number,
): Built => {
  const paragraphStyle = new ctx.ck.ParagraphStyle({
    textStyle: textStyle(ctx, style, fontSizeMm),
    textAlign: ctx.ck.TextAlign.Left,
  })
  const builder = ctx.ck.ParagraphBuilder.MakeFromFontProvider(paragraphStyle, ctx.fonts)
  const placeholders: (InlineSymbol | null)[] = []
  const pills: Pill[] = []

  let offset = 0
  for (const run of parseMarkup(markup))
    offset = addRun(ctx, builder, style, fontSizeMm, run, offset, placeholders, pills)

  const paragraph = builder.build()
  builder.delete()
  paragraph.layout(wrapWidth)
  return { paragraph, placeholders, pills }
}

const drawPills = (
  canvas: Canvas,
  ctx: RenderContext,
  built: Built,
  originX: number,
  originY: number,
  fontSizeMm: number,
) => {
  const lines = built.paragraph.getLineMetrics()
  for (const pill of built.pills) {
    const background = pill.style.background
    if (!background) continue
    const pad = parseEdges(background.padding, fontSizeMm)
    const bleed = px(toMillimetres(background.bleedLeft, fontSizeMm), ctx)
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
      const l = originX + rect[0] - bleed
      const t = baseline - capHeight - px(pad.top, ctx)
      const r = originX + rect[2] + px(pad.right, ctx)
      const b = baseline + px(pad.bottom, ctx)
      const paint = new ctx.ck.Paint()
      paint.setColor(color(ctx, background.fill))
      paint.setAntiAlias(true)
      canvas.drawRRect([l, t, r, b, 0, 0, 0, 0, radius, radius, 0, 0], paint)
      paint.delete()
    }
  }
}

const drawSymbols = (
  canvas: Canvas,
  ctx: RenderContext,
  built: Built,
  originX: number,
  originY: number,
) => {
  const lines = built.paragraph.getLineMetrics()
  built.paragraph.getRectsForPlaceholders().forEach(({ rect }, i) => {
    const symbol = built.placeholders[i]
    if (!symbol) return
    const size = rect[2] - rect[0]
    const midY = (rect[1] + rect[3]) / 2
    const line =
      lines.find((l) => midY >= l.baseline - l.ascent && midY <= l.baseline + l.descent) ?? lines[0]
    const top = originY + (line?.baseline ?? 0) - size - symbol.drop
    drawImageBox(canvas, ctx, symbol.image, originX + rect[0], top, size, size)
  })
}

const drawParagraph = (
  canvas: Canvas,
  ctx: RenderContext,
  built: Built,
  x: number,
  y: number,
  fontSizeMm: number,
) => {
  drawPills(canvas, ctx, built, x, y, fontSizeMm)
  canvas.drawParagraph(built.paragraph, x, y)
  drawSymbols(canvas, ctx, built, x, y)
}

const capTop = (
  ctx: RenderContext,
  style: Style,
  boxY: number,
  fontSizeMm: number,
  paragraph: Paragraph,
): number => {
  const ascent = paragraph.getLineMetrics()[0]?.ascent ?? 0
  return boxY - (ascent - capHeightPx(ctx, style, fontSizeMm))
}

const drawBlock = (
  canvas: Canvas,
  ctx: RenderContext,
  style: Style,
  paragraphs: string[],
  fontSizeMm: number,
) => {
  const boxX = px(toMillimetres(style.box?.x), ctx)
  const boxY = px(toMillimetres(style.box?.y), ctx)
  const wrapWidth = px(toMillimetres(style.box?.w), ctx)
  const gap = px(toMillimetres(style.paragraphGap, fontSizeMm), ctx)
  const built = paragraphs.map((markup) =>
    buildParagraph(ctx, style, markup, fontSizeMm, wrapWidth),
  )

  const total =
    built.reduce((sum, b) => sum + b.paragraph.getHeight(), 0) + gap * Math.max(0, built.length - 1)
  const spare = px(toMillimetres(style.box?.h), ctx) - total
  let y = style.valign === "center" ? boxY + Math.max(0, spare / 2) : boxY
  for (const b of built) {
    drawParagraph(canvas, ctx, b, boxX, y, fontSizeMm)
    y += b.paragraph.getHeight() + gap
    b.paragraph.delete()
  }
}

const drawLine = (
  canvas: Canvas,
  ctx: RenderContext,
  style: Style,
  text: string,
  fontSizeMm: number,
) => {
  const built = buildParagraph(ctx, style, text, fontSizeMm, 1e6)
  const width = built.paragraph.getMaxIntrinsicWidth()
  const x =
    style.align === "center"
      ? (px(CARD_WIDTH_MM, ctx) - width) / 2
      : px(toMillimetres(style.box?.x), ctx)
  const y = capTop(ctx, style, px(toMillimetres(style.box?.y), ctx), fontSizeMm, built.paragraph)
  drawParagraph(canvas, ctx, built, x, y, fontSizeMm)
  built.paragraph.delete()
}

const drawTextOverlay = (
  canvas: Canvas,
  ctx: RenderContext,
  overlay: Extract<Overlay, { type: "text" }>,
) => {
  const style = ctx.styles[overlay.style]
  if (!style) throw new Error(`unknown style: "${overlay.style}"`)
  const paragraphs = (Array.isArray(overlay.content) ? overlay.content : [overlay.content]).filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  )
  if (!paragraphs.length) return

  const fontSizeMm = toMillimetres(overlay.size ?? style.size)
  if (style.kind === "block") drawBlock(canvas, ctx, style, paragraphs, fontSizeMm)
  else drawLine(canvas, ctx, style, paragraphs.join(" "), fontSizeMm)
}

const drawOverlay = (canvas: Canvas, ctx: RenderContext, overlay: Overlay) => {
  switch (overlay.type) {
    case "image":
      return fullBleed(canvas, ctx, overlay.src)
    case "text":
      return drawTextOverlay(canvas, ctx, overlay)
    case "shape":
      return
  }
}

export function renderCardPng(engine: RenderContext, card: Card, scale: number): Uint8Array {
  const ctx: RenderContext = { ...engine, scale }
  const surface = ctx.ck.MakeSurface(CARD_WIDTH_MM * scale, CARD_HEIGHT_MM * scale)
  if (!surface) throw new Error("could not create raster surface")
  const canvas = surface.getCanvas()
  canvas.clear(ctx.ck.TRANSPARENT)
  renderCard(canvas, ctx, card)
  surface.flush()
  const image = surface.makeImageSnapshot()
  const png = image.encodeToBytes()
  image.delete()
  surface.delete()
  if (!png) throw new Error("PNG encode failed")
  return png
}

export function renderCard(canvas: Canvas, ctx: RenderContext, card: Card) {
  const rect = ctx.ck.LTRBRect(0, 0, px(CARD_WIDTH_MM, ctx), px(CARD_HEIGHT_MM, ctx))
  const radius = px(CARD_RADIUS_MM, ctx)
  canvas.save()
  canvas.clipRRect(ctx.ck.RRectXY(rect, radius, radius), ctx.ck.ClipOp.Intersect, true)
  fullBleed(canvas, ctx, card.image)
  for (const overlay of card.overlays ?? []) drawOverlay(canvas, ctx, overlay)
  canvas.restore()
}
