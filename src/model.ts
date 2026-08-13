// Card content model — shared across renderers; each maps it to its own primitives.
//
// A text overlay's `content` is {t <style> …} / {abbr <name>} markup (string, or string[] of
// paragraphs) — the same grammar every printer uses. `parseMarkup` compiles it to runs; a run's
// effective style is the base style merged with its style-name stack, resolved against the DB's
// `styles` registry. `{abbr name}` resolves against the `abbreviations` registry to an image src.
//
// Flow rules (how runs lay out — the self-laying-out backends share `flow.ts`):
//  1. Additive sweep: cursor += margin.before; place content; cursor += width; cursor += margin.after.
//  2. `background` draws behind the run's box, expanded by `outset` per side — never advances the
//     cursor. Spacing between runs is `margin` (a style property), not the background.
//  3. An {abbr} image is sized to the cap-height of its font, sat on the baseline (like a capital).
//  4. A line's ascent/descent = max over its runs.
//  5. Wrap between runs and at spaces inside a run; a backgrounded run never splits; a leading
//     margin is dropped at a line break.
//  6. Shrink-to-fit: if the block overflows its box height, reduce the base size until it fits.

export type Length = string // "3.5mm" | "0.8em" | "6px"
export type Ref = string // name of a style in the presentation registry

export interface Background {
  fill: string
  outset?: { top?: Length; right?: Length; bottom?: Length; left?: Length }
  corners?: { topLeft?: Length; topRight?: Length; bottomRight?: Length; bottomLeft?: Length }
}

export interface Margin {
  before?: Length
  after?: Length
}

// core text properties every renderer honours (a named style is Props + positioning)
export interface Props {
  font?: string
  weight?: number
  style?: "normal" | "italic"
  size?: Length
  color?: string
  opacity?: number
  letterSpacing?: Length
  uppercase?: boolean
  background?: Background
  margin?: Margin
}

export type Overlay =
  | { type: "image"; src: string }
  | { type: "shape"; style: Ref }
  | { type: "text"; style: Ref; content: string | string[] }
