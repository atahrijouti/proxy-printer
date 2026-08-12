import type { JSX } from "solid-js"

// an abbreviation ({abbr NAME}) expands to registered content — a symbol image or literal text
export type Abbreviation = { type: "image"; src: string } | { type: "text"; value: string }
export type Abbreviations = Record<string, Abbreviation>

// what markup needs from a DB's presentation — grows as markup gains DB-driven inputs
export type MarkupConfig = { abbreviations: Abbreviations }

// a markup engine bound to one DB's presentation
export type Markup = { render: (text: string) => JSX.Element[] }

// From a "{" find its matching "}", counting nested braces and honouring "\{" / "\}" escapes.
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

// Build a markup engine bound to one DB's presentation. `render(text)` turns inline markup into an
// ordered list of nodes (plain runs stay strings) — no per-call config:
//   {t <style> <content…>} → <span class="<style>">…</span>  (content rendered recursively)
//   {abbr <name>}          → the registered abbreviation (image → <img>, text → string)
// Anything unrecognised is shown literally, braces included.
export const createMarkup = ({ abbreviations }: MarkupConfig): Markup => {
  const expand = (inner: string): JSX.Element => {
    const space = inner.indexOf(" ")
    const fn = space === -1 ? inner : inner.slice(0, space)
    const rest = space === -1 ? "" : inner.slice(space + 1)

    if (fn === "abbr") {
      const name = rest.trim()
      const entry = abbreviations[name]
      if (!entry) return `{${inner}}`
      return entry.type === "image" ? <img class="glyph" src={entry.src} alt={name} /> : entry.value
    }

    if (fn === "t") {
      const space2 = rest.indexOf(" ")
      const style = space2 === -1 ? rest : rest.slice(0, space2)
      const content = space2 === -1 ? "" : rest.slice(space2 + 1)
      return <span class={style}>{render(content)}</span>
    }

    return `{${inner}}`
  }

  const render = (text: string): JSX.Element[] => {
    const nodes: JSX.Element[] = []
    let run = ""
    const flush = () => {
      if (run) nodes.push(run)
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
        nodes.push(expand(text.slice(i + 1, close)))
        i = close
        continue
      }
      run += ch
    }
    flush()
    return nodes
  }

  return { render }
}
