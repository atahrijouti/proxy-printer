import type { FontFace as DBFontFace } from "./types"

export interface Resources {
  images: Map<string, HTMLImageElement>
}

export async function loadFonts(fonts: DBFontFace[]): Promise<void> {
  await Promise.all(
    fonts.map(async (font) => {
      const face = new FontFace(font.family, `url(${JSON.stringify(font.src)})`, {
        weight: font.weight ? String(font.weight) : undefined,
        style: font.style,
      })
      await face.load()
      document.fonts.add(face)
    }),
  )
}

async function decodeImage(url: string): Promise<HTMLImageElement> {
  const element = document.createElement("img")
  element.crossOrigin = "anonymous"
  element.src = url
  await element.decode()
  return element
}

export async function loadImages(urls: string[]): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>()
  await Promise.all(
    [...new Set(urls)].map(async (url) => {
      images.set(url, await decodeImage(url))
    }),
  )
  return images
}
