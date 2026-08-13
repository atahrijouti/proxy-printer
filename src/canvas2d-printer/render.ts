import { layout, type Measurer, type PlacedImage, type PlacedText, type RunBox } from "../flow"
import type { Overlay, Props } from "../model"
import { lengthToPx } from "./units"
import type { Card, Presentation } from "./types"

export const CARD_WIDTH_MM = 63
export const CARD_HEIGHT_MM = 88
export const CARD_RADIUS_MM = 2

type Ctx = CanvasRenderingContext2D
type Images = Map<string, HTMLImageElement>

const fontString = (props: Props, sizePx: number) =>
  `${props.style === "italic" ? "italic " : ""}${props.weight ?? 400} ${sizePx}px ${JSON.stringify(props.font ?? "Bogle")}`

export class CanvasMeasurer implements Measurer {
  private ctx: Ctx
  private images: Images
  capHeight = 0
  ascent = 0
  descent = 0
  constructor(images: Images) {
    this.images = images
    this.ctx = document.createElement("canvas").getContext("2d")!
  }
  use(props: Props, sizePx: number) {
    this.ctx.font = fontString(props, sizePx)
    const cap = this.ctx.measureText("H")
    const line = this.ctx.measureText("Hg")
    this.capHeight = cap.actualBoundingBoxAscent || sizePx * 0.7
    this.ascent = line.fontBoundingBoxAscent || sizePx * 0.9
    this.descent = line.fontBoundingBoxDescent || sizePx * 0.25
  }
  width(text: string) {
    return this.ctx.measureText(text).width
  }
  imageAspect(src: string) {
    const image = this.images.get(src)
    return image ? image.naturalWidth / image.naturalHeight : 1
  }
}

interface DrawEnv {
  pres: Presentation
  images: Images
  measurer: CanvasMeasurer
  scale: number
  toPx: (len: string | number | undefined, emPx?: number) => number
}

const drawText = (ctx: Ctx, it: PlacedText, ox: number, oy: number) => {
  ctx.font = fontString(it.props, it.sizePx)
  ctx.fillStyle = it.props.color ?? "#000000"
  ctx.globalAlpha = it.props.opacity ?? 1
  ctx.fillText(it.text, ox + it.x, oy + it.baseline)
  ctx.globalAlpha = 1
}

const drawImage = (ctx: Ctx, it: PlacedImage, ox: number, oy: number, images: Images) => {
  const image = images.get(it.src)
  if (image) ctx.drawImage(image, ox + it.x, oy + it.y, it.w, it.h)
}

const itemRegistry: {
  text: (ctx: Ctx, it: PlacedText, ox: number, oy: number, images: Images) => void
  image: (ctx: Ctx, it: PlacedImage, ox: number, oy: number, images: Images) => void
} = { text: drawText, image: drawImage }

function drawBackground(ctx: Ctx, box: RunBox, ox: number, oy: number, env: DrawEnv) {
  const c = box.background.corners ?? {}
  const r = (l?: string) => env.toPx(l)
  ctx.beginPath()
  ctx.roundRect(ox + box.x, oy + box.y, box.w, box.h, [
    r(c.topLeft),
    r(c.topRight),
    r(c.bottomRight),
    r(c.bottomLeft),
  ])
  ctx.fillStyle = box.background.fill
  ctx.fill()
}

function layoutText(overlay: Extract<Overlay, { type: "text" }>, env: DrawEnv) {
  const style = env.pres.styles[overlay.style]
  if (!style) throw new Error(`unknown style: "${overlay.style}"`)
  const paragraphs = (Array.isArray(overlay.content) ? overlay.content : [overlay.content]).filter(
    (p) => p.length > 0,
  )
  const block = style.kind === "block"
  const baseSizePx = env.toPx(style.size)
  env.measurer.use(style, baseSizePx)
  const cap = env.measurer.capHeight
  const ascent = env.measurer.ascent

  const result = layout({
    paragraphs,
    base: style as Props,
    baseSizePx,
    minSizePx: baseSizePx * 0.6,
    boxWidth: block
      ? env.toPx(style.box?.w)
      : style.align === "center"
        ? CARD_WIDTH_MM * env.scale
        : 1e6,
    boxHeight: block ? env.toPx(style.box?.h) : 1e6,
    lineHeight: style.lineHeight ?? 1,
    paragraphGap: env.toPx(style.paragraphGap),
    align: style.align ?? "left",
    valign: style.valign ?? "top",
    resolve: (name) => (env.pres.styles[name] ?? {}) as Props,
    resolveAbbr: (id) => env.pres.abbreviations[id],
    measurer: env.measurer,
    toPx: env.toPx,
  })

  const ox = block ? env.toPx(style.box?.x) : style.align === "center" ? 0 : env.toPx(style.box?.x)
  const oy = block ? env.toPx(style.box?.y) : env.toPx(style.box?.y) - (ascent - cap)
  return { result, ox, oy }
}

const overlayRegistry: Record<string, (ctx: Ctx, overlay: Overlay, env: DrawEnv) => void> = {
  image: (ctx, overlay, env) => {
    if (overlay.type !== "image") return
    const image = env.images.get(overlay.src)
    if (image) ctx.drawImage(image, 0, 0, CARD_WIDTH_MM * env.scale, CARD_HEIGHT_MM * env.scale)
  },
  shape: () => {},
  text: (ctx, overlay, env) => {
    if (overlay.type !== "text") return
    const { result, ox, oy } = layoutText(overlay, env)
    for (const box of result.boxes) drawBackground(ctx, box, ox, oy, env)
    for (const it of result.items) itemRegistry[it.kind](ctx, it as never, ox, oy, env.images)
  },
}

export function drawCard(
  ctx: Ctx,
  card: Card,
  pres: Presentation,
  images: Images,
  measurer: CanvasMeasurer,
  scale: number,
) {
  const env: DrawEnv = {
    pres,
    images,
    measurer,
    scale,
    toPx: (len, emPx = 0) => lengthToPx(len, scale, emPx),
  }
  const w = CARD_WIDTH_MM * scale
  const h = CARD_HEIGHT_MM * scale
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, CARD_RADIUS_MM * scale)
  ctx.clip()
  const base = images.get(card.image)
  if (base) ctx.drawImage(base, 0, 0, w, h)
  for (const overlay of card.overlays ?? []) overlayRegistry[overlay.type](ctx, overlay, env)
  ctx.restore()
}
