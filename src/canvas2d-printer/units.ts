const MM_PER_INCH = 25.4
const PX_PER_INCH = 96
const PT_PER_INCH = 72

// length → device px, given px-per-mm scale (em is relative to the passed em size in px)
export function lengthToPx(len: string | number | undefined, scale: number, emPx = 0): number {
  if (len == null) return 0
  if (typeof len === "number") return len
  const match = len.trim().match(/^(-?[\d.]+)\s*(mm|px|pt|em|%)?$/)
  if (!match) return 0
  const n = parseFloat(match[1])
  switch (match[2] ?? "mm") {
    case "mm":
      return n * scale
    case "px":
      return (n / PX_PER_INCH) * MM_PER_INCH * scale
    case "pt":
      return (n / PT_PER_INCH) * MM_PER_INCH * scale
    case "em":
      return n * emPx
    default:
      return 0
  }
}
