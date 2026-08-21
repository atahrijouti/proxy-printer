export interface TextNode {
  type: "text"
  text: string
  styles: string[]
}

export interface SymbolNode {
  type: "symbol"
  id: string
  styles: string[]
}

export type MarkupNode = TextNode | SymbolNode

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

export function parseMarkup(input: string): MarkupNode[] {
  const nodes: MarkupNode[] = []

  const walk = (text: string, active: string[]): void => {
    let buf = ""
    const flush = () => {
      if (buf) nodes.push({ type: "text", text: buf, styles: [...active] })
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
        const directive = space === -1 ? inner : inner.slice(0, space)
        const rest = space === -1 ? "" : inner.slice(space + 1)

        if (directive === "t") {
          const space2 = rest.indexOf(" ")
          const name = space2 === -1 ? rest : rest.slice(0, space2)
          const content = space2 === -1 ? "" : rest.slice(space2 + 1)
          flush()
          walk(content, [...active, name])
          i = close
          continue
        }
        if (directive === "sym") {
          flush()
          nodes.push({ type: "symbol", id: rest.trim(), styles: [...active] })
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
  return nodes
}
