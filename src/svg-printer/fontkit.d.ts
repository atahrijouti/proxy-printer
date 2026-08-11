// Minimal typings for the fontkit v2 API we use. fontkit is used only for
// measurement (plain glyph advances + cap height); the SVG engine and pdf-lib draw
// the glyphs. Kerning is intentionally excluded — we lay out with plain advances so
// the browser (font-kerning:none) and pdf-lib (no kerning) agree exactly.
declare module "fontkit" {
  export interface Glyph {
    advanceWidth: number // font units, from hmtx (no kerning)
  }
  export interface Font {
    unitsPerEm: number
    capHeight: number
    glyphsForString(text: string): Glyph[]
  }
  export function create(data: Uint8Array): Font
  export function openSync(path: string): Font
}
