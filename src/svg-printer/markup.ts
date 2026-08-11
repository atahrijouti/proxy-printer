// Wire-format text markup → flat runs. Grammar (closed set):
//   {style:NAME} … {/style}   styled span; generic close, LIFO nesting
//   {sym:NAME}                inline symbol, self-closing
//   \{                        literal brace
// Everything else is literal text. Unknown/malformed braces are kept literal.

export interface TextRun {
  kind: "text"
  text: string
  styles: string[]
}

export interface SymRun {
  kind: "sym"
  id: string
  styles: string[]
}

export type Run = TextRun | SymRun

export function parseMarkup(input: string): Run[] {
  const runs: Run[] = []
  const stack: string[] = []
  let buf = ""

  const flush = () => {
    if (buf) {
      runs.push({ kind: "text", text: buf, styles: [...stack] })
      buf = ""
    }
  }

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (ch === "\\" && input[i + 1] === "{") {
      buf += "{"
      i++
      continue
    }

    if (ch === "{") {
      const end = input.indexOf("}", i)
      if (end === -1) {
        buf += ch
        continue
      }
      const tag = input.slice(i + 1, end)

      if (tag === "/style") {
        flush()
        stack.pop()
        i = end
        continue
      }
      const styleMatch = tag.match(/^style:(.+)$/)
      if (styleMatch) {
        flush()
        stack.push(styleMatch[1])
        i = end
        continue
      }
      const symMatch = tag.match(/^sym:(.+)$/)
      if (symMatch) {
        flush()
        runs.push({ kind: "sym", id: symMatch[1], styles: [...stack] })
        i = end
        continue
      }
      // unknown tag → literal
      buf += ch
      continue
    }

    buf += ch
  }

  flush()
  return runs
}
