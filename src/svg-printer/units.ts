// All SVG user units are millimetres (the card viewBox is in mm). Lengths in the DB
// may be mm / px / em / pt; resolve them to mm. `em` needs the surrounding font size.

const PIXELS_PER_INCH = 96
const POINTS_PER_INCH = 72
const MILLIMETRES_PER_INCH = 25.4

export function toMillimetres(value: string | number | undefined, emInMm = 0): number {
  if (value == null) return 0
  if (typeof value === "number") return value
  const match = value.trim().match(/^(-?[\d.]+)\s*(mm|px|em|pt)?$/)
  if (!match) return 0
  const amount = parseFloat(match[1])
  switch (match[2] ?? "mm") {
    case "mm":
      return amount
    case "px":
      return (amount / PIXELS_PER_INCH) * MILLIMETRES_PER_INCH
    case "pt":
      return (amount / POINTS_PER_INCH) * MILLIMETRES_PER_INCH
    case "em":
      return amount * emInMm
    default:
      return amount
  }
}

// Parse a CSS-style "top right bottom left" shorthand into mm (em-relative).
export function parseEdges(
  value: string | undefined,
  emInMm = 0,
): { top: number; right: number; bottom: number; left: number } {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean).map((p) => toMillimetres(p, emInMm))
  const top = parts[0] ?? 0
  const right = parts[1] ?? top
  const bottom = parts[2] ?? top
  const left = parts[3] ?? right
  return { top, right, bottom, left }
}
