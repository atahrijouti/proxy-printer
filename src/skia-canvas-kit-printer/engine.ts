import CanvasKitInit from "canvaskit-wasm"
import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url"
import type { CanvasKit, Image, TypefaceFontProvider } from "canvaskit-wasm"
import * as fontkit from "fontkit"
import type { FontFace, Style } from "./types"

export interface Engine {
  ck: CanvasKit
  fonts: TypefaceFontProvider
  images: Map<string, Image>
  capRatios: Map<string, number>
}

// The engine plus the presentation it draws with, at a fixed device scale (px per mm).
// compose.ts stays engine-agnostic; layout.ts and render.ts consume this.
export interface RenderContext extends Engine {
  styles: Record<string, Style>
  abbreviations: Record<string, string>
  scale: number
}

let initialized: Promise<CanvasKit> | null = null
const canvasKit = () => (initialized ??= CanvasKitInit({ locateFile: () => wasmUrl }))

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch failed (${response.status}): ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function decode(ck: CanvasKit, url: string): Promise<Image> {
  const element = document.createElement("img")
  element.crossOrigin = "anonymous"
  element.src = url
  await element.decode()
  return ck.MakeImageFromCanvasImageSource(element)
}

function capRatio(bytes: Uint8Array): number {
  try {
    const font = fontkit.create(bytes) as { capHeight?: number; unitsPerEm?: number }
    if (font.capHeight && font.unitsPerEm) return font.capHeight / font.unitsPerEm
  } catch {
    /* fall through to a sensible default */
  }
  return 0.7
}

export async function loadEngine(fonts: FontFace[], imageUrls: string[]): Promise<Engine> {
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
  await ensureImages(engine, imageUrls)
  return engine
}

// Decode any not-yet-loaded image URLs into the engine's map. Only the {abbr} symbols are
// loaded this way — card art never enters the WASM heap (it renders as native <img>).
async function ensureImages(engine: Engine, urls: string[]): Promise<void> {
  await Promise.all(
    [...new Set(urls)]
      .filter((url) => !engine.images.has(url))
      .map(async (url) => engine.images.set(url, await decode(engine.ck, url))),
  )
}
