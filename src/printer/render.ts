import type { Canvas } from "canvaskit-wasm"

import type { CardSpec, DB, Overlay, Style, Symbols } from "~/db"

import { composeText } from "./compose"
import { colorFromHex, type Environment, symbolImageForHeight } from "./environment"
import { CARD_HEIGHT, CARD_WIDTH } from "./page"
import { layoutText, type PlacedInlineImage, type TextLayout } from "./text-layout"
import { pixelsFromMm } from "./units"

type TextOverlay = Extract<Overlay, { type: "text" }>

export interface Layer {
  type: "image" | "text"
  src: string
}

export function cardLayers(
  environment: Environment,
  styles: Record<string, Style>,
  symbols: Symbols,
  card: CardSpec,
): Layer[] {
  const layers: Layer[] = [{ type: "image", src: card.image }]
  let run: TextOverlay[] = []
  const flush = () => {
    if (run.length === 0) return
    layers.push({ type: "text", src: rasterizeText(environment, styles, symbols, run) })
    run = []
  }
  for (const overlay of card.overlays ?? []) {
    if (overlay.type === "text") {
      run.push(overlay)
      continue
    }
    flush()
    if (overlay.type === "image") layers.push({ type: "image", src: overlay.src })
    if (overlay.type === "shape") {
      // known missing, will be implemented in the future
    }
  }
  flush()
  return layers
}

function rasterizeText(
  environment: Environment,
  styles: Record<string, Style>,
  symbols: Symbols,
  overlays: TextOverlay[],
): string {
  const surface = environment.ck.MakeSurface(pixelsFromMm(CARD_WIDTH), pixelsFromMm(CARD_HEIGHT))
  if (!surface) throw new Error("could not create raster surface")
  try {
    const canvas = surface.getCanvas()
    canvas.clear(environment.ck.TRANSPARENT)
    for (const overlay of overlays) {
      const layout = layoutText(environment, composeText(overlay, styles, symbols))
      drawTextLayout(canvas, environment, layout)
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

function drawTextLayout(canvas: Canvas, environment: Environment, layout: TextLayout) {
  try {
    for (const background of layout.backgrounds) {
      const paint = new environment.ck.Paint()
      paint.setColor(colorFromHex(environment, background.fill))
      paint.setAntiAlias(true)
      const { left, top, right, bottom, corners } = background
      const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = corners
      canvas.drawRRect([left, top, right, bottom, tl, tl, tr, tr, br, br, bl, bl], paint)
      paint.delete()
    }
    for (const { paragraph, x, y } of layout.paragraphs) canvas.drawParagraph(paragraph, x, y)
    for (const inlineImage of layout.inlineImages) drawInlineImage(canvas, environment, inlineImage)
  } finally {
    for (const { paragraph } of layout.paragraphs) paragraph.delete()
  }
}

function drawInlineImage(canvas: Canvas, environment: Environment, placed: PlacedInlineImage) {
  const { symbolUrl, x, y, width, height } = placed

  const image = symbolImageForHeight(environment, symbolUrl, height)
  if (!image) return
  const paint = new environment.ck.Paint()
  canvas.drawImageRectOptions(
    image,
    environment.ck.LTRBRect(0, 0, image.width(), image.height()),
    environment.ck.LTRBRect(x, y, x + width, y + height),
    environment.ck.FilterMode.Linear,
    environment.ck.MipmapMode.None,
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

export interface RenderedCard {
  id: string
  layers: Layer[]
}

export const renderCard = (environment: Environment, db: DB, card: CardSpec): RenderedCard => ({
  id: card.id,
  layers: cardLayers(environment, db.styles, db.symbols, card),
})
