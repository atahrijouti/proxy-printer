// Thin drawing layer. compose.ts resolves the DB into an engine-agnostic request,
// layout.ts turns it into positioned primitives, and this file only paints them onto a
// transparent canvaskit surface — then assembles a card's layer stack (the canvas2d model:
// base art + image overlays stay native URLs, each run of text overlays is one PNG layer,
// so canvaskit never decodes the card art and the WASM heap stays tiny for any deck size).

import type { Canvas } from "canvaskit-wasm"
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "./card"
import { composeText } from "./compose"
import { toColor, type RenderContext } from "./engine"
import { layoutOverlay, type Layout, type PlacedImage } from "./layout"
import type { Card, Overlay } from "./types"

type TextOverlay = Extract<Overlay, { type: "text" }>

export type Layer =
  | { type: "image"; src: string } // a URL: the base art or an image overlay
  | { type: "text"; src: string } // a data URL: a rasterized run of consecutive text overlays

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
    // shape overlays are not implemented — they contribute no layer
  }
  flush()
  return layers
}

// draw a run of text overlays onto one transparent card-sized surface → a PNG data URL.
// the surface and every paragraph are freed on all paths (finally), so a throw can't leak.
function rasterizeText(ctx: RenderContext, overlays: TextOverlay[]): string {
  const surface = ctx.ck.MakeSurface(CARD_WIDTH_MM * ctx.scale, CARD_HEIGHT_MM * ctx.scale)
  if (!surface) throw new Error("could not create raster surface")
  try {
    const canvas = surface.getCanvas()
    canvas.clear(ctx.ck.TRANSPARENT)
    for (const overlay of overlays) {
      const layout = layoutOverlay(ctx, composeText(overlay, ctx.styles, ctx.symbols))
      drawLayout(canvas, ctx, layout)
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

// backgrounds first (behind), then the text, then inline images on top
function drawLayout(canvas: Canvas, ctx: RenderContext, layout: Layout) {
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
    for (const inlineImage of layout.images)
      drawImageBox(canvas, ctx, inlineImage)
  } finally {
    for (const { paragraph } of layout.paragraphs) paragraph.delete()
  }
}

function drawImageBox(canvas: Canvas, ctx: RenderContext, placed: PlacedImage) {
  const { image, x, y, width, height } = placed
  const paint = new ctx.ck.Paint()
  const src = ctx.ck.LTRBRect(0, 0, image.width(), image.height())
  // symbols are rasterized for the largest style, so smaller ones minify — nearest would alias
  canvas.drawImageRectOptions(
    image,
    src,
    ctx.ck.LTRBRect(x, y, x + width, y + height),
    ctx.ck.FilterMode.Linear,
    ctx.ck.MipmapMode.None,
    paint,
  )
  paint.delete()
}

function pngDataUrl(bytes: Uint8Array): string {
  let binary = ""
  const CHUNK = 0x8000 // chunk so String.fromCharCode(...) never overruns the arg limit
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return `data:image/png;base64,${btoa(binary)}`
}
