import PDFDocument from "pdfkit/js/pdfkit.standalone"
import { CARD_HEIGHT_MM, CARD_RADIUS_MM, CARD_WIDTH_MM } from "./card"
import { CARDS_PER_PAGE, COLUMNS, PAGE_HEIGHT_MM, PAGE_PADDING_MM, PAGE_WIDTH_MM } from "./page"
import type { Layer } from "./render"
import { pointsFromMm } from "./units"

const PAGE_SIZE_PT = [pointsFromMm(PAGE_WIDTH_MM), pointsFromMm(PAGE_HEIGHT_MM)]
const EPOCH = new Date(0)

export async function buildPdf(cards: Layer[][]): Promise<Blob> {
  const imageUrls = [...new Set(cards.flat().flatMap((l) => (l.type === "image" ? [l.src] : [])))]
  const imageDataUrls = new Map<string, string>()
  await Promise.all(imageUrls.map(async (url) => imageDataUrls.set(url, await fetchDataUrl(url))))

  const doc = new PDFDocument({
    size: PAGE_SIZE_PT,
    margin: 0,
    info: { CreationDate: EPOCH, ModDate: EPOCH },
  })
  const chunks: BlobPart[] = []
  doc.on("data", (chunk) => chunks.push(chunk as BlobPart))
  const done = new Promise<Blob>((resolve) => {
    doc.on("end", () => resolve(new Blob(chunks, { type: "application/pdf" })))
  })

  const widthPt = pointsFromMm(CARD_WIDTH_MM)
  const heightPt = pointsFromMm(CARD_HEIGHT_MM)
  const radiusPt = pointsFromMm(CARD_RADIUS_MM)
  cards.forEach((layers, index) => {
    const slot = index % CARDS_PER_PAGE
    if (index > 0 && slot === 0) doc.addPage({ size: PAGE_SIZE_PT, margin: 0 })
    const xPt = pointsFromMm(PAGE_PADDING_MM + (slot % COLUMNS) * CARD_WIDTH_MM)
    const yPt = pointsFromMm(PAGE_PADDING_MM + Math.floor(slot / COLUMNS) * CARD_HEIGHT_MM)
    doc.save()
    doc.roundedRect(xPt, yPt, widthPt, heightPt, radiusPt).clip()
    for (const layer of layers) {
      const src = layer.type === "image" ? imageDataUrls.get(layer.src) : layer.src
      if (src) doc.image(src, xPt, yPt, { width: widthPt, height: heightPt })
    }
    doc.restore()
  })

  doc.end()
  return done
}

async function fetchDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
