// Card → Typst source. The printer hardcodes only overlay-type → engine-element (image
// overlay → #image, text overlay → #place/#block/#text, {abbr} image → inline #box(#image));
// every style property rides along inside the forwarded arg-dicts (see encode.ts).
//
// One document holds the whole print run: A4 pages, a 3×3 grid of 63×88mm card boxes,
// paginated. The SVG preview and the PDF are both compiled from THIS source, so the
// preview reflects the artifact by construction (docs/goal.md). The frame — page, margins,
// card size, corner radius, grid — is the printer's, not the DB's.

import { typArgs, typContent } from "./encode"
import { parseMarkup, type Run } from "./markup"
import type { Card, Presentation, Style } from "./types"

const CARD_WIDTH = "63mm"
const CARD_HEIGHT = "88mm"
const CARD_RADIUS = "2mm"
const COLUMNS = 3
const ROWS = 3
export const CARDS_PER_PAGE = COLUMNS * ROWS
const PER_PAGE = CARDS_PER_PAGE
const PAGE = "width: 210mm, height: 297mm, margin: (x: 10.5mm, y: 16.5mm)" // 3×3 grid centred on A4
// tight line spacing (~line-height 1 with cap-anchored text) + the ability paragraph gap
const PAR = "leading: 0.32em, spacing: 0.8mm"

export type ImagePath = (url: string) => string

// Wrap `inner` with one style's engine calls: #text(...) outside, #highlight(...) then
// #upper closest to the content. A missing property just contributes nothing.
function wrapStyle(inner: string, style: Style | undefined): string {
  if (!style) return inner
  let out = inner
  if (style.uppercase) out = `#upper[${out}]`
  if (style.highlight) out = `#highlight(${typArgs(style.highlight)})[${out}]`
  if (style.text) out = `#text(${typArgs(style.text)})[${out}]`
  return out
}

function emitRun(run: Run, presentation: Presentation, imagePath: ImagePath): string {
  let inner: string
  if (run.kind === "abbr") {
    const entry = presentation.abbreviations[run.id]
    if (!entry) throw new Error(`unknown abbreviation: {abbr ${run.id}}`)
    inner =
      entry.type === "image"
        ? `#box(baseline: ${entry.baseline})[#image(${JSON.stringify(imagePath(entry.src))}, height: ${entry.height})]`
        : typContent(entry.value)
  } else {
    inner = typContent(run.text)
  }
  // Wrap innermost style first so a later (nested) style wins on conflicts.
  for (const name of [...run.styles].reverse()) inner = wrapStyle(inner, presentation.styles[name])
  return inner
}

function emitParagraph(markup: string, presentation: Presentation, imagePath: ImagePath): string {
  return parseMarkup(markup)
    .map((run) => emitRun(run, presentation, imagePath))
    .join("")
}

// A card-relative placed image (base art or an image overlay), full-bleed.
function placedImage(url: string, imagePath: ImagePath): string {
  return `#place(dx: 0mm, dy: 0mm)[#image(${JSON.stringify(imagePath(url))}, width: ${CARD_WIDTH}, height: ${CARD_HEIGHT})]`
}

function emitText(
  content: string | string[],
  style: Style,
  size: string | undefined,
  presentation: Presentation,
  imagePath: ImagePath,
): string {
  const paragraphs = (Array.isArray(content) ? content : [content]).filter(
    (p) => typeof p === "string" && p.length > 0,
  )
  if (!paragraphs.length) return ""

  const body = paragraphs.map((p) => emitParagraph(p, presentation, imagePath)).join("\n\n")

  // per-card size override rides on the base text() args
  const baseStyle: Style = size ? { ...style, text: { ...style.text, size } } : style
  let out = wrapStyle(body, baseStyle)
  if (baseStyle.box || baseStyle.align) {
    // a sized #block whose fixed height lets #align(horizon) vertically centre the content
    const aligned = baseStyle.align ? `#align(${baseStyle.align})[${out}]` : out
    out = `#block(${typArgs(baseStyle.box ?? {})})[${aligned}]`
  }

  const place = baseStyle.place ?? {}
  const parts = [place.alignment, `dx: ${place.dx ?? "0mm"}`, `dy: ${place.dy ?? "0mm"}`].filter(
    Boolean,
  )
  return `#place(${parts.join(", ")})[${out}]`
}

// One card as a fixed 63×88mm rounded, clipped box with its overlays placed inside.
function composeCardBox(card: Card, presentation: Presentation, imagePath: ImagePath): string {
  const parts = [placedImage(card.image, imagePath)] // base art, bottom of the stack
  for (const overlay of card.overlays ?? []) {
    if (overlay.type === "image") {
      parts.push(placedImage(overlay.src, imagePath))
    } else if (overlay.type === "text") {
      const style = presentation.styles[overlay.style]
      if (!style) throw new Error(`unknown style: "${overlay.style}"`)
      parts.push(emitText(overlay.content, style, overlay.size, presentation, imagePath))
    }
    // shape overlay: not exercised yet
  }
  // No leading `#`: card boxes are spliced into #grid(...) arguments, i.e. code context.
  // The body `[…]` is markup again, so the placed overlays inside keep their `#`.
  return `box(width: ${CARD_WIDTH}, height: ${CARD_HEIGHT}, radius: ${CARD_RADIUS}, clip: true)[\n${parts.join("\n")}\n]`
}

// The whole run as one Typst document: A4 pages, a 3×3 grid per page, paginated.
export function composeDocument(
  cards: Card[],
  presentation: Presentation,
  imagePath: ImagePath,
): string {
  const boxes = cards.map((card) => composeCardBox(card, presentation, imagePath))

  const pages: string[] = []
  for (let i = 0; i < boxes.length; i += PER_PAGE) {
    const cells = boxes.slice(i, i + PER_PAGE).join(",\n")
    pages.push(
      `#grid(columns: (${CARD_WIDTH},) * ${COLUMNS}, rows: (${CARD_HEIGHT},) * ${ROWS}, column-gutter: 0mm, row-gutter: 0mm,\n${cells}\n)`,
    )
  }

  // Pin the document date so the PDF's CreationDate/ModDate and content-derived /ID are fixed —
  // otherwise identical input yields byte-different PDFs (the goal's byte-identical requirement).
  const DATE = "#set document(date: datetime(year: 2020, month: 1, day: 1, hour: 0, minute: 0, second: 0))"
  return [DATE, `#set page(${PAGE})`, `#set par(${PAR})`, pages.join("\n#pagebreak(weak: true)\n")].join("\n\n")
}
