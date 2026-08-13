const MM_PER_INCH = 25.4
const PX_PER_INCH = 96
const PT_PER_INCH = 72

// length → device px, given px-per-mm scale
export function lengthToPx(len: string | undefined, scale: number): number {
  if (len == null) return 0
  const match = len.trim().match(/^(-?[\d.]+)\s*(mm|px|pt)?$/)
  if (!match) return 0
  const n = parseFloat(match[1])
  switch (match[2] ?? "mm") {
    case "mm":
      return n * scale
    case "px":
      return (n / PX_PER_INCH) * MM_PER_INCH * scale
    case "pt":
      return (n / PT_PER_INCH) * MM_PER_INCH * scale
    default:
      return 0
  }
}
