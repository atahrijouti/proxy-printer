import * as v from "valibot"

const mm = v.number()

const fontFace = v.object({
  fontFamily: v.string(),
  fontWeight: v.optional(v.number()),
  fontStyle: v.optional(v.picklist(["normal", "italic"])),
  src: v.string(),
})

const background = v.object({
  fill: v.string(),
  outset: v.optional(
    v.object({
      top: v.optional(mm),
      right: v.optional(mm),
      bottom: v.optional(mm),
      left: v.optional(mm),
    }),
  ),
  corners: v.optional(
    v.object({
      topLeft: v.optional(mm),
      topRight: v.optional(mm),
      bottomRight: v.optional(mm),
      bottomLeft: v.optional(mm),
    }),
  ),
})

const style = v.object({
  fontFamily: v.optional(v.string()),
  fontWeight: v.optional(v.number()),
  fontStyle: v.optional(v.picklist(["normal", "italic"])),
  fontSize: v.optional(mm),
  color: v.optional(v.string()),
  opacity: v.optional(v.number()),
  letterSpacing: v.optional(mm),
  uppercase: v.optional(v.boolean()),
  lineHeight: v.optional(v.number()),
  paragraphGap: v.optional(mm),
  background: v.optional(background),
  margin: v.optional(v.object({ before: v.optional(mm), after: v.optional(mm) })),
  mode: v.optional(v.picklist(["inline", "block"])),
  box: v.optional(
    v.object({ x: v.optional(mm), y: v.optional(mm), w: v.optional(mm), h: v.optional(mm) }),
  ),
  align: v.optional(v.picklist(["left", "center"])),
  valign: v.optional(v.picklist(["top", "center"])),
})

const overlay = v.variant("type", [
  v.object({ type: v.literal("image"), src: v.string() }),
  v.object({ type: v.literal("shape"), style: v.string() }),
  v.object({
    type: v.literal("text"),
    style: v.string(),
    content: v.union([v.string(), v.array(v.string())]),
  }),
])

const cardSpec = v.object({
  id: v.string(),
  image: v.string(),
  overlays: v.optional(v.array(overlay)),
})

export const dbSchema = v.object({
  name: v.optional(v.string()),
  cardBack: v.optional(v.string()),
  fonts: v.optional(v.array(fontFace)),
  styles: v.optional(v.record(v.string(), style)),
  symbols: v.optional(v.record(v.string(), v.string())),
  cards: v.array(cardSpec),
})

export type Mm = number
export type FontFace = v.InferOutput<typeof fontFace>
export type Background = v.InferOutput<typeof background>
export type Style = v.InferOutput<typeof style>
export type Overlay = v.InferOutput<typeof overlay>
export type CardSpec = v.InferOutput<typeof cardSpec>
export type Symbols = NonNullable<DB["symbols"]>
export type DB = v.InferOutput<typeof dbSchema>
