import PDFDocument from "pdfkit/js/pdfkit.standalone"
import { CARD_HEIGHT_MM, CARD_RADIUS_MM, CARD_WIDTH_MM } from "./card"
import type { Layer } from "./render"

const MM_TO_PT = 72 / 25.4
const COLUMNS = 3
const ROWS = 3
const PER_PAGE = COLUMNS * ROWS
const MARGIN_X_MM = 10.5
const MARGIN_Y_MM = 16.5
const EPOCH = new Date(0)

export async function buildPdf(cards: Layer[][]): Promise<Blob> {
  const artUrls = [...new Set(cards.flat().flatMap((l) => (l.type === "image" ? [l.src] : [])))]
  const artData = new Map<string, string>()
  await Promise.all(artUrls.map(async (url) => artData.set(url, await fetchDataUrl(url))))

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    info: { CreationDate: EPOCH, ModDate: EPOCH },
  })
  const chunks: BlobPart[] = []
  doc.on("data", (chunk) => chunks.push(chunk as BlobPart))
  const done = new Promise<Blob>((resolve) => {
    doc.on("end", () => resolve(new Blob(chunks, { type: "application/pdf" })))
  })

  const w = CARD_WIDTH_MM * MM_TO_PT
  const h = CARD_HEIGHT_MM * MM_TO_PT
  const r = CARD_RADIUS_MM * MM_TO_PT
  cards.forEach((layers, index) => {
    const slot = index % PER_PAGE
    if (index > 0 && slot === 0) doc.addPage({ size: "A4", margin: 0 })
    const x = (MARGIN_X_MM + (slot % COLUMNS) * CARD_WIDTH_MM) * MM_TO_PT
    const y = (MARGIN_Y_MM + Math.floor(slot / COLUMNS) * CARD_HEIGHT_MM) * MM_TO_PT
    doc.save()
    doc.roundedRect(x, y, w, h, r).clip()
    for (const layer of layers) {
      const src = layer.type === "image" ? artData.get(layer.src) : layer.src
      if (src) doc.image(src, x, y, { width: w, height: h })
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
