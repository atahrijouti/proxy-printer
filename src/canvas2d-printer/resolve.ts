import type { DB, Length, ResolvedStyle, Style, Symbols } from "./types"
import { lengthToPx } from "./units"

// fallback base size for a text style that omits fontSize (Card Conjurer's Rules default,
// 59px on a 1500px / 600-dpi card ≈ 2.5mm)
const DEFAULT_FONT_SIZE: Length = "2.5mm"

// the DB's two registries in device px: every authored Length has been scaled to a number
export interface ResolvedDb {
  styles: Record<string, ResolvedStyle>
  symbols: Symbols
  defaultFontSize: number
}

// scale every length in the DB's styles to device px once, up front — so the renderer and the
// layout engine deal only in numbers and never need `scale` or a length parser again.
// Both registries are optional: a DB whose cards carry no overlays needs neither.
export function resolveDb(db: DB, scale: number): ResolvedDb {
  const styles: Record<string, ResolvedStyle> = {}
  for (const [name, style] of Object.entries(db.presentation?.styles ?? {})) {
    styles[name] = resolveStyle(style, scale)
  }
  return {
    styles,
    symbols: db.symbols ?? {},
    defaultFontSize: lengthToPx(DEFAULT_FONT_SIZE, scale),
  }
}

function resolveStyle(style: Style, scale: number): ResolvedStyle {
  const px = (len: Length | undefined) => (len == null ? undefined : lengthToPx(len, scale))
  return {
    ...style,
    fontSize: px(style.fontSize),
    letterSpacing: px(style.letterSpacing),
    paragraphGap: px(style.paragraphGap),
    box: style.box && {
      x: px(style.box.x),
      y: px(style.box.y),
      w: px(style.box.w),
      h: px(style.box.h),
    },
    margin: style.margin && {
      before: px(style.margin.before),
      after: px(style.margin.after),
    },
    background: style.background && {
      fill: style.background.fill,
      outset: style.background.outset && {
        top: px(style.background.outset.top),
        right: px(style.background.outset.right),
        bottom: px(style.background.outset.bottom),
        left: px(style.background.outset.left),
      },
      corners: style.background.corners && {
        topLeft: px(style.background.corners.topLeft),
        topRight: px(style.background.corners.topRight),
        bottomRight: px(style.background.corners.bottomRight),
        bottomLeft: px(style.background.corners.bottomLeft),
      },
    },
  }
}
