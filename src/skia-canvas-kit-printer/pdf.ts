import PDFDocument from "pdfkit/js/pdfkit.standalone.js"

const MM_TO_PT = 72 / 25.4
const COLUMNS = 3
const ROWS = 3
const PER_PAGE = COLUMNS * ROWS
const CARD_WIDTH_MM = 63
const CARD_HEIGHT_MM = 88
const MARGIN_X_MM = 10.5
const MARGIN_Y_MM = 16.5
const EPOCH = new Date(0)

function dataUri(png: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < png.length; i++) binary += String.fromCharCode(png[i])
  return `data:image/png;base64,${btoa(binary)}`
}

export function buildPdf(cardPngs: Uint8Array[]): Promise<Blob> {
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

  cardPngs.forEach((png, index) => {
    const slot = index % PER_PAGE
    if (index > 0 && slot === 0) doc.addPage({ size: "A4", margin: 0 })
    const column = slot % COLUMNS
    const row = Math.floor(slot / COLUMNS)
    const x = (MARGIN_X_MM + column * CARD_WIDTH_MM) * MM_TO_PT
    const y = (MARGIN_Y_MM + row * CARD_HEIGHT_MM) * MM_TO_PT
    doc.image(dataUri(png), x, y, {
      width: CARD_WIDTH_MM * MM_TO_PT,
      height: CARD_HEIGHT_MM * MM_TO_PT,
    })
  })

  doc.end()
  return done
}
