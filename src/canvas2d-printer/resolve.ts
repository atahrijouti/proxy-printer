import type { Length, Presentation, ResolvedStyle, Style } from "./types"
import { lengthToPx } from "./units"

// device-px presentation: every authored Length has been scaled to a number
export interface ResolvedPresentation {
  styles: Record<string, ResolvedStyle>
  abbreviations: Record<string, string>
}

// scale every length in the presentation to device px once, up front — so the renderer and the
// layout engine deal only in numbers and never need `scale` or a length parser again.
export function resolvePresentation(
  presentation: Presentation,
  scale: number,
): ResolvedPresentation {
  const styles: Record<string, ResolvedStyle> = {}
  for (const [name, style] of Object.entries(presentation.styles)) {
    styles[name] = resolveStyle(style, scale)
  }
  return { styles, abbreviations: presentation.abbreviations }
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
