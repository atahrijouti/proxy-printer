import * as fontkit from "fontkit"
import type { FontFaceSource } from "./types"

// A face resolved for use: `metrics` drives our deterministic layout, (family,
// weight, style) name the FontFace the SVG engine draws with, and `bytes` are the
// original font file for pdf-lib to embed in the PDF.
export interface ResolvedFace {
  metrics: fontkit.Font
  family: string
  weight: number
  style: "normal" | "italic"
  bytes: Uint8Array
}

// Loads every declared face once: registers it with the browser (so <text> can draw
// it) and parses the same bytes with fontkit (so we can measure it). Layout never
// depends on the browser having a font — measurement comes from the file itself.
export class FontBook {
  private faces: ResolvedFace[] = []

  async load(sources: FontFaceSource[]): Promise<void> {
    this.faces = await Promise.all(
      sources.map(async (source) => {
        const response = await fetch(source.src)
        if (!response.ok) throw new Error(`font fetch failed (${response.status}): ${source.src}`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const weight = source.fontWeight ?? 400
        const style = source.fontStyle ?? "normal"

        const fontFace = new FontFace(source.fontFamily, bytes, { weight: String(weight), style })
        await fontFace.load()
        document.fonts.add(fontFace)

        return { metrics: fontkit.create(bytes), family: source.fontFamily, weight, style, bytes }
      }),
    )
  }

  resolve(family: string, weight = 400, style: "normal" | "italic" = "normal"): ResolvedFace {
    const inFamily = this.faces.filter((face) => face.family === family)
    if (inFamily.length === 0) throw new Error(`font family not loaded: ${family}`)

    const exact = inFamily.find((face) => face.weight === weight && face.style === style)
    if (exact) return exact

    const sameStyle = inFamily.filter((face) => face.style === style)
    const candidates = sameStyle.length ? sameStyle : inFamily
    return candidates.reduce((best, face) =>
      Math.abs(face.weight - weight) < Math.abs(best.weight - weight) ? face : best,
    )
  }
}
