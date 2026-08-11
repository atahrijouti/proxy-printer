// PDF emitter: a second renderer over the same CardDraw primitives the SVG view
// uses. Fonts are embedded with pdf-lib (regular fontkit, unsubsetted — the only
// combination that handles Bogle's CFF). Kerning is off and letter-spacing is
// applied via the Tc operator, matching the on-screen SVG exactly.

import * as fontkit from "fontkit"
import { PDFDocument, rgb, setCharacterSpacing, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib"
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

function color(hex: string) {
  const value = hex.replace("#", "")
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value
  const int = parseInt(full, 16)
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255)
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`image load failed: ${src}`))
    image.src = src
  })
}

// pdf-lib can embed JPEG and PNG directly; SVG symbols are rasterized to PNG first.
async function embedImage(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    if (/\.svg(\?|$)/i.test(url)) {
      const svgText = await (await fetch(url)).text()
      const objectUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }))
      try {
        const image = await loadImageElement(objectUrl)
        const pixels = 256
        const canvas = document.createElement("canvas")
        canvas.width = pixels
        canvas.height = pixels
        canvas.getContext("2d")!.drawImage(image, 0, 0, pixels, pixels)
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
        if (!blob) return null
        return await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()))
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
    return isJpeg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes)
  } catch (error) {
    console.error(`PDF: could not embed image ${url}`, error)
    return null
  }
}

export async function exportCardsToPdf(
  cards: CardDraw[],
  fonts: FontBook,
  layout: PageLayout = A4_PORTRAIT,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  // Our minimal fontkit typings are narrower than pdf-lib's Fontkit interface, but
  // the runtime object satisfies it (verified: regular fontkit + subset:false).
  pdf.registerFontkit(fontkit as unknown as Parameters<typeof pdf.registerFontkit>[0])

  // Embed each distinct face once (unsubsetted — required for the CFF fonts).
  const fontForFace = new Map<ResolvedFace, PDFFont>()
  const faceOf = (family: string, weight: number, style: "normal" | "italic") =>
    fonts.resolve(family, weight, style)
  for (const card of cards) {
    for (const fragment of card.textFragments) {
      const face = faceOf(fragment.fontFamily, fragment.fontWeight, fragment.fontStyle)
      if (!fontForFace.has(face)) fontForFace.set(face, await pdf.embedFont(face.bytes, { subset: false }))
    }
  }

  // Embed each distinct image once.
  const imageForUrl = new Map<string, PDFImage | null>()
  const urls = new Set<string>()
  for (const card of cards) {
    for (const art of card.artLayers) urls.add(art.href)
    for (const symbol of card.symbols) urls.add(symbol.href)
  }
  for (const url of urls) imageForUrl.set(url, await embedImage(pdf, url))

  const pageWidthPt = layout.pageWidthInMm * MM_TO_PT
  const pageHeightPt = layout.pageHeightInMm * MM_TO_PT
  let page: PDFPage | null = null

  cards.forEach((card, index) => {
    const positionOnPage = index % layout.cardsPerPage
    if (positionOnPage === 0) page = pdf.addPage([pageWidthPt, pageHeightPt])
    const column = positionOnPage % layout.columns
    const row = Math.floor(positionOnPage / layout.columns)
    const cardLeftInMm = layout.marginInMm + column * layout.cardWidthInMm
    const cardTopInMm = layout.marginInMm + row * layout.cardHeightInMm
    drawCard(page!, card, cardLeftInMm, cardTopInMm, layout.pageHeightInMm, fontForFace, imageForUrl, faceOf)
  })

  return await pdf.save()
}

function drawCard(
  page: PDFPage,
  card: CardDraw,
  cardLeftInMm: number,
  cardTopInMm: number,
  pageHeightInMm: number,
  fontForFace: Map<ResolvedFace, PDFFont>,
  imageForUrl: Map<string, PDFImage | null>,
  faceOf: (family: string, weight: number, style: "normal" | "italic") => ResolvedFace,
): void {
  const x = (xInMm: number) => (cardLeftInMm + xInMm) * MM_TO_PT
  // PDF y grows upward; our layout y grows downward from the card top.
  const yBottom = (topInMm: number, heightInMm: number) =>
    (pageHeightInMm - (cardTopInMm + topInMm + heightInMm)) * MM_TO_PT
  const yBaseline = (baselineInMm: number) =>
    (pageHeightInMm - (cardTopInMm + baselineInMm)) * MM_TO_PT

  for (const art of card.artLayers) {
    const image = imageForUrl.get(art.href)
    if (image) {
      page.drawImage(image, {
        x: x(art.x),
        y: yBottom(art.y, art.height),
        width: art.width * MM_TO_PT,
        height: art.height * MM_TO_PT,
      })
    }
  }

  for (const box of card.backgrounds) {
    // Corner radii are dropped in the PDF (a print-cut-away cosmetic detail).
    page.drawRectangle({
      x: x(box.x),
      y: yBottom(box.y, box.height),
      width: box.width * MM_TO_PT,
      height: box.height * MM_TO_PT,
      color: color(box.fill),
    })
  }

  for (const symbol of card.symbols) {
    const image = imageForUrl.get(symbol.href)
    if (image) {
      page.drawImage(image, {
        x: x(symbol.x),
        y: yBottom(symbol.y, symbol.height),
        width: symbol.width * MM_TO_PT,
        height: symbol.height * MM_TO_PT,
      })
    }
  }

  for (const fragment of card.textFragments) {
    const font = fontForFace.get(faceOf(fragment.fontFamily, fragment.fontWeight, fragment.fontStyle))
    if (!font) continue
    const letterSpacingPt = fragment.letterSpacingInMm * MM_TO_PT
    if (letterSpacingPt) page.pushOperators(setCharacterSpacing(letterSpacingPt))
    page.drawText(fragment.text, {
      x: x(fragment.x),
      y: yBaseline(fragment.baseline),
      size: fragment.fontSizeInMm * MM_TO_PT,
      font,
      color: color(fragment.fill),
      opacity: fragment.opacity,
    })
    if (letterSpacingPt) page.pushOperators(setCharacterSpacing(0))
  }
}
