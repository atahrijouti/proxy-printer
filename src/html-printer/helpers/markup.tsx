import type { JSX } from "solid-js"

export type Abbreviation = { type: "image"; src: string } | { type: "text"; value: string }
export type Abbreviations = Record<string, Abbreviation>

export type MarkupConfig = { abbreviations: Abbreviations }

export type Markup = { render: (text: string) => JSX.Element[] }

type Segment =
  | { kind: "text"; text: string }
  | { kind: "abbr"; name: string }
  | { kind: "tag"; style: string; children: Segment[] }

const matchingBrace = (text: string, open: number): number => {
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

const parseDirective = (inner: string): Segment => {
  const space = inner.indexOf(" ")
  const keyword = space === -1 ? inner : inner.slice(0, space)
  const rest = space === -1 ? "" : inner.slice(space + 1)

  switch (keyword) {
    case "abbr":
      return { kind: "abbr", name: rest.trim() }
    case "t": {
      const sep = rest.indexOf(" ")
      const style = sep === -1 ? rest : rest.slice(0, sep)
      const content = sep === -1 ? "" : rest.slice(sep + 1)
      return { kind: "tag", style, children: parse(content) }
    }
    default:
      return { kind: "text", text: `{${inner}}` }
  }
}

const parse = (text: string): Segment[] => {
  const segments: Segment[] = []
  let run = ""
  const flush = () => {
    if (run) segments.push({ kind: "text", text: run })
    run = ""
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "\\" && (text[i + 1] === "{" || text[i + 1] === "}")) {
      run += text[i + 1]
      i++
      continue
    }
    if (ch === "{") {
      const close = matchingBrace(text, i)
      if (close === -1) {
        run += ch
        continue
      }
      flush()
      segments.push(parseDirective(text.slice(i + 1, close)))
      i = close
      continue
    }
    run += ch
  }
  flush()
  return segments
}

export const createMarkup = ({ abbreviations }: MarkupConfig): Markup => {
  const renderSegments = (segments: Segment[]): JSX.Element[] =>
    segments.map((segment) => {
      switch (segment.kind) {
        case "text":
          return segment.text
        case "abbr": {
          const entry = abbreviations[segment.name]
          if (!entry) return `{abbr ${segment.name}}`
          return entry.type === "image" ? (
            <img class="glyph" src={entry.src} alt={segment.name} />
          ) : (
            entry.value
          )
        }
        case "tag":
          return <span class={segment.style}>{renderSegments(segment.children)}</span>
        default: {
          const _exhaustive: never = segment
          return _exhaustive
        }
      }
    })

  return { render: (text) => renderSegments(parse(text)) }
}
