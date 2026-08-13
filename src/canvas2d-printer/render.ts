import { layout, type Measurer, type PlacedImage, type PlacedText, type RunBox } from "./flow"
import type { Overlay, Props } from "./model"
import { lengthToPx } from "./units"
import type { Card, Presentation } from "./types"

export const CARD_WIDTH_MM = 63
export const CARD_HEIGHT_MM = 88
export const CARD_RADIUS_MM = 2

type Ctx = CanvasRenderingContext2D
type Images = Map<string, HTMLImageElement>
type ToPx = (len: string | number | undefined, emPx?: number) => number

const fontString = (props: Props, sizePx: number) =>
  `${props.style === "italic" ? "italic " : ""}${props.weight ?? 400} ${sizePx}px ${JSON.stringify(props.font ?? "sans-serif")}`

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
    const capitals = this.ctx.measureText("H")
    const line = this.ctx.measureText("Hg")
    this.capHeight = capitals.actualBoundingBoxAscent || sizePx * 0.7
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

function drawBackground(ctx: Ctx, box: RunBox, originX: number, originY: number, toPx: ToPx) {
  const corners = box.background.corners ?? {}
  const radius = (len?: string) => toPx(len)
  ctx.beginPath()
  ctx.roundRect(originX + box.x, originY + box.y, box.w, box.h, [
    radius(corners.topLeft),
    radius(corners.topRight),
    radius(corners.bottomRight),
    radius(corners.bottomLeft),
  ])
  ctx.fillStyle = box.background.fill
  ctx.fill()
}

type ItemDrawer = (
  ctx: Ctx,
  item: PlacedText | PlacedImage,
  originX: number,
  originY: number,
  images: Images,
) => void

const drawItem: Record<(PlacedText | PlacedImage)["kind"], ItemDrawer> = {
  text: (ctx, item, originX, originY) => {
    if (item.kind !== "text") return
    ctx.font = fontString(item.props, item.sizePx)
    ctx.fillStyle = item.props.color ?? "#000000"
    ctx.globalAlpha = item.props.opacity ?? 1
    ctx.fillText(item.text, originX + item.x, originY + item.baseline)
    ctx.globalAlpha = 1
  },
  image: (ctx, item, originX, originY, images) => {
    if (item.kind !== "image") return
    const image = images.get(item.src)
    if (image) ctx.drawImage(image, originX + item.x, originY + item.y, item.w, item.h)
  },
}

interface DrawEnv {
  pres: Presentation
  images: Images
  measurer: CanvasMeasurer
  scale: number
  toPx: ToPx
}

function drawTextOverlay(ctx: Ctx, overlay: Extract<Overlay, { type: "text" }>, env: DrawEnv) {
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
    base: style,
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
    resolve: (name) => env.pres.styles[name] ?? {},
    resolveAbbr: (id) => env.pres.abbreviations[id],
    measurer: env.measurer,
    toPx: env.toPx,
  })

  const originX = block
    ? env.toPx(style.box?.x)
    : style.align === "center"
      ? 0
      : env.toPx(style.box?.x)
  const originY = block ? env.toPx(style.box?.y) : env.toPx(style.box?.y) - (ascent - cap)

  for (const box of result.boxes) drawBackground(ctx, box, originX, originY, env.toPx)
  for (const item of result.items) drawItem[item.kind](ctx, item, originX, originY, env.images)
}

const drawOverlay: Record<Overlay["type"], (ctx: Ctx, overlay: Overlay, env: DrawEnv) => void> = {
  image: (ctx, overlay, env) => {
    if (overlay.type !== "image") return
    const image = env.images.get(overlay.src)
    if (image) ctx.drawImage(image, 0, 0, CARD_WIDTH_MM * env.scale, CARD_HEIGHT_MM * env.scale)
  },
  shape: () => {},
  text: (ctx, overlay, env) => {
    if (overlay.type === "text") drawTextOverlay(ctx, overlay, env)
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
  const width = CARD_WIDTH_MM * scale
  const height = CARD_HEIGHT_MM * scale

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, CARD_RADIUS_MM * scale)
  ctx.clip()
  const base = images.get(card.image)
  if (base) ctx.drawImage(base, 0, 0, width, height)
  for (const overlay of card.overlays ?? []) drawOverlay[overlay.type](ctx, overlay, env)
  ctx.restore()
}
