// Inline markup → flat runs. Grammar (closed set):
//   {t NAME content}   tagged span; content is markup (nests), NAME picks up a style
//   {abbr NAME}        substitution; NAME resolves via the abbreviations registry
//   \{ \}              literal braces
// Each run carries the stack of style names active over it (outermost first).

export interface TextRun {
  kind: "text"
  text: string
  styles: string[]
}

export interface AbbrRun {
  kind: "abbr"
  id: string
  styles: string[]
}

export type Run = TextRun | AbbrRun

function matchingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === "\\") {
      i++
      continue
    }
    if (ch === "{") depth++
    else if (ch === "}" && --depth === 0) return i
  }
  return -1
}

export function parseMarkup(input: string): Run[] {
  const runs: Run[] = []

  const walk = (text: string, active: string[]): void => {
    let buf = ""
    const flush = () => {
      if (buf) runs.push({ kind: "text", text: buf, styles: [...active] })
      buf = ""
    }

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === "\\" && (text[i + 1] === "{" || text[i + 1] === "}")) {
        buf += text[i + 1]
        i++
        continue
      }
      if (ch === "{") {
        const close = matchingBrace(text, i)
        if (close === -1) {
          buf += ch
          continue
        }
        const inner = text.slice(i + 1, close)
        const space = inner.indexOf(" ")
        const fn = space === -1 ? inner : inner.slice(0, space)
        const rest = space === -1 ? "" : inner.slice(space + 1)

        if (fn === "t") {
          const space2 = rest.indexOf(" ")
          const name = space2 === -1 ? rest : rest.slice(0, space2)
          const content = space2 === -1 ? "" : rest.slice(space2 + 1)
          flush()
          walk(content, [...active, name])
          i = close
          continue
        }
        if (fn === "abbr") {
          flush()
          runs.push({ kind: "abbr", id: rest.trim(), styles: [...active] })
          i = close
          continue
        }
        buf += ch
        continue
      }
      buf += ch
    }
    flush()
  }

  walk(input, [])
  return runs
}
