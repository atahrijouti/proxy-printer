import { initWasm as initResvg, Resvg } from "@resvg/resvg-wasm"
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url"
import type { CanvasKit, Image, TypefaceFontProvider } from "canvaskit-wasm"
import CanvasKitInit from "canvaskit-wasm"
import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url"

import type { DB } from "~/db"
import { fetchBytes } from "~/utils/fetch-bytes"

interface SvgFonts {
  fontBuffers: Uint8Array[]
  defaultFontFamily?: string
}

type SymbolSource =
  | { kind: "raster"; aspect: number; image: Image }
  | { kind: "vector"; aspect: number; svg: Uint8Array }

export interface Environment {
  ck: CanvasKit
  fonts: TypefaceFontProvider
  svgFonts: SvgFonts
  symbolSources: Map<string, SymbolSource>
  rasters: Map<string, Image>
  capRatios: Map<string, number>
}

export const FALLBACK_CAP_RATIO = 0.7

export const colorFromHex = (environment: Environment, hex: string, opacity = 1) => {
  const value = hex.replace("#", "")
  const channel = (i: number) => parseInt(value.slice(i, i + 2), 16)
  return environment.ck.Color(channel(0), channel(2), channel(4), opacity)
}

let canvasKitReady: Promise<CanvasKit> | null = null
const canvasKit = () => (canvasKitReady ??= CanvasKitInit({ locateFile: () => wasmUrl }))

let resvgReady: Promise<void> | null = null
const resvgWasm = () => (resvgReady ??= initResvg(fetch(resvgWasmUrl)))

async function loadSymbolSource(ck: CanvasKit, url: string): Promise<SymbolSource> {
  const bytes = await fetchBytes(url)
  const native = ck.MakeImageFromEncoded(bytes)
  if (native) return { kind: "raster", aspect: native.width() / native.height(), image: native }

  try {
    const parsed = new Resvg(bytes)
    try {
      return { kind: "vector", aspect: parsed.width / parsed.height, svg: bytes }
    } finally {
      parsed.free()
    }
  } catch (cause) {
    throw new Error(`could not decode symbol: ${url}`, { cause })
  }
}

export const symbolAspect = (environment: Environment, url: string): number | null =>
  environment.symbolSources.get(url)?.aspect ?? null

function bucketedHeightPx(heightPx: number): number {
  let size = 1
  while (size < heightPx) size *= 2
  return size
}

export function symbolImageForHeight(
  environment: Environment,
  url: string,
  heightPx: number,
): Image | null {
  const source = environment.symbolSources.get(url)
  if (!source) return null
  if (source.kind === "raster") return source.image

  const height = bucketedHeightPx(heightPx)
  const key = `${url}@${height}`
  const cached = environment.rasters.get(key)
  if (cached) return cached

  const image = rasterizeSvg(environment, source.svg, height)
  environment.rasters.set(key, image)
  return image
}

function rasterizeSvg(environment: Environment, svg: Uint8Array, heightPx: number): Image {
  const renderer = new Resvg(svg, {
    fitTo: { mode: "height", value: heightPx },
    font: environment.svgFonts,
  })
  try {
    const rendered = renderer.render()
    try {
      const image = environment.ck.MakeImage(
        {
          width: rendered.width,
          height: rendered.height,
          alphaType: environment.ck.AlphaType.Premul,
          colorType: environment.ck.ColorType.RGBA_8888,
          colorSpace: environment.ck.ColorSpace.SRGB,
        },
        rendered.pixels,
        4 * rendered.width,
      )
      if (!image) throw new Error("could not build an image from resvg's pixels")
      return image
    } finally {
      rendered.free()
    }
  } finally {
    renderer.free()
  }
}

const CAP_PROBE_SIZE = 1000

function capRatio(ck: CanvasKit, bytes: Uint8Array): number {
  const typeface = ck.Typeface.MakeTypefaceFromData(bytes.buffer as ArrayBuffer)
  if (!typeface) return FALLBACK_CAP_RATIO
  const font = new ck.Font(typeface, CAP_PROBE_SIZE)
  try {
    font.setHinting(ck.FontHinting.None)
    font.setLinearMetrics(true)
    const glyphs = font.getGlyphIDs("H")
    if (!glyphs[0]) return FALLBACK_CAP_RATIO
    const top = font.getGlyphBounds(glyphs)[1]
    if (!(top < 0)) return FALLBACK_CAP_RATIO
    return -top / CAP_PROBE_SIZE
  } finally {
    font.delete()
    typeface.delete()
  }
}

export async function loadEnvironment(db: DB): Promise<Environment> {
  const [ck] = await Promise.all([canvasKit(), resvgWasm()])

  const provider = ck.TypefaceFontProvider.Make()
  const capRatios = new Map<string, number>()
  const fontBuffers: Uint8Array[] = []
  await Promise.all(
    db.fonts.map(async (font) => {
      const bytes = await fetchBytes(font.src)
      provider.registerFont(bytes, font.fontFamily)
      fontBuffers.push(bytes)
      if (!capRatios.has(font.fontFamily)) capRatios.set(font.fontFamily, capRatio(ck, bytes))
    }),
  )

  const symbolSources = new Map<string, SymbolSource>()
  await Promise.all(
    [...new Set(Object.values(db.symbols))].map(async (url) =>
      symbolSources.set(url, await loadSymbolSource(ck, url)),
    ),
  )

  return {
    ck,
    fonts: provider,
    svgFonts: { fontBuffers, defaultFontFamily: db.fonts[0]?.fontFamily },
    symbolSources,
    rasters: new Map(),
    capRatios,
  }
}
