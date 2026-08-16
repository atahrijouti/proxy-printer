import { initWasm as initResvg, Resvg } from "@resvg/resvg-wasm"
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url"
import CanvasKitInit from "canvaskit-wasm"
import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url"
import type { CanvasKit, Image, TypefaceFontProvider } from "canvaskit-wasm"
import * as fontkit from "fontkit"
import type { FontFace, Style, Symbols } from "./types"

interface SvgFonts {
  fontBuffers: Uint8Array[]
  defaultFontFamily?: string
}

type SymbolSource =
  | { kind: "raster"; aspect: number; image: Image }
  | { kind: "vector"; aspect: number; svg: Uint8Array }

export interface Resources {
  ck: CanvasKit
  fonts: TypefaceFontProvider
  svgFonts: SvgFonts
  symbolSources: Map<string, SymbolSource>
  rasters: Map<string, Image>
  capRatios: Map<string, number>
}

export interface RenderContext extends Resources {
  styles: Record<string, Style>
  symbols: Symbols
  scale: number
}

export const FALLBACK_CAP_RATIO = 0.7

export const INLINE_IMAGE_CAP_RATIO = 1.15

export const toColor = (ctx: Resources, hex: string, opacity = 1) => {
  const value = hex.replace("#", "")
  const channel = (i: number) => parseInt(value.slice(i, i + 2), 16)
  return ctx.ck.Color(channel(0), channel(2), channel(4), opacity)
}

let canvasKitReady: Promise<CanvasKit> | null = null
const canvasKit = () => (canvasKitReady ??= CanvasKitInit({ locateFile: () => wasmUrl }))

let resvgReady: Promise<void> | null = null
const resvgWasm = () => (resvgReady ??= initResvg(fetch(resvgWasmUrl)))

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch failed (${response.status}): ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function loadSymbol(ck: CanvasKit, url: string): Promise<SymbolSource> {
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

export const symbolAspect = (resources: Resources, url: string): number | null =>
  resources.symbolSources.get(url)?.aspect ?? null

function bucketHeight(heightPx: number): number {
  let size = 1
  while (size < heightPx) size *= 2
  return size
}

export function symbolImage(resources: Resources, url: string, heightPx: number): Image | null {
  const source = resources.symbolSources.get(url)
  if (!source) return null
  if (source.kind === "raster") return source.image

  const height = bucketHeight(heightPx)
  const key = `${url}@${height}`
  const cached = resources.rasters.get(key)
  if (cached) return cached

  const image = rasterize(resources, source.svg, height)
  resources.rasters.set(key, image)
  return image
}

function rasterize(resources: Resources, svg: Uint8Array, heightPx: number): Image {
  const renderer = new Resvg(svg, {
    fitTo: { mode: "height", value: heightPx },
    font: resources.svgFonts,
  })
  try {
    const rendered = renderer.render()
    try {
      const image = resources.ck.MakeImage(
        {
          width: rendered.width,
          height: rendered.height,
          alphaType: resources.ck.AlphaType.Premul,
          colorType: resources.ck.ColorType.RGBA_8888,
          colorSpace: resources.ck.ColorSpace.SRGB,
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

function capRatio(bytes: Uint8Array): number {
  try {
    const font = fontkit.create(bytes) as { capHeight?: number; unitsPerEm?: number }
    if (font.capHeight && font.unitsPerEm) return font.capHeight / font.unitsPerEm
  } catch {}
  return FALLBACK_CAP_RATIO
}

export async function loadResources(
  fonts: FontFace[],
  symbolUrls: string[],
): Promise<Resources> {
  const [ck] = await Promise.all([canvasKit(), resvgWasm()])

  const provider = ck.TypefaceFontProvider.Make()
  const capRatios = new Map<string, number>()
  const fontBuffers: Uint8Array[] = []
  await Promise.all(
    fonts.map(async (font) => {
      const bytes = await fetchBytes(font.src)
      provider.registerFont(bytes, font.fontFamily)
      fontBuffers.push(bytes)
      if (!capRatios.has(font.fontFamily)) capRatios.set(font.fontFamily, capRatio(bytes))
    }),
  )

  const symbolSources = new Map<string, SymbolSource>()
  await Promise.all(
    [...new Set(symbolUrls)].map(async (url) => symbolSources.set(url, await loadSymbol(ck, url))),
  )

  return {
    ck,
    fonts: provider,
    svgFonts: { fontBuffers, defaultFontFamily: fonts[0]?.fontFamily },
    symbolSources,
    rasters: new Map(),
    capRatios,
  }
}
