// PDF emitter — a second renderer over the same CardDraw primitives the SVG view
// uses. Built on pdfkit (full fontkit under the hood), which embeds+subsets any
// font program it can read: CFF (Bogle), TrueType, woff. It cannot read woff2, so
// those faces are decompressed to plain sfnt with wawoff2 first. This is the
// "right tool per font": pdfkit for embedding, wawoff2 for the woff2 container.
//
// pdfkit's origin is top-left with y growing downward — the same as our layout —
// so coordinates map directly (mm → pt), no vertical flip.

import { Buffer } from "buffer"
import PDFDocument, { type PDFDoc } from "pdfkit/js/pdfkit.standalone.js"
import type { FontBook, ResolvedFace } from "./fonts"
import type { CardDraw } from "./layout"

const MM_TO_PT = 72 / 25.4

export interface PageLayout {
  cardsPerPage: number
  columns: number
  cardWidthInMm: number
  cardHeightInMm: number
  marginInMm: number
  pageWidthInMm: number
  pageHeightInMm: number
}

const A4_PORTRAIT: PageLayout = {
  cardsPerPage: 9,
  columns: 3,
  cardWidthInMm: 63,
  cardHeightInMm: 88,
  marginInMm: 10,
  pageWidthInMm: 210,
  pageHeightInMm: 297,
}

const isWoff2 = (bytes: Uint8Array) =>
  bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32 // "wOF2"

// pdfkit (via fontkit) embeds sfnt/CFF/woff. It cannot read woff2, and no browser
// woff2 decoder bundles cleanly, so the PDF path requires an embeddable container.
function assertEmbeddable(bytes: Uint8Array, family: string): Uint8Array {
  if (isWoff2(bytes)) {
    throw new Error(`font "${family}" is woff2, which cannot be embedded in the PDF; provide ttf/otf/woff`)
  }
  return bytes
}

const faceKey = (family: string, weight: number, style: string) => `${family}__${weight}__${style}`

function base64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// pdfkit draws images from a Buffer, data URI, or path; a data URI is the simplest
// browser-safe form. JPEG/PNG pass through; SVG symbols are rasterized to PNG.
async function toImageDataUri(url: string): Promise<string | null> {
  try {
    if (/\.svg(\?|$)/i.test(url)) {
      const svgText = await (await fetch(url)).text()
      const objectUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }))
      try {
        const image = await loadImage(objectUrl)
        const pixels = 256
        const canvas = document.createElement("canvas")
        canvas.width = pixels
        canvas.height = pixels
        canvas.getContext("2d")!.drawImage(image, 0, 0, pixels, pixels)
        return canvas.toDataURL("image/png")
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/png"
    return `data:${mime};base64,${base64(bytes)}`
  } catch (error) {
    console.error(`PDF: could not load image ${url}`, error)
    return null
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`image load failed: ${src}`))
    image.src = src
  })
}

export async function exportCardsToPdf(
  cards: CardDraw[],
  fonts: FontBook,
  layout: PageLayout = A4_PORTRAIT,
): Promise<Blob> {
  const pageSize: [number, number] = [layout.pageWidthInMm * MM_TO_PT, layout.pageHeightInMm * MM_TO_PT]
  const doc = new PDFDocument({ size: pageSize, margin: 0, autoFirstPage: false })

  const resolve = (family: string, weight: number, style: "normal" | "italic") =>
    fonts.resolve(family, weight, style)

  // Register each distinct face once (decompressing woff2 as needed).
  const registered = new Set<string>()
  for (const card of cards) {
    for (const fragment of card.textFragments) {
      const face = resolve(fragment.fontFamily, fragment.fontWeight, fragment.fontStyle)
      const key = faceKey(face.family, face.weight, face.style)
      if (!registered.has(key)) {
        doc.registerFont(key, Buffer.from(assertEmbeddable(face.bytes, face.family)))
        registered.add(key)
      }
    }
  }

  // Load each distinct image once.
  const imageUri = new Map<string, string | null>()
  const urls = new Set<string>()
  for (const card of cards) {
    for (const art of card.artLayers) urls.add(art.href)
    for (const symbol of card.symbols) urls.add(symbol.href)
  }
  for (const url of urls) imageUri.set(url, await toImageDataUri(url))

  const chunks: Uint8Array[] = []
  doc.on("data", (chunk) => chunks.push(chunk))
  const finished = new Promise<Blob>((res) =>
    doc.on("end", () => res(new Blob(chunks as BlobPart[], { type: "application/pdf" }))),
  )

  cards.forEach((card, index) => {
    if (index % layout.cardsPerPage === 0) doc.addPage({ size: pageSize, margin: 0 })
    const positionOnPage = index % layout.cardsPerPage
    const column = positionOnPage % layout.columns
    const row = Math.floor(positionOnPage / layout.columns)
    const cardLeftInMm = layout.marginInMm + column * layout.cardWidthInMm
    const cardTopInMm = layout.marginInMm + row * layout.cardHeightInMm
    drawCard(doc, card, cardLeftInMm, cardTopInMm, imageUri, resolve)
  })

  doc.end()
  return await finished
}

function drawCard(
  doc: PDFDoc,
  card: CardDraw,
  cardLeftInMm: number,
  cardTopInMm: number,
  imageUri: Map<string, string | null>,
  resolve: (family: string, weight: number, style: "normal" | "italic") => ResolvedFace,
): void {
  const pt = (mm: number) => mm * MM_TO_PT
  const drawImage = (href: string, x: number, y: number, width: number, height: number) => {
    const uri = imageUri.get(href)
    if (uri) doc.image(uri, pt(cardLeftInMm + x), pt(cardTopInMm + y), { width: pt(width), height: pt(height) })
  }

  for (const art of card.artLayers) drawImage(art.href, art.x, art.y, art.width, art.height)

  for (const box of card.backgrounds) {
    // Square corners for now; rounded shape is a later step.
    doc.rect(pt(cardLeftInMm + box.x), pt(cardTopInMm + box.y), pt(box.width), pt(box.height)).fill(box.fill)
  }

  for (const symbol of card.symbols) drawImage(symbol.href, symbol.x, symbol.y, symbol.width, symbol.height)

  for (const fragment of card.textFragments) {
    const face = resolve(fragment.fontFamily, fragment.fontWeight, fragment.fontStyle)
    const opacity = fragment.opacity ?? 1
    if (opacity < 1) doc.fillOpacity(opacity)
    doc
      .font(faceKey(face.family, face.weight, face.style))
      .fontSize(pt(fragment.fontSizeInMm))
      .fillColor(fragment.fill)
      .text(fragment.text, pt(cardLeftInMm + fragment.x), pt(cardTopInMm + fragment.baseline), {
        lineBreak: false,
        baseline: "alphabetic",
        characterSpacing: pt(fragment.letterSpacingInMm),
        features: [],
      })
    if (opacity < 1) doc.fillOpacity(1)
  }
}
