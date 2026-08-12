const LENGTH = /^-?\d*\.?\d+(mm|cm|in|pt|em|%|fr|deg)$/
const NUMBER = /^-?\d*\.?\d+$/
const COLOR = /^#[0-9a-fA-F]{3,8}$/

export function typValue(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value))
    return `(${value.map(typValue).join(", ")}${value.length === 1 ? "," : ""})`
  if (value && typeof value === "object") return `(${typArgs(value as Record<string, unknown>)})`

  const text = String(value)
  if (text.startsWith("raw:")) return text.slice(4)
  if (LENGTH.test(text) || NUMBER.test(text)) return text
  if (COLOR.test(text)) return `rgb(${JSON.stringify(text)})`
  return JSON.stringify(text)
}

export function typArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${typValue(value)}`)
    .join(", ")
}

export function typContent(text: string): string {
  return text.replace(/[\\#$[\]*_`<>@~"]/g, (ch) => `\\${ch}`)
}
