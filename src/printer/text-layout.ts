import type {
  Paragraph,
  ParagraphBuilder,
  TextAlign,
  TextStyle as CkTextStyle,
} from "canvaskit-wasm"
import { CARD_WIDTH } from "./page"
import type { ComposedText, Span } from "./compose"
import { FALLBACK_CAP_RATIO, symbolAspect, colorFromHex, type Resources } from "./resources"
import type { Style } from "./types"
import { mmFromLength, pixelsFromMm } from "./units"

const UNBOUNDED_WIDTH_PX = 1e6
const DEFAULT_FONT_FAMILY = "Bogle"
const MIN_FONT_RATIO = 0.6
const SHRINK_STEP_MM = 0.05
const INLINE_IMAGE_CAP_RATIO = 1.15

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
  symbolUrl: string
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

export function layoutText(resources: Resources, composed: ComposedText): TextLayout {
  const layout: TextLayout = { backgrounds: [], paragraphs: [], inlineImages: [] }
  if (composed.mode === "block") layoutBlockText(resources, composed, layout)
  else layoutInlineText(resources, composed, layout)
  return layout
}

function layoutInlineText(resources: Resources, composed: ComposedText, layout: TextLayout) {
  const fontSizeMm = mmFromLength(composed.style.fontSize)
  const spans = composed.content[0] ?? []
  const shaped = buildParagraph(
    resources,
    composed.style,
    spans,
    fontSizeMm,
    UNBOUNDED_WIDTH_PX,
    resources.ck.TextAlign.Left,
  )
  const width = shaped.paragraph.getMaxIntrinsicWidth()
  const x =
    composed.style.align === "center"
      ? (pixelsFromMm(CARD_WIDTH) - width) / 2
      : pixelsFromMm(composed.boxXMm)
  const y = capTopPx(
    resources,
    composed.style,
    pixelsFromMm(composed.boxYMm),
    fontSizeMm,
    shaped.paragraph,
  )
  placeParagraph(layout, resources, shaped, x, y, fontSizeMm)
}

function layoutBlockText(resources: Resources, composed: ComposedText, layout: TextLayout) {
  const boxX = pixelsFromMm(composed.boxXMm)
  const boxHeightPx = pixelsFromMm(composed.boxHeightMm)
  const wrapWidth = pixelsFromMm(composed.boxWidthMm)
  const align =
    composed.style.align === "center" ? resources.ck.TextAlign.Center : resources.ck.TextAlign.Left
  const baseFontSizeMm = mmFromLength(composed.style.fontSize)
  const minFontSizeMm = baseFontSizeMm * MIN_FONT_RATIO

  const tryLayout = (fontSizeMm: number) => {
    const paragraphs = composed.content.map((spans) =>
      buildParagraph(resources, composed.style, spans, fontSizeMm, wrapWidth, align),
    )
    const paragraphGap = pixelsFromMm(mmFromLength(composed.style.paragraphGap))
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
      ? pixelsFromMm(composed.boxYMm) + Math.max(0, spareHeight / 2)
      : pixelsFromMm(composed.boxYMm)
  const capHeight = capHeightPx(resources, composed.style, laid.fontSizeMm)
  const firstLineAscent = laid.paragraphs[0]?.paragraph.getLineMetrics()[0]?.ascent ?? 0
  let cursorY = blockTop - (firstLineAscent - capHeight)
  for (const shaped of laid.paragraphs) {
    placeParagraph(layout, resources, shaped, boxX, cursorY, laid.fontSizeMm)
    cursorY += shaped.paragraph.getHeight() + laid.paragraphGap
  }
}

interface InlineImage {
  symbolUrl: string
  dropPx: number
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
  resources: Resources,
  base: Style,
  spans: Span[],
  fontSizeMm: number,
  wrapWidthPx: number,
  align: TextAlign,
): ShapedParagraph {
  const paragraphStyle = new resources.ck.ParagraphStyle({
    textStyle: ckTextStyle(resources, base, fontSizeMm),
    textAlign: align,
  })
  const builder = resources.ck.ParagraphBuilder.MakeFromFontProvider(
    paragraphStyle,
    resources.fonts,
  )
  const placeholders: (InlineImage | null)[] = []
  const backgrounds: BackgroundRange[] = []

  let offset = 0
  for (const span of spans)
    offset = layoutSpan(resources, builder, span, fontSizeMm, offset, placeholders, backgrounds)

  const paragraph = builder.build()
  builder.delete()
  paragraph.layout(wrapWidthPx)
  return { paragraph, placeholders, backgrounds }
}

function layoutSpan(
  resources: Resources,
  builder: ParagraphBuilder,
  span: Span,
  fontSizeMm: number,
  offset: number,
  placeholders: (InlineImage | null)[],
  backgrounds: BackgroundRange[],
): number {
  if ("symbolUrl" in span) {
    const aspect = symbolAspect(resources, span.symbolUrl)
    if (aspect == null) return offset
    const capHeight = capHeightPx(resources, span.style, fontSizeMm)
    const height = capHeight * INLINE_IMAGE_CAP_RATIO
    const width = height * aspect
    builder.addPlaceholder(
      width,
      height,
      resources.ck.PlaceholderAlignment.Middle,
      resources.ck.TextBaseline.Alphabetic,
      0,
    )
    placeholders.push({
      symbolUrl: span.symbolUrl,
      dropPx: (capHeight * (1 - INLINE_IMAGE_CAP_RATIO)) / 2,
    })
    return offset + 1
  }

  offset = layoutMargin(resources, builder, span.style.margin?.before, offset, placeholders)
  const text = span.style.uppercase ? span.text.toUpperCase() : span.text
  builder.pushStyle(ckTextStyle(resources, span.style, fontSizeMm))
  builder.addText(text)
  builder.pop()
  const start = offset
  offset += text.length

  if (span.style.background) backgrounds.push({ start, end: offset, style: span.style })
  return layoutMargin(resources, builder, span.style.margin?.after, offset, placeholders)
}

function layoutMargin(
  resources: Resources,
  builder: ParagraphBuilder,
  marginLength: string | undefined,
  offset: number,
  placeholders: (InlineImage | null)[],
): number {
  const gap = pixelsFromMm(mmFromLength(marginLength))
  if (gap <= 0) return offset
  builder.addPlaceholder(
    gap,
    1,
    resources.ck.PlaceholderAlignment.Middle,
    resources.ck.TextBaseline.Alphabetic,
    0,
  )
  placeholders.push(null)
  return offset + 1
}

function placeParagraph(
  layout: TextLayout,
  resources: Resources,
  shaped: ShapedParagraph,
  x: number,
  y: number,
  fontSizeMm: number,
) {
  layout.paragraphs.push({ paragraph: shaped.paragraph, x, y })
  layout.backgrounds.push(...placeBackgrounds(resources, shaped, x, y, fontSizeMm))
  layout.inlineImages.push(...placeInlineImages(shaped, x, y))
}

function placeBackgrounds(
  resources: Resources,
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
    const outset = mmFromOutset(background.outset)
    const radius = pixelsFromMm(mmFromLength(background.corners?.bottomRight))
    const capHeight = capHeightPx(resources, range.style, fontSizeMm)
    for (const { rect } of shaped.paragraph.getRectsForRange(
      range.start,
      range.end,
      resources.ck.RectHeightStyle.Max,
      resources.ck.RectWidthStyle.Tight,
    )) {
      const midY = (rect[1] + rect[3]) / 2
      const line = lineAt(lines, midY)
      const baseline = originY + (line?.baseline ?? 0)
      placed.push({
        left: originX + rect[0] - pixelsFromMm(outset.left),
        top: baseline - capHeight - pixelsFromMm(outset.top),
        right: originX + rect[2] + pixelsFromMm(outset.right),
        bottom: baseline + pixelsFromMm(outset.bottom),
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
      symbolUrl: inlineImage.symbolUrl,
      x: originX + rect[0],
      y: originY + (line?.baseline ?? 0) - height - inlineImage.dropPx,
      width,
      height,
    })
  })
  return placed
}

const lineAt = (lines: ReturnType<Paragraph["getLineMetrics"]>, y: number) =>
  lines.find((line) => y >= line.baseline - line.ascent && y <= line.baseline + line.descent) ??
  lines[0]

const capHeightPx = (resources: Resources, style: Style, fontSizeMm: number) =>
  (resources.capRatios.get(style.fontFamily ?? DEFAULT_FONT_FAMILY) ?? FALLBACK_CAP_RATIO) *
  pixelsFromMm(fontSizeMm)

function capTopPx(
  resources: Resources,
  style: Style,
  boxYPx: number,
  fontSizeMm: number,
  paragraph: Paragraph,
): number {
  const ascent = paragraph.getLineMetrics()[0]?.ascent ?? 0
  return boxYPx - (ascent - capHeightPx(resources, style, fontSizeMm))
}

const mmFromOutset = (
  outset: { top?: string; right?: string; bottom?: string; left?: string } | undefined,
) => ({
  top: mmFromLength(outset?.top),
  right: mmFromLength(outset?.right),
  bottom: mmFromLength(outset?.bottom),
  left: mmFromLength(outset?.left),
})

const ckFontWeight = (resources: Resources, weight = 400) => {
  const weights = resources.ck.FontWeight
  if (weight <= 300) return weights.Light
  if (weight <= 400) return weights.Normal
  if (weight <= 500) return weights.Medium
  if (weight <= 600) return weights.SemiBold
  if (weight <= 700) return weights.Bold
  if (weight <= 800) return weights.ExtraBold
  return weights.Black
}

const ckTextStyle = (resources: Resources, style: Style, fontSizeMm: number): CkTextStyle =>
  new resources.ck.TextStyle({
    color: colorFromHex(resources, style.color ?? "#000000", style.opacity ?? 1),
    fontFamilies: [style.fontFamily ?? DEFAULT_FONT_FAMILY],
    fontSize: pixelsFromMm(fontSizeMm),
    fontStyle: {
      weight: ckFontWeight(resources, style.fontWeight),
      slant:
        style.fontStyle === "italic"
          ? resources.ck.FontSlant.Italic
          : resources.ck.FontSlant.Upright,
    },
    letterSpacing: pixelsFromMm(mmFromLength(style.letterSpacing)),
    heightMultiplier: style.lineHeight,
    halfLeading: true,
  })
