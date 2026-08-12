import { typArgs, typContent } from "./encode"
import { parseMarkup, type Run } from "./markup"
import type { Card, Overlay, Presentation, Style } from "./types"

const CARD_WIDTH = "63mm"
const CARD_HEIGHT = "88mm"
const CARD_RADIUS = "2mm"
const COLUMNS = 3
const ROWS = 3
export const CARDS_PER_PAGE = COLUMNS * ROWS

const PAGE = "width: 210mm, height: 297mm, margin: (x: 10.5mm, y: 16.5mm)"
const PARAGRAPH = "leading: 0.32em, spacing: 0.8mm"
const DATE = "datetime(year: 2020, month: 1, day: 1, hour: 0, minute: 0, second: 0)"

export type ImagePath = (url: string) => string

interface Context {
  styles: Record<string, Style>
  abbreviations: Presentation["abbreviations"]
  imagePath: ImagePath
}

const call = (fn: string, args: string, body: string) => `#${fn}(${args})[${body}]`
const imageSource = (path: string, args: string) => `#image(${JSON.stringify(path)}, ${args})`

const styleWrap = (body: string, style: Style): string => {
  let out = body
  if (style.uppercase) out = `#upper[${out}]`
  if (style.highlight) out = call("highlight", typArgs(style.highlight), out)
  if (style.text) out = call("text", typArgs(style.text), out)
  return out
}

const abbrSource = (id: string, ctx: Context): string => {
  const entry = ctx.abbreviations[id]
  if (!entry) throw new Error(`unknown abbreviation: {abbr ${id}}`)
  switch (entry.type) {
    case "text":
      return typContent(entry.value)
    case "image":
      return call(
        "box",
        `baseline: ${entry.baseline}`,
        imageSource(ctx.imagePath(entry.src), `height: ${entry.height}`),
      )
  }
}

const runSource = (run: Run, ctx: Context): string => {
  const content = run.kind === "abbr" ? abbrSource(run.id, ctx) : typContent(run.text)
  return run.styles.reduceRight((body, name) => styleWrap(body, ctx.styles[name] ?? {}), content)
}

const paragraphSource = (markup: string, ctx: Context): string =>
  parseMarkup(markup)
    .map((run) => runSource(run, ctx))
    .join("")

const toParagraphs = (content: string | string[]): string[] =>
  (Array.isArray(content) ? content : [content]).filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  )

const placeAround = (place: Style["place"], body: string): string => {
  const args = [place?.alignment, `dx: ${place?.dx ?? "0mm"}`, `dy: ${place?.dy ?? "0mm"}`]
    .filter(Boolean)
    .join(", ")
  return call("place", args, body)
}

const boxAround = (style: Style, body: string): string => {
  if (!style.box && !style.align) return body
  const inner = style.align ? call("align", style.align, body) : body
  return call("block", typArgs(style.box ?? {}), inner)
}

const withSize = (style: Style, size: string | undefined): Style =>
  size ? { ...style, text: { ...style.text, size } } : style

const requireStyle = (name: string, ctx: Context): Style => {
  const style = ctx.styles[name]
  if (!style) throw new Error(`unknown style: "${name}"`)
  return style
}

const fullBleedImage = (url: string, ctx: Context): string =>
  placeAround(
    { dx: "0mm", dy: "0mm" },
    imageSource(ctx.imagePath(url), `width: ${CARD_WIDTH}, height: ${CARD_HEIGHT}`),
  )

const textOverlaySource = (
  style: Style,
  content: string | string[],
  size: string | undefined,
  ctx: Context,
): string => {
  const paragraphs = toParagraphs(content)
  if (!paragraphs.length) return ""
  const resolved = withSize(style, size)
  const body = paragraphs.map((paragraph) => paragraphSource(paragraph, ctx)).join("\n\n")
  return placeAround(resolved.place, boxAround(resolved, styleWrap(body, resolved)))
}

const overlaySource = (overlay: Overlay, ctx: Context): string => {
  switch (overlay.type) {
    case "image":
      return fullBleedImage(overlay.src, ctx)
    case "text":
      return textOverlaySource(requireStyle(overlay.style, ctx), overlay.content, overlay.size, ctx)
    case "shape":
      return ""
  }
}

const cardCell = (card: Card, ctx: Context): string => {
  const layers = [
    fullBleedImage(card.image, ctx),
    ...(card.overlays ?? []).map((overlay) => overlaySource(overlay, ctx)),
  ]
  return `box(width: ${CARD_WIDTH}, height: ${CARD_HEIGHT}, radius: ${CARD_RADIUS}, clip: true)[${layers.filter(Boolean).join("")}]`
}

const gridPage = (cells: string[]): string =>
  `#grid(columns: (${CARD_WIDTH},) * ${COLUMNS}, rows: (${CARD_HEIGHT},) * ${ROWS}, column-gutter: 0mm, row-gutter: 0mm, ${cells.join(", ")})`

const chunk = <T>(items: T[], size: number): T[][] => {
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}

export function composeDocument(
  cards: Card[],
  presentation: Presentation,
  imagePath: ImagePath,
): string {
  const ctx: Context = {
    styles: presentation.styles,
    abbreviations: presentation.abbreviations,
    imagePath,
  }
  const cells = cards.map((card) => cardCell(card, ctx))
  const pages = chunk(cells, CARDS_PER_PAGE).map(gridPage).join("\n#pagebreak(weak: true)\n")
  const preamble = [
    `#set document(date: ${DATE})`,
    `#set page(${PAGE})`,
    `#set par(${PARAGRAPH})`,
  ].join("\n")
  return `${preamble}\n\n${pages}`
}
