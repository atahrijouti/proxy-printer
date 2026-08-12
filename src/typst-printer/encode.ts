// Encode JS values as Typst source. The printer forwards argument *names* to the engine
// blindly (it never enumerates them); this layer only encodes *values*, by JS type plus a
// couple of string conventions — so the DB can pass any Typst arg without a printer change.
//
//   number / boolean          → literal (4, true)
//   "4.75mm" / "50%" / "1.2em" → length / ratio literal (unquoted)
//   "#5a442c"                  → rgb("#5a442c")
//   "raw:<expr>"               → <expr> verbatim (escape hatch for Typst keywords: center, …)
//   other string              → quoted Typst string ("italic")
//   array                     → (a, b, c)
//   object                    → (k: v, …)

const LENGTH = /^-?\d*\.?\d+(mm|cm|in|pt|em|%|fr|deg)$/
const NUMBER = /^-?\d*\.?\d+$/
const COLOR = /^#[0-9a-fA-F]{3,8}$/

export function typValue(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    return `(${value.map(typValue).join(", ")}${value.length === 1 ? "," : ""})`
  }
  if (value && typeof value === "object") return `(${typArgs(value as Record<string, unknown>)})`

  const text = String(value)
  if (text.startsWith("raw:")) return text.slice(4)
  if (LENGTH.test(text) || NUMBER.test(text)) return text
  if (COLOR.test(text)) return `rgb(${JSON.stringify(text)})`
  return JSON.stringify(text)
}

// A dict → Typst named-argument list: `k1: v1, k2: v2`. Keys pass through untouched
// (Typst identifiers may contain hyphens, e.g. `top-edge`). Undefined values are dropped.
export function typArgs(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${typValue(value)}`)
    .join(", ")
}

// Escape literal text for Typst content (markup) mode, so card prose can't inject syntax.
export function typContent(text: string): string {
  return text.replace(/[\\#$\[\]*_`<>@~"]/g, (ch) => `\\${ch}`)
}
