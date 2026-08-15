import CanvasKitInit from "canvaskit-wasm"
import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url"
import type { CanvasKit, Image, TypefaceFontProvider } from "canvaskit-wasm"
import * as fontkit from "fontkit"
import type { FontFace, Length, Style, Symbols } from "./types"

export interface Engine {
  ck: CanvasKit
  fonts: TypefaceFontProvider
  images: Map<string, Image>
  capRatios: Map<string, number>
}

// The engine plus the DB registries it draws with, at a fixed device scale (px per mm).
// compose.ts stays engine-agnostic; layout.ts and render.ts consume this.
export interface RenderContext extends Engine {
  styles: Record<string, Style>
  symbols: Symbols
  scale: number
}

// cap-height as a fraction of font-size when a font's metric is unavailable (canvas2d parity)
export const FALLBACK_CAP_RATIO = 0.7

// an inline {sym} image is sized to 1.15× the surrounding text's cap height (canvas2d parity)
export const INLINE_IMAGE_CAP_RATIO = 1.15

// hex "#rrggbb" → a canvaskit colour (alpha from opacity); used by layout (text) and render (backgrounds)
export const toColor = (ctx: Engine, hex: string, opacity = 1) => {
  const value = hex.replace("#", "")
  const channel = (i: number) => parseInt(value.slice(i, i + 2), 16)
  return ctx.ck.Color(channel(0), channel(2), channel(4), opacity)
}

let initialized: Promise<CanvasKit> | null = null
const canvasKit = () => (initialized ??= CanvasKitInit({ locateFile: () => wasmUrl }))

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch failed (${response.status}): ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

// skia's codecs cover png/jpeg/webp/gif; anything else (SVG — canvaskit has no parser) is null
async function decode(ck: CanvasKit, url: string, heightPx: number): Promise<Image> {
  const bytes = await fetchBytes(url)
  const native = ck.MakeImageFromEncoded(bytes)
  if (native) return native
  return rasterize(ck, url, bytes, heightPx)
}

// width ÷ height from the SVG's own source, not the browser's intrinsic-size fallback
function svgAspect(bytes: Uint8Array): number {
  const tag = /<svg\b[^>]*>/i.exec(new TextDecoder().decode(bytes.slice(0, 4096)))?.[0]
  if (!tag) return 1

  const length = (name: string): number | null => {
    const value = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1]?.trim()
    if (!value || value.endsWith("%")) return null
    const amount = parseFloat(value)
    return Number.isFinite(amount) && amount > 0 ? amount : null
  }
  const width = length("width")
  const height = length("height")
  if (width && height) return width / height

  const box = /\bviewBox\s*=\s*"([^"]*)"/i.exec(tag)?.[1].trim().split(/[\s,]+/).map(Number)
  if (box?.length === 4 && box[2] > 0 && box[3] > 0) return box[2] / box[3]
  return 1
}

// Browser decode, but into a raster we size. Not MakeImageFromCanvasImageSource: it reads the
// <img>'s intrinsic dimensions, which a viewBox-only SVG doesn't have, so the browser's default
// object size decides (Firefox and Chrome disagree) and the glyph lands in a padded bitmap.
async function rasterize(
  ck: CanvasKit,
  url: string,
  bytes: Uint8Array,
  heightPx: number,
): Promise<Image> {
  const widthPx = Math.max(1, Math.round(heightPx * svgAspect(bytes)))

  const element = document.createElement("img")
  element.crossOrigin = "anonymous"
  element.width = widthPx
  element.height = heightPx
  element.src = url
  await element.decode()

  const canvas = document.createElement("canvas")
  canvas.width = widthPx
  canvas.height = heightPx
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("2d canvas context unavailable")
  context.drawImage(element, 0, 0, widthPx, heightPx)

  const pixels = context.getImageData(0, 0, widthPx, heightPx).data
  const image = ck.MakeImage(
    {
      width: widthPx,
      height: heightPx,
      alphaType: ck.AlphaType.Unpremul,
      colorType: ck.ColorType.RGBA_8888,
      colorSpace: ck.ColorSpace.SRGB,
    },
    pixels,
    4 * widthPx,
  )
  if (!image) throw new Error(`could not rasterize: ${url}`)
  return image
}

// The tallest an inline symbol can ever be drawn: shrink-to-fit only moves down from a style's
// declared size, so the largest fontSize against the largest cap ratio bounds every card.
function symbolRasterPx(
  styles: Record<string, Style>,
  capRatios: Map<string, number>,
  scale: number,
): number {
  const sizesMm = Object.values(styles).map((style) => absoluteMillimetres(style.fontSize))
  const capRatio = Math.max(FALLBACK_CAP_RATIO, ...capRatios.values())
  const largest = Math.max(0, ...sizesMm) * scale * capRatio * INLINE_IMAGE_CAP_RATIO
  return Math.max(1, Math.ceil(largest))
}

// the bound above holds only while every fontSize is absolute, so a relative one is an error
function absoluteMillimetres(value: Length | undefined): number {
  if (value == null) return 0
  const match = /^(-?[\d.]+)\s*mm$/.exec(value.trim())
  if (!match) throw new Error(`fontSize must be an absolute mm length, got "${value}"`)
  return parseFloat(match[1])
}

function capRatio(bytes: Uint8Array): number {
  try {
    const font = fontkit.create(bytes) as { capHeight?: number; unitsPerEm?: number }
    if (font.capHeight && font.unitsPerEm) return font.capHeight / font.unitsPerEm
  } catch {
    /* fall through to a sensible default */
  }
  return FALLBACK_CAP_RATIO
}

export async function loadEngine(
  fonts: FontFace[],
  imageUrls: string[],
  styles: Record<string, Style>,
  scale: number,
): Promise<Engine> {
  const ck = await canvasKit()

  const provider = ck.TypefaceFontProvider.Make()
  const capRatios = new Map<string, number>()
  await Promise.all(
    fonts.map(async (font) => {
      const bytes = await fetchBytes(font.src)
      provider.registerFont(bytes, font.fontFamily)
      if (!capRatios.has(font.fontFamily)) capRatios.set(font.fontFamily, capRatio(bytes))
    }),
  )

  const images = new Map<string, Image>()
  const engine = { ck, fonts: provider, images, capRatios }
  await ensureImages(engine, imageUrls, symbolRasterPx(styles, capRatios, scale))
  return engine
}

// Decode any not-yet-loaded image URLs into the engine's map. Only the {sym} symbols are
// loaded this way — card art never enters the WASM heap (it renders as native <img>).
async function ensureImages(engine: Engine, urls: string[], sizePx: number): Promise<void> {
  await Promise.all(
    [...new Set(urls)]
      .filter((url) => !engine.images.has(url))
      .map(async (url) => engine.images.set(url, await decode(engine.ck, url, sizePx))),
  )
}
