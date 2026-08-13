// Card content model — shared across renderers; each renderer maps it to its own primitives.
//
// Flow rules:
//  1. Additive sweep: cursor += margin.before; place content; cursor += width; cursor += margin.after.
//  2. `background` draws behind the content bbox expanded by `outset` per side — never advances the cursor.
//     Author owns clearance (the follower's margin), not the engine.
//  3. An `image` inline's box = cap-height of its resolved font, bottom on the baseline (sits like a capital).
//  4. A line's ascent/descent = max over its inlines (mixed sizes flow correctly).
//  5. Wrap between inlines and at spaces inside a `text` run; a backgrounded run never splits;
//     a leading margin is dropped at a line break.
//  6. Shrink-to-fit: if the block overflows its box height, reduce the base size until it fits
//     (so there are no per-card size overrides — the fitter finds the size).

export type Length = string // "3.5mm" | "0.8em"
export type Ref = string // name of a style in the presentation registry

// ── placement ──
export type Overlay =
  | { type: "image"; src: string }
  | { type: "shape"; style: Ref }
  | { type: "text"; style: Ref; content: Paragraph[] }

// ── inline flow ──
export type Paragraph = Inline[]

export type Inline =
  | { kind: "text"; value: string; style?: Ref | Props; margin?: Margin }
  | { kind: "image"; src: string; style?: Ref | Props; margin?: Margin }

export interface Margin {
  before?: Length
  after?: Length
}

// core property set every renderer honors
export interface Props {
  font?: string
  weight?: number
  italic?: boolean
  size?: Length
  color?: string
  letterSpacing?: Length
  opacity?: number
  uppercase?: boolean
  background?: Background
}

// visual-only run decoration (zero flow effect)
export interface Background {
  fill: string
  outset?: { top?: Length; right?: Length; bottom?: Length; left?: Length }
  corners?: { topLeft?: Length; topRight?: Length; bottomRight?: Length; bottomLeft?: Length }
}
