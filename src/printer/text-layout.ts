import type {
  Paragraph,
  ParagraphBuilder,
  TextAlign,
  TextStyle as CkTextStyle,
} from "canvaskit-wasm"
import { CARD_WIDTH_MM } from "./card"
import type { ComposedText, Span } from "./compose"
import {
  FALLBACK_CAP_RATIO,
  INLINE_IMAGE_CAP_RATIO,
  symbolAspect,
  toColor,
  type RenderContext,
} from "./resources"
import type { Style } from "./types"
import { toMillimetres, toPixels } from "./units"

const UNBOUNDED_WIDTH_PX = 1e6
const DEFAULT_FONT_FAMILY = "Bogle"
const MIN_FONT_RATIO = 0.6
const SHRINK_STEP_MM = 0.05

export interface PlacedParagraph {
  paragraph: Paragraph
  x: number
  y: number
}
export interface PlacedBackground {
  left: number
  top: number
  right: number
  bottom: number
  radius: number
  fill: string
}

export interface PlacedInlineImage {
  src: string
  x: number
  y: number
  width: number
  height: number
}
export interface TextLayout {
  backgrounds: PlacedBackground[]
  paragraphs: PlacedParagraph[]
  inlineImages: PlacedInlineImage[]
}

export function layoutText(ctx: RenderContext, composed: ComposedText): TextLayout {
  const layout: TextLayout = { backgrounds: [], paragraphs: [], inlineImages: [] }
  if (composed.mode === "block") layoutBlockText(ctx, composed, layout)
  else layoutInlineText(ctx, composed, layout)
  return layout
}

function layoutInlineText(ctx: RenderContext, composed: ComposedText, layout: TextLayout) {
  const fontSizeMm = toMillimetres(composed.style.fontSize)
  const spans = composed.content[0] ?? []
  const shaped = buildParagraph(
    ctx,
    composed.style,
    spans,
    fontSizeMm,
    UNBOUNDED_WIDTH_PX,
    ctx.ck.TextAlign.Left,
  )
  const width = shaped.paragraph.getMaxIntrinsicWidth()
  const x =
    composed.style.align === "center"
      ? (toPixels(CARD_WIDTH_MM) - width) / 2
      : toPixels(composed.boxXMm)
  const y = capTop(ctx, composed.style, toPixels(composed.boxYMm), fontSizeMm, shaped.paragraph)
  placeParagraph(layout, ctx, shaped, x, y, fontSizeMm)
}

function layoutBlockText(ctx: RenderContext, composed: ComposedText, layout: TextLayout) {
  const boxX = toPixels(composed.boxXMm)
  const boxHeightPx = toPixels(composed.boxHeightMm)
  const wrapWidth = toPixels(composed.boxWidthMm)
  const align = composed.style.align === "center" ? ctx.ck.TextAlign.Center : ctx.ck.TextAlign.Left
  const baseFontSizeMm = toMillimetres(composed.style.fontSize)
  const minFontSizeMm = baseFontSizeMm * MIN_FONT_RATIO

  const tryLayout = (fontSizeMm: number) => {
    const paragraphs = composed.content.map((spans) =>
      buildParagraph(ctx, composed.style, spans, fontSizeMm, wrapWidth, align),
    )
    const paragraphGap = toPixels(toMillimetres(composed.style.paragraphGap, fontSizeMm))
    const height =
      paragraphs.reduce((sum, shaped) => sum + shaped.paragraph.getHeight(), 0) +
      paragraphGap * Math.max(0, paragraphs.length - 1)
    return { paragraphs, paragraphGap, height, fontSizeMm }
  }

  let laid = tryLayout(baseFontSizeMm)
  while (laid.height > boxHeightPx && laid.fontSizeMm > minFontSizeMm) {
    for (const shaped of laid.paragraphs) shaped.paragraph.delete()
    laid = tryLayout(Math.max(minFontSizeMm, laid.fontSizeMm - SHRINK_STEP_MM))
  }

  const spareHeight = boxHeightPx - laid.height
  const blockTop =
    composed.style.valign === "center"
      ? toPixels(composed.boxYMm) + Math.max(0, spareHeight / 2)
      : toPixels(composed.boxYMm)
  const capHeight = capHeightPx(ctx, composed.style, laid.fontSizeMm)
  const firstLineAscent = laid.paragraphs[0]?.paragraph.getLineMetrics()[0]?.ascent ?? 0
  let cursorY = blockTop - (firstLineAscent - capHeight)
  for (const shaped of laid.paragraphs) {
    placeParagraph(layout, ctx, shaped, boxX, cursorY, laid.fontSizeMm)
    cursorY += shaped.paragraph.getHeight() + laid.paragraphGap
  }
}

interface InlineImage {
  src: string
  drop: number
}
interface BackgroundRange {
  start: number
  end: number
  style: Style
}
interface ShapedParagraph {
  paragraph: Paragraph
  placeholders: (InlineImage | null)[]
  backgrounds: BackgroundRange[]
}

function buildParagraph(
  ctx: RenderContext,
  base: Style,
  spans: Span[],
  fontSizeMm: number,
  wrapWidthPx: number,
  align: TextAlign,
): ShapedParagraph {
  const paragraphStyle = new ctx.ck.ParagraphStyle({
    textStyle: toTextStyle(ctx, base, fontSizeMm),
    textAlign: align,
  })
  const builder = ctx.ck.ParagraphBuilder.MakeFromFontProvider(paragraphStyle, ctx.fonts)
  const placeholders: (InlineImage | null)[] = []
  const backgrounds: BackgroundRange[] = []

  let offset = 0
  for (const span of spans)
    offset = layoutSpan(ctx, builder, span, fontSizeMm, offset, placeholders, backgrounds)

  const paragraph = builder.build()
  builder.delete()
  paragraph.layout(wrapWidthPx)
  return { paragraph, placeholders, backgrounds }
}

function layoutSpan(
  ctx: RenderContext,
  builder: ParagraphBuilder,
  span: Span,
  fontSizeMm: number,
  offset: number,
  placeholders: (InlineImage | null)[],
  backgrounds: BackgroundRange[],
): number {
  if ("imageSrc" in span) {
    const aspect = symbolAspect(ctx, span.imageSrc)
    if (aspect == null) return offset
    const capHeight = capHeightPx(ctx, span.style, fontSizeMm)
    const height = capHeight * INLINE_IMAGE_CAP_RATIO
    const width = height * aspect
    builder.addPlaceholder(
      width,
      height,
      ctx.ck.PlaceholderAlignment.Middle,
      ctx.ck.TextBaseline.Alphabetic,
      0,
    )
    placeholders.push({
      src: span.imageSrc,
      drop: (capHeight * (1 - INLINE_IMAGE_CAP_RATIO)) / 2,
    })
    return offset + 1
  }

  offset = layoutMargin(ctx, builder, span.style.margin?.before, fontSizeMm, offset, placeholders)
  const text = span.style.uppercase ? span.text.toUpperCase() : span.text
  builder.pushStyle(toTextStyle(ctx, span.style, fontSizeMm))
  builder.addText(text)
  builder.pop()
  const start = offset
  offset += text.length

  if (span.style.background) backgrounds.push({ start, end: offset, style: span.style })
  return layoutMargin(ctx, builder, span.style.margin?.after, fontSizeMm, offset, placeholders)
}

function layoutMargin(
  ctx: RenderContext,
  builder: ParagraphBuilder,
  marginLength: string | undefined,
  fontSizeMm: number,
  offset: number,
  placeholders: (InlineImage | null)[],
): number {
  const gap = toPixels(toMillimetres(marginLength, fontSizeMm))
  if (gap <= 0) return offset
  builder.addPlaceholder(
    gap,
    1,
    ctx.ck.PlaceholderAlignment.Middle,
    ctx.ck.TextBaseline.Alphabetic,
    0,
  )
  placeholders.push(null)
  return offset + 1
}

function placeParagraph(
  layout: TextLayout,
  ctx: RenderContext,
  shaped: ShapedParagraph,
  x: number,
  y: number,
  fontSizeMm: number,
) {
  layout.paragraphs.push({ paragraph: shaped.paragraph, x, y })
  layout.backgrounds.push(...placeBackgrounds(ctx, shaped, x, y, fontSizeMm))
  layout.inlineImages.push(...placeInlineImages(shaped, x, y))
}

function placeBackgrounds(
  ctx: RenderContext,
  shaped: ShapedParagraph,
  originX: number,
  originY: number,
  fontSizeMm: number,
): PlacedBackground[] {
  const lines = shaped.paragraph.getLineMetrics()
  const placed: PlacedBackground[] = []
  for (const range of shaped.backgrounds) {
    const background = range.style.background
    if (!background) continue
    const outset = resolveOutset(background.outset, fontSizeMm)
    const radius = toPixels(toMillimetres(background.corners?.bottomRight))
    const capHeight = capHeightPx(ctx, range.style, fontSizeMm)
    for (const { rect } of shaped.paragraph.getRectsForRange(
      range.start,
      range.end,
      ctx.ck.RectHeightStyle.Max,
      ctx.ck.RectWidthStyle.Tight,
    )) {
      const midY = (rect[1] + rect[3]) / 2
      const line = lineAt(lines, midY)
      const baseline = originY + (line?.baseline ?? 0)
      placed.push({
        left: originX + rect[0] - toPixels(outset.left),
        top: baseline - capHeight - toPixels(outset.top),
        right: originX + rect[2] + toPixels(outset.right),
        bottom: baseline + toPixels(outset.bottom),
        radius,
        fill: background.fill,
      })
    }
  }
  return placed
}

function placeInlineImages(
  shaped: ShapedParagraph,
  originX: number,
  originY: number,
): PlacedInlineImage[] {
  const lines = shaped.paragraph.getLineMetrics()
  const placed: PlacedInlineImage[] = []
  shaped.paragraph.getRectsForPlaceholders().forEach(({ rect }, i) => {
    const inlineImage = shaped.placeholders[i]
    if (!inlineImage) return
    const width = rect[2] - rect[0]
    const height = rect[3] - rect[1]
    const line = lineAt(lines, (rect[1] + rect[3]) / 2)
    placed.push({
      src: inlineImage.src,
      x: originX + rect[0],
      y: originY + (line?.baseline ?? 0) - height - inlineImage.drop,
      width,
      height,
    })
  })
  return placed
}

const lineAt = (lines: ReturnType<Paragraph["getLineMetrics"]>, y: number) =>
  lines.find((line) => y >= line.baseline - line.ascent && y <= line.baseline + line.descent) ??
  lines[0]

const capHeightPx = (ctx: RenderContext, style: Style, fontSizeMm: number) =>
  (ctx.capRatios.get(style.fontFamily ?? DEFAULT_FONT_FAMILY) ?? FALLBACK_CAP_RATIO) *
  toPixels(fontSizeMm)

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

const resolveOutset = (
  outset: { top?: string; right?: string; bottom?: string; left?: string } | undefined,
  emMm: number,
) => ({
  top: toMillimetres(outset?.top, emMm),
  right: toMillimetres(outset?.right, emMm),
  bottom: toMillimetres(outset?.bottom, emMm),
  left: toMillimetres(outset?.left, emMm),
})

const toFontWeight = (ctx: RenderContext, weight = 400) => {
  const weights = ctx.ck.FontWeight
  if (weight <= 300) return weights.Light
  if (weight <= 400) return weights.Normal
  if (weight <= 500) return weights.Medium
  if (weight <= 600) return weights.SemiBold
  if (weight <= 700) return weights.Bold
  if (weight <= 800) return weights.ExtraBold
  return weights.Black
}

const toTextStyle = (ctx: RenderContext, style: Style, fontSizeMm: number): CkTextStyle =>
  new ctx.ck.TextStyle({
    color: toColor(ctx, style.color ?? "#000000", style.opacity ?? 1),
    fontFamilies: [style.fontFamily ?? DEFAULT_FONT_FAMILY],
    fontSize: toPixels(fontSizeMm),
    fontStyle: {
      weight: toFontWeight(ctx, style.fontWeight),
      slant: style.fontStyle === "italic" ? ctx.ck.FontSlant.Italic : ctx.ck.FontSlant.Upright,
    },
    letterSpacing: toPixels(toMillimetres(style.letterSpacing)),
    heightMultiplier: style.lineHeight,
    halfLeading: true,
  })
