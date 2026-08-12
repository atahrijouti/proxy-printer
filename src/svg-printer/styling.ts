// Resolving a run's effective style (base overlay style + any {t NAME} overrides) and
// measuring text — all from fontkit metrics, independent of the browser.

import type { FontBook, ResolvedFace } from "./fonts"
import type { BackgroundStyle, Style } from "./types"
import { toMillimetres } from "./units"

export interface ResolvedStyle {
  face: ResolvedFace
  fontSizeInMm: number
  color: string
  opacity?: number
  letterSpacingInMm: number
  uppercase: boolean
  background?: BackgroundStyle
}

// Merge a base style with the named styles referenced by a run, left to right. Only the
// text properties matter here; any positioning fields on a merged style are ignored.
export function mergeStyles(
  base: Style,
  styleNames: string[],
  registry: Record<string, Style>,
): Style {
  const merged: Style = { ...base }
  for (const name of styleNames) {
    const override = registry[name]
    if (!override) throw new Error(`unknown style: {t ${name} …}`)
    Object.assign(merged, override)
  }
  return merged
}

export function resolveStyle(style: Style, fonts: FontBook, fontSizeInMm: number): ResolvedStyle {
  return {
    face: fonts.resolve(style.font ?? "", style.weight ?? 400, style.style ?? "normal"),
    fontSizeInMm,
    color: style.color ?? "#000000",
    opacity: style.opacity,
    letterSpacingInMm: toMillimetres(style.letterSpacing),
    uppercase: style.uppercase ?? false,
    background: style.background,
  }
}

export function measureWidthInMm(style: ResolvedStyle, text: string): number {
  if (text === "") return 0
  // Plain advances (no kerning) so the browser (font-kerning:none) and pdfkit agree.
  const glyphs = style.face.metrics.glyphsForString(text)
  const unitScale = style.fontSizeInMm / style.face.metrics.unitsPerEm
  let advance = 0
  for (const glyph of glyphs) advance += glyph.advanceWidth * unitScale
  return advance + style.letterSpacingInMm * glyphs.length
}

export function capHeightInMm(face: ResolvedFace, fontSizeInMm: number): number {
  return (face.metrics.capHeight / face.metrics.unitsPerEm) * fontSizeInMm
}
