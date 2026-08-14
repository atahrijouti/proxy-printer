// The layout engine: canvaskit measures, shapes, wraps, and positions the text, and we
// read finished device-pixel coordinates back out as placed primitives. This is skia's
// analogue of the canvas2d printer's flow.ts — the difference is that canvaskit (not a
// hand-rolled measurer) is the engine. render.ts only draws what this returns.

import type {
  Image,
  Paragraph,
  ParagraphBuilder,
  TextAlign,
  TextStyle as CkTextStyle,
} from "canvaskit-wasm"
import { CARD_WIDTH_MM } from "./card"
import type { ComposedText, Span } from "./compose"
import { FALLBACK_CAP_RATIO, toColor, type RenderContext } from "./engine"
import type { Style } from "./types"
import { toMillimetres } from "./units"

// An inline {abbr} image is sized to 1.15× the surrounding text's cap height and centred
// on the cap-box middle — matching the canvas2d printer (the DB carries only the URL).
const INLINE_IMAGE_CAP_RATIO = 1.15
const UNBOUNDED_WIDTH_PX = 1e6 // an inline (single-line) style never wraps
const DEFAULT_FONT_FAMILY = "Bogle"
const MIN_FONT_RATIO = 0.6 // shrink-to-fit floor: block text shrinks to at most 60% (canvas2d parity)
const SHRINK_STEP_MM = 0.05 // font-size decrement per shrink attempt

// ── Placed primitives (device px) — the whole engine output render.ts consumes ─────
export interface PlacedParagraph {
  paragraph: Paragraph // owned by the caller: draw it, then delete it
  x: number
  y: number
}
export interface PlacedBackground {
  left: number
  top: number
  right: number
  bottom: number
  radius: number
  fill: string // hex; render turns it into a canvaskit colour
}
export interface PlacedImage {
  image: Image
  x: number
  y: number
  size: number
}
export interface Layout {
  backgrounds: PlacedBackground[]
  paragraphs: PlacedParagraph[]
  images: PlacedImage[]
}

export function layoutOverlay(ctx: RenderContext, composed: ComposedText): Layout {
  const layout: Layout = { backgrounds: [], paragraphs: [], images: [] }
  if (composed.mode === "block") layoutBlock(ctx, composed, layout)
  else layoutInline(ctx, composed, layout)
  return layout
}

// An inline style is a single line placed at box.x (or centred across the card); box.y is
// the cap-top (canvas2d: baseline = box.y + cap), so we lift by capTop.
function layoutInline(ctx: RenderContext, composed: ComposedText, layout: Layout) {
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
      ? (px(CARD_WIDTH_MM, ctx) - width) / 2
      : px(composed.boxXMm, ctx)
  const y = capTop(ctx, composed.style, px(composed.boxYMm, ctx), fontSizeMm, shaped.paragraph)
  placeParagraph(layout, ctx, shaped, x, y, fontSizeMm)
}

// A block wraps within box.w and shrinks its font-size until it fits box.h (canvas2d parity),
// then vertical-aligns; box.y is the cap-top of the first line.
function layoutBlock(ctx: RenderContext, composed: ComposedText, layout: Layout) {
  const boxX = px(composed.boxXMm, ctx)
  const boxHeightPx = px(composed.boxHeightMm, ctx)
  const wrapWidth = px(composed.boxWidthMm, ctx)
  const align = composed.style.align === "center" ? ctx.ck.TextAlign.Center : ctx.ck.TextAlign.Left
  const baseFontSizeMm = toMillimetres(composed.style.fontSize)
  const minFontSizeMm = baseFontSizeMm * MIN_FONT_RATIO

  // lay the whole block out at a candidate font-size, measuring its stacked height
  const tryLayout = (fontSizeMm: number) => {
    const paragraphs = composed.content.map((spans) =>
      buildParagraph(ctx, composed.style, spans, fontSizeMm, wrapWidth, align),
    )
    const paragraphGap = px(toMillimetres(composed.style.paragraphGap, fontSizeMm), ctx)
    const height =
      paragraphs.reduce((sum, shaped) => sum + shaped.paragraph.getHeight(), 0) +
      paragraphGap * Math.max(0, paragraphs.length - 1)
    return { paragraphs, paragraphGap, height, fontSizeMm }
  }

  // shrink-to-fit: keep shrinking the font-size until the block fits box.h (or hits the floor)
  let laid = tryLayout(baseFontSizeMm)
  while (laid.height > boxHeightPx && laid.fontSizeMm > minFontSizeMm) {
    for (const shaped of laid.paragraphs) shaped.paragraph.delete()
    laid = tryLayout(Math.max(minFontSizeMm, laid.fontSizeMm - SHRINK_STEP_MM))
  }

  const spareHeight = boxHeightPx - laid.height
  const blockTop =
    composed.style.valign === "center"
      ? px(composed.boxYMm, ctx) + Math.max(0, spareHeight / 2)
      : px(composed.boxYMm, ctx)
  const capHeight = capHeightPx(ctx, composed.style, laid.fontSizeMm)
  const firstLineAscent = laid.paragraphs[0]?.paragraph.getLineMetrics()[0]?.ascent ?? 0
  // canvaskit puts the first baseline at top + ascent; lift so box.y lands on the cap-top instead
  let cursorY = blockTop - (firstLineAscent - capHeight)
  for (const shaped of laid.paragraphs) {
    placeParagraph(layout, ctx, shaped, boxX, cursorY, laid.fontSizeMm)
    cursorY += shaped.paragraph.getHeight() + laid.paragraphGap
  }
}

// ── Building a canvaskit paragraph from composed spans ────────────────────────────────
interface InlineImage {
  image: Image
  drop: number
}
interface BackgroundRange {
  start: number
  end: number
  style: Style
}
// a laid-out canvaskit paragraph plus the data needed to place its images and backgrounds
interface ShapedParagraph {
  paragraph: Paragraph
  placeholders: (InlineImage | null)[] // index-aligned with the paragraph's placeholders
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
    offset = addSpan(ctx, builder, span, fontSizeMm, offset, placeholders, backgrounds)

  const paragraph = builder.build()
  builder.delete()
  paragraph.layout(wrapWidthPx)
  return { paragraph, placeholders, backgrounds }
}

function addSpan(
  ctx: RenderContext,
  builder: ParagraphBuilder,
  span: Span,
  fontSizeMm: number,
  offset: number,
  placeholders: (InlineImage | null)[],
  backgrounds: BackgroundRange[],
): number {
  if ("imageSrc" in span) {
    const image = ctx.images.get(span.imageSrc)
    if (!image) return offset
    const capHeight = capHeightPx(ctx, span.style, fontSizeMm)
    const size = capHeight * INLINE_IMAGE_CAP_RATIO
    builder.addPlaceholder(
      size,
      size,
      ctx.ck.PlaceholderAlignment.Middle,
      ctx.ck.TextBaseline.Alphabetic,
      0,
    )
    placeholders.push({ image, drop: (capHeight * (1 - INLINE_IMAGE_CAP_RATIO)) / 2 })
    return offset + 1
  }

  offset = addMargin(ctx, builder, span.style.margin?.before, fontSizeMm, offset, placeholders)
  const text = span.style.uppercase ? span.text.toUpperCase() : span.text
  builder.pushStyle(toTextStyle(ctx, span.style, fontSizeMm))
  builder.addText(text)
  builder.pop()
  const start = offset
  offset += text.length
  // the background box wraps just the text; its outset extends it, margins sit outside it
  if (span.style.background) backgrounds.push({ start, end: offset, style: span.style })
  return addMargin(ctx, builder, span.style.margin?.after, fontSizeMm, offset, placeholders)
}

// a margin is a flow-only gap: a placeholder that reserves width but draws nothing
function addMargin(
  ctx: RenderContext,
  builder: ParagraphBuilder,
  marginLength: string | undefined,
  fontSizeMm: number,
  offset: number,
  placeholders: (InlineImage | null)[],
): number {
  const gap = px(toMillimetres(marginLength, fontSizeMm), ctx)
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

// ── Positioning one shaped paragraph and deriving its backgrounds / images ──────────
function placeParagraph(
  layout: Layout,
  ctx: RenderContext,
  shaped: ShapedParagraph,
  x: number,
  y: number,
  fontSizeMm: number,
) {
  layout.paragraphs.push({ paragraph: shaped.paragraph, x, y })
  layout.backgrounds.push(...placeBackgrounds(ctx, shaped, x, y, fontSizeMm))
  layout.images.push(...placeImages(shaped, x, y))
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
    const radius = px(toMillimetres(background.corners?.bottomRight), ctx)
    const capHeight = capHeightPx(ctx, range.style, fontSizeMm)
    for (const { rect } of shaped.paragraph.getRectsForRange(
      range.start,
      range.end,
      ctx.ck.RectHeightStyle.Max,
      ctx.ck.RectWidthStyle.Tight,
    )) {
      // each rect can be on a different line when a range wraps — pick the line by its own midpoint
      const midY = (rect[1] + rect[3]) / 2
      const line = lineAt(lines, midY)
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

function placeImages(shaped: ShapedParagraph, originX: number, originY: number): PlacedImage[] {
  const lines = shaped.paragraph.getLineMetrics()
  const placed: PlacedImage[] = []
  shaped.paragraph.getRectsForPlaceholders().forEach(({ rect }, i) => {
    const inlineImage = shaped.placeholders[i]
    if (!inlineImage) return
    const size = rect[2] - rect[0]
    const line = lineAt(lines, (rect[1] + rect[3]) / 2)
    placed.push({
      image: inlineImage.image,
      x: originX + rect[0],
      y: originY + (line?.baseline ?? 0) - size - inlineImage.drop,
      size,
    })
  })
  return placed
}

// ── canvaskit + geometry helpers ─────────────────────────────────────────────────────
const px = (mm: number, ctx: RenderContext) => mm * ctx.scale

// the line whose vertical extent contains y (falling back to the first line)
const lineAt = (lines: ReturnType<Paragraph["getLineMetrics"]>, y: number) =>
  lines.find((line) => y >= line.baseline - line.ascent && y <= line.baseline + line.descent) ??
  lines[0]

const capHeightPx = (ctx: RenderContext, style: Style, fontSizeMm: number) =>
  (ctx.capRatios.get(style.fontFamily ?? DEFAULT_FONT_FAMILY) ?? FALLBACK_CAP_RATIO) *
  px(fontSizeMm, ctx)

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
    fontSize: px(fontSizeMm, ctx),
    fontStyle: {
      weight: toFontWeight(ctx, style.fontWeight),
      slant: style.fontStyle === "italic" ? ctx.ck.FontSlant.Italic : ctx.ck.FontSlant.Upright,
    },
    letterSpacing: px(toMillimetres(style.letterSpacing), ctx),
    heightMultiplier: style.lineHeight,
    halfLeading: true,
  })
