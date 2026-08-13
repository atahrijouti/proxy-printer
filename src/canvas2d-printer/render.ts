import {
  layout,
  type Measurer,
  type PlacedImage,
  type PlacedText,
  type BackgroundBox,
} from "./flow"
import type { Card, Overlay, ResolvedTextStyle } from "./types"
import type { ResolvedPresentation } from "./resolve"
import { CARD_HEIGHT_MM, CARD_RADIUS_MM, CARD_WIDTH_MM } from "./card"

// a box edge for line-mode text: no wrapping, no height limit
const UNBOUNDED = Infinity
// shrink-to-fit will not go below this fraction of the style's base size
const MIN_SIZE_RATIO = 0.6
// only used when the browser reports no font metrics; fractions of the font size
const FALLBACK_CAP_RATIO = 0.7
const FALLBACK_ASCENT_RATIO = 0.9
const FALLBACK_DESCENT_RATIO = 0.25

type Ctx = CanvasRenderingContext2D
type Images = Map<string, HTMLImageElement>

const fontString = (style: ResolvedTextStyle, sizePx: number) =>
  `${style.fontStyle === "italic" ? "italic " : ""}${style.fontWeight ?? 400} ${sizePx}px ${JSON.stringify(style.fontFamily ?? "sans-serif")}`

export class CanvasMeasurer implements Measurer {
  private ctx: Ctx
  private images: Images
  capHeight = 0
  ascent = 0
  descent = 0
  constructor(images: Images) {
    this.images = images
    this.ctx = document.createElement("canvas").getContext("2d")!
  }
  setFont(style: ResolvedTextStyle, sizePx: number) {
    this.ctx.font = fontString(style, sizePx)
    const capMetrics = this.ctx.measureText("H")
    const lineMetrics = this.ctx.measureText("Hg")
    this.capHeight = capMetrics.actualBoundingBoxAscent || sizePx * FALLBACK_CAP_RATIO
    this.ascent = lineMetrics.fontBoundingBoxAscent || sizePx * FALLBACK_ASCENT_RATIO
    this.descent = lineMetrics.fontBoundingBoxDescent || sizePx * FALLBACK_DESCENT_RATIO
  }
  measureWidth(text: string) {
    return this.ctx.measureText(text).width
  }
  imageAspect(src: string) {
    const image = this.images.get(src)
    return image ? image.naturalWidth / image.naturalHeight : 1
  }
}

interface DrawEnv {
  presentation: ResolvedPresentation
  images: Images
  measurer: CanvasMeasurer
  scale: number
}

function drawBackground(ctx: Ctx, box: BackgroundBox, originX: number, originY: number) {
  const corners = box.background.corners ?? {}
  ctx.beginPath()
  ctx.roundRect(originX + box.x, originY + box.y, box.w, box.h, [
    corners.topLeft ?? 0,
    corners.topRight ?? 0,
    corners.bottomRight ?? 0,
    corners.bottomLeft ?? 0,
  ])
  ctx.fillStyle = box.background.fill
  ctx.fill()
}

function drawItem(
  ctx: Ctx,
  item: PlacedText | PlacedImage,
  originX: number,
  originY: number,
  images: Images,
) {
  switch (item.type) {
    case "text":
      ctx.font = fontString(item.style, item.sizePx)
      ctx.fillStyle = item.style.color ?? "#000000"
      ctx.globalAlpha = item.style.opacity ?? 1
      ctx.fillText(item.text, originX + item.x, originY + item.baseline)
      ctx.globalAlpha = 1
      return
    case "image": {
      const image = images.get(item.src)
      if (image) ctx.drawImage(image, originX + item.x, originY + item.y, item.w, item.h)
      return
    }
  }
}

function drawTextOverlay(ctx: Ctx, overlay: Extract<Overlay, { type: "text" }>, env: DrawEnv) {
  const style = env.presentation.styles[overlay.style]
  if (!style) throw new Error(`unknown style: "${overlay.style}"`)
  const paragraphs = (Array.isArray(overlay.content) ? overlay.content : [overlay.content]).filter(
    (p) => p.length > 0,
  )
  const isBlock = style.mode === "block"
  const baseSizePx = style.fontSize ?? 0

  const laidOut = layout({
    paragraphs,
    baseStyle: style,
    baseSizePx,
    minSizePx: baseSizePx * MIN_SIZE_RATIO,
    boxWidth: isBlock
      ? (style.box?.w ?? 0)
      : style.align === "center"
        ? CARD_WIDTH_MM * env.scale
        : UNBOUNDED,
    boxHeight: isBlock ? (style.box?.h ?? 0) : UNBOUNDED,
    lineHeight: style.lineHeight ?? 1,
    paragraphGap: style.paragraphGap ?? 0,
    align: style.align ?? "left",
    valign: style.valign ?? "top",
    styles: env.presentation.styles,
    abbreviations: env.presentation.abbreviations,
    measurer: env.measurer,
  })

  const originX = isBlock || style.align !== "center" ? (style.box?.x ?? 0) : 0
  const originY = style.box?.y ?? 0

  for (const box of laidOut.backgrounds) drawBackground(ctx, box, originX, originY)
  for (const item of laidOut.content) drawItem(ctx, item, originX, originY, env.images)
}

function drawOverlay(ctx: Ctx, overlay: Overlay, env: DrawEnv) {
  switch (overlay.type) {
    case "image": {
      const image = env.images.get(overlay.src)
      if (image) ctx.drawImage(image, 0, 0, CARD_WIDTH_MM * env.scale, CARD_HEIGHT_MM * env.scale)
      return
    }
    case "shape":
      return
    case "text":
      drawTextOverlay(ctx, overlay, env)
      return
  }
}

export function drawCard(
  ctx: Ctx,
  card: Card,
  presentation: ResolvedPresentation,
  images: Images,
  measurer: CanvasMeasurer,
  scale: number,
) {
  const env: DrawEnv = { presentation, images, measurer, scale }
  const width = CARD_WIDTH_MM * scale
  const height = CARD_HEIGHT_MM * scale

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, CARD_RADIUS_MM * scale)
  ctx.clip()
  const cardImage = images.get(card.image)
  if (cardImage) ctx.drawImage(cardImage, 0, 0, width, height)
  for (const overlay of card.overlays ?? []) drawOverlay(ctx, overlay, env)
  ctx.restore()
}
