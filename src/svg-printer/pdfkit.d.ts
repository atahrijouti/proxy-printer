// Minimal typings for the pdfkit standalone (browser) build and wawoff2.
declare module "pdfkit/js/pdfkit.standalone.js" {
  export interface PDFDoc {
    on(event: "data", cb: (chunk: Uint8Array) => void): void
    on(event: "end", cb: () => void): void
    addPage(options: { size: [number, number]; margin: number }): PDFDoc
    registerFont(name: string, src: Uint8Array): PDFDoc
    font(name: string): PDFDoc
    fontSize(size: number): PDFDoc
    fillColor(color: string): PDFDoc
    fillOpacity(opacity: number): PDFDoc
    text(text: string, x: number, y: number, options?: Record<string, unknown>): PDFDoc
    rect(x: number, y: number, width: number, height: number): PDFDoc
    fill(color?: string): PDFDoc
    image(src: string, x: number, y: number, options: { width: number; height: number }): PDFDoc
    end(): void
  }
  interface PDFDocumentConstructor {
    new (options: { size: [number, number]; margin: number; autoFirstPage?: boolean }): PDFDoc
  }
  const PDFDocument: PDFDocumentConstructor
  export default PDFDocument
}
