import CanvasKitInit from "canvaskit-wasm"
import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url"
import type { CanvasKit, Image, TypefaceFontProvider } from "canvaskit-wasm"
import * as fontkit from "fontkit"
import type { FontFace } from "./types"

export interface Engine {
  ck: CanvasKit
  fonts: TypefaceFontProvider
  images: Map<string, Image>
  capRatios: Map<string, number>
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
      provider.registerFont(bytes, font.family)
      if (!capRatios.has(font.family)) capRatios.set(font.family, capRatio(bytes))
    }),
  )

  const images = new Map<string, Image>()
  await Promise.all(
    [...new Set(imageUrls)].map(async (url) => {
      images.set(url, await decode(ck, url))
    }),
  )

  return { ck, fonts: provider, images, capRatios }
}
