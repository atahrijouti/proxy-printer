const PX_PER_MM = 16
const PT_PER_MM = 72 / 25.4

export const toPixels = (mm: number): number => mm * PX_PER_MM
export const toPoints = (mm: number): number => mm * PT_PER_MM

export function toMillimetres(value: string | number | undefined, emInMm = 0): number {
  if (value == null) return 0
  if (typeof value === "number") return value
  const match = value.trim().match(/^(-?[\d.]+)\s*(mm|em)?$/)
  if (!match) return 0
  const amount = parseFloat(match[1])
  return match[2] === "em" ? amount * emInMm : amount
}
