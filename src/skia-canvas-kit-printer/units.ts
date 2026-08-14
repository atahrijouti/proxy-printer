const PX_PER_INCH = 96
const PT_PER_INCH = 72
const MM_PER_INCH = 25.4

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
      return (amount / PX_PER_INCH) * MM_PER_INCH
    case "pt":
      return (amount / PT_PER_INCH) * MM_PER_INCH
    case "em":
      return amount * emInMm
    default:
      return amount
  }
}
