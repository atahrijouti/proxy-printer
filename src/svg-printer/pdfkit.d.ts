// Minimal typings for the pdfkit standalone (browser) build and wawoff2.
declare module "pdfkit/js/pdfkit.standalone.js" {
  export interface PDFDoc {
    on(event: "data", cb: (chunk: Uint8Array) => void): void
    on(event: "end", cb: () => void): void
    addPage(options: { size: [number, number] | string; margin: number }): PDFDoc
    registerFont(name: string, src: Uint8Array): PDFDoc
    font(name: string): PDFDoc
    fontSize(size: number): PDFDoc
    fillColor(color: string): PDFDoc
    fillOpacity(opacity: number): PDFDoc
    text(text: string, x: number, y: number, options?: Record<string, unknown>): PDFDoc
    rect(x: number, y: number, width: number, height: number): PDFDoc
    roundedRect(x: number, y: number, width: number, height: number, radius: number): PDFDoc
    path(svgPath: string): PDFDoc
    fill(color?: string): PDFDoc
    clip(rule?: string): PDFDoc
    save(): PDFDoc
    restore(): PDFDoc
    translate(x: number, y: number): PDFDoc
    image(src: string, x: number, y: number, options: { width: number; height: number }): PDFDoc
    end(): void
  }
  type PageSize = [number, number] | string
  interface PDFDocumentConstructor {
    new (options: {
      size: PageSize
      margin: number
      autoFirstPage?: boolean
      info?: Record<string, unknown>
    }): PDFDoc
  }
  const PDFDocument: PDFDocumentConstructor
  export default PDFDocument
}
