import type { Canvas } from "canvaskit-wasm"
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "./card"
import { composeText } from "./compose"
import { symbolImageForHeight, toColor, type RenderContext } from "./resources"
import { layoutText, type TextLayout, type PlacedInlineImage } from "./text-layout"
import type { Card, Overlay } from "./types"
import { toPixels } from "./units"

type TextOverlay = Extract<Overlay, { type: "text" }>

export type Layer = { type: "image"; src: string } | { type: "text"; src: string }

export function cardLayers(ctx: RenderContext, card: Card): Layer[] {
  const layers: Layer[] = [{ type: "image", src: card.image }]
  let run: TextOverlay[] = []
  const flush = () => {
    if (run.length === 0) return
    layers.push({ type: "text", src: rasterizeText(ctx, run) })
    run = []
  }
  for (const overlay of card.overlays ?? []) {
    if (overlay.type === "text") {
      run.push(overlay)
      continue
    }
    flush()
    if (overlay.type === "image") layers.push({ type: "image", src: overlay.src })
  }
  flush()
  return layers
}

function rasterizeText(ctx: RenderContext, overlays: TextOverlay[]): string {
  const surface = ctx.ck.MakeSurface(toPixels(CARD_WIDTH_MM), toPixels(CARD_HEIGHT_MM))
  if (!surface) throw new Error("could not create raster surface")
  try {
    const canvas = surface.getCanvas()
    canvas.clear(ctx.ck.TRANSPARENT)
    for (const overlay of overlays) {
      const layout = layoutText(ctx, composeText(overlay, ctx.styles, ctx.symbols))
      drawTextLayout(canvas, ctx, layout)
    }
    surface.flush()
    const image = surface.makeImageSnapshot()
    try {
      const png = image.encodeToBytes()
      if (!png) throw new Error("PNG encode failed")
      return pngDataUrl(png)
    } finally {
      image.delete()
    }
  } finally {
    surface.delete()
  }
}

function drawTextLayout(canvas: Canvas, ctx: RenderContext, layout: TextLayout) {
  try {
    for (const background of layout.backgrounds) {
      const paint = new ctx.ck.Paint()
      paint.setColor(toColor(ctx, background.fill))
      paint.setAntiAlias(true)
      const { left, top, right, bottom, radius } = background
      canvas.drawRRect([left, top, right, bottom, 0, 0, 0, 0, radius, radius, 0, 0], paint)
      paint.delete()
    }
    for (const { paragraph, x, y } of layout.paragraphs) canvas.drawParagraph(paragraph, x, y)
    for (const inlineImage of layout.inlineImages) drawInlineImage(canvas, ctx, inlineImage)
  } finally {
    for (const { paragraph } of layout.paragraphs) paragraph.delete()
  }
}

function drawInlineImage(canvas: Canvas, ctx: RenderContext, placed: PlacedInlineImage) {
  const { src, x, y, width, height } = placed

  const image = symbolImageForHeight(ctx, src, height)
  if (!image) return
  const paint = new ctx.ck.Paint()
  canvas.drawImageRectOptions(
    image,
    ctx.ck.LTRBRect(0, 0, image.width(), image.height()),
    ctx.ck.LTRBRect(x, y, x + width, y + height),
    ctx.ck.FilterMode.Linear,
    ctx.ck.MipmapMode.None,
    paint,
  )
  paint.delete()
}

function pngDataUrl(bytes: Uint8Array): string {
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return `data:image/png;base64,${btoa(binary)}`
}
