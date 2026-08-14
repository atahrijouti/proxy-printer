import { Flow, fontString, type PlacedBackground, type PlacedImage, type PlacedText } from "./flow"
import { composeText } from "./compose"
import type { ResolvedPresentation } from "./resolve"
import type { Card, Overlay } from "./types"
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "./card"

type Ctx = CanvasRenderingContext2D
type Images = Map<string, HTMLImageElement>

// one text-layout engine for the app; it holds only an internal measuring canvas and is reused
const flow = new Flow()

// a card composites as an ordered stack of layers (by the DOM on screen, by the PDF in print) —
// the art stays native, only text is rasterized
export type Layer =
  | { type: "image"; src: string } // a URL: the base art or an image overlay, drawn natively
  | { type: "text"; src: string } // a data URL: a rasterized run of consecutive text overlays

interface DrawEnv {
  presentation: ResolvedPresentation
  images: Images
  cardWidth: number
}

// the base art, then each overlay in order — consecutive text overlays merged into one raster layer,
// so interleaved image overlays keep their z-order
export function cardLayers(
  card: Card,
  presentation: ResolvedPresentation,
  images: Images,
  textScale: number,
): Layer[] {
  const layers: Layer[] = [{ type: "image", src: card.image }]
  let run: Extract<Overlay, { type: "text" }>[] = []
  const flushText = () => {
    if (run.length === 0) return
    layers.push({ type: "text", src: rasterizeText(run, presentation, images, textScale) })
    run = []
  }
  for (const overlay of card.overlays ?? []) {
    if (overlay.type === "text") {
      run.push(overlay)
      continue
    }
    flushText()
    if (overlay.type === "image") layers.push({ type: "image", src: overlay.src })
    // shape overlays are not implemented — they contribute no layer
  }
  flushText()
  return layers
}

// draw a run of text overlays onto one transparent card-sized canvas at textScale → a data URL
function rasterizeText(
  overlays: Extract<Overlay, { type: "text" }>[],
  presentation: ResolvedPresentation,
  images: Images,
  textScale: number,
): string {
  const canvas = document.createElement("canvas")
  canvas.width = CARD_WIDTH_MM * textScale
  canvas.height = CARD_HEIGHT_MM * textScale
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2d canvas context unavailable")
  const env: DrawEnv = { presentation, images, cardWidth: canvas.width }
  for (const overlay of overlays) drawTextOverlay(ctx, overlay, env)
  return canvas.toDataURL("image/png")
}

function imageAspect(images: Images, src: string): number {
  const image = images.get(src)
  return image ? image.naturalWidth / image.naturalHeight : 1
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
  const layout = flow.layout(content, box, style)
  for (const bg of layout.backgrounds) drawBackground(ctx, bg, originX, originY)
  for (const item of layout.content) drawItem(ctx, item, originX, originY, env.images)
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
