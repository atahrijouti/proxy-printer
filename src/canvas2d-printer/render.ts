import { Flow, fontString, type PlacedBackground, type PlacedImage, type PlacedText } from "./flow"
import { composeText } from "./compose"
import type { ResolvedPresentation } from "./resolve"
import type { Card, Overlay } from "./types"

type Ctx = CanvasRenderingContext2D
type Images = Map<string, HTMLImageElement>

// one text-layout engine for the app; it holds only an internal measuring canvas and is reused
const flow = new Flow()

export interface CardFrame {
  width: number
  height: number
  radius: number
}

interface DrawEnv {
  presentation: ResolvedPresentation
  images: Images
  cardWidth: number
  cardHeight: number
}

function imageAspect(images: Images, src: string): number {
  const image = images.get(src)
  return image ? image.naturalWidth / image.naturalHeight : 1
}

function drawBackground(ctx: Ctx, bg: PlacedBackground, originX: number, originY: number) {
  const corners = bg.background.corners ?? {}
  ctx.beginPath()
  ctx.roundRect(originX + bg.x, originY + bg.y, bg.width, bg.height, [
    corners.topLeft ?? 0,
    corners.topRight ?? 0,
    corners.bottomRight ?? 0,
    corners.bottomLeft ?? 0,
  ])
  ctx.fillStyle = bg.background.fill
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
      ctx.font = fontString(item.style, item.fontSize)
      ctx.letterSpacing = `${item.style.letterSpacing ?? 0}px`
      ctx.fillStyle = item.style.color ?? "#000000"
      ctx.globalAlpha = item.style.opacity ?? 1
      ctx.fillText(item.text, originX + item.x, originY + item.baseline)
      ctx.globalAlpha = 1
      return
    case "image": {
      const image = images.get(item.src)
      if (image) ctx.drawImage(image, originX + item.x, originY + item.y, item.width, item.height)
      return
    }
    default: {
      const _exhaustive: never = item
      return _exhaustive
    }
  }
}

function drawTextOverlay(ctx: Ctx, overlay: Extract<Overlay, { type: "text" }>, env: DrawEnv) {
  const paragraphs = (Array.isArray(overlay.content) ? overlay.content : [overlay.content]).filter(
    (p) => p.length > 0,
  )
  const { content, box, style, originX, originY } = composeText(
    overlay.style,
    paragraphs,
    env.presentation,
    (src) => imageAspect(env.images, src),
    env.cardWidth,
  )
  const laid = flow.layout(content, box, style)
  for (const bg of laid.backgrounds) drawBackground(ctx, bg, originX, originY)
  for (const item of laid.content) drawItem(ctx, item, originX, originY, env.images)
}

function drawOverlay(ctx: Ctx, overlay: Overlay, env: DrawEnv) {
  switch (overlay.type) {
    case "image": {
      const image = env.images.get(overlay.src)
      if (image) ctx.drawImage(image, 0, 0, env.cardWidth, env.cardHeight)
      return
    }
    case "shape":
      return
    case "text":
      drawTextOverlay(ctx, overlay, env)
      return
    default: {
      const _exhaustive: never = overlay
      return _exhaustive
    }
  }
}

export function drawCard(
  ctx: Ctx,
  card: Card,
  presentation: ResolvedPresentation,
  images: Images,
  frame: CardFrame,
) {
  const env: DrawEnv = {
    presentation,
    images,
    cardWidth: frame.width,
    cardHeight: frame.height,
  }

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, frame.width, frame.height, frame.radius)
  ctx.clip()
  const cardImage = images.get(card.image)
  if (cardImage) ctx.drawImage(cardImage, 0, 0, frame.width, frame.height)
  for (const overlay of card.overlays ?? []) drawOverlay(ctx, overlay, env)
  ctx.restore()
}
