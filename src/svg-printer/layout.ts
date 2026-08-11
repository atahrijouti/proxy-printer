// Deterministic layout. We measure and position everything with fontkit metrics;
// the emitted primitives carry finished coordinates + a font size, and the SVG
// engine only draws the glyphs. Preview and PDF consume the same primitives.
//
// The engine is domain-agnostic: it knows "line" and "block" roles, text styles,
// and an optional background behind a run. It knows nothing about keywords, traits,
// or cards beyond reading the field a role points at.

import type { FontBook } from "./fonts"
import { parseMarkup } from "./markup"
import { capHeightInMm, measureWidthInMm, mergeStyles, resolveStyle, type ResolvedStyle } from "./styling"
import type { AbilityBlock, Card, Presentation, Role, SymbolDefinition, TextStyle } from "./types"
import { parseEdges, toMillimetres } from "./units"

// ── Output primitives (all coordinates in mm) ────────────────────────────────
export interface ImageBox {
  href: string
  x: number
  y: number
  width: number
  height: number
}

export interface Corners {
  topLeft: number
  topRight: number
  bottomRight: number
  bottomLeft: number
}

export interface BackgroundBox {
  x: number
  y: number
  width: number
  height: number
  fill: string
  corners: Corners
}

export interface TextFragment {
  x: number
  baseline: number
  text: string
  fontFamily: string
  fontWeight: number
  fontStyle: "normal" | "italic"
  fontSizeInMm: number
  fill: string
  opacity?: number
  letterSpacingInMm: number
}

export interface CardDraw {
  widthInMm: number
  heightInMm: number
  cornerRadiusInMm: number
  artLayers: ImageBox[] // base art + frame overlays, clipped to the card corner
  backgrounds: BackgroundBox[] // drawn behind the text
  symbols: ImageBox[] // inline icons
  textFragments: TextFragment[] // glyphs, drawn by the engine
}

// ── Tokens (one wrap unit each) ──────────────────────────────────────────────
interface TextToken {
  kind: "text"
  text: string
  style: ResolvedStyle
  widthInMm: number
  x: number
}
interface GapToken {
  kind: "space" | "pad" // "space": inter-word gap; "pad": a background's horizontal padding
  style: ResolvedStyle
  widthInMm: number
  x: number
}
interface SymbolToken {
  kind: "symbol"
  href: string
  sizeInMm: number
  dropInMm: number
  widthInMm: number
  x: number
}
type Token = TextToken | GapToken | SymbolToken

interface LayoutContext {
  fonts: FontBook
  styles: Record<string, TextStyle>
  symbols: Record<string, SymbolDefinition>
}

// ── Tokenizing one paragraph of markup at a given size ───────────────────────
function tokenize(
  paragraph: string,
  baseStyle: TextStyle,
  fontSizeInMm: number,
  context: LayoutContext,
): Token[] {
  const tokens: Token[] = []

  for (const run of parseMarkup(paragraph)) {
    if (run.kind === "sym") {
      const definition = context.symbols[run.id]
      if (!definition) throw new Error(`unknown symbol token: {sym:${run.id}}`)
      const sizeInMm = toMillimetres(definition.height, fontSizeInMm)
      const dropInMm = toMillimetres(definition.baseline, fontSizeInMm)
      tokens.push({ kind: "symbol", href: definition.src, sizeInMm, dropInMm, widthInMm: sizeInMm, x: 0 })
      continue
    }

    const style = resolveStyle(mergeStyles(baseStyle, run.styles, context.styles), context.fonts, fontSizeInMm)
    const padding = style.background ? parseEdges(style.background.padding, fontSizeInMm) : null

    // The badge's text sits at the normal flow position (aligned with body text);
    // the box bleeds left of it (see emitLine's `bleedLeft`). Only the right padding
    // participates in flow — as a trailing pad token that also pushes following text.

    const text = style.uppercase ? run.text.toUpperCase() : run.text
    for (const part of text.split(/(\s+)/)) {
      if (part === "") continue
      if (/^\s+$/.test(part)) {
        tokens.push({ kind: "space", style, widthInMm: measureWidthInMm(style, " "), x: 0 })
      } else {
        tokens.push({ kind: "text", text: part, style, widthInMm: measureWidthInMm(style, part), x: 0 })
      }
    }

    if (padding) tokens.push({ kind: "pad", style, widthInMm: padding.right, x: 0 })
  }

  return tokens
}

// Assign x positions in a single line (no wrapping). Returns the line's total width.
function placeInline(tokens: Token[]): number {
  let x = 0
  for (const token of tokens) {
    token.x = x
    x += token.widthInMm
  }
  return x
}

// Greedy word wrap. Breaks only at spaces; drops the space that falls at a break.
function wrap(tokens: Token[], maxWidthInMm: number): Token[][] {
  const lines: Token[][] = []
  let line: Token[] = []
  let x = 0
  for (const token of tokens) {
    if (token.kind === "space" && line.length === 0) continue // no leading space
    if (token.kind !== "space" && line.length > 0 && x + token.widthInMm > maxWidthInMm) {
      const last = line[line.length - 1]
      if (last?.kind === "space") {
        line.pop()
        x -= last.widthInMm
      }
      lines.push(line)
      line = []
      x = 0
    }
    token.x = x
    line.push(token)
    x += token.widthInMm
  }
  if (line.length) lines.push(line)
  return lines
}

// ── Emitting one positioned line into the draw ───────────────────────────────
function emitLine(
  line: Token[],
  originX: number,
  baseline: number,
  lineTop: number,
  lineHeightInMm: number,
  draw: CardDraw,
): void {
  // Backgrounds: contiguous tokens that share a background become one box behind them.
  let segment: { startX: number; endX: number; style: ResolvedStyle } | null = null
  const flushSegment = () => {
    if (!segment) return
    const style = segment.style
    const background = style.background!
    const padding = parseEdges(background.padding, style.fontSizeInMm)
    const bleedLeft = toMillimetres(background.bleedLeft, style.fontSizeInMm)
    const cap = capHeightInMm(style.face, style.fontSizeInMm)
    const hugLine = background.hug === "line"
    draw.backgrounds.push({
      x: originX + segment.startX - bleedLeft,
      y: hugLine ? lineTop : baseline - cap - padding.top,
      width: segment.endX - segment.startX + bleedLeft,
      height: hugLine ? lineHeightInMm : cap + padding.top + padding.bottom,
      fill: background.fill,
      corners: resolveCorners(background.corners, style.fontSizeInMm),
    })
    segment = null
  }

  for (const token of line) {
    const hasBackground = token.kind !== "symbol" && token.style.background
    if (hasBackground) {
      if (!segment) segment = { startX: token.x, endX: token.x + token.widthInMm, style: token.style }
      else segment.endX = token.x + token.widthInMm
    } else {
      flushSegment()
    }
  }
  flushSegment()

  for (const token of line) {
    if (token.kind === "symbol") {
      draw.symbols.push({
        href: token.href,
        x: originX + token.x,
        y: baseline - token.sizeInMm - token.dropInMm,
        width: token.sizeInMm,
        height: token.sizeInMm,
      })
    } else if (token.kind === "text") {
      draw.textFragments.push({
        x: originX + token.x,
        baseline,
        text: token.text,
        fontFamily: token.style.face.family,
        fontWeight: token.style.face.weight,
        fontStyle: token.style.face.style,
        fontSizeInMm: token.style.fontSizeInMm,
        fill: token.style.color,
        opacity: token.style.opacity,
        letterSpacingInMm: token.style.letterSpacingInMm,
      })
    }
    // "space" and "pad" tokens only occupy width; they draw nothing.
  }
}

function resolveCorners(
  corners: { topLeft?: string; topRight?: string; bottomRight?: string; bottomLeft?: string } | undefined,
  emInMm: number,
): Corners {
  return {
    topLeft: toMillimetres(corners?.topLeft, emInMm),
    topRight: toMillimetres(corners?.topRight, emInMm),
    bottomRight: toMillimetres(corners?.bottomRight, emInMm),
    bottomLeft: toMillimetres(corners?.bottomLeft, emInMm),
  }
}

// ── Roles ────────────────────────────────────────────────────────────────────
function layoutLineRole(
  text: string,
  role: Role,
  context: LayoutContext,
  cardWidthInMm: number,
  draw: CardDraw,
): void {
  const fontSizeInMm = toMillimetres(role.text.size)
  const tokens = tokenize(text, role.text, fontSizeInMm, context)
  const totalWidth = placeInline(tokens)

  const baseFace = context.fonts.resolve(role.text.font ?? "", role.text.weight ?? 400, role.text.style ?? "normal")
  const originX =
    role.align === "center" ? (cardWidthInMm - totalWidth) / 2 : toMillimetres(role.box.x)
  const cap = capHeightInMm(baseFace, fontSizeInMm)
  const baseline = toMillimetres(role.box.y) + cap
  const lineHeightInMm = fontSizeInMm * (role.lineHeight ?? 1)

  emitLine(tokens, originX, baseline, baseline - cap, lineHeightInMm, draw)
}

function layoutBlockRole(
  paragraphs: string[],
  role: Role,
  fontSizeInMm: number,
  context: LayoutContext,
  draw: CardDraw,
): void {
  const boxX = toMillimetres(role.box.x)
  const boxY = toMillimetres(role.box.y)
  const boxWidth = toMillimetres(role.box.w)
  const boxHeight = toMillimetres(role.box.h)
  const baseFace = context.fonts.resolve(role.text.font ?? "", role.text.weight ?? 400, role.text.style ?? "normal")

  const lineStep = fontSizeInMm * (role.lineHeight ?? 1)
  const paragraphGap = toMillimetres(role.paragraphGap, fontSizeInMm)
  const wrappedParagraphs = paragraphs.map((paragraph) =>
    wrap(tokenize(paragraph, role.text, fontSizeInMm, context), boxWidth),
  )
  const lineCount = wrappedParagraphs.reduce((sum, lines) => sum + lines.length, 0)
  const totalHeight = lineCount * lineStep + paragraphGap * (wrappedParagraphs.length - 1)

  const cap = capHeightInMm(baseFace, fontSizeInMm)
  let cursorY = role.valign === "center" ? boxY + Math.max(0, (boxHeight - totalHeight) / 2) : boxY

  for (const lines of wrappedParagraphs) {
    for (const line of lines) {
      emitLine(line, boxX, cursorY + cap, cursorY, lineStep, draw)
      cursorY += lineStep
    }
    cursorY += paragraphGap
  }
}

function extractParagraphs(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string")
  if (value && typeof value === "object" && Array.isArray((value as AbilityBlock).content)) {
    return (value as AbilityBlock).content
  }
  return []
}

// ── Public entry ──────────────────────────────────────────────────────────────
export function composeCard(card: Card, presentation: Presentation, fonts: FontBook): CardDraw {
  const template = presentation.templates[card.template]
  if (!template) throw new Error(`unknown template: ${card.template}`)

  const widthInMm = toMillimetres(presentation.card.w)
  const heightInMm = toMillimetres(presentation.card.h)
  const draw: CardDraw = {
    widthInMm,
    heightInMm,
    cornerRadiusInMm: toMillimetres(presentation.card.radius),
    artLayers: [],
    backgrounds: [],
    symbols: [],
    textFragments: [],
  }

  draw.artLayers.push({ href: card.image, x: 0, y: 0, width: widthInMm, height: heightInMm })
  for (const frame of card.frames ?? []) {
    draw.artLayers.push({ href: frame, x: 0, y: 0, width: widthInMm, height: heightInMm })
  }

  const context: LayoutContext = { fonts, styles: presentation.styles, symbols: presentation.symbols }
  for (const [roleName, role] of Object.entries(template.roles)) {
    const value = card[role.field ?? roleName]
    if (role.kind === "line") {
      if (typeof value === "string" && value) layoutLineRole(value, role, context, widthInMm, draw)
    } else {
      const paragraphs = extractParagraphs(value)
      if (paragraphs.length) {
        // Per-card size override (e.g. the dense cards); else the role's default.
        const override = value && typeof value === "object" ? (value as AbilityBlock).size : undefined
        const fontSizeInMm = toMillimetres(override ?? role.text.size)
        layoutBlockRole(paragraphs, role, fontSizeInMm, context, draw)
      }
    }
  }

  return draw
}
